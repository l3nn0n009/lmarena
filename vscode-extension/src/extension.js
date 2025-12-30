const vscode = require('vscode');
const { io } = require('socket.io-client');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');

let socket = null;
let currentModel = null;
let models = [];
let executionMode = 'planning'; // 'planning' or 'execution'
let runningProcesses = new Map(); // pid -> process

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Grove AI extension activated');

    // Register the webview provider
    const provider = new GroveViewProvider(context.extensionUri, context);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('grove.chatView', provider)
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('grove.newChat', () => {
            provider.clearChat();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('grove.selectModel', async () => {
            const items = models.map(m => ({
                label: m.name,
                description: m.modality,
                id: m.id
            }));
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select an AI model'
            });
            if (selected) {
                provider.selectModel(selected.id);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('grove.toggleMode', () => {
            executionMode = executionMode === 'planning' ? 'execution' : 'planning';
            vscode.window.showInformationMessage(`Grove: Switched to ${executionMode} mode`);
            provider.updateMode(executionMode);
        })
    );
}

class GroveViewProvider {
    constructor(extensionUri, context) {
        this._extensionUri = extensionUri;
        this._context = context;
        this._view = null;
        this._messages = [];
    }

    resolveWebviewView(webviewView, context, token) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'init':
                    this._connectToServer();
                    break;
                case 'sendMessage':
                    this._sendMessage(data.message);
                    break;
                case 'selectModel':
                    this._selectModel(data.model);
                    break;
                case 'setMode':
                    executionMode = data.mode;
                    break;
                case 'executeToolCall':
                    await this._executeToolCall(data.toolCall);
                    break;
                case 'cancelProcess':
                    this._cancelProcess(data.pid);
                    break;
            }
        });
    }

    _connectToServer() {
        const config = vscode.workspace.getConfiguration('grove');
        const serverUrl = config.get('serverUrl') || 'http://localhost:3000';

        if (socket) {
            socket.disconnect();
        }

        socket = io(serverUrl, {
            reconnection: true,
            reconnectionAttempts: 5,
            timeout: 30000
        });

        socket.on('connect', () => {
            console.log('[Grove] Connected to server');
            this._postMessage({ type: 'connected' });
            socket.emit('init', {});
        });

        socket.on('ready', (data) => {
            currentModel = data.currentModel;
            this._postMessage({
                type: 'ready',
                model: currentModel,
                modality: data.modality
            });
        });

        socket.on('models', (data) => {
            models = data.models || [];
            this._postMessage({ type: 'models', models });
        });

        socket.on('token', (data) => {
            this._postMessage({
                type: 'token',
                fullText: data.fullText,
                delta: data.delta
            });
        });

        socket.on('messageComplete', async (data) => {
            this._postMessage({
                type: 'messageComplete',
                response: data.response
            });

            // Parse tool calls
            const toolCalls = this._parseToolCalls(data.response);

            if (executionMode === 'execution' && toolCalls.length > 0) {
                // Execute tool calls and collect results that need to be fed back
                const feedbackResults = [];

                for (const tc of toolCalls) {
                    const result = await this._executeToolCallWithResult(tc);

                    // For read_file, we need to send the content back to the AI
                    if (tc.tool === 'read_file' && result.success && result.content) {
                        feedbackResults.push({
                            tool: 'read_file',
                            path: tc.path,
                            content: result.content
                        });
                    }
                }

                // If we have file read results, send them back to the AI
                if (feedbackResults.length > 0) {
                    const feedbackMessage = this._buildFeedbackMessage(feedbackResults);
                    this._sendFollowUp(feedbackMessage);
                }
            }
        });

        socket.on('modelSelected', (data) => {
            currentModel = data.model;
            this._postMessage({
                type: 'modelSelected',
                model: data.model
            });
        });

        socket.on('error', (data) => {
            this._postMessage({ type: 'error', message: data.message });
            vscode.window.showErrorMessage(`Grove: ${data.message}`);
        });

        socket.on('disconnect', () => {
            this._postMessage({ type: 'disconnected' });
        });
    }

    _sendMessage(message) {
        if (!socket?.connected) {
            vscode.window.showErrorMessage('Grove: Not connected to server');
            return;
        }

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

        // Build system prompt
        const systemPrompt = this._buildSystemPrompt(workspaceFolder);
        const fullMessage = systemPrompt + '\n\n---\n\nUser: ' + message;

        socket.emit('sendMessage', {
            message: fullMessage,
            conversationId: Date.now().toString()
        });
    }

    // Send a follow-up message with tool results (for agentic loop)
    _sendFollowUp(message) {
        if (!socket?.connected) return;

        this._postMessage({ type: 'followUp', message: 'Sending file contents to AI...' });

        // Add streaming placeholder for the continuation
        this._postMessage({ type: 'startStreaming' });

        socket.emit('sendMessage', {
            message: message,
            conversationId: Date.now().toString()
        });
    }

    // Build feedback message with tool results
    _buildFeedbackMessage(results) {
        let message = 'Tool execution results:\n\n';

        for (const r of results) {
            if (r.tool === 'read_file') {
                message += `## File: ${r.path}\n\`\`\`\n${r.content}\n\`\`\`\n\n`;
            }
        }

        message += 'Now please continue with your analysis or next steps based on the file contents above.';
        return message;
    }

    _buildSystemPrompt(workspaceFolder) {
        return `You are Grove, an AI coding assistant integrated into VS Code.

WORKSPACE: ${workspaceFolder}
MODE: ${executionMode.toUpperCase()}

## TOOL CALLS
Use these XML tags for actions:

### Create/Write File
<tool_call>
<tool>create_file</tool>
<path>relative/path/file.ext</path>
<content>
file content here
</content>
</tool_call>

### Read File
<tool_call>
<tool>read_file</tool>
<path>relative/path/file.ext</path>
</tool_call>

### Edit File (find and replace)
<tool_call>
<tool>edit_file</tool>
<path>relative/path/file.ext</path>
<find>text to find</find>
<replace>replacement text</replace>
</tool_call>

### Rename/Move File
<tool_call>
<tool>rename_file</tool>
<from>old/path/file.ext</from>
<to>new/path/file.ext</to>
</tool_call>

### Delete File
<tool_call>
<tool>delete_file</tool>
<path>relative/path/file.ext</path>
</tool_call>

### Run Command
<tool_call>
<tool>run_command</tool>
<command>npm install</command>
</tool_call>

### Cancel Command (use the PID from run_command output)
<tool_call>
<tool>cancel_command</tool>
<pid>12345</pid>
</tool_call>

## RULES
${executionMode === 'planning' ?
                '- PLANNING MODE: Explain what you would do. Tool calls will be shown but NOT executed automatically.' :
                '- EXECUTION MODE: Tool calls will be executed automatically. Be careful!'}
- Use relative paths from the workspace root
- One tool_call per action
- Explain your reasoning before taking actions`;
    }

    _parseToolCalls(text) {
        const calls = [];
        const regex = /<tool_call>\s*<tool>\s*([^<]+)\s*<\/tool>\s*([\s\S]*?)<\/tool_call>/gi;

        let match;
        while ((match = regex.exec(text)) !== null) {
            const tool = match[1].trim();
            const inner = match[2];

            const tc = { tool };

            // Extract various fields
            const pathMatch = inner.match(/<path>\s*([^<]*)\s*<\/path>/i);
            const contentMatch = inner.match(/<content>([\s\S]*?)<\/content>/i);
            const commandMatch = inner.match(/<command>\s*([^<]*)\s*<\/command>/i);
            const findMatch = inner.match(/<find>([\s\S]*?)<\/find>/i);
            const replaceMatch = inner.match(/<replace>([\s\S]*?)<\/replace>/i);
            const fromMatch = inner.match(/<from>\s*([^<]*)\s*<\/from>/i);
            const toMatch = inner.match(/<to>\s*([^<]*)\s*<\/to>/i);
            const pidMatch = inner.match(/<pid>\s*([^<]*)\s*<\/pid>/i);

            if (pathMatch) tc.path = pathMatch[1].trim();
            if (contentMatch) tc.content = contentMatch[1].replace(/^\n/, '').replace(/\n$/, '');
            if (commandMatch) tc.command = commandMatch[1].trim();
            if (findMatch) tc.find = findMatch[1];
            if (replaceMatch) tc.replace = replaceMatch[1];
            if (fromMatch) tc.from = fromMatch[1].trim();
            if (toMatch) tc.to = toMatch[1].trim();
            if (pidMatch) tc.pid = pidMatch[1].trim();

            calls.push(tc);
        }

        return calls;
    }

    // Execute tool call and return result (for agentic loop)
    async _executeToolCallWithResult(tc) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceFolder && tc.tool !== 'run_command' && tc.tool !== 'cancel_command') {
            this._postMessage({ type: 'toolResult', tool: tc.tool, success: false, error: 'No workspace open' });
            return { success: false, error: 'No workspace open' };
        }

        try {
            switch (tc.tool) {
                case 'create_file':
                case 'write_file':
                    await this._createFile(workspaceFolder, tc.path, tc.content);
                    return { success: true };
                case 'read_file':
                    return await this._readFileWithResult(workspaceFolder, tc.path);
                case 'edit_file':
                    await this._editFile(workspaceFolder, tc.path, tc.find, tc.replace);
                    return { success: true };
                case 'rename_file':
                    await this._renameFile(workspaceFolder, tc.from, tc.to);
                    return { success: true };
                case 'delete_file':
                    await this._deleteFile(workspaceFolder, tc.path);
                    return { success: true };
                case 'run_command':
                    await this._runCommand(workspaceFolder, tc.command);
                    return { success: true };
                case 'cancel_command':
                    this._cancelProcess(tc.pid);
                    return { success: true };
                default:
                    this._postMessage({ type: 'toolResult', tool: tc.tool, success: false, error: 'Unknown tool' });
                    return { success: false, error: 'Unknown tool' };
            }
        } catch (error) {
            this._postMessage({ type: 'toolResult', tool: tc.tool, success: false, error: error.message });
            vscode.window.showErrorMessage(`Grove: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    async _executeToolCall(tc) {
        await this._executeToolCallWithResult(tc);
    }

    async _createFile(workspace, filePath, content) {
        const fullPath = path.join(workspace, filePath);
        const dir = path.dirname(fullPath);

        // Create directory if needed
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(fullPath, content || '', 'utf8');

        // Open the file in editor
        const doc = await vscode.workspace.openTextDocument(fullPath);
        await vscode.window.showTextDocument(doc);

        this._postMessage({ type: 'toolResult', tool: 'create_file', success: true, path: filePath });
        vscode.window.showInformationMessage(`Grove: Created ${filePath}`);
    }

    async _readFile(workspace, filePath) {
        const fullPath = path.join(workspace, filePath);

        if (!fs.existsSync(fullPath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const content = fs.readFileSync(fullPath, 'utf8');
        this._postMessage({ type: 'toolResult', tool: 'read_file', success: true, path: filePath, content });
    }

    // Version that returns content for agentic loop
    async _readFileWithResult(workspace, filePath) {
        const fullPath = path.join(workspace, filePath);

        if (!fs.existsSync(fullPath)) {
            this._postMessage({ type: 'toolResult', tool: 'read_file', success: false, error: `File not found: ${filePath}` });
            return { success: false, error: `File not found: ${filePath}` };
        }

        const content = fs.readFileSync(fullPath, 'utf8');
        this._postMessage({ type: 'toolResult', tool: 'read_file', success: true, path: filePath, content });
        vscode.window.showInformationMessage(`Grove: Read ${filePath} (${content.length} chars)`);
        return { success: true, content, path: filePath };
    }

    async _editFile(workspace, filePath, find, replace) {
        const fullPath = path.join(workspace, filePath);

        if (!fs.existsSync(fullPath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        let content = fs.readFileSync(fullPath, 'utf8');
        if (!content.includes(find)) {
            throw new Error(`Text not found in file: "${find.substring(0, 50)}..."`);
        }

        content = content.replace(find, replace);
        fs.writeFileSync(fullPath, content, 'utf8');

        // Refresh document if open
        const doc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === fullPath);
        if (doc) {
            await vscode.commands.executeCommand('workbench.action.files.revert');
        }

        this._postMessage({ type: 'toolResult', tool: 'edit_file', success: true, path: filePath });
        vscode.window.showInformationMessage(`Grove: Edited ${filePath}`);
    }

    async _renameFile(workspace, from, to) {
        const fromPath = path.join(workspace, from);
        const toPath = path.join(workspace, to);

        if (!fs.existsSync(fromPath)) {
            throw new Error(`File not found: ${from}`);
        }

        // Create target directory if needed
        const toDir = path.dirname(toPath);
        if (!fs.existsSync(toDir)) {
            fs.mkdirSync(toDir, { recursive: true });
        }

        fs.renameSync(fromPath, toPath);

        this._postMessage({ type: 'toolResult', tool: 'rename_file', success: true, from, to });
        vscode.window.showInformationMessage(`Grove: Renamed ${from} → ${to}`);
    }

    async _deleteFile(workspace, filePath) {
        const fullPath = path.join(workspace, filePath);

        if (!fs.existsSync(fullPath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            fs.rmSync(fullPath, { recursive: true });
        } else {
            fs.unlinkSync(fullPath);
        }

        this._postMessage({ type: 'toolResult', tool: 'delete_file', success: true, path: filePath });
        vscode.window.showInformationMessage(`Grove: Deleted ${filePath}`);
    }

    async _runCommand(workspace, command) {
        return new Promise((resolve) => {
            const cwd = workspace || process.cwd();

            const proc = spawn(command, [], {
                shell: true,
                cwd,
                env: process.env
            });

            const pid = proc.pid;
            runningProcesses.set(pid.toString(), proc);

            this._postMessage({
                type: 'commandStarted',
                pid,
                command,
                message: `Running: ${command} (PID: ${pid})`
            });

            let output = '';

            proc.stdout.on('data', (data) => {
                output += data.toString();
                this._postMessage({ type: 'commandOutput', pid, output: data.toString() });
            });

            proc.stderr.on('data', (data) => {
                output += data.toString();
                this._postMessage({ type: 'commandOutput', pid, output: data.toString(), isError: true });
            });

            proc.on('close', (code) => {
                runningProcesses.delete(pid.toString());
                this._postMessage({
                    type: 'commandComplete',
                    pid,
                    code,
                    output,
                    success: code === 0
                });

                if (code === 0) {
                    vscode.window.showInformationMessage(`Grove: Command completed (exit ${code})`);
                } else {
                    vscode.window.showWarningMessage(`Grove: Command exited with code ${code}`);
                }
                resolve();
            });

            proc.on('error', (error) => {
                runningProcesses.delete(pid.toString());
                this._postMessage({
                    type: 'commandError',
                    pid,
                    error: error.message
                });
                resolve();
            });
        });
    }

    _cancelProcess(pid) {
        const proc = runningProcesses.get(pid?.toString());
        if (proc) {
            proc.kill('SIGTERM');
            runningProcesses.delete(pid.toString());
            this._postMessage({ type: 'commandCancelled', pid });
            vscode.window.showInformationMessage(`Grove: Cancelled process ${pid}`);
        } else {
            this._postMessage({ type: 'error', message: `Process ${pid} not found` });
        }
    }

    selectModel(modelId) {
        if (socket?.connected) {
            socket.emit('selectModel', { model: modelId });
        }
    }

    clearChat() {
        this._messages = [];
        this._postMessage({ type: 'clearChat' });
    }

    updateMode(mode) {
        this._postMessage({ type: 'modeChanged', mode });
    }

    _postMessage(message) {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    _getHtmlForWebview(webview) {
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: var(--vscode-font-family);
            background: var(--vscode-sideBar-background);
            color: var(--vscode-foreground);
            padding: 0;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        
        .header {
            padding: 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            flex-shrink: 0;
        }
        
        .status {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
        }
        
        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #888;
        }
        
        .status-dot.connected { background: #10b981; }
        .status-dot.thinking { background: #f59e0b; animation: pulse 1s infinite; }
        
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
        }
        
        .status-text {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        
        .controls {
            display: flex;
            gap: 8px;
        }
        
        .control-btn {
            flex: 1;
            padding: 6px 8px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 4px;
            font-size: 11px;
            cursor: pointer;
        }
        
        .control-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        
        .control-btn.active {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        
        .model-select {
            width: 100%;
            padding: 6px 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            font-size: 12px;
            margin-top: 8px;
        }
        
        .chat-container {
            flex: 1;
            overflow-y: auto;
            padding: 12px;
            min-height: 0;
        }
        
        .message {
            margin-bottom: 16px;
        }
        
        .message-header {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 4px;
            text-transform: uppercase;
        }
        
        .message-content {
            background: var(--vscode-input-background);
            border-radius: 8px;
            padding: 10px 12px;
            font-size: 13px;
            line-height: 1.5;
            white-space: pre-wrap;
            word-break: break-word;
        }
        
        .message.user .message-content {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        
        .tool-card {
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            margin: 8px 0;
            overflow: hidden;
        }
        
        .tool-header {
            padding: 8px 10px;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
            background: var(--vscode-toolbar-hoverBackground);
        }
        
        .tool-icon { font-size: 14px; }
        .tool-name { font-weight: 600; }
        .tool-path { color: var(--vscode-descriptionForeground); margin-left: auto; }
        
        .tool-actions {
            display: flex;
            gap: 4px;
        }
        
        .tool-action-btn {
            padding: 4px 8px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 3px;
            font-size: 10px;
            cursor: pointer;
        }
        
        .tool-action-btn.execute {
            background: #10b981;
            color: #000;
        }
        
        .tool-content {
            padding: 8px 10px;
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
            max-height: 200px;
            overflow: auto;
            white-space: pre;
            display: none;
        }
        
        .tool-card.expanded .tool-content {
            display: block;
        }
        
        .command-output {
            background: var(--vscode-terminal-background);
            color: var(--vscode-terminal-foreground);
            padding: 8px;
            font-family: var(--vscode-editor-font-family);
            font-size: 11px;
            max-height: 150px;
            overflow: auto;
            white-space: pre-wrap;
        }
        
        .input-container {
            padding: 12px;
            border-top: 1px solid var(--vscode-panel-border);
            flex-shrink: 0;
        }
        
        .input-row {
            display: flex;
            gap: 8px;
        }
        
        .input-field {
            flex: 1;
            padding: 8px 10px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            font-size: 13px;
            font-family: inherit;
            resize: none;
            min-height: 36px;
            max-height: 120px;
        }
        
        .input-field:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        
        .send-btn {
            padding: 8px 16px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
        }
        
        .send-btn:hover {
            background: var(--vscode-button-hoverBackground);
        }
        
        .send-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        
        .char-counter {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }
        
        .cursor { animation: blink 1s infinite; }
        @keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }
    </style>
</head>
<body>
    <div class="header">
        <div class="status">
            <div class="status-dot" id="statusDot"></div>
            <span class="status-text" id="statusText">Connecting...</span>
            <span class="char-counter" id="charCounter" style="display: none;"></span>
        </div>
        <div class="controls">
            <button class="control-btn active" id="planningBtn" onclick="setMode('planning')">📋 Planning</button>
            <button class="control-btn" id="executionBtn" onclick="setMode('execution')">⚡ Execution</button>
        </div>
        <select class="model-select" id="modelSelect" onchange="selectModel(this.value)">
            <option value="">Loading models...</option>
        </select>
    </div>
    
    <div class="chat-container" id="chatContainer"></div>
    
    <div class="input-container">
        <div class="input-row">
            <textarea 
                class="input-field" 
                id="inputField" 
                placeholder="Ask Grove anything..."
                onkeydown="handleKey(event)"
            ></textarea>
            <button class="send-btn" id="sendBtn" onclick="sendMessage()">Send</button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        let isConnected = false;
        let isThinking = false;
        let currentMode = 'planning';
        let charCount = 0;
        
        // Initialize
        vscode.postMessage({ type: 'init' });
        
        function setMode(mode) {
            currentMode = mode;
            document.getElementById('planningBtn').classList.toggle('active', mode === 'planning');
            document.getElementById('executionBtn').classList.toggle('active', mode === 'execution');
            vscode.postMessage({ type: 'setMode', mode });
        }
        
        function selectModel(modelId) {
            if (modelId) {
                vscode.postMessage({ type: 'selectModel', model: modelId });
            }
        }
        
        function handleKey(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        }
        
        function sendMessage() {
            const input = document.getElementById('inputField');
            const message = input.value.trim();
            if (!message || isThinking) return;
            
            addMessage('user', message);
            input.value = '';
            
            isThinking = true;
            updateStatus();
            addStreamingPlaceholder();
            
            vscode.postMessage({ type: 'sendMessage', message });
        }
        
        function addMessage(role, content) {
            const container = document.getElementById('chatContainer');
            const div = document.createElement('div');
            div.className = 'message ' + role;
            div.innerHTML = \`
                <div class="message-header">\${role === 'user' ? 'You' : 'Grove'}</div>
                <div class="message-content">\${formatContent(content)}</div>
            \`;
            container.appendChild(div);
            container.scrollTop = container.scrollHeight;
        }
        
        function addStreamingPlaceholder() {
            const container = document.getElementById('chatContainer');
            const div = document.createElement('div');
            div.className = 'message assistant';
            div.id = 'streaming';
            div.innerHTML = \`
                <div class="message-header">Grove</div>
                <div class="message-content"><span class="cursor">▋</span></div>
            \`;
            container.appendChild(div);
            container.scrollTop = container.scrollHeight;
        }
        
        function updateStreamingMessage(text) {
            const div = document.getElementById('streaming');
            if (div) {
                const content = div.querySelector('.message-content');
                content.innerHTML = formatContent(text) + '<span class="cursor">▋</span>';
                
                const container = document.getElementById('chatContainer');
                container.scrollTop = container.scrollHeight;
            }
            
            charCount = text.length;
            document.getElementById('charCounter').textContent = charCount.toLocaleString() + ' chars';
            document.getElementById('charCounter').style.display = 'inline';
        }
        
        function finalizeMessage(text) {
            const div = document.getElementById('streaming');
            if (div) div.remove();
            
            addMessage('assistant', text);
            isThinking = false;
            charCount = 0;
            document.getElementById('charCounter').style.display = 'none';
            updateStatus();
        }
        
        function formatContent(text) {
            if (!text) return '';
            let result = escapeHtml(text);
            
            // Format tool calls as cards
            result = result.replace(/&lt;tool_call&gt;\\s*&lt;tool&gt;\\s*([^&]+)\\s*&lt;\\/tool&gt;([\\s\\S]*?)&lt;\\/tool_call&gt;/gi, 
                (match, tool, inner) => {
                    const pathMatch = inner.match(/&lt;path&gt;\\s*([^&]*)\\s*&lt;\\/path&gt;/i);
                    const contentMatch = inner.match(/&lt;content&gt;([\\s\\S]*?)&lt;\\/content&gt;/i);
                    const commandMatch = inner.match(/&lt;command&gt;\\s*([^&]*)\\s*&lt;\\/command&gt;/i);
                    
                    const path = pathMatch ? pathMatch[1].trim() : '';
                    const content = contentMatch ? contentMatch[1].trim() : '';
                    const command = commandMatch ? commandMatch[1].trim() : '';
                    
                    const icon = tool.includes('file') ? '📄' : tool.includes('command') ? '⚡' : '🔧';
                    const cardId = 'tc-' + Math.random().toString(36).substr(2, 9);
                    
                    const toolData = JSON.stringify({ tool: tool.trim(), path, content, command }).replace(/"/g, '&quot;');
                    
                    return \`
                        <div class="tool-card" id="\${cardId}">
                            <div class="tool-header" onclick="toggleToolCard('\${cardId}')">
                                <span class="tool-icon">\${icon}</span>
                                <span class="tool-name">\${tool.trim()}</span>
                                <span class="tool-path">\${path || command}</span>
                                <div class="tool-actions">
                                    \${currentMode === 'planning' ? \`<button class="tool-action-btn execute" onclick="executeToolCall(event, \${toolData})">Execute</button>\` : ''}
                                </div>
                            </div>
                            \${content ? \`<div class="tool-content">\${content}</div>\` : ''}
                        </div>
                    \`;
                });
            
            result = result.replace(/\\n/g, '<br>');
            return result;
        }
        
        function escapeHtml(text) {
            return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }
        
        function toggleToolCard(cardId) {
            const card = document.getElementById(cardId);
            if (card) card.classList.toggle('expanded');
        }
        
        function executeToolCall(event, toolCall) {
            event.stopPropagation();
            vscode.postMessage({ type: 'executeToolCall', toolCall });
        }
        
        function updateStatus() {
            const dot = document.getElementById('statusDot');
            const text = document.getElementById('statusText');
            
            if (isThinking) {
                dot.className = 'status-dot thinking';
                text.textContent = 'Thinking...';
            } else if (isConnected) {
                dot.className = 'status-dot connected';
                text.textContent = 'Connected';
            } else {
                dot.className = 'status-dot';
                text.textContent = 'Disconnected';
            }
        }
        
        // Handle messages from extension
        window.addEventListener('message', (event) => {
            const data = event.data;
            
            switch (data.type) {
                case 'connected':
                    isConnected = true;
                    updateStatus();
                    break;
                    
                case 'disconnected':
                    isConnected = false;
                    updateStatus();
                    break;
                    
                case 'ready':
                    document.getElementById('statusText').textContent = data.model || 'Ready';
                    break;
                    
                case 'models':
                    const select = document.getElementById('modelSelect');
                    select.innerHTML = '<option value="">Select model...</option>';
                    
                    const groups = {};
                    data.models.forEach(m => {
                        const mod = m.modality || 'text';
                        if (!groups[mod]) groups[mod] = [];
                        groups[mod].push(m);
                    });
                    
                    for (const [modality, models] of Object.entries(groups)) {
                        const optgroup = document.createElement('optgroup');
                        optgroup.label = modality.toUpperCase();
                        models.forEach(m => {
                            const opt = document.createElement('option');
                            opt.value = m.id;
                            opt.textContent = m.name;
                            optgroup.appendChild(opt);
                        });
                        select.appendChild(optgroup);
                    }
                    break;
                    
                case 'modelSelected':
                    document.getElementById('modelSelect').value = data.model;
                    document.getElementById('statusText').textContent = data.model;
                    break;
                    
                case 'token':
                    updateStreamingMessage(data.fullText);
                    break;
                    
                case 'messageComplete':
                    finalizeMessage(data.response);
                    break;
                    
                case 'error':
                    isThinking = false;
                    updateStatus();
                    const streamingDiv = document.getElementById('streaming');
                    if (streamingDiv) streamingDiv.remove();
                    addMessage('assistant', '❌ Error: ' + data.message);
                    break;
                    
                case 'clearChat':
                    document.getElementById('chatContainer').innerHTML = '';
                    break;
                    
                case 'modeChanged':
                    setMode(data.mode);
                    break;
                    
                case 'toolResult':
                    console.log('Tool result:', data);
                    break;
                    
                case 'commandStarted':
                    addMessage('assistant', '⚡ ' + data.message);
                    break;
                    
                case 'commandOutput':
                    // Could append to a command output area
                    console.log(data.output);
                    break;
                    
                case 'commandComplete':
                    addMessage('assistant', \`✓ Command completed (exit \${data.code})\`);
                    break;
                    
                case 'commandCancelled':
                    addMessage('assistant', \`⛔ Process \${data.pid} cancelled\`);
                    break;
            }
        });
    </script>
</body>
</html>`;
    }
}

function deactivate() {
    if (socket) {
        socket.disconnect();
    }

    // Kill any running processes
    for (const [pid, proc] of runningProcesses) {
        proc.kill('SIGTERM');
    }
    runningProcesses.clear();
}

module.exports = {
    activate,
    deactivate
};
