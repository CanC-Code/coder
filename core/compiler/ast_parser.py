#!/usr/bin/env python3
"""
core/compiler/ast_parser.py — v16
Enhanced C/C++ symbol extractor for Coder's offline Android port pipeline.

Backward compatible: still returns "classes", "functions", "includes"
with the EXACT original regex extraction (preserved verbatim).
Additive: adds globals / externs / macros / enums / typedefs /
struct_fields / symbols_by_name so the JS-side trace can resolve
non-function symbols (like gAntiPiracyCRCStart) with 100% precision.
"""
import os
import re

_C_KEYWORDS = {
    "void","char","short","int","long","float","double","signed","unsigned",
    "bool","_Bool","size_t","ssize_t","ptrdiff_t","int8_t","int16_t","int32_t",
    "int64_t","uint8_t","uint16_t","uint32_t","uint64_t","wchar_t","char16_t",
    "char32_t","const","volatile","static","register","auto","inline","extern",
    "restrict","__restrict","__restrict__","struct","union","enum","typedef"
}
_NOT_A_NAME = {
    "if","else","for","while","switch","return","sizeof","alignof","alignas",
    "typeof","offsetof","case","default","break","continue","do","goto","new",
    "delete","throw","try","catch","using","namespace","template"
}


def _strip_strings(s):
    """Blank string/char literal contents (offset- and length-preserving)."""
    def _r(m): return " " * len(m.group(0))
    s = re.sub(r'"(?:\\.|[^"\\])*"', _r, s)
    s = re.sub(r"'(?:\\.|[^'\\])*'", _r, s)
    return s


def _strip_comments(s):
    """Blank // and /* */ comments (offset- and length-preserving)."""
    def _r(m): return " " * len(m.group(0))
    s = re.sub(r"/\*.*?\*/", _r, s, flags=re.S)
    s = re.sub(r"//[^\n]*", _r, s)
    return s


def _strip_for_scan(s):
    return _strip_comments(_strip_strings(s))


