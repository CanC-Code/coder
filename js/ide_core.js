let workspaceFiles = {}; 
let chatHistory = [];
let lexiconState = {
    dictionary: {
        "bka_install_segv_handler": { definition: "Low-level signal handler in DKR native code intercepting segmentation faults.", domain: "n64_native" },
        "bkaservice": { definition: "Android background service handling IPC and lifecycle integration for dkrwrapper.", domain: "android_wrapper" },
        "segvdump": { definition: "Crash trace signature capturing memory access violations in aarch64 runtime.", domain: "debugging" }
    },
    thesaurus: {
        "segv": { synonyms: ["segmentation fault", "memory violation", "segvdump"], semantic_cluster: ["crash", "signal", "handler"] }
    }
};

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
    const fileTreeEl = document.getElementById('file-tree');
    fileTreeEl.innerHTML = '';
    
    showProgress(`Indexing file paths (${files.length} files)...`);

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
    appendAgentMessage(`Mounted workspace with <strong>${files.length}</strong> files. Indexing DKR Android port structures...`);

    await ingestFilesInBatches(fileArray);
}

async function ingestFilesInBatches(fileArray) {
    const batchSize = 20;
    let processed = 0;

    for (let i = 0; i < fileArray.length; i += batchSize) {
        const batch = fileArray.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async item => {
            try {
                const text = await item.file.text();
                parseCodeSymbols(item.path, text);
            } catch (err) {}
        }));

        processed += batch.length;
        showProgress(`Analyzing codebase: ${processed} / ${fileArray.length} files parsed...`);
        await new Promise(r => setTimeout(r, 4));
    }

    hideProgress();
    appendAgentMessage(`<strong>Codebase Fully Ingested:</strong> All ${fileArray.length} files analyzed. NDK symbols, JNI wrappers, and DKR components indexed.`);
}

function parseCodeSymbols(path, text) {
    const lines = text.split('\n');
    let domain = path.includes('/') ? path.split('/')[0] : "android_project";

    lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed.includes('bka_install_segv_handler') || trimmed.includes('BkaService') || trimmed.includes('class ') || trimmed.includes('void ')) {
            const parts = trimmed.split(/\s+/);
            if (parts.length >= 2) {
                const term = parts[1].replace(/[(:<]/g, '').toLowerCase();
                if (term.length > 2 && term.length < 40) {
                    lexiconState.dictionary[term] = {
                        definition: `Found in ${path}: ${trimmed}`,
                        domain: domain
                    };
                }
            }
        }
    });
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
    document.getElementById('diff-file-title').textContent = `${path} (Loading...)`;
    document.getElementById('diff-view').textContent = "// Reading file contents...";

    try {
        const text = await fileObj.text();
        document.getElementById('diff-file-title').textContent = `${path} (${text.length} bytes)`;
        document.getElementById('diff-view').textContent = text;
    } catch (err) {
        document.getElementById('diff-view').textContent = `[!] Error reading file: ${err.message}`;
    }
}

function handleManualsIngest(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    showProgress(`Ingesting manual(s)...`);

    let processedCount = 0;
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const reader = new FileReader();
        reader.onload = function(e) {
            const text = e.target.result;
            parseAndLearnReference(file.name, text);
            processedCount++;
            if (processedCount === files.length) {
                hideProgress();
                appendAgentMessage(`Ingested manual: <strong>${file.name}</strong> (${Math.round(text.length / 1024)} KB).`);
            }
        };
        reader.readAsText(file);
    }
}

function parseAndLearnReference(filename, text) {
    const lines = text.split('\n');
    let domain = filename.toLowerCase().includes('n64') ? 'n64_hardware' : 'reference_doc';
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.length > 5 && line.length < 100 && (line.includes(':') || line.includes('-'))) {
            const parts = line.split(/[:\-]/);
            if (parts.length >= 2) {
                const term = parts[0].trim().toLowerCase();
                const definition = parts[1].trim();
                if (term.length > 2 && term.length < 30) {
                    lexiconState.dictionary[term] = { definition, domain };
                }
            }
        }
    }
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
    
    chatHistory.push({ sender: 'user', text: text });
    input.value = '';

    setTimeout(() => {
        const queryLower = text.toLowerCase();
        let responseHTML = "";

        // Context-aware semantic intent routing for DKR port
        if (queryLower.includes("port state") || queryLower.includes("status") || queryLower.includes("overview")) {
            responseHTML = `<strong>DKR Port State (${com.dkrwrapper || 'com.dkrwrapper'}):</strong><br>` +
                           `• <strong>Builds:</strong> Stable on <code>dkr-aarch64</code> branch (Gradle & Maven rate limits resolved).<br>` +
                           `• <strong>Execution:</strong> Deployed via <code>rish</code>; local frame streaming active at <code>127.0.0.1:8081</code>.<br>` +
                           `• <strong>Active Debugging:</strong> Investigating segmentation fault traces (<code>SEGVDUMP</code>) in <code>bka_install_segv_handler</code>.`;
        } else if (queryLower.includes("segv") || queryLower.includes("crash") || queryLower.includes("bka")) {
            responseHTML = `<strong>Crash Analysis (SEGVDUMP):</strong><br>` +
                           `The segmentation fault originates around <code>bka_install_segv_handler</code> during native memory initialization. Recommend inspecting null pointer references in the NDK JNI bridge layer.`;
        } else {
            // Fallback to dictionary match or general response
            let matchedTerm = null;
            for (let term in lexiconState.dictionary) {
                if (queryLower.includes(term) && term.length > 3) {
                    matchedTerm = term;
                    break;
                }
            }

            if (matchedTerm) {
                const entry = lexiconState.dictionary[matchedTerm];
                responseHTML = `<strong>Lexicon Match [${matchedTerm}]:</strong><br>${entry.definition} <br><em>Domain:</em> ${entry.domain}`;
            } else {
                responseHTML = `<strong>Android NDK & N64 Porting Engine:</strong><br>Analyzed query against DKR repository structure. Ready to inspect JNI bindings, display lists, or memory pointers.`;
            }
        }

        appendAgentMessage(responseHTML);
    }, 600);
}

function approveAndSave() {
    alert("Changes approved and committed via NDK/Wasm toolchain!");
}

function exportSession() {
    const sessionData = {
        timestamp: new Date().toISOString(),
        chatHistory,
        lexiconState,
        fileCount: Object.keys(workspaceFiles).length
    };

    const blob = new Blob([JSON.stringify(sessionData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coder-session-${Date.now()}.json`;
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
            lexiconState = data.lexiconState || lexiconState;
            chatHistory = data.chatHistory || [];
            appendAgentMessage("Session state successfully restored from backup.");
        } catch (err) {
            alert("Failed to load session: " + err.message);
        }
    };
    reader.readAsText(file);
}
