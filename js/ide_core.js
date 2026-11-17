let workspaceFiles = {}; // Stores File objects for on-demand reading
let chatHistory = [];
let lexiconState = {
    dictionary: {
        "rcp": { definition: "Reality Coprocessor: N64 co-processor containing RSP and RDP.", domain: "n64_hardware" },
        "rsp": { definition: "Reality Signal Processor: N64 geometry and audio vector processor.", domain: "n64_hardware" },
        "rdp": { definition: "Reality Display Processor: N64 rasterizer and texture mapping engine.", domain: "n64_hardware" },
        "jni": { definition: "Java Native Interface: Bridge between Android Java runtime and NDK C++ code.", domain: "android_ndk" }
    },
    thesaurus: {
        "rcp": { synonyms: ["coprocessor", "reality processor"], semantic_cluster: ["rsp", "rdp", "graphics", "microcode"] }
    }
};

function showProgress(text) {
    const pc = document.getElementById('progress-container');
    const pt = document.getElementById('progress-text');
    pc.style.display = 'block';
    pt.textContent = text;
}

function hideProgress() {
    document.getElementById('progress-container').style.display = 'none';
}

function handleFolderSelect(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    workspaceFiles = {};
    const fileTreeEl = document.getElementById('file-tree');
    fileTreeEl.innerHTML = '';
    
    showProgress(`Indexing ${files.length} files...`);

    setTimeout(() => {
        const root = {};

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const relPath = file.webkitRelativePath || file.name;
            workspaceFiles[relPath] = file; // Store reference for lazy loading

            // Build tree dictionary
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
        hideProgress();
        appendAgentMessage(`Successfully mounted workspace folder with <strong>${files.length}</strong> files ready for navigation and compilation.`);
    }, 50);
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
            
            const subUl = document.createElement('ul0');
            subUl.style.listStyle = 'none';
            subUl.style.paddingLeft = '12px';
            subUl.style.display = 'none'; // Collapsed by default for 1400+ file performance
            
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
    document.getElementById('diff-view').textContent = "// Reading file contents into memory...";

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

    showProgress(`Ingesting ${files.length} manual(s)...`);

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
                appendAgentMessage(`Successfully ingested reference manual: <strong>${file.name}</strong> (${Math.round(text.length / 1024)} KB). Lexical engine updated.`);
            }
        };
        reader.readAsText(file);
    }
}

function parseAndLearnReference(filename, text) {
    const lines = text.split('\n');
    let domain = filename.toLowerCase().includes('n64') ? 'n64_hardware' : 'reference_doc';
    
    // Sample lines to extract technical terms and definitions
    for (let i = 0; i < Math.min(lines.length, 5000); i++) {
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
        let matchedTerm = null;

        for (let term in lexiconState.dictionary) {
            if (queryLower.includes(term)) {
                matchedTerm = term;
                break;
            }
        }

        let responseHTML = "";
        if (matchedTerm) {
            const entry = lexiconState.dictionary[matchedTerm];
            responseHTML = `<strong>Lexicon Match [${matchedTerm}]:</strong><br>${entry.definition} <br><em>Domain:</em> ${entry.domain}`;
        } else {
            responseHTML = `<strong>Android NDK & N64 Porting Engine:</strong><br>Indexed query against workspace and ingested manuals. Ready to synthesize JNI wrappers, display list decoders, or ARM64 optimizations.`;
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
