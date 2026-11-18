#!/usr/bin/env python3
import os
import subprocess
import sys
import datetime

class PatchExporter:
    def __init__(self, workspace_root):
        self.workspace_root = workspace_root

    def generate_review_bundle(self):
        os.makedirs(os.path.join(self.workspace_root, "exports"), exist_ok=True)
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        bundle_path = os.path.join(self.workspace_root, "exports", f"patch_review_{timestamp}.patch.txt")

        # Run git diff to capture all current workspace modifications
        try:
            diff_output = subprocess.check_output(["git", "diff"], cwd=self.workspace_root, universal_newlines=True)
        except Exception as e:
            diff_output = f"Error generating git diff: {str(e)}"

        bundle_content = f"""=== NEURO-SYMBOLIC CODER PATCH REVIEW BUNDLE ===
Generated: {datetime.datetime.now().isoformat()}
Workspace: {self.workspace_root}
Target: Diddy Kong Racing Android Port (aarch64)
===================================================

[SUMMARY]
This bundle contains all synthesized infills, ABI fixes, and architecture adjustments 
ready for verification against the Master Requirements List.

[UNIFIED DIFF OUTPUT]
{diff_output}
===================================================
END OF REVIEW BUNDLE
"""

        with open(bundle_path, "w", encoding="utf-8") as f:
            f.write(bundle_content)

        print(f"[+] Successfully exported review bundle to: {bundle_path}")
        return bundle_path

if __name__ == "__main__":
    workspace = sys.argv[1] if len(sys.argv) > 1 else "."
    exporter = PatchExporter(workspace)
    exporter.generate_review_bundle()
