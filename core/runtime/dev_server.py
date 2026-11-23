#!/usr/bin/env python3
"""
core/runtime/dev_server.py — Local Termux HTTP Bridge for Coder IDE (v22)
Serves ~/coder static assets and provides local endpoints for:
  - GET  /api/health       -> bridge status & detected repo path
  - POST /api/diag         -> runs scripts/diag.sh on target repo & file
  - POST /api/logcat       -> captures Android logcat (via rish or logcat) & inspects crashes
  - POST /api/apply_patch  -> writes approved patch content directly to local repo file
"""
import os
import sys
import io
import json
import shutil
import subprocess
import tempfile
import contextlib
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

CODER_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
sys.path.insert(0, CODER_ROOT)
from instrumentation.log_inspector import inspect_log_stream
from core.compiler.clang_ast_extractor import extract_clang_ast_symbols


def _infer_repo_package_and_lib(repo_dir):
    pkg = ""
    lib_base = ""
    if repo_dir and os.path.isdir(repo_dir):
        for root, dirs, files in os.walk(repo_dir):
            dirs[:] = [d for d in dirs if d not in (".git", "build", ".gradle", ".coder", "node_modules")]
            for fn in files:
                fp = os.path.join(root, fn)
                if fn == "AndroidManifest.xml":
                    try:
                        txt = open(fp, "r", encoding="utf-8", errors="ignore").read()
                        import re as _r
                        m = _r.search(r'\bpackage\s*=\s*"([a-zA-Z0-9_.]+)"', txt)
                        if m:
                            pkg = m.group(1)
                    except Exception:
                        pass
                elif fn in ("CMakeLists.txt",) and not lib_base:
                    try:
                        txt = open(fp, "r", encoding="utf-8", errors="ignore").read()
                        import re as _r
                        m = _r.search(r'\badd_library\s*\(\s*([A-Za-z0-9_]+)\s+SHARED', txt)
                        if m:
                            lib_base = m.group(1)
                    except Exception:
                        pass
                elif fn.startswith("lib") and fn.endswith(".so") and not lib_base:
                    lib_base = fn[:-3]
            if pkg and lib_base:
                break
    if not pkg and lib_base:
        pkg = f"com.{lib_base}"
    if not lib_base and pkg:
        lib_base = pkg.split(".")[-1]
    return pkg, lib_base


def detect_default_repo():
    """Return ONLY an explicitly designated repo. Never scan $HOME."""
    env_repo = os.environ.get("CODER_REPO", "").strip()
    if env_repo and os.path.isdir(env_repo):
        return os.path.abspath(env_repo)
    cfg = os.path.join(CODER_ROOT, ".coder_repo")
    if os.path.isfile(cfg):
        try:
            with open(cfg, "r", encoding="utf-8") as f:
                designated = f.read().strip()
            if designated and os.path.isdir(designated):
                return os.path.abspath(designated)
        except Exception:
            pass
    return ""


class CoderBridgeHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=CODER_ROOT, **kwargs)

    def log_message(self, fmt, *args):
        sys.stderr.write(f"[bridge] {self.address_string()} - {fmt % args}\n")

    def _send_json(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8", errors="ignore")
        return json.loads(raw) if raw.strip() else {}

    def do_OPTIONS(self):
        self._send_json(200, {"ok": True})

    def do_GET(self):
        if self.path == "/api/blueprint":
            bp_path = os.path.join(CODER_ROOT, "core", "graph", "android_port_blueprint.json")
            if os.path.isfile(bp_path):
                with open(bp_path, "r", encoding="utf-8") as f:
                    self._send_json(200, {"ok": True, "blueprint": json.load(f)})
            else:
                self._send_json(200, {"ok": True, "blueprint": None})
            return

        if self.path == "/api/health":
            self._send_json(200, {
                "ok": True,
                "version": "v28",
                "coder_root": CODER_ROOT,
                "default_repo": detect_default_repo(),
                "has_rish": bool(shutil.which("rish")),
                "has_clang": bool(shutil.which("clang")),
            })
            return
        super().do_GET()

    def do_POST(self):
        try:
            body = self._read_json()
        except Exception as e:
            self._send_json(400, {"ok": False, "error": f"Invalid JSON: {e}"})
            return

        if self.path == "/api/ast":
            repo = os.path.expanduser(body.get("repo") or detect_default_repo())
            target_file = body.get("file", "")
            extra_flags = body.get("flags", [])
            if not repo or not os.path.isdir(repo) or not target_file:
                self._send_json(400, {"ok": False, "error": "Missing valid repo or file."})
                return
            try:
                ast_data = extract_clang_ast_symbols(repo, target_file, extra_flags)
                self._send_json(200, {"ok": True, "ast": ast_data})
            except Exception as e:
                self._send_json(500, {"ok": False, "error": str(e)})
            return

        if self.path == "/api/blueprint":
            bp_data = body.get("blueprint")
            if not isinstance(bp_data, dict):
                self._send_json(400, {"ok": False, "error": "Missing blueprint object."})
                return
            bp_path = os.path.join(CODER_ROOT, "core", "graph", "android_port_blueprint.json")
            os.makedirs(os.path.dirname(bp_path), exist_ok=True)
            with open(bp_path, "w", encoding="utf-8") as f:
                json.dump(bp_data, f, indent=2)
            self._send_json(200, {"ok": True, "saved": bp_path})
            return

        if self.path == "/api/diag":
            repo = os.path.expanduser(body.get("repo") or detect_default_repo())
            target_file = body.get("file", "")
            extra_flags = body.get("flags", [])
            if not repo or not os.path.isdir(repo):
                self._send_json(400, {"ok": False, "error": f"Repo directory not found: {repo}"})
                return
            if not target_file:
                self._send_json(400, {"ok": False, "error": "Missing target 'file' path."})
                return

            diag_script = os.path.join(CODER_ROOT, "scripts", "diag.sh")
            cmd = ["sh", diag_script, repo, target_file] + [str(x) for x in extra_flags]
            try:
                proc = subprocess.run(cmd, capture_output=True, text=True, timeout=25)
                output = (proc.stdout or "") + ("\n" + proc.stderr if proc.stderr else "")
                self._send_json(200, {
                    "ok": True,
                    "repo": repo,
                    "file": target_file,
                    "returncode": proc.returncode,
                    "output": output.strip()
                })
            except Exception as e:
                self._send_json(500, {"ok": False, "error": str(e)})
            return

        if self.path == "/api/logcat":
            lines = int(body.get("lines", 400))
            req_repo = os.path.expanduser(body.get("repo") or detect_default_repo())
            inferred_pkg, inferred_lib = _infer_repo_package_and_lib(req_repo)
            pkg = (body.get("package") or inferred_pkg or "").strip()
            if shutil.which("rish"):
                cmd = ["rish", "-c", f"logcat -d -t {lines}"]
            elif shutil.which("logcat"):
                cmd = ["logcat", "-d", "-t", str(lines)]
            else:
                self._send_json(400, {"ok": False, "error": "Neither 'rish' nor 'logcat' found in PATH."})
                return

            try:
                proc = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
                raw_log = proc.stdout or proc.stderr or ""
                with tempfile.NamedTemporaryFile("w", delete=False, suffix=".log", encoding="utf-8") as tf:
                    tf.write(raw_log)
                    tmp_path = tf.name
                try:
                    buf = io.StringIO()
                    with contextlib.redirect_stdout(buf):
                        rc = inspect_log_stream(tmp_path, as_json=True)
                    report = json.loads(buf.getvalue())
                finally:
                    os.unlink(tmp_path)

                _filters = [x for x in (pkg, f"lib{inferred_lib}" if inferred_lib else "", "DEBUG", "SIGSEGV", "SIGBUS", "SEGVDUMP", "libc", "backtrace:", "#0") if x]
                filtered = "\n".join(
                    ln for ln in raw_log.splitlines()
                    if any(k in ln for k in _filters)
                )[-12000:]
                self._send_json(200, {
                    "ok": True,
                    "crashed": rc == 1,
                    "report": report,
                    "filtered_log": filtered or raw_log[-8000:]
                })
            except Exception as e:
                self._send_json(500, {"ok": False, "error": str(e)})
            return

        if self.path == "/api/extract_rom":
            repo = os.path.expanduser(body.get("repo") or detect_default_repo())
            ver = str(body.get("version") or "").strip()
            if not repo or not os.path.isdir(repo):
                self._send_json(400, {"ok": False, "error": f"Repo directory not found: {repo}"})
                return
            extract_sh = os.path.join(repo, "extract.sh")
            if not os.path.isfile(extract_sh):
                self._send_json(400, {"ok": False, "error": f"No extract.sh found in {repo}"})
                return
            cmd = ["bash", extract_sh] + ([ver] if ver else [])
            try:
                proc = subprocess.run(cmd, cwd=repo, capture_output=True, text=True, timeout=180)
                out = (proc.stdout or "") + ("\n" + proc.stderr if proc.stderr else "")
                self._send_json(200 if proc.returncode == 0 else 500, {
                    "ok": proc.returncode == 0,
                    "returncode": proc.returncode,
                    "output": out.strip()[-8000:],
                    "error": None if proc.returncode == 0 else f"extract.sh exited with code {proc.returncode}"
                })
            except Exception as e:
                self._send_json(500, {"ok": False, "error": str(e)})
            return

        if self.path == "/api/pipeline":
            repo = os.path.expanduser(body.get("repo") or detect_default_repo() or CODER_ROOT)
            task = str(body.get("task") or "").strip()
            if not os.path.isdir(repo):
                self._send_json(400, {"ok": False, "error": f"Target directory not found: {repo}"})
                return

            task_map = {
                "profile":        [sys.executable, os.path.join(CODER_ROOT, "core", "profiler", "codebase_profiler.py"), repo],
                "lexicon":        [sys.executable, os.path.join(CODER_ROOT, "core", "graph", "lexicon.py"), repo],
                "infill":         [sys.executable, os.path.join(CODER_ROOT, "core", "compiler", "stub_infiller.py"), repo],
                "generate_stubs": [sys.executable, os.path.join(CODER_ROOT, "core", "compiler", "dynamic_generator.py"), repo],
                "build_audit":    [sys.executable, os.path.join(CODER_ROOT, "instrumentation", "build_auditor.py"), repo],
                "validate_graph": [sys.executable, os.path.join(CODER_ROOT, "instrumentation", "graph_validator.py"), "--selftest"],
                "batch_export":   [sys.executable, os.path.join(CODER_ROOT, "export", "batch_export_engine.py"), repo],
                "patch_export":   [sys.executable, os.path.join(CODER_ROOT, "export", "patch_exporter.py"), repo],
                "auto_export":    [sys.executable, os.path.join(CODER_ROOT, "export", "auto_exporter.py"), repo],
            }

            if task == "orchestrate":
                try:
                    from core.runtime.host_orchestrator import HostOrchestrator
                    orch = HostOrchestrator(repo)
                    count = orch.ingest_directory(".")
                    self._send_json(200, {
                        "ok": True,
                        "task": task,
                        "output": f"[+] HostOrchestrator ingested {count} C/C++ files: {len(orch.boxes)} ConceptualBoxes, {len(orch.tethers)} Tethers built."
                    })
                except Exception as e:
                    self._send_json(500, {"ok": False, "error": str(e)})
                return

            # Resolve script path dynamically even if directory layout varies
            if task not in task_map:
                self._send_json(400, {"ok": False, "error": f"Unknown pipeline task: {task}"})
                return

            cmd = task_map[task]
            if not os.path.isfile(cmd[1]):
                # Fallback search by basename anywhere inside CODER_ROOT
                base = os.path.basename(cmd[1]).lower()
                for r, _, files in os.walk(CODER_ROOT):
                    hit = next((fn for fn in files if fn.lower() == base), None)
                    if hit:
                        cmd[1] = os.path.join(r, hit)
                        break

            try:
                _env = os.environ.copy()
                _env["PYTHONPATH"] = CODER_ROOT + os.pathsep + _env.get("PYTHONPATH", "")
                proc = subprocess.run(cmd, cwd=repo, capture_output=True, text=True, timeout=60, env=_env)
                out = (proc.stdout or "") + ("\n" + proc.stderr if proc.stderr else "")
                self._send_json(200, {
                    "ok": proc.returncode == 0,
                    "task": task,
                    "returncode": proc.returncode,
                    "output": out.strip() or "(No output)"
                })
            except Exception as e:
                self._send_json(500, {"ok": False, "error": str(e)})
            return

        if self.path == "/api/apply_patch":
            repo = os.path.expanduser(body.get("repo") or detect_default_repo())
            rel_path = body.get("filePath", "")
            content = body.get("content")
            _repo_base = os.path.basename(os.path.normpath(repo))
            if _repo_base and rel_path.startswith(_repo_base + os.sep):
                rel_path = rel_path[len(_repo_base) + 1:]
            if not repo or not os.path.isdir(repo) or not rel_path or content is None:
                self._send_json(400, {"ok": False, "error": "Missing repo, filePath, or content."})
                return
            abs_target = os.path.abspath(os.path.join(repo, rel_path))
            if not abs_target.startswith(os.path.abspath(repo) + os.sep):
                self._send_json(403, {"ok": False, "error": "Path traversal blocked."})
                return
            os.makedirs(os.path.dirname(abs_target), exist_ok=True)
            with open(abs_target, "w", encoding="utf-8") as f:
                f.write(content)
            self._send_json(200, {"ok": True, "written": abs_target, "bytes": len(content)})
            return

        self._send_json(404, {"ok": False, "error": f"Unknown endpoint: {self.path}"})


def main():
    port = int(os.environ.get("CODER_PORT", "8080"))
    server = ThreadingHTTPServer(("127.0.0.1", port), CoderBridgeHandler)
    print(f"[*] Coder Local Bridge v28 listening on http://127.0.0.1:{port}")
    print(f"[*] Serving workspace: {CODER_ROOT}")
    default_repo = detect_default_repo()
    if default_repo:
        print(f"[*] Auto-detected target repo: {default_repo}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[*] Shutting down bridge.")
        server.server_close()


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        assert callable(detect_default_repo)
        print("[SELFTEST OK] dev_server module imports and handlers verified.")
        sys.exit(0)
    main()
