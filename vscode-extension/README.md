# Grove AI - VS Code Extension

AI coding assistant powered by LMArena. Write, read, edit, rename files and run commands using natural language.

## Features

- **Model Selection**: Choose from available AI models (GPT, Claude, Gemini, etc.)
- **Planning Mode**: AI explains what it would do, you approve each action
- **Execution Mode**: AI automatically executes file operations and commands
- **File Operations**: 
  - Create/write files
  - Read files
  - Edit files (find & replace)
  - Rename/move files
  - Delete files
- **Command Execution**:
  - Run shell commands
  - Cancel running commands
  - See command output in real-time

## Requirements

The Grove server must be running:

```bash
cd lmarena
npm start
```

By default, the extension connects to `http://localhost:3000`.

## Installation

### Development Mode

1. Open the `vscode-extension` folder in VS Code
2. Press F5 to launch Extension Development Host
3. The Grove icon will appear in the activity bar

### Build VSIX

```bash
cd vscode-extension
npm install
npx vsce package
```

Then install the `.vsix` file via Extensions > Install from VSIX.

## Configuration

- `grove.serverUrl`: URL of the Grove server (default: `http://localhost:3000`)
- `grove.defaultModel`: Default AI model to use

## Usage

### Modes

- **📋 Planning Mode** (default): The AI will explain what it would do and show tool calls, but won't execute them automatically. You can click "Execute" on each tool call to run it.

- **⚡ Execution Mode**: Tool calls are executed automatically. Use with caution!

### Tool Calls

The AI uses XML-style tool calls:

```xml
<tool_call>
<tool>create_file</tool>
<path>src/utils/helper.js</path>
<content>
export function helper() {
  return 'Hello!';
}
</content>
</tool_call>
```

### Available Tools

| Tool | Description |
|------|-------------|
| `create_file` | Create a new file or overwrite existing |
| `read_file` | Read file contents |
| `edit_file` | Find and replace text in a file |
| `rename_file` | Rename or move a file |
| `delete_file` | Delete a file or folder |
| `run_command` | Run a shell command |
| `cancel_command` | Cancel a running command by PID |

## Commands

- `Grove: New Chat` - Clear the chat history
- `Grove: Select Model` - Select an AI model via quick pick
- `Grove: Toggle Planning/Execution Mode` - Switch between modes
