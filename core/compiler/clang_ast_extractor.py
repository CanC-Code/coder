#!/usr/bin/env python3
"""
core/compiler/clang_ast_extractor.py — v24
Uses `clang -Xclang -ast-dump=json -fsyntax-only` to resolve canonical/desugared
32-bit integer typedefs, struct/union fields, and function parameters without regex blind spots.
Falls back cleanly to ASTParser if clang is unavailable or headers are incomplete.
"""
import os
import sys
import json
import shutil
import subprocess

CODER_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
sys.path.insert(0, CODER_ROOT)
from core.compiler.ast_parser import ASTParser

INT32_CANONICAL = {
    "int", "unsigned int", "long", "unsigned long",
    "int32_t", "uint32_t", "s32", "u32"
}


def _is_canonical_32bit_int(type_obj):
    if not isinstance(type_obj, dict):
        return False
    desugared = (type_obj.get("desugaredQualType") or type_obj.get("qualType") or "").strip()
    desugared = desugared.replace("const ", "").replace("volatile ", "").strip()
    return desugared in INT32_CANONICAL


def extract_clang_ast_symbols(repo_dir, rel_file, extra_flags=None):
    abs_file = os.path.abspath(os.path.join(repo_dir, rel_file))
    parser = ASTParser(repo_dir)
    base = parser.parse_source_symbols(rel_file)
    base["ast_backend"] = "regex_fallback"
    base["resolved_int32_typedefs"] = []
    base["ast_struct_fields"] = []
    base["ast_func_params"] = []

    if not shutil.which("clang") or not os.path.isfile(abs_file):
        return base

    cmd = [
        "clang", "-Xclang", "-ast-dump=json", "-fsyntax-only",
        "-fno-color-diagnostics", "-w",
        "-I", os.path.join(repo_dir, "include"),
        "-I", os.path.join(repo_dir, "src"),
    ] + [str(f) for f in (extra_flags or [])] + [abs_file]

    try:
        proc = subprocess.run(cmd, cwd=repo_dir, capture_output=True, text=True, timeout=20)
        raw = proc.stdout or ""
        start = raw.find("{")
        if start == -1:
            return base
        ast_root = json.loads(raw[start:])
    except Exception as e:
        base["ast_error"] = str(e)
        return base

    base["ast_backend"] = "clang_json_ast"
    int32_typedefs = set()
    struct_fields = []
    func_params = []

    def loc_file_and_line(node):
        loc = node.get("loc") or {}
        if "expansionLoc" in loc:
            loc = loc["expansionLoc"]
        f = loc.get("file") or ""
        ln = loc.get("line")
        if f:
            try:
                f = os.path.relpath(os.path.abspath(os.path.join(repo_dir, f)), repo_dir)
            except Exception:
                pass
        return f, ln

    def walk(node, current_file=""):
        if not isinstance(node, dict):
            return
        f, ln = loc_file_and_line(node)
        active_file = f or current_file
        kind = node.get("kind", "")

        if kind == "TypedefDecl":
            name = node.get("name", "")
            if name and _is_canonical_32bit_int(node.get("type")):
                int32_typedefs.add(name)

        elif kind == "RecordDecl" and node.get("completeDefinition"):
            rec_name = node.get("name") or "<anonymous>"
            for child in node.get("inner") or []:
                if child.get("kind") == "FieldDecl":
                    ff, fln = loc_file_and_line(child)
                    ftype = child.get("type") or {}
                    if _is_canonical_32bit_int(ftype) and child.get("name"):
                        struct_fields.append({
                            "record": rec_name,
                            "name": child["name"],
                            "qualType": ftype.get("qualType", ""),
                            "desugaredType": ftype.get("desugaredQualType", ftype.get("qualType", "")),
                            "filePath": ff or active_file,
                            "line": fln or ln
                        })

        elif kind == "FunctionDecl":
            fn_name = node.get("name", "")
            params = []
            idx = 0
            for child in node.get("inner") or []:
                if child.get("kind") == "ParmVarDecl":
                    ptype = child.get("type") or {}
                    params.append({
                        "idx": idx,
                        "name": child.get("name", f"arg{idx}"),
                        "qualType": ptype.get("qualType", ""),
                        "isInt32": _is_canonical_32bit_int(ptype)
                    })
                    idx += 1
            if fn_name and any(p["isInt32"] for p in params):
                func_params.append({
                    "name": fn_name,
                    "filePath": active_file,
                    "line": ln,
                    "params": params
                })

        for child in node.get("inner") or []:
            walk(child, active_file)

    walk(ast_root, rel_file)
    base["resolved_int32_typedefs"] = sorted(int32_typedefs)
    base["ast_struct_fields"] = struct_fields
    base["ast_func_params"] = func_params
    return base


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            cfile = os.path.join(td, "sample.c")
            with open(cfile, "w") as f:
                f.write("typedef unsigned int RomAddr;\nstruct DmaReq { RomAddr srcAddr; int len; };\nvoid dma_start(RomAddr addr) {}\n")
            res = extract_clang_ast_symbols(td, "sample.c")
            if shutil.which("clang"):
                assert res["ast_backend"] == "clang_json_ast", res
                assert "RomAddr" in res["resolved_int32_typedefs"], res
                assert any(x["name"] == "srcAddr" for x in res["ast_struct_fields"]), res
                assert any(x["name"] == "dma_start" for x in res["ast_func_params"]), res
            print(f"[SELFTEST OK] clang_ast_extractor verified (backend={res['ast_backend']}).")
        sys.exit(0)
    if len(sys.argv) >= 3:
        print(json.dumps(extract_clang_ast_symbols(sys.argv[1], sys.argv[2], sys.argv[3:]), indent=2))
    else:
        print("Usage: python3 core/compiler/clang_ast_extractor.py <repo> <rel_file> [flags] | --selftest")
