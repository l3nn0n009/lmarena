# NebulaCLI

**Autonomous AI Coding Agent** powered by Claude Opus 4.5, GPT 5.2, and Gemini 3 Pro via LMArena.

## What is NebulaCLI?

NebulaCLI turns the LMArena website into a blazing-fast API for AI coding. It:

- **Intercepts SSE streams** at the network level (no DOM scraping lag)
- **Auto-selects the best model** for each task type
- **Executes multi-step tasks autonomously** without user prompts
- **Manages rate limits** to avoid anti-abuse detection
- **Provides optimized prompts** for maximum coding effectiveness

## Quick Start

```bash
# Install dependencies
npm install

# Start the server (required)
npm start

# In a new terminal, launch the CLI
npm run nebula
```

## CLI Commands

```
MODES
  /auto [on|off]    Toggle autonomous mode

PROJECT
  /project [path]   Set project directory
  /cd [path]        Change current directory
  /pwd              Show directories

MODELS
  /model [name]     Switch AI model
  /models           List available models

CONTEXT
  /context [name]   Load context file
  /unload [name]    Remove context

OTHER
  /status           Show current status
  /clear            Clear screen
  /help             Show this help
  /exit             Exit CLI
```

## Autonomous Mode

Enable with `/auto on`. The agent will:

1. Continue to the next step without waiting for prompts
2. Run build/lint/test commands automatically
3. Fix errors before moving on
4. Report progress with brief status updates

Perfect for tasks like:
- "Build a REST API with Express and MongoDB"
- "Refactor this codebase to use TypeScript"
- "Add unit tests for all services"

## Model Selection

NebulaCLI intelligently selects models based on task type:

| Task Type | Primary Model | Fallback |
|-----------|---------------|----------|
| Planning/Architecture | Claude Opus 4.5 | GPT 5.2 |
| Coding | GPT 5.2 | Claude Sonnet |
| Debugging | Claude Opus 4.5 | Claude Sonnet |
| Quick Tasks | Gemini 3 Flash | Gemini 3 Pro |
| Research | GPT 5.2 Search | Perplexity Sonar |
| Image Generation | GPT Image 1.5 | Gemini Image |

## Context Files

Create `.md` files in your project to provide context:

- `AGENT.md` - Project overview and conventions
- `NEBULA.md` - NebulaCLI-specific instructions
- `README.md` - Standard readme (auto-loaded)

The CLI auto-loads these from the project root.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     NebulaCLI (cli/nebula.js)               │
│              Optimized prompts, autonomous mode             │
└────────────────────────────┬────────────────────────────────┘
                             │ WebSocket (Socket.io)
┌────────────────────────────┴────────────────────────────────┐
│                  Backend (Node.js + Express)                │
│  ┌─────────────────────────────────────────────────────────┐│
│  │            LMArena Optimized Controller                 ││
│  │  - SSE Network Interception (API-like speed)           ││
│  │  - Resource blocking (images, fonts, analytics)        ││
│  │  - DOM stripping (minimal memory usage)                ││
│  └─────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────┐│
│  │            Model Orchestrator                           ││
│  │  - Task-type inference                                  ││
│  │  - Automatic model selection                            ││
│  │  - Rate limit management                                ││
│  └─────────────────────────────────────────────────────────┘│
└────────────────────────────┬────────────────────────────────┘
                             │ Puppeteer (Stealth)
┌────────────────────────────┴────────────────────────────────┐
│              Hidden Chrome Browser → lmarena.ai             │
└─────────────────────────────────────────────────────────────┘
```

## Anti-Abuse Strategy

To avoid triggering LMArena's rate limits:

1. **Request Spacing** - Minimum 2s between requests (increases with usage)
2. **Human-like Behavior** - Random delays, mouse movements
3. **Session Persistence** - Cookies saved in `./chrome-profile/`
4. **Error Recovery** - Exponential backoff on failures

## Performance Optimizations

1. **SSE Interception** - Captures tokens directly from network (not DOM)
2. **Resource Blocking** - No images, fonts, or analytics loaded
3. **DOM Stripping** - UI elements hidden/removed
4. **Tab Reuse** - Same browser tab for all requests

## License

MIT
