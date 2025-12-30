#!/usr/bin/env node
/**
 * NebulaCLI v1.0 - Autonomous AI Coding Agent
 * Powered by LMArena (Claude Opus 4.5, GPT 5.2, Gemini 3 Pro)
 * 
 * Features:
 * - Autonomous multi-step task execution
 * - Intelligent model orchestration
 * - Optimized prompts for coding tasks
 * - Tool calling (file ops, commands, search)
 * - Anti-abuse rate limit management
 */

const readline = require('readline');
const { io } = require('socket.io-client');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// ANSI codes
const c = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    italic: '\x1b[3m',
    green: '\x1b[32m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    magenta: '\x1b[35m',
    blue: '\x1b[34m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
    bgGreen: '\x1b[42m',
    bgBlue: '\x1b[44m',
};

const spinnerFrames = ['◐', '◓', '◑', '◒'];

class NebulaCLI {
    constructor() {
        this.socket = null;
        this.currentModel = null;
        this.models = [];
        this.isStreaming = false;
        this.workingDir = process.cwd();
        this.projectDir = process.cwd();

        // Context system
        this.contextFiles = new Map();
        this.activeContexts = [];

        // Streaming state
        this.fullResponse = '';
        this.displayedLen = 0;
        this.toolCallBuffer = '';
        this.inToolCall = false;
        this.pendingToolCalls = [];

        // Autonomy
        this.autonomousMode = false;
        this.currentPlan = null;
        this.executingPlan = false;

        // Anti-abuse
        this.requestCount = 0;
        this.lastRequestTime = 0;
        this.minRequestInterval = 2000; // 2s between requests

        this.spinnerInterval = null;
        this.spinnerIdx = 0;

        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: ''
        });
    }

    buildSystemPrompt() {
        const contextSection = this.activeContexts.length > 0
            ? `\n\n## Project Context\n${this.activeContexts.map(name => {
                const ctx = this.contextFiles.get(name);
                return ctx ? `### ${name}\n${ctx.content.substring(0, 2000)}` : '';
            }).join('\n\n')}`
            : '';

        return `You are Nebula, an elite autonomous coding agent.

# Environment
- PROJECT: ${this.projectDir}
- CWD: ${this.workingDir}
- MODE: ${this.autonomousMode ? 'AUTONOMOUS' : 'INTERACTIVE'}

# Core Mandates
- Match existing code conventions exactly
- Verify libraries exist before using (check package.json, etc.)
- Add comments only for "why", never for "what"
- Include tests for new features unless told otherwise
${this.autonomousMode ? `
# Autonomous Mode
- Continue without prompting after each step
- Run build/lint/test after changes and fix errors
- Output brief status: "✓ Created file.js" or "✗ Build failed, fixing..."
` : `
# Interactive Mode
- Explain plan before major changes
- Ask ONE targeted question if requirements unclear
`}

# Tool Calls
Use XML format for file/command operations:

