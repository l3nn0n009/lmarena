# Grove (LMArena Wrapper) - Agent Documentation

> **Last Updated:** December 27, 2025  
> **Project Name:** Grove (internally: LMArena Wrapper)  
> **Purpose:** A premium frontend wrapper around lmarena.ai that provides unlimited access to top AI models via browser automation

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Technology Stack](#technology-stack)
4. [Directory Structure](#directory-structure)
5. [Core Components](#core-components)
6. [Design System (Grove Theme)](#design-system-grove-theme)
7. [Feature Documentation](#feature-documentation)
8. [Socket Communication Protocol](#socket-communication-protocol)
9. [Known Issues & Solutions](#known-issues--solutions)
10. [CSS Architecture & Patterns](#css-architecture--patterns)
11. [Common Development Tasks](#common-development-tasks)
12. [Debugging Guide](#debugging-guide)
13. [Future Development Roadmap](#future-development-roadmap)

---

## Project Overview

### What is Grove?

Grove is a **custom frontend application** that wraps around [lmarena.ai](https://lmarena.ai) (also known as LM Arena or Chatbot Arena). It uses **Puppeteer browser automation** running in the background to interact with lmarena.ai, sending prompts and receiving streaming responses.

### Why Does This Exist?

LMArena provides free access to cutting-edge AI models (GPT-5, Claude Opus 4.5, Gemini 3 Pro, image generation models, etc.) with generous rate limits. However, their default UI is utilitarian. Grove provides:

1. **Premium UI Experience** - A beautiful, nature-themed interface called "Grove"
2. **Unified Model Access** - Quick switching between text AND image generation models
3. **Chat History** - Local persistence of conversations (lmarena.ai doesn't save chats)
4. **Image Library** - Auto-saves generated images to a local gallery
5. **AI Personalities** - Create custom system prompts for different AI personas
6. **Voice Mode** - Text-to-speech for AI responses
7. **Incognito Mode** - Chat without saving history
8. **Branch Chat** - Fork a conversation to try different directions

### How It Works (High Level)

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React + Vite)                  │
│                    http://localhost:5173                    │
└────────────────────────────┬────────────────────────────────┘
                             │ WebSocket (Socket.io)
                             ▼
┌────────────────────────────────────────────────────────────┐
│                  Backend (Node.js + Express)               │
│                    http://localhost:3000                   │
│                                                            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │              LMArena Controller                      │  │
│  │  - Navigates to lmarena.ai                          │  │
│  │  - Handles Terms of Service popups                  │  │
│  │  - Types messages into lmarena's textarea           │  │
│  │  - Observes DOM for streaming responses             │  │
│  │  - Extracts generated images                        │  │
│  └─────────────────────────────────────────────────────┘  │
└────────────────────────────┬───────────────────────────────┘
                             │ Puppeteer
                             ▼
┌────────────────────────────────────────────────────────────┐
│             Hidden Chrome Browser                          │
│             (with stealth plugins)                         │
│                                                            │
│             Actually visits lmarena.ai                     │
│             Handles Cloudflare challenges                  │
│             Maintains session cookies                      │
└────────────────────────────────────────────────────────────┘
```

---

## Architecture

### Frontend (React + Vite)

Located in `/client/`

- **Entry Point:** `src/main.jsx` → `src/App.jsx` → `src/components/ChatBox.jsx`
- **State Management:** React useState/useCallback hooks (no Redux)
- **Styling:** Single monolithic CSS file at `src/App.css`
- **Socket Communication:** Custom hook `src/hooks/useSocket.js` with service `src/services/socket.js`

### Backend (Node.js + Express)

Located in `/server/`

- **Entry Point:** `index.js`
- **Express Server:** Serves static files and handles Socket.io connections
- **Browser Controller:** `browser.js` - Manages Puppeteer instance
- **LMArena Controller:** `lmarena.js` - All logic for interacting with lmarena.ai

### Data Persistence

- **Browser Session:** Stored in `/browser-data/` directory (cookies, localStorage)
- **Chat History:** Client-side only, stored in React state (lost on refresh)
- **Saved Images:** `localStorage.getItem('lmarena_images')`
- **Personalities:** `localStorage.getItem('grove_personalities')`

---

## Technology Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.x | UI Framework |
| Vite | 5.x | Build tool & dev server |
| Socket.io-client | 4.x | WebSocket communication |
| react-markdown | Latest | Renders AI responses as Markdown |

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 18+ | Runtime |
| Express | 4.x | HTTP server |
| Socket.io | 4.x | WebSocket server |
| Puppeteer | 21.x | Browser automation |
| puppeteer-extra | Latest | Plugin system for Puppeteer |
| puppeteer-extra-plugin-stealth | Latest | Evades bot detection |

### Fonts
- **Outfit** (Google Fonts) - Primary font, weights 300-800

---

## Directory Structure

```
lmarena/
├── AGENT.md                    # This file
├── README.md                   # Basic project readme
├── frontend-design.md          # Design system guidelines
├── package.json                # Root package.json (scripts to run both)
│
├── client/                     # React Frontend
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── public/
│   │   └── assets/            # Static images
│   │       ├── logo.png       # Grove leaf logo
│   │       ├── new-chat.png   # Plus icon for new chat
│   │       ├── gallery.png    # Library icon
│   │       ├── incognito.png  # Ghost icon
│   │       ├── chat-item.png  # Chat history item icon
│   │       └── dots.png       # Context menu trigger
│   │
│   └── src/
│       ├── main.jsx           # React entry point
│       ├── App.jsx            # Root component (just renders ChatBox)
│       ├── App.css            # ⭐ ALL STYLES - Single source of truth
│       ├── index.css          # Minimal global resets
│       │
│       ├── components/
│       │   ├── ChatBox.jsx    # ⭐ MAIN COMPONENT - Contains everything
│       │   ├── ModelSelector.jsx
│       │   ├── ImageLibrary.jsx
│       │   └── PersonalityManager.jsx
│       │
│       ├── hooks/
│       │   └── useSocket.js   # Socket connection hook
│       │
│       ├── services/
│       │   └── socket.js      # Socket.io service singleton
│       │
│       └── constants/
│           ├── models.js      # MODEL_PROVIDERS configuration (text, image, search)
│           └── modelIcons.js  # Provider SVG icons for UI
│
├── server/                     # Node.js Backend
│   ├── package.json
│   ├── index.js               # Express + Socket.io server
│   ├── browser.js             # Puppeteer browser controller
│   └── lmarena.js             # ⭐ LMArena interaction logic
│
├── browser-data/               # Puppeteer session data (gitignored)
└── chrome-profile/             # Chrome profile data
```

---

## Core Components

### 1. ChatBox.jsx (Main Application Component)

**Location:** `client/src/components/ChatBox.jsx`

This is the heart of the application. It renders the entire UI and manages all state.

#### State Variables

```javascript
// Core Chat State
const [messages, setMessages] = useState([]);           // Current chat messages
const [input, setInput] = useState('');                 // User input field
const [isStreaming, setIsStreaming] = useState(false);  // Is AI currently responding?
const [streamingContent, setStreamingContent] = useState(''); // Partial AI response

// Model State
const [selectedModel, setSelectedModel] = useState('gemini-3-pro');
const [currentModality, setCurrentModality] = useState('text'); // 'text' or 'image'

// Chat History
const [currentChatId, setCurrentChatId] = useState('');
const [chatHistory, setChatHistory] = useState([]);

// UI State
const [sidebarOpen, setSidebarOpen] = useState(true);
const [showLibrary, setShowLibrary] = useState(false);
const [showPersonalities, setShowPersonalities] = useState(false);
const [activeMenu, setActiveMenu] = useState(null);     // Context menu for chat items

// Features
const [incognitoMode, setIncognitoMode] = useState(false);
const [editTarget, setEditTarget] = useState(null);     // Image being edited
const [branchContext, setBranchContext] = useState(''); // Chat history for branching
const [activePersonalityId, setActivePersonalityId] = useState('standard');

// Voice Mode
const [voiceModeEnabled, setVoiceModeEnabled] = useState(false);
const [speaking, setSpeaking] = useState(false);
```

#### Key Functions

| Function | Purpose |
|----------|---------|
| `handleSubmit` | Processes user input, combines with personality, sends to backend |
| `handleModelChange` | Switches AI model, resets chat state |
| `startNewChat` | Saves current chat to history, clears state |
| `loadChat` | Loads a chat from history |
| `deleteChat` | Removes chat from history |
| `exportToMarkdown` | Downloads chat as .md file |
| `branchChat` | Creates a copy of chat for alternative exploration |
| `toggleIncognito` | Enables/disables incognito mode |
| `speakText` | Uses Web Speech API for TTS |

#### Message Flow (Critical to Understand)

When user submits a message:

1. `handleSubmit` is called
2. If it's the first message AND text modality:
   - Fetch active personality from localStorage
   - If non-standard personality, prepend: `[System: {instructions}]\n\n`
   - If branch context exists, prepend that too
3. Add user message to `messages` state (for UI display)
4. Call `sendMessage(messageToSend, conversationId)` via socket
5. Backend types message into lmarena.ai
6. Backend observes DOM for response tokens
7. `token` events stream back → update `streamingContent`
8. `messageComplete` event → add final message to `messages`, clear `streamingContent`

### 2. ModelSelector.jsx

**Location:** `client/src/components/ModelSelector.jsx`

Renders the model selection dropdown with:
- Modality toggle (Text / Image)
- Provider list (OpenAI, Google, Anthropic, etc.)
- Model list for selected provider

**Props:**
- `selectedModel` - Current model ID
- `onSelectModel` - Callback when model is selected
- `disabled` - Disable during streaming

### 3. ImageLibrary.jsx

**Location:** `client/src/components/ImageLibrary.jsx`

Modal that displays saved AI-generated images with:
- Grid layout of images
- Download button (saves to disk)
- Edit button (sends image to image editing model)
- Delete button (with confirmation dialog)

**Props:**
- `images` - Array of `{ url, chatId, timestamp }`
- `onClose` - Close modal
- `onDelete` - Delete image callback
- `onEditInModel` - Send image for editing

### 4. PersonalityManager.jsx

**Location:** `client/src/components/PersonalityManager.jsx`

Modal for managing AI personalities (custom system prompts):
- List of personalities with active indicator
- Create manually (name + prompt)
- Generate with AI (describe idea → AI creates prompt)
- Delete custom personalities

**Default Personalities:**
```javascript
const DEFAULT_PERSONALITIES = [
    { id: 'standard', name: 'Grove Standard', prompt: '...' },
    { id: 'poet', name: 'Nature Poet', prompt: '...' },
    { id: 'engineer', name: 'Code Architect', prompt: '...' }
];
```

**Props:**
- `activeId` - Currently active personality ID
- `onSelect` - Callback when personality is selected
- `onClose` - Close modal
- `onGenerateRequest` - Function to generate prompt via AI

---

## Design System (Grove Theme)

### Color Palette (CSS Variables)

```css
:root {
  /* Backgrounds */
  --bg-app: #fcfaf7;           /* Main app background - warm off-white */
  --bg-sidebar: #f5f1ea;       /* Sidebar - slightly beige */
  --bg-input: #ffffff;         /* Input fields - pure white */
  --bg-hover: #e8e1d5;         /* Hover states - warm gray */
  --bg-message-user: #1a3a32;  /* User message bubbles - dark forest green */

  /* Text */
  --text-primary: #2d3330;     /* Primary text - dark greenish gray */
  --text-secondary: #5a635e;   /* Secondary text - medium gray-green */
  --text-muted: #8e9a93;       /* Muted text - light gray-green */

  /* Accents */
  --accent: #4a7c59;           /* Primary accent - sage green */
  --accent-soft: #8fb996;      /* Soft accent - light green */

  /* Borders */
  --border: rgba(45, 51, 48, 0.08); /* Subtle borders */

  /* Typography */
  --font-sans: 'Outfit', 'Inter', system-ui, sans-serif;

  /* Dimensions */
  --sidebar-width: 280px;
  --sidebar-collapsed: 80px;
}
```

### Typography

- **Font Family:** Outfit (Google Fonts)
- **Weights Used:** 300, 400, 500, 600, 700, 800
- **Brand Text:** 800 weight, letter-spacing: 1.5px
- **Body Text:** 16-17px, line-height: 1.8
- **Headers:** 22-32px, weight 800

### Component Styling Patterns

#### Buttons
- **Primary Action:** `background: var(--accent)`, border-radius: 14-16px
- **Ghost/Transparent:** `background: transparent`, no border
- **Hover:** `transform: scale(1.05-1.1)` or `translateY(-2px)`

#### Cards/Containers
- Border-radius: 28-44px for modals, 14-20px for smaller cards
- Shadows: `box-shadow: 0 20px 60px rgba(0,0,0,0.1)`
- Borders: `1px solid var(--border)`

#### Modals
- Overlay: `rgba(26, 58, 50, 0.55)` with `backdrop-filter: blur(14px)`
- Modal: `border-radius: 44px`, white background

---

## Feature Documentation

### 1. Incognito Mode

**Purpose:** Chat without saving to history

**Behavior:**
- When enabled, chat history is not saved
- Ghost icon appears in empty state
- Toggle button in header turns dark when active

**State:** `incognitoMode` boolean

### 2. Voice Mode

**Purpose:** Read AI responses aloud

**Implementation:**
- Uses Web Speech API (`window.speechSynthesis`)
- Prefers Microsoft Natural voices > Google US English > fallback
- Speaks sentence by sentence as response streams
- Detects sentence boundaries via regex: `/([.!?]+[\s\n]+)/`

**State:** `voiceModeEnabled`, `speaking`

### 3. Branch Chat

**Purpose:** Fork a conversation to explore alternatives

**Implementation:**
1. `branchChat(chat)` is called from context menu
2. Generates Markdown of conversation history
3. Stores in `branchContext` state
4. Clears current chat
5. User can select new model
6. On next submit, `branchContext` is prepended to message
7. AI continues from that context

### 4. Image Library

**Purpose:** Save and manage generated images

**Auto-Save Logic:**
- On `token` event, if `data.imageUrl` exists, save to library
- On `messageComplete`, extract image from markdown: `!\[.*?\]\((.*?)\)`

**Storage:** localStorage key `lmarena_images`

### 5. AI Personalities

**Purpose:** Custom system prompts for different AI personas

**Storage:** localStorage key `grove_personalities`

**How Prompts are Combined:**
```javascript
// Only for first message in conversation, and only for text modality
if (activeP && activeP.id !== 'standard') {
    messageToSend = `[System: ${activeP.prompt}]\n\n${content}`;
}
```

### 6. Search Models (Web Search AI)

**Purpose:** AI models with real-time web search capabilities

**Available Models:**
- Google: Gemini 3 Pro (Grounding), Gemini 2.5 Pro (Grounding)
- OpenAI: GPT-5.2 Search, GPT-5.1 Search, GPT-5 Search, o3 Search
- xAI: Grok 4.1 Fast Search, Grok 4 Fast Search, Grok 4 Search
- Anthropic: Claude Opus 4.1 Search, Claude Opus 4 Search
- Others: Perplexity Sonar Reasoning Pro, Perplexity Sonar Pro, Diffbot Small XL

**URL Format:**
```
https://lmarena.ai/?mode=direct&model=gemini-3-pro-grounding&chat-modality=search
```

**Response Processing:**
- Responses are converted from HTML to clean Markdown
- Citations and source cards are automatically extracted
- Sources are appended to the response as a formatted list

**Response Format:**
```markdown
[AI Response in Markdown]

---

**Sources:**
1. [Source Title](https://source-url.com)
2. [Another Source](https://another-url.com)
```

---

## Socket Communication Protocol

### Client → Server Events

| Event | Payload | Purpose |
|-------|---------|---------|
| `init` | `{ model: string }` | Initialize with default model |
| `sendMessage` | `{ message: string, conversationId: string }` | Send user message |
| `selectModel` | `{ model: string }` | Switch AI model |
| `loadChat` | `{ chatId: string }` | Load existing chat |

### Server → Client Events

| Event | Payload | Purpose |
|-------|---------|---------|
| `status` | `{ type: string, message: string }` | Status updates |
| `ready` | `{ initialized: boolean }` | Backend ready |
| `messageStart` | `{}` | AI started responding |
| `token` | `{ fullText, delta, imageUrl?, chatId }` | Streaming token |
| `messageComplete` | `{ response: string, chatId: string }` | AI finished |
| `modelSelected` | `{ success: boolean, model: string }` | Model change confirmed |
| `error` | `{ message: string }` | Error occurred |

---

## Known Issues & Solutions

### Issue 1: CSS Breakages

**Symptom:** UI elements appear unstyled or broken

**Cause:** `App.css` needs to contain ALL class definitions used by ALL components

**Solution:** When adding new UI elements, ALWAYS add corresponding CSS to `App.css`. Check JSX class names against CSS file.

### Issue 2: Cloudflare Blocks

**Symptom:** Backend fails to connect, "Please verify you are human"

**Solution:**
1. Browser runs visible on first launch
2. Complete Cloudflare challenge manually
3. Session saved in `/browser-data/`
4. Future runs use saved session

### Issue 3: No Response Streaming

**Symptom:** AI never responds or responses appear all at once

**Cause:** DOM selectors in `lmarena.js` may be outdated

**Solution:** Update selectors in `setupResponseObserver()` to match current lmarena.ai DOM

### Issue 4: Instructions Sent Separately

**Symptom:** AI acknowledges instructions instead of following them

**Solution:** Ensure `handleSubmit` sends a SINGLE combined message. Check console log:
```
[ChatBox] Sending combined message: [System: ...
```

### Issue 5: Image Paste Not Working

**Symptom:** Image editing fails

**Solution:** Check lmarena.ai's paste event handling. The code in `lmarena.js` creates a synthetic paste event.

---

## CSS Architecture & Patterns

### Single Source of Truth

ALL styles are in `client/src/App.css`. There is no CSS-in-JS, no Tailwind, no CSS modules.

### File Structure

```css
/* Section Comments */
/* ========================================================================
   SECTION NAME
   ======================================================================== */

/* Subsections */
/* --- Subsection --- */
```

### Key Sections in App.css

1. **Root Variables** - CSS custom properties
2. **Global Resets** - Box-sizing, margins
3. **Layout** - `.chat-layout`, `.chat-container`
4. **Sidebar** - `.chat-sidebar`, `.sidebar-header`, `.brand-*`, `.new-chat-*`
5. **Chat Header** - `.chat-header`, `.model-selector-*`, `.incognito-*`
6. **Messages** - `.messages-container`, `.message`, `.message-content`
7. **Input Area** - `.input-container`, `.input-form`, `.voice-pill`, `.send-button`
8. **Modals** - `.library-overlay`, `.library-modal`, `.p-manager-layout`
9. **Empty State** - `.empty-state`, `.empty-icon`
10. **Context Menu** - `.context-menu`
11. **Animations** - `@keyframes`
12. **Collapsed Sidebar** - `.chat-sidebar.closed` overrides

### Important CSS Classes

| Class | Component | Purpose |
|-------|-----------|---------|
| `.new-chat-action-btn` | ChatBox | New chat button (icon only, 72x72) |
| `.model-selector-trigger` | ModelSelector | Button that opens dropdown |
| `.model-dropdown` | ModelSelector | Dropdown container |
| `.p-item` | PersonalityManager | Single personality list item |
| `.library-item` | ImageLibrary | Single image in grid |
| `.incognito-toggle-btn` | ChatBox | Toggle button in header |

---

## Common Development Tasks

### Adding a New Model

1. Edit `client/src/constants/models.js`
2. Add to appropriate provider in `MODEL_PROVIDERS`
3. If new modality, add to server's `MODEL_CONFIG` in `server/lmarena.js`

### Adding a New Feature

1. Add state to `ChatBox.jsx`
2. Add UI elements with appropriate class names
3. Add CSS to `App.css`
4. If needs backend, add Socket.io event handling

### Fixing Broken Styles

1. Identify the JSX element and its className
2. Search for that class in `App.css`
3. If missing, add it with appropriate styles matching Grove theme
4. Check parent element styles if layout is broken

### Debugging Socket Issues

1. Check browser console for `[Socket]` prefixed logs
2. Check Node.js console for `[LMArena]` prefixed logs
3. All socket events are logged via `onAny` handler

---

## Debugging Guide

### Frontend Console Logs

```
[Socket] Emitting event: sendMessage { message: "...", conversationId: "..." }
[Socket] Event received: token { fullText: "...", delta: "..." }
[ChatBox] Sending combined message: [System: ...
```

### Backend Console Logs

```
[LMArena] Sending message: Hello...
[LMArena] Navigating to: https://lmarena.ai/?mode=direct&model=...
[Observer] Initial AI message count: 0
```

### Common Debug Steps

1. **Nothing happening after send:**
   - Check browser console for socket connection
   - Check Node console for LMArena errors
   - Verify Puppeteer browser isn't blocked

2. **Styles broken:**
   - Inspect element in DevTools
   - Check if class exists in App.css
   - Look for typos in className

3. **Model not switching:**
   - Check console for `modelSelected` event
   - Verify model ID matches lmarena.ai's expected format

---

## Future Development Roadmap

### Planned Features

1. **Persistent Chat History**
   - Store in IndexedDB or backend database
   - Sync across sessions

2. **Export/Import**
   - Export all chats as archive
   - Import conversation history

3. **Multiple Simultaneous Models**
   - Compare responses from different models
   - Side-by-side view

4. **Plugin System**
   - Tool calling for code execution
   - File system access
   - Web search integration

5. **Themes**
   - Dark mode
   - Custom color schemes

### Technical Debt

1. **Chat Persistence** - Currently only in React state
2. **Error Handling** - More robust error recovery
3. **Mobile Responsive** - Currently desktop-only
4. **Tests** - No test coverage

---

## Quick Reference

### Running the Project

```bash
# Terminal 1 - Backend
cd server && npm run server

# Terminal 2 - Frontend
cd client && npm run dev

# Access at http://localhost:5173
```

### Key Files to Edit

| Task | File |
|------|------|
| UI Layout | `client/src/components/ChatBox.jsx` |
| Styles | `client/src/App.css` |
| Models | `client/src/constants/models.js` |
| Backend Logic | `server/lmarena.js` |
| Socket Events | `server/index.js` |

### localStorage Keys

| Key | Content |
|-----|---------|
| `lmarena_images` | Array of saved images |
| `grove_personalities` | Array of custom personalities |

---

## Contact & Attribution

This is an open project created for personal use. It wraps lmarena.ai's public interface through browser automation.

**Important:** This project relies on lmarena.ai's interface remaining consistent. If lmarena.ai updates their DOM structure, the selectors in `server/lmarena.js` will need updating.

---

*End of Agent Documentation*
