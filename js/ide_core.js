const engine = new NeuroSymbolicEngine(0.35);
let workspaceFiles = {};   // relPath -> File
let patchedContents = {};  // relPath -> string (in-memory approved patches)
let currentOpenFile = null;
let pendingDiff = null;
let chatHistory = [];

function updateStatusBar() {
    const statusRight = document.getElementById('status-metrics');
    if (statusRight) {
        statusRight.textContent = `Boxes: ${engine.boxes.size} | .so Targets: ${engine.androidModel.nativeTargets.length} | JNI: ${engine.androidModel.javaNativeMethods.length} | Findings: ${engine.auditFindings.length}`;
    }
}

function showProgress(text) {
    const pc = document.getElementById('progress-container');
    const pt = document.getElementById('progress-text');
    if (pc && pt) {
        pc.style.display = 'block';
        pt.textContent = text;
    }
}

function hideProgress() {
    const pc = document.getElementById('progress-container');
    if (pc) pc.style.display = 'none';
}

async function handleFolderSelect(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    workspaceFiles = {};
    patchedContents = {};
    engine.resetWorkspace();

    const fileTreeEl = document.getElementById('file-tree');
    fileTreeEl.innerHTML = '';

    showProgress(`Indexing directory tree (${files.length} files)...`);

    const root = {};
    const fileArray = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const relPath = file.webkitRelativePath || file.name;
        workspaceFiles[relPath] = file;
        fileArray.push({ path: relPath, file });

        const parts = relPath.split('/');
        let curr = root;
        parts.forEach((part, idx) => {
            if (!curr[part]) {
                curr[part] = (idx === parts.length - 1) ? file : {};
            }
            curr = curr[part];
        });
    }

    renderTree(root, fileTreeEl, "");
    appendAgentMessage(`Mounted workspace with <strong>${files.length}</strong> files. Tracing AndroidManifest, Gradle/Version Catalogs, R8 ProGuard rules, static & RegisterNatives JNI bindings, and runtime call paths...`);

    await ingestFilesInBatches(fileArray, false);
}

async function ingestFilesInBatches(fileArray, isManual = false) {
    const batchSize = 25;
    let processed = 0;
    const textExtensions = new Set(["c", "cpp", "cc", "cxx", "h", "hpp", "s", "asm", "java", "kt", "py", "js", "gradle", "kts", "xml", "mk", "cmake", "txt", "md", "sh", "json", "properties", "toml", "pro"]);

    for (let i = 0; i < fileArray.length; i += batchSize) {
        const batch = fileArray.slice(i, i + batchSize);

        await Promise.all(batch.map(async item => {
            const ext = item.path.split('.').pop().toLowerCase();
            if (!isManual && !textExtensions.has(ext) && !item.path.endsWith("Makefile") && !item.path.endsWith("CMakeLists.txt")) {
                engine.registerNonTextAsset(item.path);
                return;
            }
            try {
                const text = await item.file.text();
                engine.ingestDocument(item.path, text, isManual);
            } catch (err) {
                if (!isManual) engine.registerNonTextAsset(item.path);
            }
        }));

        processed += batch.length;
        showProgress(`${isManual ? "Ingesting manual" : "Tracing Android SDK, Packaging & Runtime"}: ${processed} / ${fileArray.length} files...`);
        updateStatusBar();
        await new Promise(r => setTimeout(r, 2));
    }

    engine.finalizeCrossReferences();
    updateStatusBar();
    hideProgress();

    const am = engine.androidModel;
    const critCount = engine.auditFindings.filter(f => f.severity === "CRITICAL").length;
    const highCount = engine.auditFindings.filter(f => f.severity === "HIGH").length;

    appendAgentMessage(
        `<strong>Android SDK, Packaging & Neuro-Symbolic Runtime Graph Ready:</strong><br>` +
        `• <strong>APK & Build Structure:</strong> ${am.components.length} Manifest components, ${am.nativeTargets.length} native <code>.so</code> target(s), ${am.javaNativeMethods.length} JNI methods (${am.dynamicJniMethods.length} dynamic <code>RegisterNatives</code>), ${am.reverseJniLookups.length} reverse-JNI lookups, ${am.packagedAssets.length} asset/resource entries.<br>` +
        `• <strong>Runtime Graph & Audit:</strong> ${engine.runtimeReachable.size} runtime-reachable symbols; <span style="color:#ff7b72;">${critCount} CRITICAL</span> and <span style="color:#d29922;">${highCount} HIGH</span> Android SDK/JNI/alignment findings.<br>` +
        `• Tap <strong>APK & Runtime</strong>, <strong>Port Audit</strong>, or ask any Android SDK/NDK question or <code>trace &lt;file_or_symbol&gt;</code>.`
    );
}

