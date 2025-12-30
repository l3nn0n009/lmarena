#!/usr/bin/env node
/**
 * Grove CLI v3.0 - Claude Code Alternative
 * Multi-agent support, context files, project directories
 */

const readline = require('readline');
const { io } = require('socket.io-client');
const fs = require('fs');
const path = require('path');

// ANSI codes
const c = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    magenta: '\x1b[35m',
    blue: '\x1b[34m',
    white: '\x1b[37m',
};

const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

class GroveCLI {
    constructor() {
        this.socket = null;
        this.currentModel = null;
        this.models = [];
        this.isStreaming = false;
        this.workingDir = process.cwd();
        this.projectDir = process.cwd(); // Root project directory

        // Context system
        this.contextFiles = new Map(); // name -> { path, content }
        this.activeContexts = []; // Currently active context names

        // Streaming state
        this.fullResponse = '';
        this.displayedLen = 0;
        this.toolCallBuffer = '';
        this.inToolCall = false;
        this.pendingToolCalls = [];

        this.spinnerInterval = null;
        this.spinnerIdx = 0;
        this.agentName = 'grove';

        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: ''
        });
    }

    // Build the system prompt dynamically based on context
    buildSystemPrompt() {
        let prompt = `You are Grove, an intelligent AI coding assistant. You help developers write, refactor, and debug code.

PROJECT DIRECTORY: ${this.projectDir}
CURRENT DIRECTORY: ${this.workingDir}

## CONVERSATION STYLE
- Be conversational and helpful, not robotic
- When asked to write code, first briefly explain your approach
- Ask clarifying questions if the request is ambiguous
- Suggest improvements and alternatives when appropriate
- DON'T just immediately use tool calls - discuss your plan first
- After creating files, summarize what you did

## TOOL CALLS (use when ready to implement)
When creating/editing files, use this XML format:

<tool_call>
<tool>create_file</tool>
<path>relative/path/file.ext</path>
<content>
file content here
</content>
</tool_call>

For running commands:
<tool_call>
<tool>run_command</tool>
<command>npm install express</command>
</tool_call>

RULES:
1. Always discuss your approach BEFORE using tool calls
2. One tool_call block per file
3. Use relative paths from the project directory
4. Be thoughtful about file organization`;

        // Add active context files
        if (this.activeContexts.length > 0) {
            prompt += `\n\n## CONTEXT FILES\nThe following context files provide project-specific information:\n`;

            for (const name of this.activeContexts) {
                const ctx = this.contextFiles.get(name);
                if (ctx && ctx.content) {
                    prompt += `\n### ${name.toUpperCase()}\n${ctx.content}\n`;
                }
            }
        }

        return prompt;
    }

    spinner(msg) {
        this.spinnerIdx = 0;
        this.spinnerInterval = setInterval(() => {
            process.stdout.write(`\r${c.cyan}${spinnerFrames[this.spinnerIdx]} ${msg}${c.reset}  `);
            this.spinnerIdx = (this.spinnerIdx + 1) % spinnerFrames.length;
        }, 80);
    }

    stopSpinner() {
        if (this.spinnerInterval) {
            clearInterval(this.spinnerInterval);
            this.spinnerInterval = null;
            process.stdout.write('\r\x1b[K');
        }
    }

    getPrompt() {
        const dir = path.basename(this.workingDir);
        const model = this.currentModel ? this.currentModel.split('-')[0] : 'grove';
        const ctxIndicator = this.activeContexts.length > 0
            ? `${c.magenta}[${this.activeContexts.join(',')}]${c.reset} `
            : '';
        return `${ctxIndicator}${c.dim}${dir}${c.reset} ${c.green}${model}${c.reset}${c.dim}>${c.reset} `;
    }

    async connect() {
        const serverUrl = process.env.GROVE_SERVER || 'http://localhost:3000';
        this.spinner('Connecting...');

        return new Promise((resolve, reject) => {
            this.socket = io(serverUrl, {
                reconnection: true,
                reconnectionAttempts: 5,
                timeout: 30000
            });

            this.socket.on('connect', () => {
                this.socket.emit('init', {});
            });

            this.socket.on('ready', (data) => {
                this.stopSpinner();
                this.currentModel = data.currentModel;
                console.log(`${c.green}✓${c.reset} Connected ${c.dim}(${this.currentModel || 'no model'})${c.reset}`);
                resolve();
            });

            this.socket.on('models', (data) => {
                this.models = data.models || [];
            });

            this.socket.on('token', (data) => {
                this.handleToken(data);
            });

            this.socket.on('messageComplete', (data) => {
                this.handleComplete(data);
            });

            this.socket.on('modelSelected', (data) => {
                this.stopSpinner();
                if (data.success) {
                    this.currentModel = data.model;
                    console.log(`${c.green}✓${c.reset} Model: ${data.model}`);
                }
            });

            this.socket.on('error', (data) => {
                this.stopSpinner();
                console.error(`\n${c.red}Error: ${data.message}${c.reset}`);
                this.isStreaming = false;
                this.showPrompt();
            });

            this.socket.on('disconnect', () => {
                console.log(`\n${c.yellow}Disconnected${c.reset}`);
            });

            this.socket.on('connect_error', (err) => {
                this.stopSpinner();
                reject(err);
            });

            setTimeout(() => {
                this.stopSpinner();
                reject(new Error('Connection timeout'));
            }, 30000);
        });
    }

    handleToken(data) {
        if (!this.isStreaming) {
            this.isStreaming = true;
            this.fullResponse = '';
            this.displayedLen = 0;
            this.toolCallBuffer = '';
            this.inToolCall = false;
            this.pendingToolCalls = [];
            console.log('');
        }

        const delta = data.delta || '';
        if (!delta) return;

        this.fullResponse += delta;
        this.processForDisplay();
    }

    processForDisplay() {
        const unprocessed = this.fullResponse.slice(this.displayedLen);
        let i = 0;

        while (i < unprocessed.length) {
            const remaining = unprocessed.slice(i);

            if (!this.inToolCall) {
                const toolStart = remaining.indexOf('<tool_call>');

                if (toolStart === 0) {
                    this.inToolCall = true;
                    this.toolCallBuffer = '';
                    i += 11;
                    continue;
                } else if (toolStart > 0) {
                    process.stdout.write(remaining.slice(0, toolStart));
                    this.inToolCall = true;
                    this.toolCallBuffer = '';
                    i += toolStart + 11;
                    continue;
                } else {
                    const partial = this.checkPartialTag(remaining, '<tool_call>');
                    if (partial > 0) {
                        const safe = remaining.slice(0, remaining.length - partial);
                        process.stdout.write(safe);
                        i += safe.length;
                        break;
                    } else {
                        process.stdout.write(remaining);
                        i += remaining.length;
                    }
                }
            } else {
                const toolEnd = remaining.indexOf('</tool_call>');

                if (toolEnd >= 0) {
                    this.toolCallBuffer += remaining.slice(0, toolEnd);
                    this.parseToolCallXML(this.toolCallBuffer);
                    this.inToolCall = false;
                    this.toolCallBuffer = '';
                    i += toolEnd + 12;
                } else {
                    this.toolCallBuffer += remaining;
                    i += remaining.length;
                }
            }
        }

        this.displayedLen = this.fullResponse.length;
    }

    checkPartialTag(str, tag) {
        for (let len = Math.min(str.length, tag.length - 1); len > 0; len--) {
            if (str.endsWith(tag.slice(0, len))) {
                return len;
            }
        }
        return 0;
    }

    parseToolCallXML(content) {
        const toolMatch = content.match(/<tool>\s*(.*?)\s*<\/tool>/s);
        const pathMatch = content.match(/<path>\s*(.*?)\s*<\/path>/s);
        const contentMatch = content.match(/<content>([\s\S]*?)<\/content>/s);
        const commandMatch = content.match(/<command>\s*(.*?)\s*<\/command>/s);

        if (toolMatch && (pathMatch || commandMatch)) {
            const toolCall = {
                tool: toolMatch[1].trim(),
                path: pathMatch ? pathMatch[1].trim() : null,
                content: contentMatch ? contentMatch[1].replace(/^\n/, '').replace(/\n$/, '') : null,
                command: commandMatch ? commandMatch[1].trim() : null
            };

            this.pendingToolCalls.push(toolCall);

            const icon = toolCall.tool.includes('file') ? '📄' :
                toolCall.tool.includes('command') ? '⚡' : '🔧';
            console.log(`\n${c.magenta}${icon} ${toolCall.tool}:${c.reset} ${c.bold}${toolCall.path || toolCall.command || ''}${c.reset}`);
            return;
        }

        // Fallback JSON parsing
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                const toolCall = JSON.parse(jsonMatch[0]);
                this.pendingToolCalls.push(toolCall);
                console.log(`\n${c.magenta}📄 ${toolCall.tool}:${c.reset} ${c.bold}${toolCall.path || ''}${c.reset}`);
            } catch (e) {
                console.log(`\n${c.yellow}⚠ Could not parse tool call${c.reset}`);
            }
        }
    }

    handleComplete(data) {
        this.isStreaming = false;
        this.processForDisplay();

        console.log('\n');

        if (this.pendingToolCalls.length > 0) {
            console.log(`${c.dim}───────────────────────────${c.reset}`);
            for (const tc of this.pendingToolCalls) {
                this.executeToolCall(tc);
            }
            console.log(`${c.dim}───────────────────────────${c.reset}\n`);
            this.pendingToolCalls = [];
        }

        this.showPrompt();
    }

    executeToolCall(tc) {
        const { tool, path: filePath, content, command } = tc;

        switch (tool) {
            case 'create_file':
            case 'write_file':
            case 'edit_file':
                this.createFile(filePath, content);
                break;
            case 'run_command':
                console.log(`${c.yellow}⚠ Command: ${command}${c.reset}`);
                console.log(`${c.dim}  (Run manually for safety)${c.reset}`);
                break;
            default:
                console.log(`${c.yellow}Unknown: ${tool}${c.reset}`);
        }
    }

    createFile(filePath, content) {
        if (!filePath || !content) {
            console.log(`${c.red}✗ Missing path or content${c.reset}`);
            return;
        }

        try {
            // Use project directory as base
            const fullPath = path.resolve(this.projectDir, filePath);
            const dir = path.dirname(fullPath);

            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            const existed = fs.existsSync(fullPath);
            fs.writeFileSync(fullPath, content, 'utf8');

            const lines = content.split('\n').length;
            const action = existed ? 'Updated' : 'Created';
            console.log(`${c.green}✓ ${action}:${c.reset} ${filePath} ${c.dim}(${lines} lines)${c.reset}`);
        } catch (err) {
            console.log(`${c.red}✗ ${filePath}: ${err.message}${c.reset}`);
        }
    }

    showPrompt() {
        this.rl.setPrompt(this.getPrompt());
        this.rl.prompt();
    }

    // Load a context file
    loadContext(name, filePath = null) {
        // If no path, look for common patterns
        const searchPaths = filePath ? [filePath] : [
            path.join(this.projectDir, `${name}.md`),
            path.join(this.projectDir, `.grove`, `${name}.md`),
            path.join(this.projectDir, 'docs', `${name}.md`),
            path.join(this.projectDir, `${name.toUpperCase()}.md`),
        ];

        for (const searchPath of searchPaths) {
            if (fs.existsSync(searchPath)) {
                try {
                    const content = fs.readFileSync(searchPath, 'utf8');
                    this.contextFiles.set(name.toLowerCase(), { path: searchPath, content });

                    if (!this.activeContexts.includes(name.toLowerCase())) {
                        this.activeContexts.push(name.toLowerCase());
                    }

                    console.log(`${c.green}✓${c.reset} Loaded context: ${c.cyan}${name}${c.reset} ${c.dim}(${searchPath})${c.reset}`);
                    return true;
                } catch (e) {
                    console.log(`${c.red}✗ Failed to read: ${searchPath}${c.reset}`);
                }
            }
        }

        console.log(`${c.red}✗ Context not found: ${name}${c.reset}`);
        console.log(`${c.dim}  Searched: ${searchPaths.join(', ')}${c.reset}`);
        return false;
    }

    // Remove a context
    unloadContext(name) {
        const idx = this.activeContexts.indexOf(name.toLowerCase());
        if (idx > -1) {
            this.activeContexts.splice(idx, 1);
            console.log(`${c.green}✓${c.reset} Unloaded: ${name}`);
        } else {
            console.log(`${c.yellow}Context not active: ${name}${c.reset}`);
        }
    }

    async handleCommand(input) {
        const trimmed = input.trim();
        if (!trimmed.startsWith('/')) return false;

        const [cmd, ...args] = trimmed.slice(1).split(/\s+/);
        const arg = args.join(' ');

        switch (cmd.toLowerCase()) {
            case 'model':
            case 'm':
                await this.setModel(arg);
                break;
            case 'models':
            case 'ls':
                this.listModels(args[0]);
                break;
            case 'project':
            case 'p':
                this.setProject(arg);
                break;
            case 'cd':
                this.changeDir(arg);
                break;
            case 'pwd':
                console.log(`${c.cyan}Project:${c.reset} ${this.projectDir}`);
                console.log(`${c.cyan}Current:${c.reset} ${this.workingDir}`);
                break;
            case 'context':
            case 'ctx':
            case 'agent':
                if (arg) {
                    this.loadContext(args[0], args[1]);
                } else {
                    this.listContexts();
                }
                break;
            case 'unload':
                if (arg) {
                    this.unloadContext(arg);
                } else {
                    console.log(`${c.dim}Usage: /unload <context_name>${c.reset}`);
                }
                break;
            case 'contexts':
                this.listContexts();
                break;
            case 'init':
                this.initProject();
                break;
            case 'help':
            case 'h':
            case '?':
                this.showHelp();
                break;
            case 'clear':
            case 'cls':
                console.clear();
                this.showBanner();
                break;
            case 'exit':
            case 'quit':
            case 'q':
                this.exit();
                break;
            default:
                console.log(`${c.dim}Unknown: /${cmd}${c.reset}`);
        }
        return true;
    }

    setProject(dir) {
        if (!dir) {
            console.log(`${c.cyan}Project:${c.reset} ${this.projectDir}`);
            return;
        }

        const newPath = path.resolve(this.workingDir, dir);
        if (fs.existsSync(newPath) && fs.statSync(newPath).isDirectory()) {
            this.projectDir = newPath;
            this.workingDir = newPath;
            console.log(`${c.green}✓${c.reset} Project set: ${newPath}`);

            // Auto-load common context files
            this.autoLoadContexts();
        } else {
            console.log(`${c.red}Not found: ${dir}${c.reset}`);
        }
    }

    autoLoadContexts() {
        const commonContexts = ['agent', 'frontend', 'backend', 'readme', 'context'];
        for (const ctx of commonContexts) {
            const searchPaths = [
                path.join(this.projectDir, `${ctx}.md`),
                path.join(this.projectDir, `${ctx.toUpperCase()}.md`),
                path.join(this.projectDir, '.grove', `${ctx}.md`),
            ];
            for (const p of searchPaths) {
                if (fs.existsSync(p)) {
                    this.loadContext(ctx, p);
                    break;
                }
            }
        }
    }

    listContexts() {
        console.log(`\n${c.bold}Active Contexts${c.reset}`);
        if (this.activeContexts.length === 0) {
            console.log(`${c.dim}  None loaded. Use /context <name> to load.${c.reset}`);
        } else {
            for (const name of this.activeContexts) {
                const ctx = this.contextFiles.get(name);
                const lines = ctx?.content?.split('\n').length || 0;
                console.log(`  ${c.green}•${c.reset} ${name} ${c.dim}(${lines} lines)${c.reset}`);
            }
        }
        console.log('');
    }

    initProject() {
        const groveDir = path.join(this.projectDir, '.grove');
        if (!fs.existsSync(groveDir)) {
            fs.mkdirSync(groveDir, { recursive: true });
        }

        const agentPath = path.join(groveDir, 'AGENT.md');
        if (!fs.existsSync(agentPath)) {
            const template = `# Project Agent Context

## Project Overview
Describe your project here.

## Tech Stack
- 

## Key Files
- 

## Coding Standards
- 

## Notes for AI
- 
`;
            fs.writeFileSync(agentPath, template);
            console.log(`${c.green}✓${c.reset} Created: .grove/AGENT.md`);
        } else {
            console.log(`${c.yellow}Already exists: .grove/AGENT.md${c.reset}`);
        }
    }

    async setModel(name) {
        if (!name) {
            console.log(`Current: ${this.currentModel || 'none'}`);
            return;
        }

        const match = this.models.find(m =>
            m.id.toLowerCase().includes(name.toLowerCase()) ||
            m.name.toLowerCase().includes(name.toLowerCase())
        );

        if (!match) {
            console.log(`${c.red}Not found: ${name}${c.reset}`);
            return;
        }

        this.spinner(`Switching to ${match.name}...`);
        this.socket.emit('selectModel', { model: match.id });
    }

    listModels(filter) {
        const grouped = {};
        for (const m of this.models) {
            const mod = m.modality || 'text';
            if (filter && !mod.includes(filter.toLowerCase())) continue;
            if (!grouped[mod]) grouped[mod] = [];
            grouped[mod].push(m);
        }

        console.log('');
        for (const [modality, models] of Object.entries(grouped)) {
            console.log(`${c.yellow}${modality.toUpperCase()}${c.reset}`);
            for (const m of models) {
                const cur = m.id === this.currentModel ? ` ${c.green}◀${c.reset}` : '';
                console.log(`  ${c.dim}•${c.reset} ${m.name}${cur}`);
            }
        }
        console.log('');
    }

    showHelp() {
        console.log(`
${c.bold}${c.cyan}Grove CLI v3.0${c.reset} - AI Coding Assistant

${c.yellow}PROJECT${c.reset}
  /project [path]   Set project directory
  /cd [path]        Change current directory
  /pwd              Show directories
  /init             Create .grove/AGENT.md template

${c.yellow}CONTEXT${c.reset}
  /context [name]   Load context file (e.g., /context frontend)
  /contexts         List active contexts
  /unload [name]    Remove context from session

${c.yellow}MODELS${c.reset}
  /model [name]     Switch AI model
  /models           List available models

${c.yellow}OTHER${c.reset}
  /clear            Clear screen
  /help             Show this help
  /exit             Exit CLI

${c.dim}Context files are .md files in your project that provide
context to the AI (e.g., FRONTEND.md, BACKEND.md, AGENT.md)${c.reset}
`);
    }

    changeDir(dir) {
        if (!dir) {
            console.log(this.workingDir);
            return;
        }
        const newPath = path.resolve(this.workingDir, dir);
        if (fs.existsSync(newPath) && fs.statSync(newPath).isDirectory()) {
            this.workingDir = newPath;
            console.log(`${c.green}✓${c.reset} ${newPath}`);
        } else {
            console.log(`${c.red}Not found: ${dir}${c.reset}`);
        }
    }

    sendMessage(message) {
        if (!this.socket?.connected) {
            console.log(`${c.red}Not connected${c.reset}`);
            return;
        }

        const systemPrompt = this.buildSystemPrompt();

        this.socket.emit('sendMessage', {
            message: `${systemPrompt}\n\n---\n\nUser: ${message}`,
            conversationId: Date.now().toString()
        });
    }

    showBanner() {
        console.log(`
${c.green}╔═══════════════════════════════════════╗
║           ${c.bold}Grove CLI v3.0${c.reset}${c.green}             ║
║      AI-Powered Coding Assistant      ║
╚═══════════════════════════════════════╝${c.reset}
`);
    }

    exit() {
        console.log(`${c.dim}Goodbye!${c.reset}`);
        this.socket?.disconnect();
        process.exit(0);
    }

    async run() {
        this.showBanner();

        try {
            await this.connect();
        } catch (err) {
            console.log(`${c.red}✗ ${err.message}${c.reset}`);
            console.log(`${c.dim}Start server: npm start${c.reset}`);
            process.exit(1);
        }

        // Auto-load contexts from current directory
        this.autoLoadContexts();

        console.log(`${c.dim}Type /help for commands${c.reset}\n`);
        this.showPrompt();

        this.rl.on('line', async (line) => {
            const input = line.trim();
            if (!input) {
                this.showPrompt();
                return;
            }

            if (await this.handleCommand(input)) {
                this.showPrompt();
                return;
            }

            this.sendMessage(input);
        });

        this.rl.on('close', () => this.exit());
    }
}

new GroveCLI().run().catch(console.error);
