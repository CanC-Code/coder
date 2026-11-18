#!/usr/bin/env python3
import subprocess
import re
import sys

class LogInspector:
    def __init__(self):
        self.crash_patterns = [
            r"SIGSEGV.*pc\s+([0-9a-fA-F]+)",
            r"SEGVDUMP.*address\s+([0-9a-fA-F]+)",
            r"Fatal signal 11 \(SIGSEGV\).*code 1 \(SEGV_MAPERR\)"
        ]

    def fetch_device_logs(self):
        try:
            print("[*] Polling device via adb/rish for logcat traces...")
            # Supports direct adb or shizuku rish execution if wrapped
            output = subprocess.check_output(["adb", "logcat", "-d", "-v", "time"], universal_newlines=True, timeout=5)
            return output
        except Exception as e:
            print(f"[!] Warning: Could not pull live adb logs ({e}). Checking local log artifacts...")
            return ""

    def analyze_logs(self, log_data):
        findings = []
        lines = log_data.splitlines()
        for idx, line in enumerate(lines):
            if "SEGVDUMP" in line or "SIGSEGV" in line:
                findings.append((idx, line))
        
        print(f"=== RUNTIME TELEMETRY INSPECTION REPORT ===")
        if findings:
            print(f"[!] Detected {len(findings)} native crash/SEGVDUMP events:")
            for f in findings:
                print(f"  Line {f[0]}: {f[1]}")
            print("[*] Recommendation: Cross-reference crash instruction pointers with Symbol Map.")
        else:
            print("[+] No active SEGVDUMP or SIGSEGV crashes detected in current log stream.")
        return findings

if __name__ == "__main__":
    inspector = LogInspector()
    logs = inspector.fetch_device_logs()
    inspector.analyze_logs(logs)
