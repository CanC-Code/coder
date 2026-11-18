/* js/local_bridge.js v23 - Connects browser IDE to Termux dev_server.py + Batch Apply & Complete Review Export */
(function () {
  "use strict";

  const bridgeState = {
    connected: false,
    defaultRepo: "",
    hasRish: false,
    hasClang: false
  };
  window.coderBridge = bridgeState;

  async function probeBridge() {
    try {
      const resp = await fetch("/api/health", { cache: "no-store" });
      if (!resp.ok) return;
      const data = await resp.json();
      if (!data || !data.ok) return;
      bridgeState.connected = true;
      bridgeState.defaultRepo = data.default_repo || "";
      bridgeState.hasRish = Boolean(data.has_rish);
      bridgeState.hasClang = Boolean(data.has_clang);
      mountBridgeControls();
    } catch (_) {
      // Static file / GitHub Pages mode: bridge stays dormant silently
    }
  }

  function getRepoPath() {
    const saved = localStorage.getItem("coder_target_repo");
    if (saved) return saved;
    if (bridgeState.defaultRepo) return bridgeState.defaultRepo;
    const entered = prompt("Enter local repo path on Termux (e.g. ~/Diddy-Kong-Racing):", "~/Diddy-Kong-Racing");
    if (entered) localStorage.setItem("coder_target_repo", entered.trim());
    return (entered || "").trim();
  }

  window.runLiveClangDiag = async function () {
    if (!bridgeState.connected) {
      appendAgentMessage("<strong>Local Bridge offline:</strong> Start <code>./scripts/serve.sh</code> in Termux to run Clang directly.");
      return;
    }
    const repo = getRepoPath();
    if (!repo) return;
    const targetFile = (typeof currentOpenFile === "string" && currentOpenFile && /\.(c|cc|cpp|cxx)$/i.test(currentOpenFile))
      ? currentOpenFile
      : prompt("Relative C/C++ file path in repo to check with Clang:", "src/main.c");
    if (!targetFile) return;

    appendAgentMessage(`Running <code>scripts/diag.sh</code> on <code>${targetFile}</code>...`);
    try {
      fetch("/api/ast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo, file: targetFile })
      }).then(r => r.ok ? r.json() : null).then(astResp => {
        if (astResp && astResp.ok && astResp.ast && typeof window.ingestClangAstMetadata === "function") {
          window.ingestClangAstMetadata(astResp.ast);
          if (typeof engine.finalizeCrossReferences === "function") engine.finalizeCrossReferences();
        }
      }).catch(() => {});

      const resp = await fetch("/api/diag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo, file: targetFile })
      });
      const data = await resp.json();
      if (!data.ok) {
        appendAgentMessage(`<strong>Clang Bridge Error:</strong> ${data.error}`);
        return;
      }
      if (!data.output) {
        appendAgentMessage(`<strong>Clang Clean:</strong> 0 warnings/errors reported for <code>${targetFile}</code>.`);
        return;
      }
      const res = engine.ingestClangDiagnostics(data.output);
      appendAgentMessage(res.html);
    } catch (e) {
      appendAgentMessage(`<strong>Clang Request Failed:</strong> ${e.message}`);
    }
  };

  window.pullLiveLogcat = async function () {
    if (!bridgeState.connected) {
      appendAgentMessage("<strong>Local Bridge offline:</strong> Start <code>./scripts/serve.sh</code> in Termux to pull Shizuku logcat.");
      return;
    }
    appendAgentMessage("Pulling device <code>logcat</code> via Termux bridge...");
    try {
      const resp = await fetch("/api/logcat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: 500, package: "com.dkrwrapper" })
      });
      const data = await resp.json();
      if (!data.ok) {
        appendAgentMessage(`<strong>Logcat Bridge Error:</strong> ${data.error}`);
        return;
      }
      const logPayload = data.filtered_log || "";
      if (window.coderVisionRuntime && logPayload) {
        const diag = window.coderVisionRuntime.analyzeRuntimeCrashLog(
          logPayload,
          engine,
          p => (typeof patchedContents !== "undefined" && patchedContents[p]) || (typeof cachedFileTexts !== "undefined" && cachedFileTexts[p]) || ""
        );
        appendAgentMessage(diag.html);
        if (diag.synthesizedDiff && typeof renderSynthesizedDiff === "function") {
          renderSynthesizedDiff(diag.synthesizedDiff);
        }
      } else {
        appendAgentMessage(`<strong>Logcat Inspected:</strong> crashed=${Boolean(data.crashed)}`);
      }
    } catch (e) {
      appendAgentMessage(`<strong>Logcat Request Failed:</strong> ${e.message}`);
    }
  };

  window.syncPatchedFileToDisk = async function (filePath, content) {
    if (!bridgeState.connected || !filePath || typeof content !== "string") return false;
    const repo = localStorage.getItem("coder_target_repo") || bridgeState.defaultRepo;
    if (!repo) return false;
    try {
      const resp = await fetch("/api/apply_patch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo, filePath, content })
      });
      const data = await resp.json();
      return Boolean(data && data.ok);
    } catch (_) {
      return false;
    }
  };

  // Batch Apply all non-advisory findings with loaded source text
  window.batchApplySafeFindings = async function () {
    if (typeof engine === "undefined" || !Array.isArray(engine.auditFindings) || engine.auditFindings.length === 0) {
      appendAgentMessage("No audit findings available to batch-apply. Run <strong>Port Audit</strong> first.");
      return;
    }
    let applied = 0;
    let skippedAdvisory = 0;
    let skippedUnloaded = 0;

    for (let idx = 0; idx < engine.auditFindings.length; idx++) {
      const f = engine.auditFindings[idx];
      const isAdv = Boolean(f.advisory) || f.fixKind === "advisory" || !(f.replaceLine || f.replaceSpan);
      if (isAdv) {
        skippedAdvisory++;
        continue;
      }
      const tx = typeof cachedFileTexts !== "undefined" ? cachedFileTexts[f.filePath] : undefined;
      const real = (typeof patchedContents !== "undefined" && patchedContents[f.filePath] !== undefined) ||
                   (typeof workspaceFiles !== "undefined" && workspaceFiles[f.filePath] instanceof File) ||
                   (tx !== undefined && !/^\/\/ Cached workspace entry/.test(tx));
      if (!real) {
        skippedUnloaded++;
        continue;
      }
      if (typeof window.stageFindingAtIndex === "function" && typeof window.approveAndSave === "function") {
        window.stageFindingAtIndex(idx);
        await window.approveAndSave();
        applied++;
      }
    }

    if (bridgeState.connected && typeof patchedContents !== "undefined") {
      for (const [fp, content] of Object.entries(patchedContents)) {
        if (content !== "__BKA_DELETED_FILE__") {
          await window.syncPatchedFileToDisk(fp, content);
        }
      }
    }

    appendAgentMessage(
      `<strong>Batch Apply Complete:</strong> Staged <strong>${applied}</strong> deterministic fix(es) across <strong>${Object.keys(patchedContents || {}).length}</strong> file(s) ` +
      `(${skippedAdvisory} advisory-only skipped, ${skippedUnloaded} unloaded skipped)` +
      `${bridgeState.connected ? " and synced modified files to disk via Termux bridge." : "."}`
    );
  };

  // Export complete human-readable review bundle (.txt) containing audit summary + full unified diffs
  window.exportCompleteReviewText = async function () {
    const paths = typeof patchedContents !== "undefined" ? Object.keys(patchedContents) : [];
    const findings = (typeof engine !== "undefined" && Array.isArray(engine.auditFindings)) ? engine.auditFindings : [];
    if (paths.length === 0 && findings.length === 0) {
      appendAgentMessage("Nothing to export yet. Run <strong>Port Audit</strong> and stage/batch-apply fixes first.");
      return;
    }

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const lines = [
      "================================================================================",
      " CODER NEURO-SYMBOLIC PORTING ENGINE — COMPLETE BATCH CHANGE & AUDIT BUNDLE (v17)",
      ` Generated: ${new Date().toISOString()}`,
      ` Modified Files: ${paths.length} | Total Findings: ${findings.length}`,
      "================================================================================",
      "",
      "--- 1. MODIFIED FILES & AUDIT SUMMARY ---"
    ];

    for (const p of paths) {
      lines.push(`  [MODIFIED] ${p}`);
    }
    lines.push("");
    for (let i = 0; i < findings.length; i++) {
      const f = findings[i];
      const status = f.verificationStatus || "PATTERN_MATCHED";
      const mode = (f.advisory || !(f.replaceLine || f.replaceSpan)) ? "ADVISORY" : "PATCHABLE";
      lines.push(`  #${i + 1} [${f.severity}] [${status}] [${mode}] ${f.category} @ ${f.filePath}:${f.line}`);
      lines.push(`      Reason: ${f.reason}`);
    }

    lines.push("", "--- 2. COMPLETE UNIFIED DIFFS ---", "");
    for (const p of paths) {
      const origLines = ((typeof cachedFileTexts !== "undefined" && cachedFileTexts[p]) || "").split("\n");
      const newLines = (patchedContents[p] || "").split("\n");
      lines.push(`diff --git a/${p} b/${p}`);
      lines.push(`--- a/${p}`);
      lines.push(`+++ b/${p}`);
      if (typeof buildContextUnifiedHunks === "function") {
        lines.push(...buildContextUnifiedHunks(origLines, newLines, 3));
      } else {
        lines.push(`@@ -1,${origLines.length} +1,${newLines.length} @@`);
        for (const l of newLines) lines.push(`+${l}`);
      }
      lines.push("");
    }

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `coder-complete-changes-${ts}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    appendAgentMessage(`<strong>Exported Complete Change Bundle:</strong> Downloaded <code>coder-complete-changes-${ts}.txt</code> (${paths.length} modified file(s), ${findings.length} audit entries).`);
  };

  function mountAlwaysAvailableBatchButtons() {
    const exportBtn = document.querySelector('button[onclick="exportUnifiedPatch()"]');
    if (exportBtn && exportBtn.parentElement && !document.getElementById("btn-batch-apply")) {
      const btnBatch = document.createElement("button");
      btnBatch.id = "btn-batch-apply";
      btnBatch.type = "button";
      btnBatch.textContent = "Batch Apply Safe";
      btnBatch.title = "Stage all non-advisory deterministic fixes in memory (and sync to disk if Termux bridge is active)";
      btnBatch.style.cssText = "background:#238636;border:none;color:white;padding:8px 12px;border-radius:4px;font-size:12px;font-weight:600;cursor:pointer;";
      btnBatch.onclick = window.batchApplySafeFindings;

      const btnFullTxt = document.createElement("button");
      btnFullTxt.id = "btn-export-full-txt";
      btnFullTxt.type = "button";
      btnFullTxt.textContent = "Export Full .txt";
      btnFullTxt.title = "Download complete human-readable review bundle (.txt) with all audit metadata and unified diffs";
      btnFullTxt.style.cssText = "background:#8957e5;border:none;color:white;padding:8px 12px;border-radius:4px;font-size:12px;font-weight:600;cursor:pointer;";
      btnFullTxt.onclick = window.exportCompleteReviewText;

      exportBtn.parentElement.insertBefore(btnBatch, exportBtn);
      exportBtn.parentElement.appendChild(btnFullTxt);
    }
  }

  function mountBridgeControls() {
    const chatInputArea = document.querySelector(".chat-input-area");
    if (chatInputArea && !document.getElementById("btn-bridge-logcat")) {
      const btnLog = document.createElement("button");
      btnLog.id = "btn-bridge-logcat";
      btnLog.type = "button";
      btnLog.textContent = "Logcat";
      btnLog.title = "Pull live device logcat via Termux bridge (rish)";
      btnLog.style.cssText = "padding:6px 8px;font-size:11px;white-space:nowrap;";
      btnLog.onclick = window.pullLiveLogcat;

      const btnClang = document.createElement("button");
      btnClang.id = "btn-bridge-clang";
      btnClang.type = "button";
      btnClang.textContent = "Clang";
      btnClang.title = "Run scripts/diag.sh on current file via Termux bridge";
      btnClang.style.cssText = "padding:6px 8px;font-size:11px;white-space:nowrap;";
      btnClang.onclick = window.runLiveClangDiag;

      chatInputArea.insertBefore(btnClang, chatInputArea.firstChild);
      chatInputArea.insertBefore(btnLog, chatInputArea.firstChild);
    }
    appendAgentMessage(`<strong>Termux Bridge Connected (v23):</strong> ${bridgeState.defaultRepo ? "Repo <code>" + bridgeState.defaultRepo + "</code> detected." : "Ready for live Clang & Shizuku logcat."}`);
  }

  window.addEventListener("DOMContentLoaded", () => {
    mountAlwaysAvailableBatchButtons();
    probeBridge();
  });
})();

// Web GUI Pipeline Task Dispatcher (v24)
window.runPipelineTask = async function (task, label) {
  if (!window.coderBridge || !window.coderBridge.connected) {
    // Offline browser fallbacks when running without Termux dev_server.py
    if (task === "batch_export" && typeof window.batchApplySafeFindings === "function") {
      return window.batchApplySafeFindings();
    }
    if ((task === "patch_export" || task === "auto_export") && typeof window.exportCompleteReviewText === "function") {
      return window.exportCompleteReviewText();
    }
    appendAgentMessage(
      `<strong>Local Bridge Offline:</strong> Task <code>${label || task}</code> requires the Termux Python bridge (` +
      `<code>./scripts/serve.sh</code>), or use the browser-native Port Audit / Establish Port / Export Full .txt controls.`
    );
    return;
  }

  const repo = localStorage.getItem("coder_target_repo") || window.coderBridge.defaultRepo;
  appendAgentMessage(`Running <strong>${label || task}</strong> on <code>${repo || "workspace"}</code>...`);
  try {
    const resp = await fetch("/api/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo, task })
    });
    const data = await resp.json();
    if (!data.ok && !data.output) {
      appendAgentMessage(`<strong>${label || task} Failed:</strong> ${data.error || "Unknown error"}`);
      return;
    }
    const statusBadge = data.ok
      ? `<span style="color:#3fb950;">[PASS]</span>`
      : `<span style="color:#f85149;">[DEFECTS FOUND]</span>`;
    appendAgentMessage(
      `<strong>${label || task}</strong> ${statusBadge}<br>` +
      `<pre style="white-space:pre-wrap;font-size:11px;max-height:220px;overflow:auto;background:#0d1117;padding:8px;border-radius:4px;border:1px solid #30363d;">${String(data.output || "").replace(/</g, "&lt;")}</pre>`
    );
  } catch (e) {
    appendAgentMessage(`<strong>${label || task} Request Error:</strong> ${e.message}`);
  }
};

window.handleScreenshotInspect = async function (event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  try {
    if (window.coderVisionRuntime && typeof window.coderVisionRuntime.assessScreenshotFile === "function") {
      const res = await window.coderVisionRuntime.assessScreenshotFile(
        file,
        engine,
        p => (typeof patchedContents !== "undefined" && patchedContents[p]) || (typeof cachedFileTexts !== "undefined" && cachedFileTexts[p]) || ""
      );
      appendAgentMessage(res.html);
      if (res.synthesizedDiff && typeof renderSynthesizedDiff === "function") {
        renderSynthesizedDiff(res.synthesizedDiff);
      }
    }
  } catch (e) {
    appendAgentMessage(`<strong>Vision Inspection Error:</strong> ${e.message}`);
  } finally {
    event.target.value = "";
  }
};

window.handleCrashLogUpload = async function (event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    if (window.coderVisionRuntime && typeof window.coderVisionRuntime.analyzeRuntimeCrashLog === "function") {
      const res = window.coderVisionRuntime.analyzeRuntimeCrashLog(
        text,
        engine,
        p => (typeof patchedContents !== "undefined" && patchedContents[p]) || (typeof cachedFileTexts !== "undefined" && cachedFileTexts[p]) || ""
      );
      appendAgentMessage(res.html);
      if (res.synthesizedDiff && typeof renderSynthesizedDiff === "function") {
        renderSynthesizedDiff(res.synthesizedDiff);
      }
    }
  } catch (e) {
    appendAgentMessage(`<strong>Crash Log Analysis Error:</strong> ${e.message}`);
  } finally {
    event.target.value = "";
  }
};

/* ==========================================================================
   v25 GUI Enhancements: Repository Pill & Global Drag-and-Drop Ingestion
   ========================================================================== */

function updateRepoPillDisplay() {
  const pill = document.getElementById("ns-repo-pill");
  if (!pill) return;
  const repo = localStorage.getItem("coder_target_repo") || (window.coderBridge && window.coderBridge.defaultRepo) || "~/coder";
  const shortName = repo.split("/").pop() || repo;
  pill.textContent = `Repo: ${shortName}`;
  pill.title = `Active Local Repository: ${repo} (Click to switch)`;
}

window.promptSwitchRepo = function () {
  const current = localStorage.getItem("coder_target_repo") || (window.coderBridge && window.coderBridge.defaultRepo) || "~/Diddy-Kong-Racing";
  const entered = prompt("Enter target local repository path on Termux:", current);
  if (entered !== null) {
    const clean = entered.trim();
    localStorage.setItem("coder_target_repo", clean);
    updateRepoPillDisplay();
    appendAgentMessage(`<strong>Target Repository Switched:</strong> <code>${clean}</code>`);
  }
};

// Global Drag-and-Drop Event Handlers
window.addEventListener("DOMContentLoaded", () => {
  updateRepoPillDisplay();

  const dropZone = document.body;
  dropZone.addEventListener("dragover", e => {
    e.preventDefault();
    e.stopPropagation();
  });

  dropZone.addEventListener("drop", async e => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer && e.dataTransfer.files;
    if (!files || files.length === 0) return;

    for (const file of files) {
      const name = file.name.toLowerCase();
      if (/\.(z64|v64|n64|rom|bin)$/.test(name)) {
        appendAgentMessage(`Detected dropped ROM: <code>${file.name}</code>. Analyzing...`);
        const dt = new DataTransfer();
        dt.items.add(file);
        const dummyInput = { target: { files: dt.files, value: "" } };
        if (typeof window.handleRomSelect === "function") {
          await window.handleRomSelect(dummyInput);
        }
      } else if (/\.(png|jpg|jpeg|webp)$/.test(name)) {
        appendAgentMessage(`Detected dropped screenshot: <code>${file.name}</code>. Running Vision Framebuffer Assessment...`);
        const dt = new DataTransfer();
        dt.items.add(file);
        const dummyInput = { target: { files: dt.files, value: "" } };
        if (typeof window.handleScreenshotInspect === "function") {
          await window.handleScreenshotInspect(dummyInput);
        }
      } else if (/\.(log|txt|dump)$/.test(name)) {
        appendAgentMessage(`Detected dropped crash log: <code>${file.name}</code>. Parsing runtime traceback...`);
        const dt = new DataTransfer();
        dt.items.add(file);
        const dummyInput = { target: { files: dt.files, value: "" } };
        if (typeof window.handleCrashLogUpload === "function") {
          await window.handleCrashLogUpload(dummyInput);
        }
      } else {
        appendAgentMessage(`Dropped file <code>${file.name}</code> staged in workspace memory.`);
      }
    }
  });
});