\`\`\`xml
<tool_call>
<tool>create_file</tool>
<path>relative/path/file.ext</path>
<content>
file content
</content>
</tool_call>
\`\`\`

For commands:
\`\`\`xml
<tool_call>
<tool>run_command</tool>
<command>npm install express</command>
</tool_call>
\`\`\`

# Response Style
- Concise (under 3 lines when possible)
- No filler ("Okay, I will..." or "I have completed...")
- Use code blocks with language tags
- Action-oriented: prefer tool calls over explanations
${contextSection}

Keep working until the task is FULLY complete. Verify your work.`;
    }

    spinner(msg) {
        this.spinnerIdx = 0;
        this.spinnerInterval = setInterval(() => {
            process.stdout.write(`\r${c.cyan}${spinnerFrames[this.spinnerIdx]} ${msg}${c.reset}   `);
            this.spinnerIdx = (this.spinnerIdx + 1) % spinnerFrames.length;
        }, 100);
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
        const model = this.currentModel ? this.currentModel.split('-').slice(0, 2).join('-') : 'nebula';
        const modeIcon = this.autonomousMode ? `${c.magenta}⚡${c.reset}` : '';
        const ctxCount = this.activeContexts.length;
        const ctxIndicator = ctxCount > 0 ? `${c.cyan}[${ctxCount}]${c.reset} ` : '';

        return `${modeIcon}${ctxIndicator}${c.dim}${dir}${c.reset} ${c.green}${model}${c.reset}${c.dim}>${c.reset} `;
    }

    async connect() {
        const serverUrl = process.env.NEBULA_SERVER || 'http://localhost:3000';
        this.spinner('Connecting to server...');

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
                console.log(`${c.green}✓${c.reset} Connected ${c.dim}(${this.currentModel || 'ready'})${c.reset}`);
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
        }
    }

    handleComplete(data) {
        this.isStreaming = false;
        this.processForDisplay();

        console.log('\n');

        if (this.pendingToolCalls.length > 0) {
            console.log(`${c.dim}───────────────────────────${c.reset}`);

            // Execute all tool calls and collect results
            const toolResults = [];
            for (const tc of this.pendingToolCalls) {
                const result = this.executeToolCall(tc);
                toolResults.push(result);
            }

            console.log(`${c.dim}───────────────────────────${c.reset}\n`);

            // In autonomous mode, send results back to AI to continue
            if (this.autonomousMode && toolResults.length > 0) {
                // Wait a moment for any async commands to settle
                setTimeout(() => {
                    const resultSummary = toolResults.map(r =>
                        `${r.success ? '✓' : '✗'} ${r.tool}: ${r.message}`
                    ).join('\n');

                    console.log(`${c.magenta}⚡ Continuing autonomously...${c.reset}\n`);

                    // Send continuation prompt to AI
                    this.sendMessage(`Tool execution results:\n${resultSummary}\n\nContinue with the next step.`);
                }, 1500); // Wait 1.5s for command output

                this.pendingToolCalls = [];
                return; // Don't show prompt, we're continuing
            }

            this.pendingToolCalls = [];
        }

        this.showPrompt();
    }

    executeToolCall(tc) {
        const { tool, path: filePath, content, command } = tc;
        let result = { tool, success: false, message: '' };

        switch (tool) {
            case 'create_file':
            case 'write_file':
            case 'edit_file':
                result = this.createFile(filePath, content);
                break;
            case 'read_file':
                result = this.readFile(filePath);
                break;
            case 'run_command':
                result = this.runCommand(command);
                break;
            default:
                console.log(`${c.yellow}Unknown tool: ${tool}${c.reset}`);
                result = { tool, success: false, message: `Unknown tool: ${tool}` };
        }

        return result;
    }

    createFile(filePath, content) {
        if (!filePath || !content) {
            console.log(`${c.red}✗ Missing path or content${c.reset}`);
            return { tool: 'create_file', success: false, message: 'Missing path or content' };
        }

        try {
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
            return { tool: 'create_file', success: true, message: `${action} ${filePath} (${lines} lines)` };
        } catch (err) {
            console.log(`${c.red}✗ ${filePath}: ${err.message}${c.reset}`);
            return { tool: 'create_file', success: false, message: err.message };
        }
    }

    readFile(filePath) {
        try {
            const fullPath = path.resolve(this.projectDir, filePath);
            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split('\n').length;
            console.log(`${c.green}✓ Read:${c.reset} ${filePath} ${c.dim}(${lines} lines)${c.reset}`);
            return { tool: 'read_file', success: true, message: `Read ${filePath} (${lines} lines)`, content };
        } catch (err) {
            console.log(`${c.red}✗ Read failed: ${err.message}${c.reset}`);
            return { tool: 'read_file', success: false, message: err.message };
        }
    }

    runCommand(command) {
        if (this.autonomousMode) {
            // In autonomous mode, actually run commands
            console.log(`${c.yellow}⚡ Running:${c.reset} ${command}`);

            try {
                const result = require('child_process').execSync(command, {
                    cwd: this.projectDir,
                    timeout: 60000,
                    encoding: 'utf8',
                    stdio: ['pipe', 'pipe', 'pipe']
                });
                const output = (result || '').trim();
                if (output) {
                    console.log(`${c.dim}${output.substring(0, 300)}${output.length > 300 ? '...' : ''}${c.reset}`);
                }
                console.log(`${c.green}✓ Command completed${c.reset}`);
                return { tool: 'run_command', success: true, message: `Executed: ${command}`, output: output.substring(0, 500) };
            } catch (err) {
                const errOutput = err.stderr?.toString() || err.message;
                console.log(`${c.red}✗ Command failed: ${errOutput.substring(0, 200)}${c.reset}`);
                return { tool: 'run_command', success: false, message: errOutput.substring(0, 200) };
            }
        } else {
            // In interactive mode, just show the command
            console.log(`${c.yellow}⚠ Command:${c.reset} ${command}`);
            console.log(`${c.dim}  (Run manually or enable /auto mode)${c.reset}`);
            return { tool: 'run_command', success: true, message: `Shown to user: ${command}` };
        }
    }

    showPrompt() {
        this.rl.setPrompt(this.getPrompt());
        this.rl.prompt();
    }

    // Anti-abuse rate limiting
    async rateLimit() {
        const now = Date.now();
        const timeSinceLast = now - this.lastRequestTime;

        if (timeSinceLast < this.minRequestInterval) {
            const waitTime = this.minRequestInterval - timeSinceLast;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        this.lastRequestTime = Date.now();
        this.requestCount++;

        // Slow down after many requests
        if (this.requestCount > 20) {
            this.minRequestInterval = 3000;
        }
        if (this.requestCount > 50) {
            this.minRequestInterval = 5000;
        }
    }

    async sendMessage(message) {
        if (!this.socket?.connected) {
            console.log(`${c.red}Not connected${c.reset}`);
            return;
        }

        // Apply rate limiting
        await this.rateLimit();

        const systemPrompt = this.buildSystemPrompt();

        this.socket.emit('sendMessage', {
            message: `${systemPrompt}\n\n---\n\nUser: ${message}`,
            conversationId: Date.now().toString()
        });
    }

    loadContext(name, filePath = null) {
        const searchPaths = filePath ? [filePath] : [
            path.join(this.projectDir, `${name}.md`),
            path.join(this.projectDir, '.nebula', `${name}.md`),
            path.join(this.projectDir, '.grove', `${name}.md`),
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

                    console.log(`${c.green}✓${c.reset} Loaded: ${c.cyan}${name}${c.reset} ${c.dim}(${searchPath})${c.reset}`);
                    return true;
                } catch (e) {
                    console.log(`${c.red}✗ Failed to read: ${searchPath}${c.reset}`);
                }
            }
        }

        console.log(`${c.red}✗ Context not found: ${name}${c.reset}`);
        return false;
    }

    async handleCommand(input) {
        const trimmed = input.trim();
        if (!trimmed.startsWith('/')) return false;

        const [cmd, ...args] = trimmed.slice(1).split(/\s+/);
        const arg = args.join(' ');

        switch (cmd.toLowerCase()) {
            case 'auto':
                this.toggleAutoMode(arg);
                break;
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
                if (arg) {
                    this.loadContext(args[0], args[1]);
                } else {
                    this.listContexts();
                }
                break;
            case 'unload':
                this.unloadContext(arg);
                break;
            case 'status':
                this.showStatus();
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
                console.log(`${c.dim}Unknown: /${cmd}. Type /help for commands.${c.reset}`);
        }
        return true;
    }

    toggleAutoMode(arg) {
        if (arg === 'on' || arg === 'true' || arg === '1') {
            this.autonomousMode = true;
        } else if (arg === 'off' || arg === 'false' || arg === '0') {
            this.autonomousMode = false;
        } else {
            this.autonomousMode = !this.autonomousMode;
        }

        const status = this.autonomousMode
            ? `${c.green}ON${c.reset} - Agent will continue without prompting`
            : `${c.yellow}OFF${c.reset} - Agent will pause for confirmation`;

        console.log(`${c.magenta}⚡ Autonomous mode:${c.reset} ${status}`);
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
            console.log(`${c.dim}Available: claude, gpt, gemini, deepseek${c.reset}`);
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

    setProject(dir) {
        if (!dir) {
            console.log(`${c.cyan}Project:${c.reset} ${this.projectDir}`);
            return;
        }

        const newPath = path.resolve(this.workingDir, dir);
        if (fs.existsSync(newPath) && fs.statSync(newPath).isDirectory()) {
            this.projectDir = newPath;
            this.workingDir = newPath;
            console.log(`${c.green}✓${c.reset} Project: ${newPath}`);
            this.autoLoadContexts();
        } else {
            console.log(`${c.red}Not found: ${dir}${c.reset}`);
        }
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

    autoLoadContexts() {
        const patterns = ['agent', 'nebula', 'gemini', 'readme', 'context'];
        for (const ctx of patterns) {
            const paths = [
                path.join(this.projectDir, `${ctx}.md`),
                path.join(this.projectDir, `${ctx.toUpperCase()}.md`),
                path.join(this.projectDir, '.nebula', `${ctx}.md`),
                path.join(this.projectDir, '.grove', `${ctx}.md`),
            ];
            for (const p of paths) {
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

    unloadContext(name) {
        const idx = this.activeContexts.indexOf(name.toLowerCase());
        if (idx > -1) {
            this.activeContexts.splice(idx, 1);
            console.log(`${c.green}✓${c.reset} Unloaded: ${name}`);
        } else {
            console.log(`${c.yellow}Not active: ${name}${c.reset}`);
        }
    }

    showStatus() {
        console.log(`
${c.bold}${c.cyan}Nebula Status${c.reset}
${c.dim}─────────────────────${c.reset}
  Model: ${this.currentModel || 'None'}
  Project: ${this.projectDir}
  CWD: ${this.workingDir}
  Auto Mode: ${this.autonomousMode ? `${c.green}ON${c.reset}` : `${c.yellow}OFF${c.reset}`}
  Contexts: ${this.activeContexts.length}
  Requests: ${this.requestCount}
  Rate Limit: ${this.minRequestInterval}ms
`);
    }

    showHelp() {
        console.log(`
${c.bold}${c.cyan}NebulaCLI v1.0${c.reset} - Autonomous AI Coding Agent

${c.yellow}MODES${c.reset}
  /auto [on|off]    Toggle autonomous mode (agent continues without prompting)

${c.yellow}PROJECT${c.reset}
  /project [path]   Set project directory
  /cd [path]        Change current directory
  /pwd              Show directories

${c.yellow}MODELS${c.reset}
  /model [name]     Switch AI model (claude, gpt, gemini, deepseek)
  /models           List available models

${c.yellow}CONTEXT${c.reset}
  /context [name]   Load context file (e.g., /context frontend)
  /unload [name]    Remove context from session

${c.yellow}OTHER${c.reset}
  /status           Show current status
  /clear            Clear screen
  /help             Show this help
  /exit             Exit CLI

${c.dim}Context files are .md files that provide project info to the AI.
Common: AGENT.md, README.md, GEMINI.md, NEBULA.md${c.reset}
`);
    }

    showBanner() {
        console.log(`
${c.cyan}╔══════════════════════════════════════════════╗
║  ${c.bold}${c.white}   ★ NebulaCLI v1.0 ★${c.reset}${c.cyan}                       ║
║      ${c.dim}Autonomous AI Coding Agent${c.reset}${c.cyan}              ║
║  ${c.dim}Claude Opus • GPT 5.2 • Gemini 3 Pro${c.reset}${c.cyan}        ║
╚══════════════════════════════════════════════╝${c.reset}
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

        this.autoLoadContexts();

        console.log(`${c.dim}Type /help for commands, /auto to enable autonomous mode${c.reset}\n`);
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

// Run
new NebulaCLI().run().catch(console.error);
