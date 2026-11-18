const engine = new NeuroSymbolicEngine(0.35);
let workspaceFiles = {};   // relPath -> File
let patchedContents = {};  // relPath -> string (in-memory approved patches)
let fileLineOffsets = {};  // relPath -> Array<{ atLine: number, delta: number }>
let currentOpenFile = null;
let pendingDiff = null;
let chatHistory = [];

function updateStatusBar() {
    const statusRight = document.getElementById('status-metrics');
    if (statusRight) {
        const manualCount = Array.from(engine.boxes.values()).filter(b => b.type === "manual_section").length;
        const n64LexCount = Object.values(engine.lexicon.dictionary).filter(d => d.domain === "n64_manual").length;
        statusRight.textContent = `Boxes: ${engine.boxes.size} | Manuals: ${manualCount} (${n64LexCount} terms) | .so: ${engine.androidModel.nativeTargets.length} | JNI: ${engine.androidModel.javaNativeMethods.length} | Findings: ${engine.auditFindings.length}`;
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
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;

    workspaceFiles = {};
    patchedContents = {};
    fileLineOffsets = {};
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
                if (!text || text.trim().length === 0) {
                    if (isManual) appendAgentMessage(`<span style="color:#ff7b72;">[!] Manual file <code>${item.path}</code> was empty or unreadable (0 bytes).</span>`);
                    return;
                }
                const storageKey = isManual ? `manuals/${item.path}` : item.path;
                if (text.length < 2000000) {
                    cachedFileTexts[storageKey] = text;
                }
                if (isManual) {
                    workspaceFiles[storageKey] = item.file;
                }
                await engine.ingestDocument(item.path, text, isManual, (pct) => {
                    showProgress(`Ingesting ${item.path}: ${pct}%...`);
                    updateStatusBar();
                });
            } catch (err) {
                if (isManual) {
                    appendAgentMessage(`<span style="color:#ff7b72;">[!] Failed reading manual <code>${item.path}</code>: ${err.message}</span>`);
                } else {
                    engine.registerNonTextAsset(item.path);
                }
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

    if (isManual) {
        const manualBoxes = Array.from(engine.boxes.values()).filter(b => b.type === "manual_section").length;
        const n64Terms = Object.values(engine.lexicon.dictionary).filter(d => d.domain === "n64_manual").length;
        const allTreePaths = Array.from(new Set([
            ...Array.from(engine.fileSummaries.keys()),
            ...Object.keys(workspaceFiles)
        ])).sort();
        if (allTreePaths.length > 0) buildAndRenderTreeFromPaths(allTreePaths);
        appendAgentMessage(
            `<strong>Reference Manual Learned & Cross-Linked:</strong><br>` +
            `• Indexed <strong>${manualBoxes}</strong> manual sections and learned <strong>${n64Terms}</strong> N64 SDK/hardware lexicon entries across <strong>${engine.tethers.length}</strong> total graph tethers.<br>` +
            `• Query any N64 function, register, or hardware subsystem (e.g., <code>osPiStartDma</code>, <code>RSP microcode</code>, <code>VI framebuffer</code>) to retrieve manual excerpts and linked C/C++ code.`
        );
    } else {
        appendAgentMessage(
            `<strong>Android SDK, Packaging & Neuro-Symbolic Runtime Graph Ready:</strong><br>` +
            `• <strong>APK & Build Structure:</strong> ${am.components.length} Manifest components, ${am.nativeTargets.length} native <code>.so</code> target(s), ${am.javaNativeMethods.length} JNI methods (${am.dynamicJniMethods.length} dynamic <code>RegisterNatives</code>), ${am.reverseJniLookups.length} reverse-JNI lookups, ${am.packagedAssets.length} asset/resource entries.<br>` +
            `• <strong>Runtime Graph & Audit:</strong> ${engine.runtimeReachable.size} runtime-reachable symbols; <span style="color:#ff7b72;">${critCount} CRITICAL</span> and <span style="color:#d29922;">${highCount} HIGH</span> Android SDK/JNI/alignment findings.<br>` +
            `• Tap <strong>APK & Runtime</strong>, <strong>Port Audit</strong>, or ask any Android SDK/NDK question or <code>trace &lt;file_or_symbol&gt;</code>.`
        );
    }
}

function renderTree(node, parentElement, prefix) {
    const keys = Object.keys(node).sort((a, b) => {
        const aIsFile = node[a] instanceof File;
        const bIsFile = node[b] instanceof File;
        return aIsFile === bIsFile ? a.localeCompare(b) : aIsFile ? 1 : -1;
    });

    keys.forEach(key => {
        const val = node[key];
        const isFile = val instanceof File || (val && typeof val.text === 'function');
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
        const text = patchedContents[path] !== undefined ? patchedContents[path] : (cachedFileTexts[path] !== undefined ? cachedFileTexts[path] : await fileObj.text());
        const sum = engine.fileSummaries.get(path);
        const pkgTag = sum ? ` [${sum.packaging}]` : "";
        const maxPreview = 250000;
        const displayText = text.length > maxPreview
            ? text.slice(0, maxPreview) + `\n\n// ... [Truncated preview at ${maxPreview} bytes of ${text.length} total bytes] ...`
            : text;
        document.getElementById('diff-file-title').textContent = `${path}${pkgTag} (${text.length} bytes)${patchedContents[path] ? " [PATCHED]" : ""}`;
        document.getElementById('diff-view').textContent = displayText;
    } catch (err) {
        document.getElementById('diff-view').textContent = `[!] Error reading file: ${err.message}`;
    }
}

async function handleManualsIngest(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;

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

async function handleScreenshotAssess(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file || !window.coderVisionRuntime) return;
    appendAgentMessage(`Analyzing screenshot <code>${file.name}</code> with Wasm Vision Kernel against ingested framebuffer & GBI specs...`);
    const getFileText = (p) => patchedContents[p] !== undefined ? patchedContents[p] : (cachedFileTexts[p] || "");
    const { html, synthesizedDiff } = await window.coderVisionRuntime.assessScreenshotFile(file, engine, getFileText);
    appendAgentMessage(html);
    if (synthesizedDiff) renderSynthesizedDiff(synthesizedDiff);
    updateStatusBar();
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

    setTimeout(async () => {
        const qLower = text.toLowerCase().trim();
        const hydrateAllWorkspaceTexts = async () => {
            for (const [p, fObj] of Object.entries(workspaceFiles)) {
                if (cachedFileTexts[p] === undefined && fObj && typeof fObj.text === "function") {
                    try { cachedFileTexts[p] = await fObj.text(); } catch (e) {}
                }
            }
        };
        const getFileText = (p) => patchedContents[p] !== undefined ? patchedContents[p] : (cachedFileTexts[p] || "");
        const applyFileEdits = (edits) => {
            for (const ed of edits) {
                if (ed.action === "delete") {
                    patchedContents[ed.filePath] = "__BKA_DELETED_FILE__";
                } else if (ed.action === "create" || ed.action === "modify") {
                    patchedContents[ed.filePath] = ed.newText;
                    if (ed.action === "create") {
                        workspaceFiles[ed.filePath] = { name: ed.filePath.split('/').pop(), text: async () => ed.newText };
                    }
                }
            }
            const allTreePaths = Array.from(new Set([
                ...Array.from(engine.fileSummaries.keys()),
                ...Object.keys(workspaceFiles)
            ])).filter(p => patchedContents[p] !== "__BKA_DELETED_FILE__").sort();
            if (allTreePaths.length > 0) buildAndRenderTreeFromPaths(allTreePaths);
            if (window.triggerCoderSnapshot) window.triggerCoderSnapshot();
        };

        const moveMatch = text.match(/^(?:move|rename)\s+(?:file\s+)?(\S+)\s+(?:to|->)\s+(\S+)$/i);
        const delMatch = text.match(/^(?:delete|remove)\s+(?:file\s+)?(\S+)$/i);

        if (moveMatch) {
            await hydrateAllWorkspaceTexts();
            const { html, fileEdits } = engine.planFileMove(moveMatch[1], moveMatch[2], getFileText);
            applyFileEdits(fileEdits);
            appendAgentMessage(html);
            updateStatusBar();
            return;
        }
        if (delMatch) {
            await hydrateAllWorkspaceTexts();
            const { html, fileEdits } = engine.planFileDelete(delMatch[1], getFileText);
            applyFileEdits(fileEdits);
            appendAgentMessage(html);
            updateStatusBar();
            return;
        }
        if (qLower.includes("unify stub") || qLower.includes("consolidate stub") || qLower.includes("merge stub")) {
            await hydrateAllWorkspaceTexts();
            const { html, fileEdits } = engine.planStubUnification(getFileText);
            applyFileEdits(fileEdits);
            appendAgentMessage(html);
            updateStatusBar();
            return;
        }

        if (window.coderVisionRuntime && window.coderVisionRuntime.isRuntimeCrashLog(text)) {
            const { html, synthesizedDiff } = window.coderVisionRuntime.analyzeRuntimeCrashLog(text, engine, getFileText);
            appendAgentMessage(html);
            if (synthesizedDiff) renderSynthesizedDiff(synthesizedDiff);
            updateStatusBar();
            return;
        }

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

    if (!originalText && cachedFileTexts[path]) {
        originalText = cachedFileTexts[path];
    }
    const lines = (originalText || "").split('\n');
    const priorShifts = (fileLineOffsets[path] || []).reduce((acc, op) => op.atLine <= pendingDiff.line ? acc + op.delta : acc, 0);
    let insertIdx = Math.max(0, Math.min(lines.length, (pendingDiff.line - 1) + priorShifts));
    const codeLines = pendingDiff.insertionLines.filter(l => !l.trim().startsWith("// [Co-requisite"));

    let delta = 0;
    if (pendingDiff.replaceSpan && pendingDiff.endLine >= pendingDiff.line && insertIdx < lines.length) {
        const spanCount = Math.min(lines.length - insertIdx, (pendingDiff.endLine - pendingDiff.line) + 1);
        lines.splice(insertIdx, spanCount, ...codeLines);
        delta = codeLines.length - spanCount;
    } else if (pendingDiff.replaceLine && insertIdx < lines.length) {
        const origIndent = (lines[insertIdx].match(/^\s*/) || [""])[0];
        const formatted = codeLines.map((l, idx) => idx === 0 && !l.startsWith(origIndent) ? origIndent + l.trimStart() : l);
        lines.splice(insertIdx, 1, ...formatted);
        delta = formatted.length - 1;
    } else {
        lines.splice(insertIdx, 0, ...codeLines);
        delta = codeLines.length;
    }

    if (!fileLineOffsets[path]) fileLineOffsets[path] = [];
    if (delta !== 0) fileLineOffsets[path].push({ atLine: pendingDiff.line, delta });

    // Auto-inject required standard header (#include <stdint.h> / <unistd.h>) if missing
    if (pendingDiff.requiredHeader && !lines.some(l => l.trim() === pendingDiff.requiredHeader)) {
        let lastIncIdx = -1;
        for (let k = 0; k < Math.min(lines.length, 60); k++) {
            if (lines[k].trim().startsWith("#include")) lastIncIdx = k;
        }
        const hdrPos = lastIncIdx >= 0 ? lastIncIdx + 1 : 0;
        lines.splice(hdrPos, 0, pendingDiff.requiredHeader);
        fileLineOffsets[path].push({ atLine: hdrPos + 1, delta: 1 });
    }
    const updatedText = lines.join('\n');

    patchedContents[path] = updatedText;
    engine.reinforceActiveTethers();
    updateStatusBar();
    if (window.triggerCoderSnapshot) window.triggerCoderSnapshot();

    document.getElementById('diff-file-title').textContent = `${path} (${updatedText.length} bytes) [COMMITTED - ${Object.keys(patchedContents).length} file(s) staged]`;
    document.getElementById('diff-view').textContent = updatedText;

    appendAgentMessage(`<strong>Patch Staged in Memory (${Object.keys(patchedContents).length} file(s) modified):</strong> ${pendingDiff.replaceLine ? "Replaced" : "Inserted"} line ${pendingDiff.line} in <code>${path}</code> and reinforced conceptual tethers. Tap <strong>Export .patch</strong> when ready to apply via <code>git apply</code>.`);
    pendingDiff = null;
}

function buildContextUnifiedHunks(origLines, newLines, ctx = 3) {
    // Emit disjoint minimal unified diff hunks so multi-edit files produce clean surgical patches
    const n = origLines.length;
    const m = newLines.length;
    const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            dp[i][j] = origLines[i] === newLines[j]
                ? dp[i + 1][j + 1] + 1
                : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }
    const ops = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
        if (origLines[i] === newLines[j]) {
            ops.push({ type: " ", origIdx: i, newIdx: j, text: origLines[i] });
            i++; j++;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            ops.push({ type: "-", origIdx: i, newIdx: j, text: origLines[i] });
            i++;
        } else {
            ops.push({ type: "+", origIdx: i, newIdx: j, text: newLines[j] });
            j++;
        }
    }
    while (i < n) { ops.push({ type: "-", origIdx: i, newIdx: j, text: origLines[i] }); i++; }
    while (j < m) { ops.push({ type: "+", origIdx: i, newIdx: j, text: newLines[j] }); j++; }

    const changeIndices = [];
    for (let k = 0; k < ops.length; k++) {
        if (ops[k].type !== " ") changeIndices.push(k);
    }
    if (changeIndices.length === 0) return [];

    // Group nearby changes within 2 * ctx lines into separate disjoint hunks
    const groups = [];
    let gStart = Math.max(0, changeIndices[0] - ctx);
    let gEnd = Math.min(ops.length - 1, changeIndices[0] + ctx);
    for (let c = 1; c < changeIndices.length; c++) {
        const idx = changeIndices[c];
        if (idx - ctx <= gEnd + 1) {
            gEnd = Math.min(ops.length - 1, idx + ctx);
        } else {
            groups.push([gStart, gEnd]);
            gStart = Math.max(0, idx - ctx);
            gEnd = Math.min(ops.length - 1, idx + ctx);
        }
    }
    groups.push([gStart, gEnd]);

    const out = [];
    for (const [s, e] of groups) {
        const slice = ops.slice(s, e + 1);
        const origStart = slice[0].origIdx + 1;
        const newStart = slice[0].newIdx + 1;
        const origCount = slice.filter(o => o.type !== "+").length;
        const newCount = slice.filter(o => o.type !== "-").length;
        out.push(`@@ -${origStart},${origCount} +${newStart},${newCount} @@`);
        for (const item of slice) out.push(`${item.type}${item.text}`);
    }
    return out;
}

async function exportUnifiedPatch() {
    const paths = Object.keys(patchedContents);
    if (paths.length === 0) {
        appendAgentMessage("No approved patches staged yet. Review findings and tap <strong>Approve & Commit Fix</strong> first.");
        return;
    }
    for (const p of paths) {
        if (cachedFileTexts[p] === undefined && workspaceFiles[p] && typeof workspaceFiles[p].text === "function") {
            try { cachedFileTexts[p] = await workspaceFiles[p].text(); } catch (e) {}
        }
    }
    const hunks = [];
    for (const p of paths) {
        const origExists = cachedFileTexts[p] !== undefined;
        const origLines = (cachedFileTexts[p] || "").split('\n');
        const isDeleted = patchedContents[p] === "__BKA_DELETED_FILE__";
        if (isDeleted) {
            hunks.push(`diff --git a/${p} b/${p}`);
            hunks.push(`deleted file mode 100644`);
            hunks.push(`--- a/${p}`);
            hunks.push(`+++ /dev/null`);
            hunks.push(`@@ -1,${origLines.length} +0,0 @@`);
            for (const l of origLines) hunks.push(`-${l}`);
        } else if (!origExists) {
            const newLines = patchedContents[p].split('\n');
            hunks.push(`diff --git a/${p} b/${p}`);
            hunks.push(`new file mode 100644`);
            hunks.push(`--- /dev/null`);
            hunks.push(`+++ b/${p}`);
            hunks.push(`@@ -0,0 +1,${newLines.length} @@`);
            for (const l of newLines) hunks.push(`+${l}`);
        } else {
            const newLines = patchedContents[p].split('\n');
            const ctxHunks = buildContextUnifiedHunks(origLines, newLines, 3);
            if (ctxHunks.length > 0) {
                hunks.push(`diff --git a/${p} b/${p}`);
                hunks.push(`--- a/${p}`);
                hunks.push(`+++ b/${p}`);
                hunks.push(...ctxHunks);
            }
        }
    }
    const patchText = hunks.join('\n') + '\n';
    const blob = new Blob([patchText], { type: 'text/x-diff' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coder-port-fixes-${Date.now()}.patch`;
    a.click();
    URL.revokeObjectURL(url);
    appendAgentMessage(`<strong>Exported Unified Git Patch:</strong> Downloaded <code>coder-port-fixes.patch</code> covering <strong>${paths.length}</strong> modified file(s). Apply with <code>git apply</code>.`);
}

function startNewChat() {
    const log = document.getElementById('chat-log');
    if (log) {
        log.innerHTML = '';
    }
    pendingDiff = null;
    activeFindingIndex = -1;
    const diffTitle = document.getElementById('diff-file-title');
    const diffView = document.getElementById('diff-view');
    if (diffTitle) diffTitle.textContent = 'No active insertion staged';
    if (diffView) diffView.textContent = '// Code, ingested N64 manual sections, or synthesized alignment fixes will appear here.';
    appendAgentMessage('Started a new chat session. Mounted workspace files, ingested manuals, and conceptual graph remain active.');
    if (window.triggerCoderSnapshot) window.triggerCoderSnapshot();
}

async function clearWorkspace() {
    const clearManualsToo = confirm("Clear mounted workspace, staged patches, and saved session?\n\nClick OK to keep your ingested N64 manuals, or Cancel to wipe everything including manuals.");
    workspaceFiles = {};
    patchedContents = {};
    fileLineOffsets = {};
    for (const k of Object.keys(cachedFileTexts)) delete cachedFileTexts[k];
    pendingDiff = null;
    activeFindingIndex = -1;

    engine.resetWorkspace(!clearManualsToo);

    const treeEl = document.getElementById('file-tree');
    if (treeEl) {
        treeEl.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px;">Mount your N64 decomp &amp; Android wrapper directory to index AST symbols, JNI bridges, and 64-bit alignment hazards.</div>';
    }
    const diffTitle = document.getElementById('diff-file-title');
    const diffView = document.getElementById('diff-view');
    if (diffTitle) diffTitle.textContent = 'No active insertion staged';
    if (diffView) diffView.textContent = '// Code, ingested N64 manual sections, or synthesized alignment fixes will appear here.';

    if (window.coderPersistence && typeof window.coderPersistence.clearSnapshot === "function") {
        try { await window.coderPersistence.clearSnapshot(); } catch (e) {}
    } else if (typeof indexedDB !== "undefined") {
        try { indexedDB.deleteDatabase("CoderIDE_DB"); } catch (e) {}
    }

    startNewChat();
    if (window.triggerCoderSnapshot) window.triggerCoderSnapshot();
    updateStatusBar();
    appendAgentMessage(`<strong>Workspace Cleared:</strong> Unloaded workspace files and staged diffs${clearManualsToo ? " (ingested N64 manuals preserved)" : " (all manuals & snapshots wiped)"}.`);
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


updateStatusBar();
// --- Resilient Session Auto-Restore, Offline Tree Rebuild & Finding Queue Navigation ---
let cachedFileTexts = {};
let activeFindingIndex = 0;

function buildAndRenderTreeFromPaths(paths) {
    const fileTreeEl = document.getElementById('file-tree');
    if (!fileTreeEl) return;
    fileTreeEl.innerHTML = '';
    const root = {};
    for (const relPath of paths) {
        const parts = relPath.split('/');
        let curr = root;
        parts.forEach((part, idx) => {
            if (!curr[part]) {
                curr[part] = (idx === parts.length - 1)
                    ? (workspaceFiles[relPath] || {
                        name: part,
                        text: async () => cachedFileTexts[relPath] || `// Cached workspace entry: ${relPath}\n// Click "Open Workspace" to mount live disk handles if needed.`
                    })
                    : {};
            }
            curr = curr[part];
        });
    }
    renderTree(root, fileTreeEl, "");
}