class ASTParser:
    def __init__(self, root_dir):
        self.root_dir = root_dir

    # ------------------------------------------------------------------ #
    # v1 core (preserved verbatim) + v16 additive augmentation
    # ------------------------------------------------------------------ #
    def parse_source_symbols(self, file_path):
        """Extracts symbols from source files.
        Returns the original v1 dict PLUS new keys — never replaces."""
        symbols = {"classes": [], "functions": [], "includes": []}
        full_path = os.path.join(self.root_dir, file_path)
        if not os.path.exists(full_path):
            return symbols
        with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
            # ---- v1 extraction — kept byte-identical for backward compat ----
            symbols["includes"]  = re.findall(r'#include\s+["<](.*?)[">]|import\s+([a-zA-Z0-9_.]+)', content)
            symbols["classes"]   = re.findall(r'(?:class|struct)\s+([a-zA-Z0-9_]+)', content)
            symbols["functions"] = re.findall(r'(?:void|int|bool|string|long|auto)\s+([a-zA-Z0-9_]+)\s*\(', content)
            # ---- v16 additive augmentation ----
            try:
                self._augment_v16(symbols, content, file_path)
            except Exception as e:  # never let extraction kill the pipeline
                symbols["_v16_error"] = repr(e)
        return symbols

    def _augment_v16(self, symbols, content, file_path):
        scan = _strip_for_scan(content)

        # --- macros (need original content, because values may contain strings) ---
        symbols["macros"] = self._extract_macros(content)
        # --- externs (semantic scan) ---
        symbols["externs"] = self._extract_externs(scan)
        # --- composites: struct/union fields, enums, class names ---
        extra_classes, struct_fields, enums = self._extract_composites(scan)
        # --- typedefs ---
        symbols["typedefs"] = self._extract_typedefs(scan)
        # --- rich function signatures (does NOT remove v1 names) ---
        symbols["function_details"] = self._extract_functions(scan)
        # --- globals: file-scope variables via depth-0 statement scan ---
        symbols["globals"] = self._extract_globals(content, scan)

        # --- merge (order-preserving, additive only) ---
        for c in extra_classes:
            if c not in symbols["classes"]:
                symbols["classes"].append(c)
        for f in symbols["function_details"]:
            if f["name"] not in symbols["functions"]:
                symbols["functions"].append(f["name"])

        symbols["struct_fields"] = struct_fields
        symbols["enums"] = enums

        # --- unified name -> occurrences index (used by JS-side trace) ---
        idx = {}
        def add(name, kind, line=None, **kw):
            if not name:
                return
            entry = {"kind": kind, "file_path": file_path, "line": line}
            entry.update(kw)
            idx.setdefault(name, []).append(entry)
        for c in symbols["classes"]:
            add(c, "class")
        for f in symbols["functions"]:
            add(f, "function")
        for g in symbols["globals"]:
            add(g["name"], "global", g.get("line"),
                type=g.get("type"), is_pointer=g.get("is_pointer"))
        for e in symbols["externs"]:
            add(e["name"], "extern", e.get("line"), type=e.get("type"))
        for m in symbols["macros"]:
            add(m["name"], m["kind"], m.get("line"),
                value=m.get("value"), params=m.get("params"))
        for td in symbols["typedefs"]:
            add(td["alias"], "typedef", td.get("line"), base=td.get("base"))
        for en in symbols["enums"]:
            add(en["name"], "enum")
            for member in en["members"]:
                add(member, "enum_member", parent=en["name"])
        for comp, fields in symbols["struct_fields"].items():
            for fld in fields:
                add(fld["name"], "struct_field", parent=comp, type=fld.get("type"))
        symbols["symbols_by_name"] = idx

    # ------------------------------------------------------------------ #
    # Extractors
    # ------------------------------------------------------------------ #
    @staticmethod
    def _extract_macros(content):
        out = []
        joined = re.sub(r"\\\n", " ", content)   # join line continuations
        for m in re.finditer(
            r"^[ \t]*#\s*define\s+([A-Za-z_]\w*)(\s*\(([^)]*)\))?\s*(.*)$",
            joined, flags=re.M
        ):
            out.append({
                "name":   m.group(1),
                "params": (m.group(3) or "").strip(),
                "value":  (m.group(4) or "").strip(),
                "line":   joined[:m.start()].count("\n") + 1,
                "kind":   "macro_function" if m.group(3) else "macro_object",
            })
        return out

    @staticmethod
    def _extract_externs(scan):
        out = []
        for m in re.finditer(r"\bextern\b(?:\s*\"C\")?\s+([^;{}\n]+?);", scan):
            decl = m.group(1).strip()
            if decl.startswith("{"):
                continue
            vm = re.search(
                r"(?P<type>(?:[A-Za-z_][\w:<>,\s\*&]*?))\s*"
                r"(?P<ptr>\**\s*)"
                r"(?P<name>[A-Za-z_]\w*)"
                r"\s*(?P<arr>\[[^\]]*\])?\s*$",
                decl
            )
            if not vm:
                continue
            name = vm.group("name")
            if name in _C_KEYWORDS or name in _NOT_A_NAME:
                continue
            out.append({
                "name":       name,
                "type":       vm.group("type").strip(),
                "is_pointer": bool(vm.group("ptr").strip()),
                "is_array":   bool(vm.group("arr")),
                "line":       scan[:m.start()].count("\n") + 1,
                "kind":       "extern",
            })
        return out

    @staticmethod
    def _extract_composites(scan):
        classes, struct_fields, enums = [], {}, []
        # struct / union: tag is OPTIONAL — anonymous inline typedefs are supported
        for kind in ("struct", "union"):
            for m in re.finditer(rf"\b{kind}\s*([A-Za-z_]\w*)?\s*\{{", scan):
                tag = m.group(1)
                start = m.end() - 1
                depth, end = 0, start
                for i in range(start, len(scan)):
                    if scan[i] == "{": depth += 1
                    elif scan[i] == "}":
                        depth -= 1
                        if depth == 0:
                            end = i; break
                body = scan[start+1:end]
                # determine name: use tag, else pick up trailing typedef alias
                name = tag
                if not name:
                    after = scan[end+1:end+200]
                    am = re.match(r"\s*([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*;", after)
                    if am:
                        name = am.group(1)
                if not name:
                    name = "<anonymous>"
                if name not in classes:
                    classes.append(name)
                fields = []
                for fm in re.finditer(
                    r"([A-Za-z_][\w:<>,\s\*&\[\]]*?)\s+([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*[;:]",
                    body
                ):
                    t, fname = fm.group(1).strip(), fm.group(2)
                    if fname in _C_KEYWORDS or fname in _NOT_A_NAME:
                        continue
                    fields.append({"name": fname, "type": t})
                if fields:
                    struct_fields[f"{kind} {name}"] = fields
        # enums: tag optional, anon-typedef alias supported
        for m in re.finditer(r"\benum\s*([A-Za-z_]\w*)?\s*\{([^}]*)\}", scan):
            tag = m.group(1)
            name = tag
            if not name:
                after = scan[m.end():m.end()+200]
                am = re.match(r"\s*([A-Za-z_]\w*)\s*;", after)
                if am:
                    name = am.group(1)
            if not name:
                name = "<anonymous_enum>"
            members = [em.group(1) for em in
                       re.finditer(r"([A-Za-z_]\w*)(?:\s*=\s*[^,}]+)?", m.group(2))
                       if em.group(1) not in _C_KEYWORDS and em.group(1) not in _NOT_A_NAME]
            if members:
                enums.append({"name": name, "members": members})
        return classes, struct_fields, enums

    @staticmethod
    def _extract_typedefs(scan):
        out = []
        seen = set()
        # (a) simple: typedef <base> Alias;  (base contains no braces)
        for m in re.finditer(
            r"\btypedef\s+([^;{}]+?)\s+([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*;",
            scan
        ):
            alias = m.group(2)
            if alias in _C_KEYWORDS or (alias, "simple") in seen:
                continue
            seen.add((alias, "simple"))
            out.append({"alias": alias, "base": m.group(1).strip(),
                        "line": scan[:m.start()].count("\n") + 1})
        # (b) composite: typedef (struct|union|enum) [tag] { ... } Alias;
        for m in re.finditer(
            r"\btypedef\s+(struct|union|enum)\s*([A-Za-z_]\w*)?\s*\{",
            scan
        ):
            start = m.end() - 1
            depth, end = 0, start
            for i in range(start, len(scan)):
                if scan[i] == "{": depth += 1
                elif scan[i] == "}":
                    depth -= 1
                    if depth == 0:
                        end = i; break
            after = scan[end+1:end+200]
            am = re.match(r"\s*([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*;", after)
            if not am:
                continue
            alias = am.group(1)
            if alias in _C_KEYWORDS or (alias, "composite") in seen:
                continue
            seen.add((alias, "composite"))
            base = f"{m.group(1)} {m.group(2) or ''}".strip()
            out.append({"alias": alias, "base": base,
                        "line": scan[:m.start()].count("\n") + 1})
        return out

    @staticmethod
    def _extract_functions(scan):
        out = []
        pat = re.compile(
            r"(?P<ret>(?:[A-Za-z_][\w:<>,\*&]*\s+){1,6})(?P<name>[A-Za-z_]\w*)\s*"
            r"\((?P<params>[^)]*)\)\s*(?P<suffix>(?:const\s*)?(?:noexcept\s*)?"
            r"(?:override\s*)?(?:final\s*)?)\s*(?:\{|;)",
            re.M
        )
        for m in pat.finditer(scan):
            name = m.group("name")
            if name in _NOT_A_NAME or name in _C_KEYWORDS:
                continue
            ret = m.group("ret").strip()
            if not ret or not re.search(r"[A-Za-z_]", ret):
                continue
            out.append({
                "name":        name,
                "return_type": ret,
                "params":      m.group("params").strip(),
                "line":        scan[:m.start()].count("\n") + 1,
            })
        return out

    @staticmethod
    def _extract_globals(content, scan):
        """Extract file-scope variable declarations via depth-0 statement scan.
        Uses `content` for exact text and `scan` (offset-preserving) for depth."""
        out = []
        depth, stmt_start = 0, 0
        stmts = []
        for i, ch in enumerate(scan):
            if ch == "{":     depth += 1
            elif ch == "}":   depth = max(0, depth - 1)
            elif ch == ";" and depth == 0:
                stmts.append((stmt_start, i + 1))
                stmt_start = i + 1

        for start, end in stmts:
            stmt = scan[start:end].strip()
            if not stmt:
                continue
            if stmt.startswith("#"):                   continue
            if re.match(r"typedef\b", stmt):           continue
            if re.match(r"extern\b", stmt):            continue
            if re.match(r"(struct|union|enum|class)\s+[\w<>]+\s*[\{;]", stmt):
                continue
            pre_eq = stmt.split("=")[0]
            if "(" in pre_eq and ")" in pre_eq:
                # function pointer global? capture name if it looks like (*NAME)
                fp = re.search(r"\(\s*\*\s*([A-Za-z_]\w*)\s*\)", stmt)
                if fp and fp.group(1) not in _NOT_A_NAME:
                    out.append({
                        "name": fp.group(1), "type": "function_pointer",
                        "is_pointer": True,
                        "line": content[:start].count("\n") + 1, "kind": "global"
                    })
                continue  # regular function decl

            # split top-level commas (tracking (), [], {})
            parts, cur, d = [], "", 0
            for ch in stmt.rstrip(";").rstrip():
                if ch in "(<[{":   d += 1; cur += ch
                elif ch in ")>]}": d -= 1; cur += ch
                elif ch == "," and d == 0:
                    parts.append(cur); cur = ""
                else: cur += ch
            if cur.strip(): parts.append(cur)
            if not parts: continue

            first = parts[0].strip() + " "
            m = re.match(
                r"((?:[A-Za-z_][\w:<>]*\s+)+)(\**)\s*([A-Za-z_]\w*)"
                r"(\s*\[[^\]]*\])?\s*(?:=.*)?$",
                first, re.S
            )
            if not m:
                continue
            vtype = m.group(1).strip()
            if re.search(r"\b(return|if|while|for|switch|case|do|else)\b", vtype):
                continue
            if not re.search(r"[A-Za-z_]", vtype):
                continue
            first_name = m.group(3)
            if first_name in _C_KEYWORDS or first_name in _NOT_A_NAME:
                continue
            line = content[:start].count("\n") + 1
            out.append({
                "name": first_name, "type": vtype,
                "is_pointer": bool(m.group(2)), "line": line, "kind": "global"
            })
            for p in parts[1:]:
                pm = re.match(r"\s*(\**)\s*([A-Za-z_]\w*)", p)
                if pm and pm.group(2) not in _C_KEYWORDS and pm.group(2) not in _NOT_A_NAME:
                    out.append({
                        "name": pm.group(2), "type": vtype,
                        "is_pointer": bool(m.group(2)) or bool(pm.group(1)),
                        "line": line, "kind": "global"
                    })
        return out


