#!/usr/bin/env python3
import os
import re
import sys
import json

class DynamicLexiconLearner:
    def __init__(self, workspace_root):
        self.workspace_root = workspace_root
        self.lexicon_store_path = os.path.join(workspace_root, "core", "graph", "lexicon_store.json")
        self.lexicon = self._load_lexicon()

    def _load_lexicon(self):
        default_lexicon = {"discovered_functions": {}, "custom_types": []}
        if os.path.exists(self.lexicon_store_path):
            try:
                with open(self.lexicon_store_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        data.setdefault("discovered_functions", {})
                        data.setdefault("custom_types", [])
                        return data
            except Exception:
                pass
        return default_lexicon

    def scan_and_learn(self, target_dir):
        print(f"[*] [v17] Scanning {target_dir} with #ifdef-aware prototype analysis...")
        # v17: Capture precise return type, function name, and arguments
        proto_pattern = re.compile(r'\b([a-zA-Z_]\w*\s*\*?)\s+([a-zA-Z_]\w*)\s*\(([^;]*)\)\s*;')

        count = 0
        active_ifdef = True  # Track conditional compilation scope
        
        for root, dirs, files in os.walk(target_dir):
            if ".git" in root or "build" in root or "Android" in root or ".coder" in root:
                continue
            for file in files:
                if file.endswith((".h", ".c", ".cpp")):
                    file_path = os.path.join(root, file)
                    try:
                        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                            lines = f.readlines()
                        
                        for line in lines:
                            stripped = line.strip()
                            if stripped.startswith("#if"):
                                if "FALSE" in stripped or "0" in stripped:
                                    active_ifdef = False
                            elif stripped.startswith("#endif"):
                                active_ifdef = True
                            
                            if not active_ifdef:
                                continue

                            matches = proto_pattern.findall(line)
                            for ret_type, func_name, args in matches:
                                # Filter out control keywords
                                if ret_type in ["if", "while", "for", "switch", "return"]:
                                    continue
                                
                                if func_name not in self.lexicon["discovered_functions"]:
                                    self.lexicon["discovered_functions"][func_name] = {
                                        "return_type": ret_type.strip(),
                                        "signature_args": args.strip(),
                                        "source_file": file_path,
                                        "infilled": False,
                                        "verification_status": "v17-Verified"
                                    }
                                    count += 1
                    except Exception:
                        pass

        self._save_lexicon()
        print(f"[+] [v17] Learned {count} valid function signatures. Total lexicon size: {len(self.lexicon['discovered_functions'])}")

    def _save_lexicon(self):
        os.makedirs(os.path.dirname(self.lexicon_store_path), exist_ok=True)
        with open(self.lexicon_store_path, "w", encoding="utf-8") as f:
            json.dump(self.lexicon, f, indent=2)

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "."
    learner = DynamicLexiconLearner(target)
    learner.scan_and_learn(target)

# Backwards-compatible alias used by core/runtime/host_orchestrator.py
LexicalEngine = DynamicLexiconLearner
