/* js/cross_file_truncation.js v23 - Cross-file struct field & function parameter 32-bit truncation auditor */
(function () {
  "use strict";

  const RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const BASE_INT32_RE = /^(?:s32|u32|int32_t|uint32_t|int|unsigned\s+int|long|unsigned\s+long)$/;
  const resolvedInt32Typedefs = new Set();
  const astStructOverrides = new Map();
  const astParamOverrides = new Map();

  function buildTransitiveInt32Typedefs(texts) {
    const aliasToBase = new Map();
    for (const [filePath, src] of Object.entries(texts)) {
      if (typeof src !== "string" || !/\.(c|cc|cpp|cxx|h|hpp)$/i.test(filePath)) continue;
      const cleanSrc = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
      const re = /\btypedef\s+([^;{}]+?)\s+([A-Za-z_]\w*)\s*;/g;
      let m;
      while ((m = re.exec(cleanSrc)) !== null) {
        const base = m[1].replace(/\b(?:const|volatile|struct|enum|union)\b/g, "").replace(/\s+/g, " ").trim();
        const alias = m[2].trim();
        if (alias && base && !base.includes("*")) {
          aliasToBase.set(alias, base);
        }
      }
    }
    for (const alias of aliasToBase.keys()) {
      let cur = alias;
      const visited = new Set();
      while (cur && !visited.has(cur)) {
        visited.add(cur);
        if (BASE_INT32_RE.test(cur) || resolvedInt32Typedefs.has(cur)) {
          resolvedInt32Typedefs.add(alias);
          break;
        }
        cur = aliasToBase.get(cur);
      }
    }
  }

  window.ingestClangAstMetadata = function (ast) {
    if (!ast) return;
    for (const td of (ast.resolved_int32_typedefs || [])) resolvedInt32Typedefs.add(td);
    for (const sf of (ast.ast_struct_fields || [])) {
      if (!astStructOverrides.has(sf.name)) astStructOverrides.set(sf.name, []);
      const list = astStructOverrides.get(sf.name);
      if (!list.some(x => x.filePath === sf.filePath && x.line === sf.line)) {
        list.push({ filePath: sf.filePath, line: sf.line, type: sf.qualType, code: `${sf.qualType} ${sf.name};` });
      }
    }
    for (const fp of (ast.ast_func_params || [])) {
      astParamOverrides.set(fp.name, [{ filePath: fp.filePath, line: fp.line, params: fp.params, signature: fp.name }]);
    }
  };

  function isInt32TypeName(t) {
    const clean = String(t || "").replace(/\b(?:const|volatile|static|register)\b/g, "").replace(/\s+/g, " ").trim();
    if (BASE_INT32_RE.test(clean)) return true;
    return resolvedInt32Typedefs.has(clean);
  }
  const PTR_EXPR_RE = /(?:\(\s*[A-Za-z_]\w*\s*\)\s*(?:&?[A-Za-z_][\w.\->]*)|&[A-Za-z_][\w.\->]*|\b(?:malloc|calloc|realloc|mmap|bka_lookup_addr_by_low32)\s*\()/;

  function indexDeclarations(texts) {
    buildTransitiveInt32Typedefs(texts);
    const structFields = new Map(); // fieldName -> [{ filePath, line, type, code }]
    const funcParams = new Map();   // funcName -> [{ filePath, line, params: [{ idx, name, type, isInt32 }], signature }]

    for (const [filePath, src] of Object.entries(texts)) {
      if (typeof src !== "string" || !/\.(c|cc|cpp|cxx|h|hpp)$/i.test(filePath)) continue;
      const lines = src.split("\n");

      // Scan struct/union bodies for 32-bit fields
      let inStruct = false, braceDepth = 0;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!inStruct && /\b(?:struct|union)\b[^{;]*\{/.test(line)) {
          inStruct = true;
          braceDepth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
          continue;
        }
        if (inStruct) {
          braceDepth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
          const fm = line.match(/^\s*((?:const\s+|volatile\s+)*(?:s32|u32|int32_t|uint32_t|unsigned\s+int|int))\s+([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*;/);
          if (fm) {
            const fieldName = fm[2];
            if (!structFields.has(fieldName)) structFields.set(fieldName, []);
            structFields.get(fieldName).push({
              filePath, line: i + 1, type: fm[1].trim(), code: line.trim()
            });
          }
          if (braceDepth <= 0) inStruct = false;
        }

        // Scan function definitions/prototypes with at least one 32-bit integer parameter
        const fnMatch = line.match(/^\s*(?:static\s+|inline\s+|extern\s+)*(?:[A-Za-z_][\w\s\*]+?)\b([A-Za-z_]\w*)\s*\(([^;{}()]+)\)\s*(?:\{|;)/);
        if (fnMatch) {
          const fnName = fnMatch[1];
          if (/^(?:if|while|for|switch|return|sizeof)$/.test(fnName)) continue;
          const rawParams = fnMatch[2].split(",").map(p => p.trim()).filter(Boolean);
          if (rawParams.length === 1 && rawParams[0] === "void") continue;
          const parsedParams = rawParams.map((p, idx) => {
            const pm = p.match(/^(.+?)\b([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?$/);
            if (!pm) return { idx, name: "", type: p, isInt32: false };
            const pType = pm[1].trim();
            return { idx, name: pm[2], type: pType, isInt32: isInt32TypeName(pType) };
          });
          if (parsedParams.some(p => p.isInt32)) {
            if (!funcParams.has(fnName)) funcParams.set(fnName, []);
            funcParams.get(fnName).push({
              filePath, line: i + 1, params: parsedParams, signature: line.trim()
            });
          }
        }
      }
    }
    for (const [k, v] of astStructOverrides.entries()) {
      if (!structFields.has(k)) structFields.set(k, v);
    }
    for (const [k, v] of astParamOverrides.entries()) {
      funcParams.set(k, v);
    }
    return { structFields, funcParams };
  }

  function runCrossFileTruncationPass(engine) {
    const texts = typeof cachedFileTexts !== "undefined" ? cachedFileTexts : {};
    const { structFields, funcParams } = indexDeclarations(texts);
    const added = [];

    for (const [filePath, src] of Object.entries(texts)) {
      if (typeof src !== "string" || !/\.(c|cc|cpp|cxx)$/i.test(filePath)) continue;
      const lines = src.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("#")) continue;

        // 1. Struct field pointer assignment: obj->field = (u32)ptr; or obj.field = &sym;
        const fieldAssign = trimmed.match(/(?:->|\.)\s*([A-Za-z_]\w*)\s*=\s*([^;]+);/);
        if (fieldAssign && PTR_EXPR_RE.test(fieldAssign[2])) {
          const fName = fieldAssign[1];
          const decls = structFields.get(fName) || [];
          const targetDecl = decls[0];
          if (targetDecl) {
            const bundleId = `xfield:${targetDecl.filePath}:${targetDecl.line}->${filePath}:${i + 1}`;
            added.push({
              severity: "HIGH",
              category: "Cross-File Struct Field Pointer Truncation",
              filePath,
              line: i + 1,
              code: trimmed,
              reason: `Pointer expression assigned to 32-bit struct field '${fName}' (declared as '${targetDecl.type}' in ${targetDecl.filePath}:${targetDecl.line}). Truncates upper 32 bits on aarch64.`,
              replaceLine: true,
              fixSuggestion: trimmed.replace(/\(\s*(?:u32|s32|uint32_t|int32_t|unsigned\s+int|int)\s*\)/g, "(uintptr_t)"),
              bundleId,
              verificationStatus: "PATTERN_MATCHED",
              verificationNotes: [],
              port17: true
            });
            if (targetDecl.filePath && targetDecl.line) {
              added.push({
                severity: "HIGH",
                category: "ARM64 Pointer Truncation (companion struct field)",
                filePath: targetDecl.filePath,
                line: targetDecl.line,
                code: targetDecl.code,
                reason: `Struct field '${fName}' receives a pointer at line ${i + 1}; widen from '${targetDecl.type}' to 'uintptr_t'.`,
                replaceLine: true,
                fixSuggestion: targetDecl.code.replace(/\b(?:s32|u32|int32_t|uint32_t|unsigned\s+int|int)\b/, "uintptr_t"),
                bundleId,
                verificationStatus: "PATTERN_MATCHED",
                verificationNotes: [],
                port17: true
              });
            }
          }
        }

        // 2. Call-site pointer passed into 32-bit function parameter: fn((u32)ptr, ...)
        const callMatch = trimmed.match(/\b([A-Za-z_]\w*)\s*\(([^;]+)\)\s*;/);
        if (callMatch && funcParams.has(callMatch[1])) {
          const fnName = callMatch[1];
          const args = callMatch[2].split(",").map(a => a.trim());
          const sigs = funcParams.get(fnName);
          const sig = sigs[0];
          for (const p of sig.params) {
            if (!p.isInt32 || p.idx >= args.length) continue;
            if (PTR_EXPR_RE.test(args[p.idx])) {
              added.push({
                severity: "HIGH",
                category: "Cross-File Function Argument Pointer Truncation",
                filePath,
                line: i + 1,
                code: trimmed,
                reason: `Argument #${p.idx + 1} ('${args[p.idx]}') passes a pointer into 32-bit parameter '${p.type} ${p.name}' of '${fnName}' (${sig.filePath}:${sig.line}).`,
                replaceLine: true,
                fixSuggestion: trimmed.replace(/\(\s*(?:u32|s32|uint32_t|int32_t|unsigned\s+int|int)\s*\)/g, "(uintptr_t)"),
                verificationStatus: "PATTERN_MATCHED",
                verificationNotes: [],
                port17: true
              });
            }
          }
        }
      }
    }

    if (added.length > 0) {
      const seen = new Set(engine.auditFindings.map(f => `${f.category}|${f.filePath}|${f.line}|${f.code}`));
      for (const item of added) {
        const key = `${item.category}|${item.filePath}|${item.line}|${item.code}`;
        if (!seen.has(key)) {
          seen.add(key);
          engine.auditFindings.push(item);
        }
      }
      engine.auditFindings.sort((a, b) => (RANK[a.severity] ?? 4) - (RANK[b.severity] ?? 4));
    }
  }

  const prevFinalize = NeuroSymbolicEngine.prototype.finalizeCrossReferences;
  NeuroSymbolicEngine.prototype.finalizeCrossReferences = function () {
    prevFinalize.call(this);
    runCrossFileTruncationPass(this);
  };
})();