function renderTree(node, parentElement, prefix) {
    const keys = Object.keys(node).sort((a, b) => {
        const aIsFile = node[a] instanceof File;
        const bIsFile = node[b] instanceof File;
        return aIsFile === bIsFile ? a.localeCompare(b) : aIsFile ? 1 : -1;
    });

    keys.forEach(key => {
        const val = node[key];
        const isFile = val instanceof File;
        const li = document.createElement('li');
        li.style.padding = '4px 6px';
        li.style.fontSize = '12px';
        li.style.cursor = 'pointer';
        li.style.borderRadius = '3px';

        if (isFile) {
            li.textContent = `📄 ${key}`;
            const fullPath = prefix ? `${prefix}/${key}` : key;
            li.onclick = () => loadFileIntoEditor(fullPath, val);
        } else {
            li.textContent = `📁 ${key}/`;
            li.style.fontWeight = '600';
            li.style.color = 'var(--text-muted)';

            const subUl = document.createElement('ul');
            subUl.style.listStyle = 'none';
            subUl.style.paddingLeft = '12px';
            subUl.style.display = 'none';

            li.onclick = (e) => {
                e.stopPropagation();
                subUl.style.display = subUl.style.display === 'none' ? 'block' : 'none';
            };

            renderTree(val, subUl, prefix ? `${prefix}/${key}` : key);
            li.appendChild(subUl);
        }
        parentElement.appendChild(li);
    });
}

async function loadFileIntoEditor(path, fileObj) {
    currentOpenFile = path;
    pendingDiff = null;
    document.getElementById('diff-file-title').textContent = `${path} (Loading...)`;
    document.getElementById('diff-view').textContent = "// Reading file contents...";

    try {
        const text = patchedContents[path] !== undefined ? patchedContents[path] : await fileObj.text();
        const sum = engine.fileSummaries.get(path);
        const pkgTag = sum ? ` [${sum.packaging}]` : "";
        document.getElementById('diff-file-title').textContent = `${path}${pkgTag} (${text.length} bytes)${patchedContents[path] ? " [PATCHED]" : ""}`;
        document.getElementById('diff-view').textContent = text;
    } catch (err) {
        document.getElementById('diff-view').textContent = `[!] Error reading file: ${err.message}`;
    }
}

async function handleManualsIngest(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files).map(f => ({ path: f.name, file: f }));
    appendAgentMessage(`Ingesting <strong>${fileArray.length}</strong> reference manual(s) into semantic memory and bidirectional lexicon...`);
    await ingestFilesInBatches(fileArray, true);
}

function renderSynthesizedDiff(diff) {
    if (!diff) return;
    pendingDiff = diff;
    currentOpenFile = diff.filePath;

    const titleEl = document.getElementById('diff-file-title');
    const viewEl = document.getElementById('diff-view');
    titleEl.textContent = `${diff.filePath}:${diff.line} — Synthesized Insertion (${diff.symbolName})`;

    const escapeHtml = str => str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const beforeHtml = diff.contextBefore.map(l => `  ${escapeHtml(l)}`).join('\n');
    const insertHtml = diff.insertionLines.map(l => `<span class="insertion">+ ${escapeHtml(l)}</span>`).join('');
    const afterHtml = diff.contextAfter.map(l => `  ${escapeHtml(l)}`).join('\n');

    viewEl.innerHTML = `${beforeHtml}\n${insertHtml}${afterHtml}`;
}

function runApkInspect() {
    const { html, synthesizedDiff } = engine.analyzeAndroidPackagingAndOperation();
    appendAgentMessage(html);
    if (synthesizedDiff) {
        renderSynthesizedDiff(synthesizedDiff);
    }
    updateStatusBar();
}

function runPortAudit() {
    const { html, synthesizedDiff } = engine.runFullPortAudit();
    appendAgentMessage(html);
    if (synthesizedDiff) {
        renderSynthesizedDiff(synthesizedDiff);
    }
    updateStatusBar();
}

function appendAgentMessage(htmlText) {
    const chatMessages = document.getElementById('chat-messages');
    const agentMsg = document.createElement('div');
    agentMsg.className = 'message agent';
    agentMsg.innerHTML = htmlText;
    chatMessages.appendChild(agentMsg);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    chatHistory.push({ sender: 'agent', text: htmlText });
}

function handleKey(event) {
    if (event.key === 'Enter') {
        sendGoal();
    }
}

function sendGoal() {
    const input = document.getElementById('user-input');
    const text = input.value.trim();
    if (!text) return;

    const chatMessages = document.getElementById('chat-messages');
    const userMsg = document.createElement('div');
    userMsg.className = 'message user';
    userMsg.textContent = text;
    chatMessages.appendChild(userMsg);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    chatHistory.push({ sender: 'user', text });
    input.value = '';

    setTimeout(() => {
        const { html, synthesizedDiff } = engine.analyzeAndRespond(text);
        appendAgentMessage(html);
        if (synthesizedDiff) {
            renderSynthesizedDiff(synthesizedDiff);
        }
        updateStatusBar();
    }, 60);
}

