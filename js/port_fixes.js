/* port_fixes.js v17 - load after ide_core.js */
(function () {
  "use strict";
  try {
  const E = NeuroSymbolicEngine.prototype;
  const RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const texts = () => cachedFileTexts;
  const TYPE_RE = /\b(?:s32|u32|int32_t|uint32_t|unsigned\s+int|int)\b/;

  // 1. Honest labels: only a compiler can promote a finding.
  const origVerify = E.verifyFindingEndToEnd;
  E.verifyFindingEndToEnd = function (f) {
    const r = origVerify.call(this, f);
    if (!r) return r;
    if (r.compilerConfirmed) r.verificationStatus = "COMPILER_CONFIRMED";
    else if (r.verificationStatus === "VERIFIED_SAFE") r.verificationStatus = "PATTERN_MATCHED";
    return r;
  };

  // 2. Preprocessor awareness + use-site analysis for pointer truncation.
  function macroActive(engine, name) {
    if (engine.macroTable.has(name)) return true;
    const t = texts();
    const re = new RegExp("\\b" + name + "\\b");
    return [...engine.androidModel.cmakeFiles, ...engine.androidModel.gradleFiles]
      .some(p => t[p] && re.test(t[p]));
  }
  function enclosingGuards(lines, idx) {
    const guards = []; let depth = 0, inElse = false, sawElif = false;
    for (let i = idx - 1; i >= 0 && i > idx - 400; i--) {
      const t = lines[i].trim();
      if (!t.startsWith("#")) continue;
      if (/^#\s*endif\b/.test(t)) depth++;
      else if (/^#\s*else\b/.test(t)) { if (depth === 0) inElse = true; }
      else if (/^#\s*elif\b/.test(t)) { if (depth === 0) sawElif = true; }
      else if (/^#\s*if/.test(t)) {
        if (depth > 0) depth--;
        else { guards.push({ line: i + 1, cond: t, negated: inElse, elif: sawElif }); inElse = false; sawElif = false; }
      }
    }
    return guards;
  }
  function guardState(engine, g) {
    if (g.elif) return { known: false };
    let m, name, neg = false;
    if ((m = g.cond.match(/^#\s*ifdef\s+(\w+)/))) name = m[1];
    else if ((m = g.cond.match(/^#\s*ifndef\s+(\w+)/))) { name = m[1]; neg = true; }
    else if ((m = g.cond.match(/^#\s*if\s+defined\s*\(?\s*(\w+)\s*\)?\s*$/))) name = m[1];
    else if ((m = g.cond.match(/^#\s*if\s+!\s*defined\s*\(?\s*(\w+)\s*\)?\s*$/))) { name = m[1]; neg = true; }
    else return { known: false };
    let active = macroActive(engine, name);
    if (neg) active = !active;
    if (g.negated) active = !active;
    return { known: true, name, active };
  }
  function analyzeTruncation(engine, f, lines) {
    const idx = f.line - 1;
    const lhs = (f.code.match(/^\s*([A-Za-z_]\w*)\s*=\s*\(/) || [])[1];
    const info = { lhs, derefLine: null, decl: null, guards: [], antiTamper: false };
    info.antiTamper = /piracy|tamper|\bcrc\b|checksum/i.test(lines.slice(Math.max(0, idx - 4), idx + 5).join("\n"));
    info.guards = enclosingGuards(lines, idx).map(g => Object.assign({}, g, guardState(engine, g)));
    if (!lhs) return info;
    const castBack = new RegExp("\\(\\s*[A-Za-z_][\\w\\s]*\\*+\\s*\\)\\s*" + lhs + "\\b");
    for (let i = idx + 1; i < Math.min(lines.length, idx + 60); i++) {
      if (castBack.test(lines[i])) { info.derefLine = i + 1; break; }
    }
    const declRe = new RegExp("^\\s*(?:(?:static|volatile|register)\\s+)*(?:s32|u32|int32_t|uint32_t|int|unsigned\\s+int)\\s+" + lhs + "\\s*(?:=[^;]*)?;");
    for (let i = idx - 1; i >= 0 && i > idx - 200; i--) {
      if (declRe.test(lines[i])) { info.decl = { line: i + 1, text: lines[i] }; break; }
    }
    return info;
  }

  const origFinalize = E.finalizeCrossReferences;
  E.finalizeCrossReferences = function () {
    origFinalize.call(this);
    const t = texts(), cache = new Map(), extra = [], kept = [];
    const linesOf = p => { if (!cache.has(p)) cache.set(p, t[p] !== undefined ? t[p].split("\n") : null); return cache.get(p); };
    for (const f of this.auditFindings) {
      if (/Hardcoded 4096/.test(f.category) && !/\b(?:mmap|mprotect|madvise|munmap|posix_memalign|aligned_alloc)\b/.test(f.code)) continue;
      if (f.category === "ARM64 Pointer Truncation / MTE Hazard" && !f.port17) {
        const lines = linesOf(f.filePath);
        if (lines) {
          f.port17 = true;
          const info = analyzeTruncation(this, f, lines);
          const dead = info.guards.find(g => g.known && !g.active);
          const tamper = info.antiTamper ? " This looks like an integrity/anti-tamper check: recompiled aarch64 code can never match the original checksum, so prefer disabling it (e.g. #if defined(ANTI_TAMPER) && !defined(__aarch64__)) over widening types." : "";
          if (dead) {
            f.severity = "LOW"; f.advisory = true;
            f.reason = "Inside '" + dead.cond + "' but " + dead.name + " is not defined in any scanned source or build file, so this is probably not compiled for Android. Confirm with a clang diagnostic." + tamper;
          } else if (info.derefLine) {
            f.severity = "CRITICAL";
            f.reason = "A pointer is truncated to 32 bits into '" + info.lhs + "', then cast back to a pointer at line " + info.derefLine + ". Dereferencing it faults (SIGSEGV)." + tamper;
            if (info.decl) extra.push({
              severity: "CRITICAL", category: "ARM64 Pointer Truncation (companion declaration)",
              filePath: f.filePath, line: info.decl.line, code: info.decl.text.trim(),
              reason: "'" + info.lhs + "' holds a pointer-sized value; a 32-bit declaration truncates it again on assignment, so the (uintptr_t) cast at line " + f.line + " has no effect until this is widened.",
              replaceLine: true, fixSuggestion: info.decl.text.trim().replace(TYPE_RE, "uintptr_t"),
              requiredHeader: f.requiredHeader || null, verificationStatus: "PATTERN_MATCHED", verificationNotes: [], port17: true
            });
          } else {
            f.severity = "LOW"; f.advisory = true;
            f.reason = "Pointer truncated to 32 bits but no cast back to a pointer was found within 60 lines; it is only used as an integer. Behavior is probably unchanged; confirm with clang." + tamper;
          }
        }
      }
      kept.push(f);
    }
    const seen = new Set(), out = [];
    for (const f of kept.concat(extra)) {
      const k = f.category + "|" + f.filePath + "|" + f.line + "|" + f.code;
      if (seen.has(k)) continue;
      seen.add(k); out.push(f);
    }
    out.sort((a, b) => (RANK[a.severity] ?? 4) - (RANK[b.severity] ?? 4));
    this.auditFindings = out;
    if (window.triggerCoderSnapshot) window.triggerCoderSnapshot();
  };

  // 3. Clang diagnostics as ground truth (paste output of scripts/diag.sh).
  const CAST_FLAGS = new Set(["-Wint-to-pointer-cast", "-Wpointer-to-int-cast", "-Wshorten-64-to-32", "-Wint-conversion"]);
  const SEV = { "-Wint-to-pointer-cast": "CRITICAL", "-Wpointer-to-int-cast": "CRITICAL", "-Wint-conversion": "HIGH",
    "-Wincompatible-pointer-types": "HIGH", "-Wimplicit-function-declaration": "HIGH", "-Wreturn-type": "HIGH",
    "-Wshorten-64-to-32": "MEDIUM", "-Wformat": "MEDIUM" };
  E.ingestClangDiagnostics = function (log) {
    const re = /([\w.\/+-]+\.(?:c|cc|cpp|cxx|h|hpp)):(\d+):(\d+):\s*(warning|error):\s*([\s\S]*?)(?=\s[\w.\/+-]+\.(?:c|cc|cpp|cxx|h|hpp):\d+:\d+:|\s\d+ (?:warnings?|errors?) generated|$)/g;
    const t = texts(), keys = Array.from(this.fileSummaries.keys()), cache = new Map();
    let m, total = 0, ignored = 0, unmatched = 0, confirmed = 0, added = 0;
    const byFlag = {}, sample = [];
    while ((m = re.exec(log)) !== null) {
      total++;
      const raw = m[1].replace(/^(?:\.{1,2}\/)+/, ""), line = Number(m[2]), kind = m[4];
      const fm = m[5].match(/\[(-W[\w-]+)\]/), flag = fm ? fm[1] : null;
      const msg = (fm ? m[5].slice(0, fm.index) : m[5]).trim().slice(0, 220);
      if (flag && /^-Wunused/.test(flag)) { ignored++; continue; }
      const path = keys.find(k => k === raw || k.endsWith("/" + raw) || raw.endsWith("/" + k));
      if (!path) { unmatched++; continue; }
      byFlag[flag || kind] = (byFlag[flag || kind] || 0) + 1;
      if (!cache.has(path)) cache.set(path, t[path] !== undefined ? t[path].split("\n") : null);
      const src = cache.get(path), codeLine = src && src[line - 1] !== undefined ? src[line - 1].trim() : "";
      const existing = this.auditFindings.find(f => f.filePath === path && f.line === line && /Pointer Truncation/.test(f.category));
      if (existing && flag && CAST_FLAGS.has(flag)) {
        existing.compilerConfirmed = true; existing.verificationStatus = "COMPILER_CONFIRMED"; existing.compilerNote = msg;
        confirmed++; continue;
      }
      const f = {
        severity: kind === "error" ? "CRITICAL" : (SEV[flag] || "LOW"),
        category: "Clang: " + (flag || kind), filePath: path, line, code: codeLine,
        reason: "Compiler diagnostic (ground truth): " + msg,
        fixSuggestion: "// [clang " + (flag || kind) + "] " + msg + "\n" + codeLine,
        advisory: true, compilerConfirmed: true, verificationStatus: "COMPILER_CONFIRMED", verificationNotes: [], port17: true
      };
      if (!this.auditFindings.some(x => x.category === f.category && x.filePath === path && x.line === line)) { this.auditFindings.push(f); added++; }
      if (sample.length < 6) sample.push("<code>" + esc(path) + ":" + line + "</code> " + esc(flag || kind) + ": " + esc(msg.slice(0, 110)));
    }
    this.auditFindings.sort((a, b) => (RANK[a.severity] ?? 4) - (RANK[b.severity] ?? 4));
    if (typeof updateStatusBar === "function") updateStatusBar();
    if (window.triggerCoderSnapshot) window.triggerCoderSnapshot();
    let html = "<strong>Clang diagnostics ingested:</strong> " + total + " parsed, " + added + " new findings, " + confirmed + " existing findings COMPILER_CONFIRMED, " + ignored + " unused-warnings ignored, " + unmatched + " in files not in the workspace.<br>";
    html += Object.entries(byFlag).map(([k, v]) => "<code>" + esc(k) + "</code> x" + v).join(", ") + "<br>" + sample.join("<br>");
    return { html, synthesizedDiff: null };
  };
  const origRespond = E.analyzeAndRespond;
  E.analyzeAndRespond = function (q) {
    if (typeof q === "string" && /\.(?:c|cc|cpp|cxx|h|hpp):\d+:\d+:\s*(?:warning|error):/.test(q)) return this.ingestClangDiagnostics(q);
    return origRespond.call(this, q);
  };

  // 4. Commit safety: no duplicate-line inserts, no commits against placeholder text.
  const isAdvisory = f => Boolean(f.advisory) || f.fixKind === "advisory" || !(f.replaceLine || f.replaceSpan);
  const origStage = stageFindingAtIndex;
  window.stageFindingAtIndex = function (idx) {
    origStage(idx);
    const f = engine.auditFindings[activeFindingIndex];
    if (f && pendingDiff) {
      pendingDiff.advisory = isAdvisory(f);
      if (pendingDiff.advisory) { pendingDiff.symbolName += " [ADVISORY - no auto-edit]"; renderSynthesizedDiff(pendingDiff); }
    }
  };
  const origApprove = approveAndSave;
  window.approveAndSave = async function () {
    const pd = pendingDiff;
    if (pd && pd.advisory) {
      appendAgentMessage("<strong>Advisory finding:</strong> no safe automatic edit exists for this one. Change it by hand, then re-run the audit.");
      return;
    }
    if (pd) {
      const p = pd.filePath, tx = texts()[p];
      const real = patchedContents[p] !== undefined || workspaceFiles[p] instanceof File || (tx !== undefined && !/^\/\/ Cached workspace entry/.test(tx));
      if (!real) {
        appendAgentMessage("<strong>Commit blocked:</strong> the original text of <code>" + esc(p) + "</code> is not loaded (restored session or file over 2 MB). Re-open the workspace first.");
        return;
      }
    }
    return origApprove();
  };

  // 5. Clear the database that is actually used (canceling pending debounced saves).
  if (window.coderPersistence) {
    window.coderPersistence.clearSnapshot = async function () {
      clearTimeout(this._saveTimer);
      try {
        const db = await window.coderPersistence.init();
        await new Promise(res => { const tx = db.transaction("session", "readwrite"); tx.objectStore("session").clear(); tx.oncomplete = res; tx.onerror = res; });
        return true;
      } catch (e) { return false; }
    };
  }
  window.addEventListener("DOMContentLoaded", () => setTimeout(() => appendAgentMessage("<strong>port_fixes v17 active:</strong> honest verification labels, #ifdef-aware pointer analysis, clang diagnostic ingestion, safe commits."), 1500));
  } catch (e) {
    window.addEventListener("DOMContentLoaded", () => setTimeout(() => appendAgentMessage("<strong>port_fixes failed to load:</strong> " + String(e && e.message)), 1500));
  }
})();