function stageFindingAtIndex(idx) {
    if (!engine.auditFindings || engine.auditFindings.length === 0) return;
    activeFindingIndex = ((idx % engine.auditFindings.length) + engine.auditFindings.length) % engine.auditFindings.length;
    const f = engine.auditFindings[activeFindingIndex];
    const vBadge = f.verificationStatus ? ` [${f.verificationStatus}]` : "";
    const vNotes = (f.verificationNotes && f.verificationNotes.length > 0)
        ? f.verificationNotes.map(n => `// Verify: ${n}`)
        : [];
    const diff = {
        filePath: f.filePath,
        line: f.line,
        replaceLine: Boolean(f.replaceLine),
        replaceSpan: Boolean(f.replaceSpan),
        endLine: f.endLine || f.line,
        requiredHeader: f.requiredHeader || null,
        originalLine: f.code || "",
        symbolName: `[Finding ${activeFindingIndex + 1}/${engine.auditFindings.length}] ${f.category}${vBadge}`,
        contextBefore: [`// [${f.severity}] ${f.category}${vBadge}`, `// Original: ${f.code}`, ...vNotes],
        insertionLines: f.fixSuggestion.split('\n'),
        contextAfter: [`// Reason: ${f.reason}`]
    };
    renderSynthesizedDiff(diff);
    if (window.triggerCoderSnapshot) window.triggerCoderSnapshot();
}

