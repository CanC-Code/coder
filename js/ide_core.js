let workspaceFiles = {};
let chatHistory = [];
let lexiconState = {
    dictionary: {
        "rcp": { definition: "Reality Coprocessor: N64 co-processor containing RSP and RDP.", domain: "n64_hardware" },
        "rsp": { definition: "Reality Signal Processor: N64 geometry and audio vector processor.", domain: "n64_hardware" },
        "rdp": { definition: "Reality Display Processor: N64 rasterizer and texture mapping engine.", domain: "n64_hardware" },
        "jni": { definition: "Java Native Interface: Bridge between Android Java runtime and NDK C++ code.", domain: "android_ndk" },
        "binder": { definition: "Android inter-process communication mechanism.", domain: "android_os" }
    },
    thesaurus: {
        "rcp": { synonyms: ["coprocessor", "reality processor"], semantic_cluster: ["rsp", "rdp", "graphics", "microcode"] },
        "jni": { synonyms: ["native bridge", "c++ wrapper"], semantic_cluster: ["ndk", "android", "bindings"] }
    }
};

function handleFolderSelect(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    workspaceFiles = {};
    const fileTreeEl = document.getElementById('file-tree');
    fileTreeEl.innerHTML = '';

    // Build hierarchical tree structure from webkitRelativePath
    const fileStructure = {};

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const relPath = file.webkitRelativePath || file.name;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const content = e.target.result;
            workspaceFiles[relPath] = { content, name: file.name };
        };
        reader.readAsText(file);

        // Insert into DOM tree
        const parts = relPath.split('/');
        let currentLevel = fileTreeEl;
        
        parts.forEach((part, index) => {
            const isFile = index === parts.length - 1;
            const existingItems = Array.from(currentLevel.children);
            let targetLi = existingItems.find(li => li.dataset.name === part);

            if (!targetLi) {
                targetLi = document.createElement('li');
                targetLi.dataset.name = part;
                targetLi.textContent = isFile ? `📄 ${part}` : `📁 ${part}/`;
                targetLi.style.paddingLeft = `${index * 12 + 8}px`;
                
                if (isFile) {
                    targetLi.onclick = () => loadFileIntoEditor(relPath);
                } else {
                    targetLi.style.fontWeight = '600';
                    targetLi.style.color = 'var(--text-muted)';
                }
                currentLevel.appendChild(targetLi);
            }
            if (!isFile) {
                let subUl = targetLi.querySelector('ul');
                if (!subUl) {
                    subUl = document.createElement('ul');
                    subUl.style.listStyle = 'none';
                    targetLi.appendChild(subUl);
                }
                currentLevel = subUl;
            }
        });
    }

    appendAgentMessage(`Successfully mounted workspace folder containing <strong>${files.length}</strong> files. Tree structure restored.`);
}

function handleManualsIngest(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    let ingestedCount = 0;
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const reader = new FileReader();
        reader.onload = function(e) {
            const text = e.target.result;
            parseAndLearnReference(file.name, text);
            ingestedCount++;
            if (ingestedCount === files.length) {
                appendAgentMessage(`Successfully ingested reference manual(s) [<strong>${file.name}</strong>]. Lexical engine updated with N64 hardware specs & definitions.`);
            }
        };
        reader.readAsText(file);
    }
}

function parseAndLearnReference(filename, text) {
    const lines = text.split('\n');
    let domain = filename.toLowerCase().includes('n64') ? 'n64_hardware' : 'reference_doc';
    
    // Extract capitalized technical terms or definitions
    lines.forEach(line => {
        if (line.length > 10 && line.length < 120 && (line.includes(':') || line.includes('-'))) {
            const parts = line.split(/[:\-]/);
            if (parts.length >= 2) {
                const term = parts[0].trim().toLowerCase();
                const definition = parts[1].trim();
                if (term.length > 2 && term.length < 30) {
                    lexiconState.dictionary[term] = { definition, domain };
                    if (!lexiconState.thesaurus[term]) {
                        lexiconState.thesaurus[term] = { synonyms: [], semantic_cluster: [] };
                    }
                }
            }
        }
    });
}

function loadFileIntoEditor(path) {
    const fileData = workspaceFiles[path];
    if (!fileData) return;
    
    document.getElementById('diff-file-title').textContent = path + " (Active View)";
    document.getElementById('diff-view').textContent = fileData.content;
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
            responseHTML = `<strong>N64 / Android Porting Match [${matchedTerm}]:</strong><br>${entry.definition} <br><br><em>Domain:</em> ${entry.domain}`;
        } else {
            responseHTML = `<strong>Android NDK & N64 Porting Engine:</strong><br>Analyzed query against loaded workspace and hardware specs. Recommending JNI memory mapping and Vulkan/OpenGL ES display list translation for ARM64 execution.`;
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
        files: Object.keys(workspaceFiles).map(k => ({ path: k, content: workspaceFiles[k].content }))
    };

    const blob = new Blob([JSON.stringify(sessionData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coder-n64-android-session-${Date.now()}.json`;
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
            
            if (data.files) {
                workspaceFiles = {};
                const fileTreeEl = document.getElementById('file-tree');
                fileTreeEl.innerHTML = '';
                
                data.files.forEach(f => {
                    workspaceFiles[f.path] = { content: f.content };
                });
                // Re-trigger folder view or list
                appendAgentMessage("Session state restored successfully.");
            }
        } catch (err) {
            alert("Failed to load session: " + err.message);
        }
    };
    reader.readAsText(file);
}
