# Codex Web - Standalone AI Assistant

A standalone web application for AI-powered log analysis, troubleshooting, and code assistance. This project provides a complete web-based interface with its own backend server, no longer requiring codex-cli.

## Features

- 🤖 **AI-powered Assistance**: Integrated OpenAI API for intelligent responses
- 📁 **Session Management**: Create, resume, and manage multiple chat sessions
- 📚 **Troubleshooting Guides**: TSG system for structured documentation
- 💬 **Real-time Chat**: Streaming responses with WebSocket communication
- 🛠️ **Tool Execution**: Safe file operations and command execution
- 🔒 **Security Controls**: Path validation and command safety checks
- 🎨 **Modern UI**: Clean interface with light/dark theme support
- ⚡ **Live Updates**: Real-time tool execution visualization

## Prerequisites

- Node.js 18+ 
- npm or yarn
- OpenAI API key

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd codex-web
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

4. Edit `.env` and add your OpenAI API key:
```env
OPENAI_API_KEY=your-openai-api-key-here
```

## Development

Run both the backend server and frontend development server:

```bash
npm run dev
```

This will start:
- Backend server on http://localhost:3001
- Frontend dev server on http://localhost:3002

### Running separately

Backend only:
```bash
npm run server:dev
```

Frontend only:
```bash
npm run client:dev
```

## Production Build

1. Build the project:
```bash
npm run build
```

2. Start the production server:
```bash
npm start
```

The server will serve both the API and the static frontend files on port 3001.

## Configuration

### Environment Variables

- `NODE_ENV` - Environment mode (development/production)
- `PORT` - Backend server port (default: 3001)
- `OPENAI_API_KEY` - Your OpenAI API key
- `OPENAI_BASE_URL` - Custom OpenAI base URL (optional)
- `LOG_TO_FILE` - Enable file logging (true/false)
- `LOG_LEVEL` - Logging level (DEBUG/INFO/WARN/ERROR)
- `WEB_UI_URL` - Frontend URL for CORS configuration

### Frontend Configuration

To connect to a different backend URL in production, set the `VITE_API_URL` environment variable during build:

```bash
VITE_API_URL=https://your-backend-url npm run build:client
```

## Architecture

### Backend Structure

```
server/
├── index.ts              # Main server entry point
├── ai/                   # AI agent and tools
│   ├── agent-loop.ts     # Core AI agent logic
│   └── tools/            # Tool implementations
├── core/                 # Core business logic
│   └── session-manager.ts
├── storage/              # Data persistence
│   ├── session-files.ts
│   ├── session-storage.ts
│   └── tsg-storage.ts
├── websocket/            # WebSocket handlers
│   └── websocket-handler.ts
├── types/                # TypeScript types
└── utils/                # Utilities
```

### Frontend Structure

```
src/
├── App.tsx               # Main React component
├── components/           # React components
│   ├── ChatView.tsx      # Main chat interface
│   ├── SessionManager.tsx # Session management
│   └── ...
├── hooks/                # Custom React hooks
├── store/                # State management (Zustand)
└── utils/                # Utility functions
```

### Technology Stack

- **Backend**: Node.js, Express, Socket.io, OpenAI SDK
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Zustand
- **Real-time**: Socket.io for bidirectional communication
- **UI Components**: Radix UI for accessible components
- **Code Editor**: Monaco Editor (VS Code's editor)
- **Terminal**: xterm.js for terminal emulation

## API Documentation

The backend provides a Socket.io API with the following events:

### Client → Server

- `start_session` - Initialize a new session
- `user_input` - Send user message
- `approval_response` - Respond to command approval
- `cancel` - Cancel current operation
- `resume_session` - Resume an existing session
- `tsg:create` - Create a new TSG
- `tsg:list` - List available TSGs
- `tsg:select` - Select active TSG
- `tsg:delete` - Delete a TSG
- `tsg:upload` - Upload files to TSG
- `session:upload` - Upload session files
- `session:file:*` - File management operations

### Server → Client

- `session_created` - Session initialized
- `session_resumed` - Session resumed
- `agent_event` - AI agent updates (messages, tool calls, results)
- `approval_request` - Request command approval
- `error` - Error messages
- `message` - General messages and responses

## Security Notes

- File operations are restricted to safe paths
- Command execution includes basic safety checks
- Sensitive file patterns are blocked
- All operations require session context
- Network access is disabled for executed commands

## Migration from codex-cli

This standalone version includes all the functionality previously provided by codex-cli's web server:

1. **Session Management**: Full session persistence and management
2. **AI Integration**: Direct OpenAI API integration
3. **Tool Execution**: Safe command and file operations
4. **TSG System**: Complete troubleshooting guide functionality
5. **File Management**: Upload and analyze session files

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Create a Pull Request

## License

Apache 2.0