# ---------------------------------------------------------------------- #
# CLI: JSON dump for a file, or --selftest to verify gAntiPiracyCRCStart
# ---------------------------------------------------------------------- #
if __name__ == "__main__":
    import sys, json, tempfile, os as _os
    if "--selftest" in sys.argv:
        sample = r'''
#include <stdio.h>
#include "audiomgr.h"
#define CRC_START_MAGIC 0xA5A5A5A5
#define CRC_POLY(x) ((x) << 1)
extern volatile uint32_t gAntiPiracyCRCStart;
extern int gAntiPiracyEnabled;
uint32_t gAntiPiracyCRCStart = 0;
static const char *gAntiPiracyTag = "AUDIO_MGR";
unsigned long gCounter = 0;
volatile int *gpFlag;
typedef struct { uint32_t start_crc; uint32_t end_crc; int enabled; } AntiPiracyState;
enum AntiPiracyMode { MODE_OFF, MODE_STRICT, MODE_LENIENT };
static inline void init_anti_piracy(void) { gAntiPiracyCRCStart = CRC_START_MAGIC; }
uint32_t compute_crc(const uint8_t *buf, size_t len) { uint32_t l = 0; return l; }
'''
        with tempfile.NamedTemporaryFile("w", suffix=".c", delete=False) as f:
            f.write(sample)
            path = f.name
        try:
            p = ASTParser(_os.path.dirname(path))
            r = p.parse_source_symbols(_os.path.basename(path))
        finally:
            _os.unlink(path)

        idx = r["symbols_by_name"]
        failures = []
        def want(name, kind):
            kinds = [e["kind"] for e in idx.get(name, [])]
            if kind not in kinds:
                failures.append(f"MISSING {name} as {kind} (got {kinds})")
        want("gAntiPiracyCRCStart", "extern")
        want("gAntiPiracyCRCStart", "global")
        want("gAntiPiracyEnabled", "extern")
        want("gAntiPiracyTag",     "global")
        want("gCounter",           "global")
        want("gpFlag",             "global")
        want("CRC_START_MAGIC",    "macro_object")
        want("CRC_POLY",           "macro_function")
        want("AntiPiracyState",    "typedef")
        want("MODE_OFF",           "enum_member")
        want("MODE_STRICT",        "enum_member")
        want("MODE_LENIENT",       "enum_member")
        want("start_crc",          "struct_field")
        want("end_crc",            "struct_field")
        want("init_anti_piracy",   "function")
        want("compute_crc",        "function")
        if failures:
            print("[SELFTEST FAIL]")
            for f in failures: print("  -", f)
            sys.exit(1)
        print("[SELFTEST OK] all expected symbols found:")
        for n in ("gAntiPiracyCRCStart","CRC_START_MAGIC","AntiPiracyState","compute_crc"):
            kinds = [e["kind"] for e in idx[n]]
            print(f"  {n}: {kinds}")
        sys.exit(0)

    if len(sys.argv) > 1:
        path = sys.argv[1]
        p = ASTParser(_os.path.dirname(path) or ".")
        print(json.dumps(p.parse_source_symbols(_os.path.basename(path)), indent=2))
    else:
        print("[*] AST Parser initialized successfully.")
