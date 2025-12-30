#!/usr/bin/env node
/**
 * NebulaCLI v2.0 - Autonomous AI Coding Agent
 * Cleaner UI, better stability, image generation support
 */

const readline = require('readline');
const { io } = require('socket.io-client');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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
    gray: '\x1b[90m',
};

class NebulaCLI {
    constructor() {
        this.socket = null;
        this.currentModel = 'ready';
        this.models = [];
        this.isStreaming = false;
        this.workingDir = process.cwd();
        this.projectDir = process.cwd();

        // Context
        this.contextFiles = new Map();
        this.activeContexts = [];

        // Streaming
        this.fullResponse = '';
        this.displayedLen = 0;
        this.toolCallBuffer = '';
        this.inToolCall = false;
        this.pendingToolCalls = [];

        // Autonomy
        this.autonomousMode = false;
        this.stepCount = 0;
        this.maxSteps = 100; // Safety limit

        // Connection
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;

        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: ''
        });
    }

    // Cleaner system prompt
    buildSystemPrompt() {
        const ctx = this.activeContexts.map(n => {
            const c = this.contextFiles.get(n);
            return c ? `[${n}]\n${c.content.substring(0, 3000)}` : '';
        }).filter(Boolean).join('\n\n');

        return `You are Nebula, an autonomous coding agent.

ENVIRONMENT:
- Project: ${this.projectDir}
- Working Dir: ${this.workingDir}
- OS: Windows (PowerShell)
- Mode: ${this.autonomousMode ? 'AUTONOMOUS - keep working until complete' : 'INTERACTIVE'}
- Port 3000 is RESERVED (use 3001, 8080, etc for dev servers)

RULES:
1. Match existing code conventions
2. PowerShell syntax: use SEMICOLON (;) not && to chain commands
3. Use Set-Location instead of cd, or just run commands directly
4. Be concise - no filler text
5. In autonomous mode, continue without waiting

TOOLS (use XML format):

Create/edit files:
<tool_call>
<tool>create_file</tool>
<path>relative/path.ext</path>
<content>
file content
</content>
</tool_call>

Run commands (PowerShell on Windows):
<tool_call>
<tool>run_command</tool>
<command>npm install express</command>
</tool_call>

Generate image (creates image in project folder):
<tool_call>
<tool>generate_image</tool>
<prompt>a modern chess piece icon, flat design</prompt>
<filename>chess-icon.png</filename>
</tool_call>

${ctx ? `\nCONTEXT:\n${ctx}` : ''}`;
    }

    getPrompt() {
        const dir = path.basename(this.workingDir);
        const model = this.getShortModelName();
        const auto = this.autonomousMode ? `${c.magenta}⚡${c.reset}` : '';
        return `${auto}${c.cyan}${dir}${c.reset} ${c.dim}${model}${c.reset} ${c.green}❯${c.reset} `;
    }

    getShortModelName() {
        if (!this.currentModel) return 'nebula';
        const m = this.currentModel.toLowerCase();
        if (m.includes('claude')) return 'claude';
        if (m.includes('gpt-5')) return 'gpt5';
        if (m.includes('gemini-3')) return 'gemini3';
        if (m.includes('deepseek')) return 'deepseek';
        if (m.includes('grok')) return 'grok';
        return m.split('-')[0];
    }

    async connect() {
        const serverUrl = process.env.NEBULA_SERVER || 'http://localhost:3000';

        return new Promise((resolve, reject) => {
            console.log(`${c.dim}Connecting to server...${c.reset}`);

            this.socket = io(serverUrl, {
                reconnection: true,
                reconnectionAttempts: this.maxReconnectAttempts,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                timeout: 60000
            });

            this.socket.on('connect', () => {
                this.reconnectAttempts = 0;
                this.socket.emit('init', {});
            });

            this.socket.on('ready', (data) => {
                this.currentModel = data.currentModel || 'ready';
                console.log(`${c.green}✓${c.reset} Connected\n`);
                resolve();
            });

            this.socket.on('models', (data) => {
                this.models = data.models || [];
            });

            this.socket.on('token', (data) => this.handleToken(data));
            this.socket.on('messageComplete', (data) => this.handleComplete(data));

            this.socket.on('modelSelected', (data) => {
                if (data.success) {
                    this.currentModel = data.model;
                    console.log(`${c.green}✓${c.reset} Model: ${this.getShortModelName()}`);
                }
                this.showPrompt();
            });

            this.socket.on('error', (data) => {
                console.error(`\n${c.red}Error: ${data.message}${c.reset}`);
                this.isStreaming = false;
                this.showPrompt();
            });

            // Auto-reconnect handling
            this.socket.on('disconnect', (reason) => {
                console.log(`\n${c.yellow}Disconnected: ${reason}${c.reset}`);
                if (reason === 'io server disconnect') {
                    // Server initiated disconnect, try to reconnect
                    this.socket.connect();
                }
            });

            this.socket.on('reconnect', (attemptNumber) => {
                console.log(`${c.green}✓${c.reset} Reconnected after ${attemptNumber} attempts`);
            });

            this.socket.on('reconnect_attempt', (attemptNumber) => {
                this.reconnectAttempts = attemptNumber;
                console.log(`${c.yellow}Reconnecting... (${attemptNumber}/${this.maxReconnectAttempts})${c.reset}`);
            });

            this.socket.on('connect_error', (err) => {
                if (this.reconnectAttempts === 0) {
                    reject(new Error(`Connection failed: ${err.message}`));
                }
            });

            setTimeout(() => {
                if (!this.socket.connected && this.reconnectAttempts === 0) {
                    reject(new Error('Connection timeout'));
                }
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
                } else if (toolStart > 0) {
                    process.stdout.write(remaining.slice(0, toolStart));
                    this.inToolCall = true;
                    this.toolCallBuffer = '';
                    i += toolStart + 11;
                } else {
                    const partial = this.checkPartialTag(remaining, '<tool_call>');
                    if (partial > 0) {
                        process.stdout.write(remaining.slice(0, -partial));
                        i = unprocessed.length;
                    } else {
                        process.stdout.write(remaining);
                        i += remaining.length;
                    }
                }
            } else {
                const toolEnd = remaining.indexOf('</tool_call>');
                if (toolEnd >= 0) {
                    this.toolCallBuffer += remaining.slice(0, toolEnd);
                    this.parseToolCall(this.toolCallBuffer);
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
            if (str.endsWith(tag.slice(0, len))) return len;
        }
        return 0;
    }

    parseToolCall(content) {
        const tool = content.match(/<tool>\s*(.*?)\s*<\/tool>/s)?.[1]?.trim();
        const filePath = content.match(/<path>\s*(.*?)\s*<\/path>/s)?.[1]?.trim();
        const fileContent = content.match(/<content>([\s\S]*?)<\/content>/s)?.[1]?.replace(/^\n/, '').replace(/\n$/, '');
        const command = content.match(/<command>\s*(.*?)\s*<\/command>/s)?.[1]?.trim();
        const prompt = content.match(/<prompt>\s*(.*?)\s*<\/prompt>/s)?.[1]?.trim();
        const filename = content.match(/<filename>\s*(.*?)\s*<\/filename>/s)?.[1]?.trim();

        if (tool) {
            const tc = { tool, path: filePath, content: fileContent, command, prompt, filename };
            this.pendingToolCalls.push(tc);

            const icon = tool === 'create_file' ? '📄' : tool === 'run_command' ? '⚡' : tool === 'generate_image' ? '🎨' : '🔧';
            console.log(`\n${c.dim}${icon} ${tool}:${c.reset} ${c.bold}${filePath || command || prompt || ''}${c.reset}`);
        }
    }

    async handleComplete(data) {
        this.isStreaming = false;
        this.processForDisplay();
        console.log('');

        if (this.pendingToolCalls.length > 0) {
            const results = [];

            for (const tc of this.pendingToolCalls) {
                const result = await this.executeToolCall(tc);
                results.push(result);
            }
            this.pendingToolCalls = [];

            // Autonomous continuation
            if (this.autonomousMode && results.length > 0) {
                this.stepCount++;

                if (this.stepCount >= this.maxSteps) {
                    console.log(`\n${c.yellow}⚠ Reached ${this.maxSteps} steps limit. Pausing.${c.reset}`);
                    this.showPrompt();
                    return;
                }

                const summary = results.map(r => `${r.success ? '✓' : '✗'} ${r.tool}: ${r.message}`).join('\n');

                console.log(`\n${c.magenta}⚡ Step ${this.stepCount} complete. Continuing...${c.reset}\n`);

                setTimeout(() => {
                    this.sendMessage(`Results:\n${summary}\n\nContinue with the next step. If all steps are done, say "COMPLETE" and summarize what was built.`);
                }, 1000);
                return;
            }
        }

        this.showPrompt();
    }

    async executeToolCall(tc) {
        const { tool, path: filePath, content, command, prompt, filename } = tc;

        switch (tool) {
            case 'create_file':
            case 'write_file':
            case 'edit_file':
                return this.createFile(filePath, content);

            case 'read_file':
                return this.readFile(filePath);

            case 'run_command':
                return this.runCommand(command);

            case 'generate_image':
                return await this.generateImage(prompt, filename);

            default:
                return { tool, success: false, message: `Unknown tool: ${tool}` };
        }
    }

    createFile(filePath, content) {
        if (!filePath || content === undefined) {
            return { tool: 'create_file', success: false, message: 'Missing path or content' };
        }

        try {
            const fullPath = path.resolve(this.projectDir, filePath);
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });

            const existed = fs.existsSync(fullPath);
            fs.writeFileSync(fullPath, content, 'utf8');

            const lines = content.split('\n').length;
            console.log(`  ${c.green}✓${c.reset} ${existed ? 'Updated' : 'Created'} ${filePath} ${c.dim}(${lines} lines)${c.reset}`);
            return { tool: 'create_file', success: true, message: `${existed ? 'Updated' : 'Created'} ${filePath}` };
        } catch (err) {
            console.log(`  ${c.red}✗${c.reset} ${filePath}: ${err.message}`);
            return { tool: 'create_file', success: false, message: err.message };
        }
    }

    readFile(filePath) {
        try {
            const fullPath = path.resolve(this.projectDir, filePath);
            const content = fs.readFileSync(fullPath, 'utf8');
            console.log(`  ${c.green}✓${c.reset} Read ${filePath}`);
            return { tool: 'read_file', success: true, message: `Read ${filePath}`, content };
        } catch (err) {
            console.log(`  ${c.red}✗${c.reset} ${err.message}`);
            return { tool: 'read_file', success: false, message: err.message };
        }
    }

    runCommand(command) {
        if (!this.autonomousMode) {
            console.log(`  ${c.yellow}⚠${c.reset} ${command} ${c.dim}(enable /auto to run)${c.reset}`);
            return { tool: 'run_command', success: true, message: `Shown: ${command}` };
        }

        console.log(`  ${c.yellow}⚡${c.reset} ${command}`);

        try {
            const output = execSync(command, {
                cwd: this.projectDir,
                timeout: 120000,
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: 'powershell.exe'
            });

            if (output?.trim()) {
                const lines = output.trim().split('\n').slice(0, 5);
                lines.forEach(l => console.log(`  ${c.dim}${l.substring(0, 80)}${c.reset}`));
                if (output.trim().split('\n').length > 5) console.log(`  ${c.dim}...${c.reset}`);
            }
            console.log(`  ${c.green}✓${c.reset} Done`);
            return { tool: 'run_command', success: true, message: `Ran: ${command}` };
        } catch (err) {
            const errMsg = err.stderr?.toString().substring(0, 150) || err.message;
            console.log(`  ${c.red}✗${c.reset} ${errMsg}`);
            return { tool: 'run_command', success: false, message: errMsg };
        }
    }

    async generateImage(prompt, filename) {
        if (!prompt || !filename) {
            return { tool: 'generate_image', success: false, message: 'Missing prompt or filename' };
        }

        console.log(`  ${c.cyan}🎨${c.reset} Generating: ${prompt.substring(0, 40)}...`);

        try {
            // Request image generation through the server
            return new Promise((resolve) => {
                this.socket.emit('generateImage', { prompt, filename });

                this.socket.once('imageGenerated', (data) => {
                    if (data.success) {
                        // Copy image to project folder
                        const destPath = path.resolve(this.projectDir, filename);
                        if (data.imagePath && fs.existsSync(data.imagePath)) {
                            fs.copyFileSync(data.imagePath, destPath);
                        }
                        console.log(`  ${c.green}✓${c.reset} Generated: ${filename}`);
                        resolve({ tool: 'generate_image', success: true, message: `Created ${filename}` });
                    } else {
                        console.log(`  ${c.red}✗${c.reset} ${data.error}`);
                        resolve({ tool: 'generate_image', success: false, message: data.error });
                    }
                });

                // Timeout after 60s
                setTimeout(() => {
                    resolve({ tool: 'generate_image', success: false, message: 'Timeout' });
                }, 60000);
            });
        } catch (err) {
            return { tool: 'generate_image', success: false, message: err.message };
        }
    }

    async sendMessage(message) {
        if (!this.socket?.connected) {
            console.log(`${c.red}Not connected. Reconnecting...${c.reset}`);
            try {
                await this.connect();
            } catch (e) {
                console.log(`${c.red}Failed to reconnect${c.reset}`);
                return;
            }
        }

        const systemPrompt = this.buildSystemPrompt();
        this.socket.emit('sendMessage', {
            message: `${systemPrompt}\n\n---\n\nUser: ${message}`,
            conversationId: 'nebula-session'
        });
    }

    showPrompt() {
        this.rl.setPrompt(this.getPrompt());
        this.rl.prompt();
    }

    async handleCommand(input) {
        const [cmd, ...args] = input.slice(1).split(/\s+/);
        const arg = args.join(' ');

        switch (cmd.toLowerCase()) {
            case 'auto':
                this.autonomousMode = arg !== 'off';
                this.stepCount = 0;
                console.log(`${c.magenta}⚡${c.reset} Auto mode: ${this.autonomousMode ? 'ON' : 'OFF'}`);
                break;

            case 'model':
            case 'm':
                if (!arg) {
                    console.log(`Current: ${this.currentModel}`);
                } else {
                    const match = this.models.find(m =>
                        m.id.toLowerCase().includes(arg.toLowerCase()) ||
                        m.name.toLowerCase().includes(arg.toLowerCase())
                    );
                    if (match) {
                        this.socket.emit('selectModel', { model: match.id });
                        return true; // Don't show prompt, wait for modelSelected
                    } else {
                        console.log(`${c.red}Not found: ${arg}${c.reset}`);
                        console.log(`${c.dim}Try: claude, gpt, gemini, deepseek${c.reset}`);
                    }
                }
                break;

            case 'models':
                this.models.forEach(m => {
                    const cur = m.id === this.currentModel ? ` ${c.green}◀${c.reset}` : '';
                    console.log(`  ${m.name}${cur}`);
                });
                break;

            case 'project':
            case 'p':
                if (arg) {
                    const p = path.resolve(this.workingDir, arg);
                    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
                        this.projectDir = p;
                        this.workingDir = p;
                        console.log(`${c.green}✓${c.reset} ${p}`);
                    } else {
                        console.log(`${c.red}Not found${c.reset}`);
                    }
                } else {
                    console.log(this.projectDir);
                }
                break;

            case 'clear':
                console.clear();
                this.showBanner();
                break;

            case 'help':
            case '?':
                this.showHelp();
                break;

            case 'exit':
            case 'q':
                process.exit(0);

            default:
                console.log(`${c.dim}Unknown command. Try /help${c.reset}`);
        }
        return false;
    }

    showBanner() {
        console.log(`
${c.cyan}┌─────────────────────────────────────┐
│     ${c.bold}${c.white}★ NebulaCLI v2.0 ★${c.reset}${c.cyan}              │
│  ${c.dim}Autonomous AI Coding Agent${c.reset}${c.cyan}         │
└─────────────────────────────────────┘${c.reset}
`);
    }

    showHelp() {
        console.log(`
${c.bold}Commands${c.reset}
  /auto [off]     Toggle autonomous mode
  /model <name>   Switch model (claude, gpt, gemini)
  /models         List models
  /project <dir>  Set project directory
  /clear          Clear screen
  /exit           Exit
`);
    }

    async run() {
        this.showBanner();

        try {
            await this.connect();
        } catch (err) {
            console.log(`${c.red}✗ ${err.message}${c.reset}`);
            console.log(`${c.dim}Start server: nebula-server${c.reset}`);
            process.exit(1);
        }

        // Auto-load context files
        ['agent', 'nebula', 'readme'].forEach(name => {
            const paths = [
                path.join(this.projectDir, `${name}.md`),
                path.join(this.projectDir, `${name.toUpperCase()}.md`),
            ];
            for (const p of paths) {
                if (fs.existsSync(p)) {
                    try {
                        this.contextFiles.set(name, { content: fs.readFileSync(p, 'utf8') });
                        this.activeContexts.push(name);
                        console.log(`${c.dim}Loaded: ${name}.md${c.reset}`);
                    } catch (e) { }
                    break;
                }
            }
        });

        console.log(`${c.dim}Type /help for commands, /auto to enable autonomous mode${c.reset}\n`);
        this.showPrompt();

        this.rl.on('line', async (line) => {
            const input = line.trim();
            if (!input) { this.showPrompt(); return; }

            if (input.startsWith('/')) {
                const showPrompt = await this.handleCommand(input);
                if (showPrompt !== true) this.showPrompt();
                return;
            }

            this.stepCount = 0; // Reset step counter on new task
            this.sendMessage(input);
        });

        this.rl.on('close', () => process.exit(0));
    }
}

new NebulaCLI().run().catch(console.error);
