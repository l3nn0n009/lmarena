# Grove CLI - Agent Context

## Project Overview
This is the Grove project - a free Claude Code alternative that provides unlimited access to frontier AI models through LMArena.

## Tech Stack
- **Backend**: Node.js, Express, Socket.io, Puppeteer
- **CLI**: Node.js with readline, socket.io-client
- **Frontend** (optional): React + Vite
- **Browser Automation**: Puppeteer with stealth plugins

## Key Files
- `cli/cli.js` - Main CLI application
- `server/index.js` - Express + Socket.io server
- `server/lmarena-optimized.js` - Optimized LMArena controller with SSE interception
- `server/browser.js` - Puppeteer browser manager

## Architecture
```
CLI (cli.js) <-> Socket.io <-> Server (index.js) <-> Puppeteer <-> LMArena.ai
```

## Coding Standards
- Use async/await for all async operations
- Error messages should be user-friendly
- Console output should use ANSI colors (defined in `c` object)
- Keep functions focused and under 50 lines when possible

## Current Features
- Multi-model support (Claude, GPT, Gemini, etc.)
- SSE network interception for streaming
- Tool calling with XML format
- Context file loading (.md files)
- Project directory management

## Notes for AI
- When creating files, use tool_call XML format
- Always discuss approach before implementing
- Paths should be relative to project directory
- Keep CLI output clean and readable
