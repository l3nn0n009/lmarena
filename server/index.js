/**
 * LMArena Wrapper - Main Server
 * Express + Socket.io server for browser automation
 */

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const browserController = require('./browser');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    maxHttpBufferSize: 1e8,
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));

// ==================== SERVER STATS ====================
const serverStats = {
    startTime: Date.now(),
    totalConnections: 0,
    activeClients: new Map(),
    totalMessages: 0,
    totalErrors: 0,
    errors: [],
    messageHistory: [],
    responseHistory: []
};

// Use OPTIMIZED LMArena instance
const sharedLmarena = require('./lmarena-optimized');

// Log error to stats
function logError(error, context = '') {
    serverStats.totalErrors++;
    const errorEntry = {
        timestamp: new Date().toISOString(),
        message: error.message || String(error),
        context
    };
    serverStats.errors.unshift(errorEntry);
    if (serverStats.errors.length > 50) serverStats.errors.pop();
    console.error(`[Server Error] ${context}: ${error.message}`);
}

// ==================== DASHBOARD ====================
app.get('/dashboard', (req, res) => {
    const uptime = Math.floor((Date.now() - serverStats.startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);

    res.send(`<!DOCTYPE html>
<html>
<head>
    <title>Grove Dashboard</title>
    <meta http-equiv="refresh" content="5">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: system-ui, sans-serif; background: #0a0a0a; color: #f5f5f5; padding: 32px; }
        h1 { color: #10b981; margin-bottom: 24px; }
        .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
        .stat { background: #111; border: 1px solid #2a2a2a; border-radius: 8px; padding: 20px; }
        .stat-value { font-size: 32px; font-weight: 700; }
        .stat-label { color: #888; font-size: 12px; text-transform: uppercase; margin-top: 4px; }
        .nav { margin-bottom: 24px; }
        .nav a { color: #10b981; margin-right: 16px; text-decoration: none; }
    </style>
</head>
<body>
    <div class="nav">
        <a href="/dashboard">Dashboard</a>
        <a href="/responses">Responses</a>
        <a href="/cloud">Cloud</a>
    </div>
    <h1>Grove Dashboard</h1>
    <div class="grid">
        <div class="stat">
            <div class="stat-value">${serverStats.activeClients.size}</div>
            <div class="stat-label">Active Clients</div>
        </div>
        <div class="stat">
            <div class="stat-value">${serverStats.totalMessages}</div>
            <div class="stat-label">Total Messages</div>
        </div>
        <div class="stat">
            <div class="stat-value">${serverStats.totalErrors}</div>
            <div class="stat-label">Errors</div>
        </div>
        <div class="stat">
            <div class="stat-value">${hours}h ${minutes}m</div>
            <div class="stat-label">Uptime</div>
        </div>
    </div>
</body>
</html>`);
});

// ==================== RESPONSES PAGE (with live streaming) ====================
app.get('/responses', (req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head>
    <title>Grove Responses</title>
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600&family=JetBrains+Mono&display=swap" rel="stylesheet">
    <script src="/socket.io/socket.io.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Space Grotesk', sans-serif; background: #0a0a0a; color: #f5f5f5; padding: 24px; }
        h1 { color: #10b981; margin-bottom: 8px; font-size: 24px; }
        .subtitle { color: #555; margin-bottom: 24px; font-size: 14px; }
        .nav { margin-bottom: 24px; display: flex; gap: 20px; }
        .nav a { color: #888; text-decoration: none; font-size: 14px; }
        .nav a:hover { color: #f5f5f5; }
        .nav a.active { color: #10b981; }
        .response { background: #111; border: 1px solid #2a2a2a; border-radius: 8px; margin-bottom: 16px; overflow: hidden; }
        .response-header { 
            padding: 12px 16px; 
            background: #1a1a1a; 
            display: flex; 
            justify-content: space-between; 
            align-items: center;
            font-size: 13px;
        }
        .response-model { color: #10b981; font-family: 'JetBrains Mono', monospace; }
        .response-time { color: #555; }
        .response-prompt { padding: 12px 16px; border-bottom: 1px solid #2a2a2a; color: #888; font-style: italic; }
        .response-content { 
            padding: 16px; 
            white-space: pre-wrap; 
            font-size: 13px; 
            line-height: 1.6; 
            font-family: 'JetBrains Mono', monospace;
            max-height: 500px; 
            overflow-y: auto;
        }
        .response-content.streaming::after {
            content: '▋';
            animation: blink 1s infinite;
        }
        @keyframes blink {
            0%, 50% { opacity: 1; }
            51%, 100% { opacity: 0; }
        }
        .empty { color: #555; text-align: center; padding: 48px; }
        .live-badge { 
            display: inline-flex; 
            align-items: center; 
            gap: 6px; 
            font-size: 12px; 
            color: #10b981;
            margin-left: 16px;
        }
        .live-dot { 
            width: 8px; 
            height: 8px; 
            background: #10b981; 
            border-radius: 50%; 
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
        }
    </style>
</head>
<body>
    <div class="nav">
        <a href="/dashboard">Dashboard</a>
        <a href="/responses" class="active">Responses</a>
        <a href="/cloud">Cloud</a>
    </div>
    <h1>Response History <span class="live-badge"><span class="live-dot"></span> Live</span></h1>
    <p class="subtitle">Responses stream in real-time as they're generated</p>
    <div id="responses-container"></div>

    <script>
        const container = document.getElementById('responses-container');
        const responses = new Map(); // id -> element
        
        // Connect to socket for live updates
        const socket = io();
        
        // Load initial responses
        async function loadResponses() {
            try {
                const res = await fetch('/api/responses');
                const data = await res.json();
                data.responses.forEach(r => {
                    if (!responses.has(r.id)) {
                        addResponse(r.id, r.model, r.prompt, r.response, r.timestamp, false);
                    }
                });
            } catch (e) {
                console.error('Failed to load responses:', e);
            }
        }
        
        // Add or update a response
        function addResponse(id, model, prompt, content, timestamp, streaming = false) {
            let el = responses.get(id);
            
            if (!el) {
                el = document.createElement('div');
                el.className = 'response';
                el.innerHTML = \`
                    <div class="response-header">
                        <span class="response-model">\${escapeHtml(model || 'unknown')}</span>
                        <span class="response-time">\${timestamp || new Date().toLocaleString()}</span>
                    </div>
                    <div class="response-prompt">"\${escapeHtml((prompt || '').substring(0, 100))}..."</div>
                    <div class="response-content \${streaming ? 'streaming' : ''}">\${escapeHtml(content || '')}</div>
                \`;
                container.insertBefore(el, container.firstChild);
                responses.set(id, el);
            } else {
                const contentEl = el.querySelector('.response-content');
                contentEl.textContent = content || '';
                contentEl.className = 'response-content' + (streaming ? ' streaming' : '');
            }
        }
        
        function escapeHtml(text) {
            if (!text) return '';
            return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }
        
        // Listen for broadcast tokens (for live view)
        socket.on('broadcast:token', (data) => {
            addResponse(data.conversationId, data.model, null, data.fullText, null, true);
        });
        
        socket.on('token', (data) => {
            addResponse(data.conversationId, null, null, data.fullText, null, true);
        });
        
        socket.on('messageComplete', (data) => {
            // Mark as complete and refresh
            loadResponses();
        });
        
        // Initial load and periodic refresh
        loadResponses();
        setInterval(loadResponses, 5000);
    </script>
</body>
</html>`);
});

// ==================== CLOUD COMMAND CENTER ====================
// Serve static HTML file
app.get('/cloud', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'cloud.html'));
});

// API for cloud dashboard data
app.get('/api/cloud-data', (req, res) => {
    const agents = Array.from(serverStats.activeClients.entries()).map(([id, info]) => ({
        id,
        shortId: id.substring(0, 8),
        model: info.model || 'Not selected',
        messages: info.messageCount,
        connectedAt: new Date(info.connectedAt).toLocaleTimeString()
    }));

    const responses = serverStats.responseHistory.slice(0, 5).map(r => ({
        model: r.model || 'unknown',
        shortPrompt: (r.prompt || '').substring(0, 80).replace(/</g, '&lt;').replace(/>/g, '&gt;'),
        shortResponse: (r.response || '').substring(0, 200).replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }));

    const models = sharedLmarena.getAvailableModels ? sharedLmarena.getAvailableModels() : [];

    res.json({
        agents,
        responses,
        models,
        totalMessages: serverStats.totalMessages,
        responseCount: serverStats.responseHistory.length,
        uptime: Date.now() - serverStats.startTime
    });
});

// ==================== REST API ====================
app.get('/health', (req, res) => {
    res.json({ status: 'ok', activeClients: serverStats.activeClients.size });
});

app.get('/api/stats', (req, res) => {
    res.json({
        uptime: Date.now() - serverStats.startTime,
        activeClients: serverStats.activeClients.size,
        totalConnections: serverStats.totalConnections,
        totalMessages: serverStats.totalMessages,
        totalErrors: serverStats.totalErrors
    });
});

app.get('/api/models', async (req, res) => {
    try {
        const models = await sharedLmarena.getAvailableModels();
        res.json({ models });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Read context file
const fs = require('fs').promises;
const fsSync = require('fs');

// Base directory for the server (project root)
const SERVER_BASE = path.resolve(__dirname, '..');

// Helper to resolve project paths
function resolveProjectPath(project, filePath) {
    // If project is not specified or empty, use server base
    let basePath = SERVER_BASE;

    if (project) {
        // If project is absolute, use it directly
        if (path.isAbsolute(project)) {
            basePath = project;
        } else {
            // Relative project path - resolve from server base
            basePath = path.resolve(SERVER_BASE, project);
        }
    }

    // Resolve the file path
    if (path.isAbsolute(filePath)) {
        return filePath;
    }
    return path.resolve(basePath, filePath);
}

app.post('/api/read-file', async (req, res) => {
    try {
        const { path: filePath, project } = req.body;

        if (!filePath) {
            return res.status(400).json({ error: 'Missing file path' });
        }

        const fullPath = resolveProjectPath(project, filePath);

        // Security: only allow .md files for context
        if (!fullPath.endsWith('.md')) {
            return res.status(400).json({ error: 'Only .md files allowed for context' });
        }

        console.log(`[Server] Reading file: ${fullPath}`);
        const content = await fs.readFile(fullPath, 'utf-8');
        res.json({ content, path: fullPath });
    } catch (error) {
        console.error(`[Server] Read file error: ${error.message}`);
        res.status(404).json({ error: 'File not found: ' + error.message });
    }
});

// Get responses with full data
app.get('/api/responses', (req, res) => {
    res.json({
        responses: serverStats.responseHistory
    });
});

// Create file API for tool call execution
app.post('/api/create-file', async (req, res) => {
    try {
        const { path: filePath, content, project } = req.body;

        if (!filePath || content === undefined) {
            return res.status(400).json({ error: 'Missing path or content' });
        }

        const fullPath = resolveProjectPath(project, filePath);

        // Create directory if needed
        const dir = path.dirname(fullPath);
        if (!fsSync.existsSync(dir)) {
            fsSync.mkdirSync(dir, { recursive: true });
        }

        // Write file
        await fs.writeFile(fullPath, content, 'utf-8');

        console.log(`[Server] Created file: ${fullPath}`);
        res.json({ success: true, path: fullPath });
    } catch (error) {
        console.error(`[Server] Create file error:`, error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== SOCKET.IO ====================
io.on('connection', (socket) => {
    const clientId = crypto.randomBytes(8).toString('hex');
    console.log(`[Server] Client connected: ${clientId}`);

    serverStats.totalConnections++;
    serverStats.activeClients.set(clientId, {
        socketId: socket.id,
        connectedAt: Date.now(),
        model: null,
        messageCount: 0
    });

    socket.on('init', async (data) => {
        try {
            const result = await sharedLmarena.initialize(data.model);
            const models = sharedLmarena.getAvailableModels();

            socket.emit('ready', {
                success: true,
                currentModel: result.model,
                modality: result.modality
            });

            socket.emit('models', { models });
        } catch (error) {
            logError(error, 'init');
            socket.emit('error', { message: error.message });
        }
    });

    socket.on('selectModel', async (data) => {
        try {
            const { model } = data;
            const result = await sharedLmarena.selectModel(model);

            const clientInfo = serverStats.activeClients.get(clientId);
            if (clientInfo) clientInfo.model = model;

            socket.emit('modelSelected', {
                success: true,
                model,
                modality: result.modality
            });
        } catch (error) {
            logError(error, 'selectModel');
            socket.emit('error', { message: error.message });
        }
    });

    socket.on('sendMessage', async (data) => {
        const { message, conversationId } = data;

        try {
            const clientInfo = serverStats.activeClients.get(clientId);
            if (clientInfo) clientInfo.messageCount++;
            serverStats.totalMessages++;

            const result = await sharedLmarena.sendMessage(message, (tokenData) => {
                // Send to requesting client
                socket.emit('token', {
                    fullText: tokenData.fullText,
                    delta: tokenData.delta,
                    imageUrl: tokenData.imageUrl,
                    conversationId
                });

                // Broadcast to all clients (for /responses live view)
                io.emit('broadcast:token', {
                    fullText: tokenData.fullText,
                    delta: tokenData.delta,
                    conversationId,
                    model: sharedLmarena.currentModel || 'unknown'
                });
            });

            const response = typeof result === 'object' ? result.response : result;

            socket.emit('messageComplete', {
                response,
                conversationId
            });

            // Log to history
            serverStats.messageHistory.unshift({
                clientId,
                message: message.substring(0, 100),
                timestamp: new Date().toISOString()
            });
            if (serverStats.messageHistory.length > 100) serverStats.messageHistory.pop();

            // Log full response for dashboard
            serverStats.responseHistory.unshift({
                id: conversationId,
                clientId,
                model: sharedLmarena.currentModel || 'unknown',
                prompt: message.substring(0, 200),
                response: response,
                timestamp: new Date().toISOString()
            });
            if (serverStats.responseHistory.length > 20) serverStats.responseHistory.pop();

        } catch (error) {
            logError(error, `sendMessage (client: ${clientId})`);
            socket.emit('error', { message: error.message });
        }
    });

    socket.on('disconnect', () => {
        console.log(`[Server] Client disconnected: ${clientId}`);
        serverStats.activeClients.delete(clientId);
        console.log(`[Server] Active clients: ${serverStats.activeClients.size}`);
    });
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('[Server] Shutting down...');
    await browserController.close();
    process.exit(0);
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
    console.log(`[Server] Dashboard: http://localhost:${PORT}/dashboard`);
    console.log(`[Server] Cloud: http://localhost:${PORT}/cloud`);
    console.log('[Server] Initializing browser...');

    sharedLmarena.initialize().then(() => {
        console.log('[Server] Browser ready.');
    }).catch(e => {
        console.error('[Server] Browser init failed:', e);
    });
});
