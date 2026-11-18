#!/usr/bin/env python3
import os
import sys
import datetime
import subprocess

class AutoExporter:
    def __init__(self, workspace_root):
        self.workspace_root = workspace_root
        self.exports_dir = os.path.join(workspace_root, "exports")
        os.makedirs(self.exports_dir, exist_ok=True)

    def run_export(self):
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        export_filename = f"patch_review_{timestamp}.patch.txt"
        export_path = os.path.join(self.exports_dir, export_filename)

        print(f"[*] Auto-applying and gathering repository diffs and generated artifacts...")

        try:
            # Capture git status and diffs
            git_status = subprocess.check_output(["git", "status", "-s"], universal_newlines=True, cwd=self.workspace_root)
            git_diff = subprocess.check_output(["git", "diff"], universal_newlines=True, cwd=self.workspace_root)
        except Exception as e:
            git_status = f"Error retrieving git status: {e}"
            git_diff = f"Error retrieving git diff: {e}"

        report_content = "=" * 80 + "\n"
        report_content += f" NEURO-SYMBOLIC CODER EXPORT & REVIEW BUNDLE\n"
        report_content += f" Generated Timestamp: {timestamp}\n"
        report_content += "=" * 80 + "\n\n"

        report_content += "--- 1. WORKSPACE GIT STATUS ---\n"
        report_content += git_status + "\n\n"

        report_content += "--- 2. DETAILED GIT DIFFS ---\n"
        report_content += git_diff + "\n\n"

        # Include generated stubs summary if available
        stubs_file = os.path.join(self.workspace_root, "core", "generated_stubs", "auto_generated_stubs.c")
        if os.path.exists(stubs_file):
            report_content += "--- 3. AUTO-GENERATED STUBS PREVIEW ---\n"
            with open(stubs_file, "r", encoding="utf-8") as sf:
                report_content += sf.read() + "\n\n"

        with open(export_path, "w", encoding="utf-8") as f:
            f.write(report_content)

        print(f"=== AUTO-APPLY & EXPORT COMPLETE ===")
        print(f"  Export bundle saved to: {export_path}")
        print(f"[+] Ready for review and target repo staging.")

if __name__ == "__main__":
    workspace = sys.argv[1] if len(sys.argv) > 1 else "."
    exporter = AutoExporter(workspace)
    exporter.run_export()