function stepFinding(delta) {
    if (!engine.auditFindings || engine.auditFindings.length === 0) {
        appendAgentMessage("No audit findings queued. Tap <strong>Port Audit</strong> to scan the workspace.");
        return;
    }
    stageFindingAtIndex(activeFindingIndex + delta);
}

(function initResilientCoderSession() {
    if (!window.coderPersistence) return;

    const captureUiState = () => {
        const chatBox = document.getElementById("chat-messages");
        return {
            cachedFileTexts,
            patchedContents,
            chatHtml: chatBox ? chatBox.innerHTML : "",
            stagedDiff: typeof pendingDiff !== "undefined" ? pendingDiff : null,
            activeFindingIndex
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
            const manualPaths = Array.from(new Set(
                Array.from(engine.boxes.values())
                    .filter(b => b.type === "manual_section" && b.payload && b.payload.filePath)
                    .map(b => `manuals/${b.payload.filePath}`)
            ));
            if (restored && ((engine.fileSummaries && engine.fileSummaries.size > 0) || manualPaths.length > 0)) {
                cachedFileTexts = restored.cachedFileTexts || {};
                patchedContents = restored.patchedContents || {};
                activeFindingIndex = restored.activeFindingIndex || 0;

                const paths = Array.from(new Set([
                    ...Array.from(engine.fileSummaries.keys()),
                    ...manualPaths
                ])).sort();
                for (const p of paths) {
                    if (!workspaceFiles[p]) {
                        workspaceFiles[p] = {
                            name: p.split('/').pop(),
                            text: async () => cachedFileTexts[p] || `// Cached workspace entry: ${p}`
                        };
                    }
                }
                buildAndRenderTreeFromPaths(paths);

                const chatBox = document.getElementById("chat-messages");
                if (chatBox && restored.chatHtml) {
                    chatBox.innerHTML = restored.chatHtml;
                    chatBox.scrollTop = chatBox.scrollHeight;
                }
                if (restored.stagedDiff && typeof renderSynthesizedDiff === "function") {
                    renderSynthesizedDiff(restored.stagedDiff);
                } else if (engine.auditFindings && engine.auditFindings.length > 0) {
                    stageFindingAtIndex(activeFindingIndex);
                }
                updateStatusBar();
                const when = new Date(restored.timestamp).toLocaleTimeString();
                appendAgentMessage(`<strong>Session & File Tree Recovered (${when}):</strong> Restored <code>${paths.length}</code> files, <code>${engine.boxes.size}</code> conceptual nodes, and <code>${engine.auditFindings.length}</code> findings from offline IndexedDB.`);
            }
        } catch (err) {
            console.warn("Session recovery skipped:", err);
        }
    });
})();
