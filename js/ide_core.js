const repoFiles = {
    "core/graph/box.py": "class ConceptualBox:\n    def __init__(self, box_id, domain, core_payload, dynamic_state=None):\n        self.id = box_id\n        self.domain = domain\n        self.core_payload = core_payload",
    "core/graph/tether.py": "class Tether:\n    def __init__(self, source_id, target_id, weight=0.5):\n        self.source_id = source_id\n        self.target_id = target_id\n        self.weight = weight",
    "core/graph/traverser.py": "class GraphTraverser:\n    def __init__(self, threshold=0.4):\n        self.tau = threshold",
    "core/runtime/host_orchestrator.py": "class HostOrchestrator:\n    def __init__(self, threshold=0.4):\n        self.boxes = {}\n        self.tethers = []\n        # Wasm zero-copy memory bridge binding initialized\n        self.wasm_active = True",
    "core/runtime/wasm_bridge.cpp": "extern \"C\" {\n  uint8_t* allocate_buffer(size_t size) {\n      return new uint8_t[size];\n  }\n}",
    "instrumentation/graph_validator.py": "def validate_graph(schema_path):\n    print('[*] Inspecting conceptual graph...')",
    "instrumentation/log_inspector.py": "class LogInspector:\n    def __init__(self, path): self.path = path"
};

function selectFile(filePath) {
    const header = document.getElementById('diff-file-title');
    const content = document.getElementById('diff-view');
    header.textContent = filePath + " (Active View)";
    content.textContent = repoFiles[filePath] || "// File contents loaded from repository sandbox.";
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
    
    // Append User Message
    const userMsg = document.createElement('div');
    userMsg.className = 'message user';
    userMsg.textContent = text;
    chatMessages.appendChild(userMsg);
    
    input.value = '';
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Simulate Neural Graph Spreading Activation & Wasm Sandbox Verification
    setTimeout(() => {
        const agentMsg = document.createElement('div');
        agentMsg.className = 'message agent';
        agentMsg.innerHTML = `<strong>Graph Activation Triggered:</strong><br>• Evaluated tethers for query.<br>• Wasm sandbox validation: <em>Passed (0 errors)</em>.<br>• Tether weights reinforced.`;
        chatMessages.appendChild(agentMsg);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 500);
}

function approveAndSave() {
    alert("Changes successfully approved, verified via Wasm sandbox, and committed to storage!");
}
