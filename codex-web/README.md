# OpenAI Codex Web UI

A modern web-based user interface for the OpenAI Codex CLI tool, providing a ChatGPT-like experience with real-time progress visualization and interactive approval workflows.

## Features

- 🎯 **Chat Interface**: Conversational UI similar to ChatGPT
- ⚡ **Real-time Updates**: Live streaming responses and tool execution status
- 🔒 **Approval Workflows**: Interactive approval cards for commands with risk assessment
- 📁 **Session Management**: Create, resume, and manage multiple chat sessions
- 🎨 **Modern Design**: Clean, responsive UI with dark mode support
- 🛠️ **Tool Visualization**: See what tools the AI is using in real-time

## Getting Started

### Prerequisites

- Node.js 22+ 
- pnpm 9+
- The Codex CLI must be built first

### Installation

From the root directory:

```bash
# Install all dependencies
pnpm install

# Build the CLI (required for web server)
pnpm build:cli
```

### Running the Web UI

There are two ways to run the web UI:

#### Option 1: Using the run script (recommended)

```bash
./run-web-ui.sh
```

This will:
- Start the Codex web server on port 3001
- Start the React development server on port 3000
- Open http://localhost:3000 in your browser

#### Option 2: Manual startup

In separate terminals:

```bash
# Terminal 1: Start the web server
codex-cli/bin/codex.js --web-server

# Terminal 2: Start the React dev server
cd codex-web && pnpm dev
```

## Architecture

The web UI consists of:

1. **Backend (Web Server)**: Socket.io server integrated into the CLI that bridges the web UI with the existing agent system
2. **Frontend (React App)**: Modern React application with real-time WebSocket communication

### Technology Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Zustand
- **Real-time**: Socket.io for bidirectional communication
- **UI Components**: Radix UI for accessible components
- **Code Editor**: Monaco Editor (VS Code's editor)
- **Terminal**: xterm.js for terminal emulation

## Development

### Project Structure

```
codex-web/
├── src/
│   ├── components/      # React components
│   ├── store/          # Zustand state management
│   ├── utils/          # Utility functions
│   └── styles/         # CSS files
├── public/             # Static assets
└── package.json
```

### Available Scripts

```bash
# Development server
pnpm dev

# Build for production
pnpm build

# Type checking
pnpm typecheck

# Linting
pnpm lint
```

## Configuration

The web UI connects to the backend on `http://localhost:3001` by default. This can be configured in:
- `vite.config.ts` - Proxy configuration for development
- Environment variables (coming soon)

## Roadmap

- [ ] Monaco Editor integration for code editing
- [ ] xterm.js integration for terminal emulation
- [ ] File tree navigation
- [ ] Multi-provider support UI
- [ ] Collaborative sessions
- [ ] Metrics dashboard
- [ ] Plugin system

## License

Apache 2.0