#!/usr/bin/env python3
"""
Builds a distilled, offline Android SDK & NDK Reference Pack (android-complete-reference.md)
from locally installed Android SDK sources ($ANDROID_HOME/sources/android-*) and NDK sysroot headers.
Load the generated Markdown file into Coder via the 'Ingest Manuals' button.
"""
import os
import re
import sys
from pathlib import Path

def find_android_home():
    for env_var in ("ANDROID_HOME", "ANDROID_SDK_ROOT"):
        val = os.environ.get(env_var)
        if val and Path(val).exists():
            return Path(val)
    default_home = Path.home() / "Android" / "Sdk"
    return default_home if default_home.exists() else None

def extract_java_api_summaries(sources_dir: Path, max_files: int = 1200):
    entries = []
    target_packages = ("android/app", "android/content", "android/os", "android/view", "android/media", "android/opengl", "android/hardware", "android/net", "android/graphics")
    count = 0
    for pkg in target_packages:
        pkg_dir = sources_dir / pkg
        if not pkg_dir.exists():
            continue
        for java_file in sorted(pkg_dir.glob("*.java")):
            if count >= max_files:
                break
            try:
                text = java_file.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            cls_match = re.search(r'\bpublic\s+(?:abstract\s+|final\s+)?(?:class|interface)\s+([A-Za-z0-9_]+)(?:\s+extends\s+([A-Za-z0-9_.]+))?', text)
            if not cls_match:
                continue
            cls_name = cls_match.group(1)
            super_cls = cls_match.group(2) or "Object"
            methods = re.findall(r'\bpublic\s+(?:static\s+)?(?:final\s+)?[A-Za-z0-9_<>\[\],\s]+\s+([a-zA-Z0-9_]+)\s*\([^;{]*\)', text)
            unique_methods = list(dict.fromkeys(methods))[:12]
            dotted_pkg = pkg.replace("/", ".")
            entries.append(f"{dotted_pkg}.{cls_name} - Extends {super_cls}. Key methods: {', '.join(unique_methods) if unique_methods else 'constants/callbacks'}.")
            count += 1
    return entries

def extract_ndk_header_summaries(ndk_dir: Path):
    entries = []
    inc_dirs = list(ndk_dir.glob("**/sysroot/usr/include"))
    if not inc_dirs:
        return entries
    inc_root = inc_dirs[0]
    for sub in ("android", "aaudio", "jni.h", "vulkan"):
        target = inc_root / sub
        headers = [target] if target.is_file() else (sorted(target.glob("*.h")) if target.exists() else [])
        for h_file in headers:
            try:
                text = h_file.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            funcs = re.findall(r'\b([A-Za-z_][A-Za-z0-9_]*)\s*\([^;{}]*\)\s*(?:__INTRODUCED_IN\(\d+\))?\s*;', text)
            unique_funcs = [f for f in dict.fromkeys(funcs) if not f.startswith("_")][:18]
            if unique_funcs:
                rel = h_file.relative_to(inc_root)
                entries.append(f"{rel} - NDK C/C++ API header exporting: {', '.join(unique_funcs)}.")
    return entries

def main():
    out_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("android-complete-reference.md")
    sdk_root = find_android_home()
    lines = ["# Complete Offline Android SDK & NDK Reference Pack\n"]

    if sdk_root:
        sources_candidates = sorted((sdk_root / "sources").glob("android-*"), reverse=True) if (sdk_root / "sources").exists() else []
        if sources_candidates:
            lines.append(f"## Android Framework SDK ({sources_candidates[0].name})\n")
            lines.extend(extract_java_api_summaries(sources_candidates[0]))
            lines.append("")

        ndk_candidates = sorted((sdk_root / "ndk").glob("*"), reverse=True) if (sdk_root / "ndk").exists() else []
        if ndk_candidates:
            lines.append(f"## Android NDK Native Headers ({ndk_candidates[0].name})\n")
            lines.extend(extract_ndk_header_summaries(ndk_candidates[0]))
            lines.append("")
    else:
        lines.append("ANDROID_HOME not detected on host; run with ANDROID_HOME=/path/to/sdk to harvest installed SDK/NDK headers.\n")

    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {len(lines)} lines to {out_path}")

if __name__ == "__main__":
    main()
