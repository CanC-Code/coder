#!/usr/bin/env python3
"""Compute the actual undefined-symbol set for a decomp tree.

No compiler required: uses regex to identify functions defined in .c files,
then subtracts from functions *called* by src/*.c.
"""
import argparse
import pathlib
import re
import sys

KEYWORDS = {
    'if','else','for','while','switch','return','sizeof','do','goto','case',
    'default','break','continue','typeof','alignof','alignas','defined',
}

LIBC_LIBM = {
    'memcpy','memset','memmove','memcmp','memchr','strlen','strcmp','strncmp',
    'strcpy','strncpy','strcat','strncat','strchr','strrchr','strstr','strdup',
    'printf','sprintf','snprintf','vprintf','vsprintf','vsnprintf','fprintf',
    'puts','putchar','fputs','fputc','malloc','calloc','realloc','free',
    'abort','exit','atoi','atol','strtol','strtoul','qsort','bsearch',
    'sinf','cosf','tanf','sqrtf','powf','expf','logf','atan2f','fabsf',
    'sin','cos','tan','sqrt','pow','exp','log','atan2','fabs',
    '__fixdfdi','__fixsfdi','__fixunsdfdi','__fixunssfdi','__floatdidf',
    '__floatdisf','__floatundidf','__floatundisf','__powisf2','__divdi3',
    '__udivdi3','__moddi3','__umoddi3','__divsi3','__udivsi3',
    '__muldi3','__ashldi3','__ashrdi3','__lshrdi3','__lshrti3',
}

CALL_RE = re.compile(r'\b([A-Za-z_]\w*)\s*\(')
DEF_RE  = re.compile(r'^[A-Za-z_][\w\s\*]*?\b([A-Za-z_]\w*)\s*\([^;{]*\)\s*\{', re.M)


def strip_comments_and_strings(s):
    def _blank(m): return ' ' * len(m.group(0))
    s = re.sub(r'/\*.*?\*/', _blank, s, flags=re.S)
    s = re.sub(r'//[^\n]*', _blank, s)
    s = re.sub(r'"(?:\\.|[^"\\])*"', _blank, s)
    s = re.sub(r"'(?:\\.|[^'\\])*'", _blank, s)
    return s


def extract_defined(root):
    defined = set()
    for sub in ('src', 'libultra/src'):
        base = pathlib.Path(root) / sub
        if not base.exists():
            continue
        for p in base.rglob('*.c'):
            try: txt = p.read_text(errors='ignore')
            except Exception: continue
            for m in DEF_RE.finditer(txt):
                defined.add(m.group(1))
    return defined


def extract_calls(root):
    calls = set()
    base = pathlib.Path(root) / 'src'
    if not base.exists():
        return calls
    for p in base.rglob('*.c'):
        try: txt = p.read_text(errors='ignore')
        except Exception: continue
        for m in CALL_RE.finditer(strip_comments_and_strings(txt)):
            calls.add(m.group(1))
    return calls



def extract_asm_defined(root):
    """Functions defined in MIPS assembly (.s / .S files)."""
    defined = set()
    glbl = re.compile(r'(?:^\s*(?:glabel|\.global|\.globl)\s+|\b(?:LEAF|NESTED)\s*\(\s*)([A-Za-z_]\w*)', re.M)
    lab  = re.compile(r'^([A-Za-z_]\w*):', re.M)
    for sub in ('asm', 'hasm', 'libultra/asm', 'libultra/src'):
        base = pathlib.Path(root) / sub
        if not base.exists():
            continue
        for p in base.rglob('*.s'):
            try: txt = p.read_text(errors='ignore')
            except Exception: continue
            for m in glbl.finditer(txt): defined.add(m.group(1))
            for m in lab.finditer(txt):  defined.add(m.group(1))
    return defined


def extract_macro_names(root):
    """Object-like and function-like #define names."""
    macros = set()
    pat = re.compile(r'#\s*define\s+([A-Za-z_]\w*)')
    for sub in ('include', 'src', 'libultra/include', 'libultra/src'):
        base = pathlib.Path(root) / sub
        if not base.exists():
            continue
        for ext in ('*.h', '*.c'):
            for p in base.rglob(ext):
                try: txt = p.read_text(errors='ignore')
                except Exception: continue
                for m in pat.finditer(txt):
                    macros.add(m.group(1))
    return macros

NOISE_AND_STD_SYMBOLS = {
    'endif', 'ifdef', 'ifndef', 'else', 'elif', 'define', 'undef', 'pragma', 'include',
    'volatile', 'restrict', 'const', 'signed', 'unsigned',
    's8', 's16', 's32', 's64', 'u8', 'u16', 'u32', 'u64', 'f32', 'f64',
    '__asm__', '__attribute__', '__extension__', '__restrict', '__restrict__',
    '__builtin_bswap16', '__builtin_bswap32', '__builtin_bswap64',
    'atan', 'atan2', 'bcmp', 'bcopy', 'bzero', 'fclose', 'fopen', 'fread', 'fwrite',
    'usleep', 'sleep', 'vfprintf', 'vsnprintf', 'vsprintf',
    'inflate', 'inflateEnd', 'inflateInit', 'inflateInit2', 'deflate', 'deflateEnd', 'deflateInit2',
}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('root')
    ap.add_argument('--out', default=None)
    args = ap.parse_args()

    defined = extract_defined(args.root)
    defined |= extract_asm_defined(args.root)
    macros  = extract_macro_names(args.root)
    calls   = extract_calls(args.root)
    gaps = calls - defined - KEYWORDS - LIBC_LIBM - macros - NOISE_AND_STD_SYMBOLS
    # drop all-caps identifiers (constants / macro-like) and function-pointer typedefs
    gaps = {g for g in gaps if not g.isupper()}
    gaps = {g for g in gaps if g not in
            ('int','char','void','short','long','float','double','unsigned','signed','const')}

    print(f"defined : {len(defined)}")
    print(f"calls   : {len(calls)}")
    print(f"gaps    : {len(gaps)}")
    for n in sorted(gaps)[:40]:
        print('  ' + n)
    if args.out:
        pathlib.Path(args.out).write_text('\n'.join(sorted(gaps)) + '\n')
        print(f"[+] gaps written to {args.out}")


if __name__ == '__main__':
    main()
