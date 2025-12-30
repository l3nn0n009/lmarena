# LMArena Wrapper + Grove CLI

A local application that provides free, unlimited access to AI models (Claude Opus 4.5, GPT 5.2, Gemini 3 Pro, etc.) through LMArena by controlling a real browser session in the background.

## 🚀 Features

- **Grove CLI**: Claude Code-like terminal interface for AI-powered coding
- **Tool Calling**: AI can create/edit files directly via structured tool calls
- **Optimized Streaming**: Network-level SSE interception (no DOM scraping lag)
- **Browser Automation**: Puppeteer with stealth plugins for anti-bot evasion
- **Real-time Streaming**: WebSocket-based token streaming for live responses
- **Web UI**: Beautiful dark theme with glassmorphism effects (optional)

## 📋 Quick Start

### Prerequisites
- Node.js 18+
- Chrome browser installed

### Installation

```bash
# Install dependencies
npm install

# (Optional) Install client dependencies for web UI
cd client && npm install && cd ..
```

### Running

**1. Start the server (required):**
```bash
npm start
```

**2. Use the CLI (recommended):**
```bash
# In a new terminal
npm run grove
```

**3. Or use the Web UI:**
```bash
npm run client
# Open http://localhost:5173
```

## 🖥️ Grove CLI Usage

```
grove> /help

Commands:
  /model [name]    Switch AI model (e.g., /model claude-opus)
  /models [type]   List available models (text/image/search)
  /cd [path]       Change working directory
  /pwd             Show current directory
  /clear           Clear screen
  /exit            Exit CLI

Examples:
  grove> Create a hello world Express server
  grove> /model gpt-5.2
  grove> Fix the bug in server.js
```

### Tool Calling

The AI can create files directly. When it detects you need a file created, it outputs:

```
📄 create_file: src/server.js
✓ Created: src/server.js (25 lines)
```

The file is instantly written to your working directory.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Grove CLI (cli/cli.js)                  │
│              OR Web Frontend (React + Vite)                 │
└────────────────────────────┬────────────────────────────────┘
                             │ WebSocket (Socket.io)
┌────────────────────────────┴────────────────────────────────┐
│                  Backend (Node.js + Express)                │
│  ┌─────────────────────────────────────────────────────────┐│
│  │            LMArena Optimized Controller                 ││
│  │  - SSE Network Interception (no DOM scraping!)         ││
│  │  - Resource blocking (images, fonts, analytics)        ││
│  │  - Real-time DOM cleanup (prevents memory bloat)       ││
│  └─────────────────────────────────────────────────────────┘│
└────────────────────────────┬────────────────────────────────┘
                             │ Puppeteer (Stealth)
┌────────────────────────────┴────────────────────────────────┐
│              Hidden Chrome Browser → lmarena.ai             │
└─────────────────────────────────────────────────────────────┘
```

## 📊 Performance Optimizations

The optimized controller (`server/lmarena-optimized.js`) solves browser crashes on long responses:

1. **SSE Interception**: Captures tokens directly from network responses
2. **Resource Blocking**: Blocks images, fonts, media, analytics
3. **DOM Hiding**: Hides chat UI to prevent layout thrashing
4. **Real-time Cleanup**: Removes old messages from DOM periodically

## ⚙️ Configuration

### Environment Variables

```bash
# Server port (default: 3000)
PORT=3000

# Chrome profile to copy from (default: Profile 3)
CHROME_PROFILE_DIRECTORY="Profile 3"
```

### Models

Available models are defined in `server/lmarena-optimized.js`. The system supports:
- **Text**: GPT 5.2, Claude Opus 4.5, Gemini 3 Pro, DeepSeek V3.2, Grok 4.1
- **Image**: GPT Image 1.5, DALL-E 3, FLUX 2, Gemini Image
- **Search**: GPT Search, Perplexity Sonar, Gemini Grounding

## 🔧 Troubleshooting

### Cloudflare Challenge

1. First run opens Chrome visibly
2. Complete the challenge manually if needed
3. Session saved in `./chrome-profile/`

### No Response

- Check if LMArena updated their DOM structure
- The SSE endpoint `/nextjs-api/stream/create-evaluation` may change
- Fallback: Use original `server/lmarena.js` (slower but more resilient)

### CLI Not Connecting

```bash
# Make sure server is running first
npm start

# Then in new terminal
npm run grove
```

## 📁 Project Structure

```
lmarena/
├── cli/
│   └── cli.js              # Grove CLI (Claude Code alternative)
├── server/
│   ├── index.js            # Express + Socket.io server
│   ├── browser.js          # Puppeteer controller
│   ├── lmarena-optimized.js # Optimized LMArena controller
│   └── lmarena.js          # Original controller (backup)
├── client/                 # React web UI (optional)
└── chrome-profile/         # Persistent browser data
```

## 📄 License

MIT
