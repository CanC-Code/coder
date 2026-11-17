#!/usr/bin/env python3
import os
import re

class ASTParser:
    def __init__(self, root_dir):
        self.root_dir = root_dir

    def parse_source_symbols(self, file_path):
        """Extracts symbols, functions, and class declarations from source files."""
        symbols = {"classes": [], "functions": [], "includes": []}
        full_path = os.path.join(self.root_dir, file_path)
        
        if not os.path.exists(full_path):
            return symbols

        with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
            
            # Simple regex-based symbol extraction for robustness across languages
            symbols["includes"] = re.findall(r'#include\s+["<](.*?)[">]|import\s+([a-zA-Z0-9_.]+)', content)
            symbols["classes"] = re.findall(r'(?:class|struct)\s+([a-zA-Z0-9_]+)', content)
            symbols["functions"] = re.findall(r'(?:void|int|bool|string|long|auto)\s+([a-zA-Z0-9_]+)\s*\(', content)

        return symbols

if __name__ == "__main__":
    parser = ASTParser(".")
    print("[*] AST Parser initialized successfully.")
