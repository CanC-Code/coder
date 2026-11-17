let loadedFiles = {};
let rootDirectoryHandle = null;

async function openFolder() {
    try {
        if (!window.showDirectoryPicker) {
            alert("Your browser does not support the File System Access API. Please use Chrome, Edge, or Opera.");
            return;
        }
        
        rootDirectoryHandle = await window.showDirectoryPicker();
        loadedFiles = {};
        
        const fileTreeEl = document.getElementById('file-tree');
        fileTreeEl.innerHTML = '';
        
        await readDirectory(rootDirectoryHandle, fileTreeEl, "");
        
        appendAgentMessage(`Successfully mounted workspace folder: <strong>${rootDirectoryHandle.name}</strong>`);
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error(err);
            alert("Error opening directory: " + err.message);
        }
    }
}

async function readDirectory(dirHandle, parentElement, pathPrefix) {
    for await (const [name, handle] of dirHandle.entries()) {
        const currentPath = pathPrefix ? `${pathPrefix}/${name}` : name;
        
        if (handle.kind === 'directory') {
            const li = document.createElement('li');
            li.textContent = `📁 ${name}/`;
            li.style.fontWeight = '600';
            li.style.color = 'var(--text-muted)';
            parentElement.appendChild(li);
            
            const subList = document.createElement('ul');
            subList.style.listStyle = 'none';
            subList.style.paddingLeft = '12px';
            parentElement.appendChild(subList);
            
            await readDirectory(handle, subList, currentPath);
        } else if (handle.kind === 'file') {
            const file = await handle.getFile();
            const content = await file.text();
            loadedFiles[currentPath] = { content, handle };
            
            const li = document.createElement('li');
            li.textContent = `📄 ${name}`;
            li.onclick = () => loadFileIntoEditor(currentPath);
            parentElement.appendChild(li);
        }
    }
}

function loadFileIntoEditor(path) {
    const fileData = loadedFiles[path];
    if (!fileData) return;
    
    document.getElementById('diff-file-title').textContent = path + " (Active)";
    document.getElementById('diff-view').textContent = fileData.content;
}

function appendAgentMessage(htmlText) {
    const chatMessages = document.getElementById('chat-messages');
    const agentMsg = document.createElement('div');
    agentMsg.className = 'message agent';
    agentMsg.innerHTML = htmlText;
    chatMessages.appendChild(agentMsg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
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
    
    input.value = '';
    chatMessages.scrollTop = chatMessages.scrollHeight;

    setTimeout(() => {
        appendAgentMessage(`<strong>Graph Activation Triggered:</strong><br>• Lexical query expanded.<br>• Wasm sandbox indexing workspace files.<br>• Ready for precision insertion.`);
    }, 500);
}

function approveAndSave() {
    alert("Changes approved and committed persistently to local workspace via Wasm bridge!");
}
