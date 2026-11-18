/* js/local_bridge.js v22 - Connects browser IDE to Termux dev_server.py when running on localhost */
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
      appendAgentMessage("<strong>Local Bridge offline:</strong> Start <code>python3 core/runtime/dev_server.py</code> in Termux to run Clang directly.");
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
      appendAgentMessage("<strong>Local Bridge offline:</strong> Start <code>python3 core/runtime/dev_server.py</code> in Termux to pull Shizuku logcat.");
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
    appendAgentMessage(`<strong>Termux Bridge Connected (v22):</strong> ${bridgeState.defaultRepo ? "Repo <code>" + bridgeState.defaultRepo + "</code> detected." : "Ready for live Clang & Shizuku logcat."}`);
  }

  window.addEventListener("DOMContentLoaded", probeBridge);
})();
