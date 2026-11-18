#!/usr/bin/env python3
import os
import sys
import re
import json


def inspect_log_stream(log_stream_path, as_json=False):
    findings = []
    fault_addr = None
    signal_info = None
    abort_msg = None
    backtrace = []
    wasm_events = []

    sig_re = re.compile(r"(?:Fatal signal \d+ \((SIG[A-Z]+)\)|SEGVDUMP|Segmentation fault|SIGBUS)", re.I)
    fault_re = re.compile(r"fault addr (0x[0-9a-fA-F]+|-+)")
    abort_re = re.compile(r"Abort message:\s*['\"]?(.*?)['\"]?$")
    bt_re = re.compile(r"#\d+\s+pc\s+([0-9a-fA-F]+)\s+([^\s]+)(?:\s+\(([^)]+)\))?")

    try:
        with open(log_stream_path, "r", encoding="utf-8", errors="ignore") as f:
            for line_no, raw in enumerate(f, 1):
                line = raw.strip()
                if not line:
                    continue

                sm = sig_re.search(line)
                if sm:
                    signal_info = sm.group(1) or "SIGSEGV"
                    findings.append({"line": line_no, "type": "SIGNAL", "text": line})

                fm = fault_re.search(line)
                if fm and not fault_addr:
                    fault_addr = fm.group(1)

                am = abort_re.search(line)
                if am and not abort_msg:
                    abort_msg = am.group(1)

                bm = bt_re.search(line)
                if bm and len(backtrace) < 12:
                    backtrace.append({
                        "pc": bm.group(1),
                        "binary": bm.group(2),
                        "symbol": bm.group(3) or "unknown"
                    })

                if "WasmMemory" in line or "wasm_bridge" in line:
                    wasm_events.append({"line": line_no, "text": line})

        crashed = bool(findings or signal_info or abort_msg)
        truncation_hint = False
        if fault_addr and fault_addr.startswith("0x"):
            try:
                val = int(fault_addr, 16)
                if 0 < val <= 0xFFFFFFFF:
                    truncation_hint = True
            except ValueError:
                pass

        report = {
            "log_path": log_stream_path,
            "crashed": crashed,
            "signal": signal_info,
            "fault_addr": fault_addr,
            "suspected_32bit_pointer_truncation": truncation_hint,
            "abort_message": abort_msg,
            "backtrace": backtrace,
            "wasm_telemetry_count": len(wasm_events),
            "findings": findings[:20]
        }

        if as_json:
            print(json.dumps(report, indent=2))
        else:
            print(f"[*] Inspecting telemetry stream: {log_stream_path}")
            for w in wasm_events[:10]:
                print(f"[-] Memory Telemetry (L{w['line']}): {w['text']}")
            for item in findings[:10]:
                print(f"[!] CRITICAL TRACE (L{item['line']}): {item['text']}")
            if abort_msg:
                print(f"[!] ART Abort Message: {abort_msg}")
            if fault_addr:
                note = " (<= 32-bit range: probable ARM64 pointer truncation!)" if truncation_hint else ""
                print(f"[!] Fault Address: {fault_addr}{note}")
            for frame in backtrace[:6]:
                print(f"    -> pc 0x{frame['pc']} {frame['binary']} ({frame['symbol']})")
            if crashed:
                print("[!] Analysis complete: Native crash signature detected.")
            else:
                print("[+] Analysis complete: No memory faults detected. Execution nominal.")

        return 1 if crashed else 0
    except FileNotFoundError:
        print(f"[!] Log stream path not found: {log_stream_path}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        import tempfile
        sample = (
            "11-18 08:30:01.123 F DEBUG   : Fatal signal 11 (SIGSEGV), code 1 (SEGV_MAPERR), fault addr 0x12345678 in tid 4120\n"
            "11-18 08:30:01.125 F DEBUG   :       #00 pc 0004a120  /data/app/libdkrwrapper.so (dkr_dma_copy+64)\n"
        )
        with tempfile.NamedTemporaryFile("w", delete=False, suffix=".log") as tf:
            tf.write(sample)
            tmp_path = tf.name
        try:
            rc = inspect_log_stream(tmp_path, as_json=True)
            assert rc == 1, f"Expected exit code 1 on crash, got {rc}"
        finally:
            os.unlink(tmp_path)
        print("[SELFTEST OK] log_inspector parsed Android tombstone SIGSEGV & 32-bit fault address.")
        sys.exit(0)

    if len(sys.argv) > 1:
        as_json = "--json" in sys.argv
        path = [a for a in sys.argv[1:] if not a.startswith("--")][0]
        sys.exit(inspect_log_stream(path, as_json=as_json))
    else:
        print("Usage: python3 instrumentation/log_inspector.py <logfile> [--json] | --selftest")