async function approveAndSave() {
    if (!pendingDiff) {
        appendAgentMessage("No pending diff insertion staged. Run a Port Audit or ask the agent to diagnose a specific symbol or file first.");
        return;
    }

    const path = pendingDiff.filePath;
    const fileObj = workspaceFiles[path];
    let originalText = patchedContents[path];

    if (originalText === undefined && fileObj) {
        try {
            originalText = await fileObj.text();
        } catch (e) {
            originalText = "";
        }
    }

    const lines = (originalText || "").split('\n');
    const insertIdx = Math.max(0, Math.min(lines.length, pendingDiff.line - 1));
    lines.splice(insertIdx, 0, ...pendingDiff.insertionLines);
    const updatedText = lines.join('\n');

    patchedContents[path] = updatedText;
    engine.reinforceActiveTethers();
    updateStatusBar();

    document.getElementById('diff-file-title').textContent = `${path} (${updatedText.length} bytes) [COMMITTED]`;
    document.getElementById('diff-view').textContent = updatedText;

    const blob = new Blob([updatedText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = path.split('/').pop();
    a.click();
    URL.revokeObjectURL(url);

    appendAgentMessage(`<strong>Patch Committed & Reinforced:</strong> Applied insertion to <code>${path}</code>, strengthened active conceptual tethers, and exported patched file.`);
    pendingDiff = null;
}

function exportSession() {
    const sessionData = {
        timestamp: new Date().toISOString(),
        chatHistory,
        patchedContents,
        engineState: engine.exportState(),
        fileCount: Object.keys(workspaceFiles).length
    };

    const blob = new Blob([JSON.stringify(sessionData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coder-neuro-state-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function importSession(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (data.engineState) {
                engine.importState(data.engineState);
            }
            patchedContents = data.patchedContents || {};
            chatHistory = data.chatHistory || [];

            const chatMessages = document.getElementById('chat-messages');
            chatMessages.innerHTML = '';
            chatHistory.forEach(msg => {
                const div = document.createElement('div');
                div.className = `message ${msg.sender === 'user' ? 'user' : 'agent'}`;
                div.innerHTML = msg.text;
                chatMessages.appendChild(div);
            });

            updateStatusBar();
            appendAgentMessage(`<strong>Session Restored:</strong> Loaded ${engine.boxes.size} Conceptual Boxes, ${engine.tethers.length} Tethers, and ${engine.auditFindings.length} Alignment Findings.`);
        } catch (err) {
            alert("Failed to load session: " + err.message);
        }
    };
    reader.readAsText(file);
}

window.addEventListener('DOMContentLoaded', updateStatusBar);


// --- Resilient Session Auto-Restore & Continuous Snapshot Hooks ---
(function initResilientCoderSession() {
    if (!window.coderPersistence) return;

    const captureUiState = () => {
        const chatBox = document.getElementById("chat-log") || document.getElementById("agent-output") || document.querySelector(".chat-messages");
        return {
            chatHtml: chatBox ? chatBox.innerHTML : "",
            stagedDiff: typeof currentStagedDiff !== "undefined" ? currentStagedDiff : null,
            dirHandle: typeof rootDirHandle !== "undefined" ? rootDirHandle : null,
            workspaceName: typeof rootDirHandle !== "undefined" && rootDirHandle ? rootDirHandle.name : ""
        };
    };

    window.triggerCoderSnapshot = () => {
        if (typeof engine !== "undefined" && window.coderPersistence) {
            window.coderPersistence.scheduleSnapshot(engine, captureUiState());
        }
    };

    window.addEventListener("beforeunload", () => {
        if (typeof engine !== "undefined" && window.coderPersistence) {
            window.coderPersistence.saveFullSession(engine, captureUiState()).catch(() => {});
        }
    });

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden" && typeof engine !== "undefined" && window.coderPersistence) {
            window.coderPersistence.saveFullSession(engine, captureUiState()).catch(() => {});
        }
    });

    window.addEventListener("DOMContentLoaded", async () => {
        if (typeof engine === "undefined" || !window.coderPersistence) return;
        try {
            const restored = await window.coderPersistence.restoreFullSession(engine);
            if (restored && engine.fileSummaries && engine.fileSummaries.size > 0) {
                const chatBox = document.getElementById("chat-log") || document.getElementById("agent-output") || document.querySelector(".chat-messages");
                if (chatBox && restored.chatHtml) {
                    chatBox.innerHTML = restored.chatHtml;
                }
                if (restored.stagedDiff && typeof renderStagedDiff === "function") {
                    renderStagedDiff(restored.stagedDiff);
                }
                if (typeof updateStatusBar === "function") {
                    updateStatusBar();
                }
                if (typeof appendMessage === "function") {
                    const when = new Date(restored.timestamp).toLocaleTimeString();
                    appendMessage("agent", `<strong>Session Recovered (${when}):</strong> Automatically restored <code>${engine.fileSummaries.size}</code> workspace files, <code>${engine.boxes.size}</code> conceptual nodes, and <code>${engine.auditFindings.length}</code> audit findings from offline IndexedDB.`);
                }
            }
        } catch (err) {
            console.warn("Session recovery skipped:", err);
        }
    });
})();
