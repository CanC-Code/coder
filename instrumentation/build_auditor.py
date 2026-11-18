#!/usr/bin/env python3
import os
import sys

class BuildAuditor:
    def __init__(self, workspace_root):
        self.workspace_root = workspace_root

    def audit_apk_build_config(self):
        issues = []
        
        # Check for ProGuard / R8 rules
        proguard_path = os.path.join(self.workspace_root, "Android", "app", "proguard-rules.pro")
        if not os.path.exists(proguard_path):
            issues.append("Missing proguard-rules.pro file; R8 will strip native JNI bindings.")
        else:
            with open(proguard_path, "r") as f:
                content = f.read()
                if "native" not in content and "-keep" not in content:
                    issues.append("proguard-rules.pro lacks native keep rules.")

        # Check for CMake source coverage
        cmake_path = os.path.join(self.workspace_root, "Android", "app", "src", "main", "cpp", "CMakeLists.txt")
        if not os.path.exists(cmake_path):
            issues.append("Missing CMakeLists.txt for native build targets.")

        print(f"=== ANDROID BUILD & R8 COMPLIANCE AUDIT ===")
        if issues:
            for issue in issues:
                print(f"[CRITICAL BUILD DEFECT] {issue}")
            return False
        else:
            print("[+] Build configuration and R8 rules verified successfully.")
            return True

if __name__ == "__main__":
    workspace = sys.argv[1] if len(sys.argv) > 1 else "."
    auditor = BuildAuditor(workspace)
    sys.exit(0 if auditor.audit_apk_build_config() else 1)
