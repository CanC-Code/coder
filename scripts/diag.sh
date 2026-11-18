#!/bin/sh
# usage: diag.sh <repo> <file.c> [extra clang flags, e.g. -DANTI_TAMPER -I...]
repo=$1; f=$2; shift 2
cd "$repo" || exit 1
clang -fsyntax-only -fno-color-diagnostics -fno-caret-diagnostics -Wall -Wno-unused \
  -Wpointer-to-int-cast -Wint-to-pointer-cast -Wshorten-64-to-32 \
  -I include -I src "$@" "$f" 2>&1 | head -c 12000
