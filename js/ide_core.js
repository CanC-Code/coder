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

    // Simulate Agent Response & Graph Activation
    setTimeout(() => {
        const agentMsg = document.createElement('div');
        agentMsg.className = 'message agent';
        agentMsg.textContent = `Activated conceptual cluster for query. Wasm sandbox validation passed successfully.`;
        chatMessages.appendChild(agentMsg);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 600);
}

function approveAndSave() {
    alert("Changes approved and committed persistently to storage! Tether weights reinforced.");
}
