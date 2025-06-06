# MTR Web UI Implementation Plan

## Executive Summary

This document outlines a comprehensive plan for developing a web-based user interface for the MTR CLI tool. The web UI will replicate and enhance existing terminal functionality while providing a modern, accessible interface with real-time progress visualization and interactive approval workflows.

## Technical Architecture

### Technology Stack

#### Frontend
- **Framework**: React 18+ with TypeScript
- **UI Library**: Radix UI + Tailwind CSS (accessible, customizable components)
- **State Management**: Zustand (lightweight, TypeScript-friendly)
- **Real-time Communication**: Socket.io-client
- **Code Editor**: Monaco Editor (VS Code's editor)
- **Terminal Emulator**: xterm.js
- **Markdown Rendering**: react-markdown with syntax highlighting
- **Build Tool**: Vite

#### Backend
- **Server Framework**: Express.js with Socket.io
- **API Layer**: GraphQL with Apollo Server (optional) or REST
- **Session Management**: Redis for session storage
- **WebSocket Layer**: Socket.io for bidirectional communication
- **Process Management**: Node.js child_process with PTY support
- **Authentication**: JWT tokens with refresh mechanism

#### Infrastructure
- **Containerization**: Docker for consistent deployment
- **Reverse Proxy**: Nginx for WebSocket support
- **Security**: CORS, CSP headers, rate limiting

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Web Browser                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    React Web UI                          │   │
│  │  ┌─────────┐  ┌──────────┐  ┌────────────┐            │   │
│  │  │  Chat   │  │  File    │  │  Terminal  │            │   │
│  │  │Interface│  │  Editor  │  │  Emulator  │            │   │
│  │  └─────────┘  └──────────┘  └────────────┘            │   │
│  │                                                         │   │
│  │              Zustand State Management                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                     │
│                     Socket.io Client                            │
└────────────────────────────┼─────────────────────────────────┘
                             │ WebSocket
┌────────────────────────────┼─────────────────────────────────┐
│                     Web Server (Node.js)                      │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                  Socket.io Server                        │ │
│  │  ┌──────────┐  ┌───────────┐  ┌──────────────┐        │ │
│  │  │  Session │  │  Command  │  │   WebSocket  │        │ │
│  │  │  Manager │  │   Queue   │  │   Handler    │        │ │
│  │  └──────────┘  └───────────┘  └──────────────┘        │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              Existing MTR Agent System                   │ │
│  │  ┌──────────┐  ┌───────────┐  ┌──────────────┐        │ │
│  │  │  Agent   │  │  Sandbox  │  │     Tool     │        │ │
│  │  │   Loop   │  │  Executor │  │   Executor   │        │ │
│  │  └──────────┘  └───────────┘  └──────────────┘        │ │
│  └─────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

## UI/UX Component Design

### 1. Main Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Logo  │  Session: current  │  Active TSG  │  Settings ⚙  │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────┐ ┌─────────────────────────────────────────┐ │
│ │             │ │                                           │ │
│ │   Sidebar   │ │          Main Content Area               │ │
│ │             │ │                                           │ │
│ │ • Chat      │ │   ┌─────────────────────────────────┐   │ │
│ │ • Files     │ │   │                                 │   │ │
│ │ • Terminal  │ │   │      Chat/Editor/Terminal       │   │ │
│ │ • History   │ │   │                                 │   │ │
│ │ • Settings  │ │   └─────────────────────────────────┘   │ │
│ │             │ │                                           │ │
│ └─────────────┘ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 2. Chat Interface Component

**Features:**
- Message bubbles with user/AI distinction
- Real-time streaming text with cursor indicator
- Code blocks with syntax highlighting and copy button
- Inline file references with preview on hover
- Tool execution cards showing:
  - Command being executed
  - Live output stream
  - Status (pending/running/completed/failed)
- Approval request cards with:
  - Command explanation
  - Approve/Deny/Explain buttons
  - Risk level indicator

**Mockup:**
```
┌─────────────────────────────────────────────────────────┐
│ Chat                                              □ ─ X │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ You: Create a React component for a todo list   │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ AI: I'll create a React todo list component...  │   │
│ │                                                  │   │
│ │ ┌───────────────────────────────────────────┐   │   │
│ │ │ 📁 Creating file: TodoList.tsx            │   │   │
│ │ │ Status: ✓ Completed                       │   │   │
│ │ └───────────────────────────────────────────┘   │   │
│ │                                                  │   │
│ │ ```tsx                                          │   │
│ │ import React, { useState } from 'react';       │   │
│ │ // ... code continues                           │   │
│ │ ```                                             │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ ⚠️  Approval Required                           │   │
│ │ Command: npm install react-todo                 │   │
│ │ This will install a new package                 │   │
│ │ [Approve] [Deny] [Explain]                     │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ Type your message...               [Send] [⌘↵] │   │
│ └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### 3. Real-time Progress Visualization

**Progress Indicator Components:**
- Thinking indicator with animated dots
- Task progress bar with current step
- File operation timeline
- Command execution terminal view

**Real-time Updates:**
```typescript
interface ProgressEvent {
  type: 'thinking' | 'file_read' | 'file_write' | 'exec_start' | 'exec_output' | 'exec_end';
  data: {
    path?: string;
    command?: string;
    output?: string;
    progress?: number;
  };
}
```

### 4. File Tree and Editor

**Features:**
- Monaco Editor integration
- File tree with real-time updates
- Diff view for changes
- Multiple file tabs
- Syntax highlighting
- IntelliSense support

### 5. Terminal Emulator

**Features:**
- Full xterm.js integration
- Command history
- Copy/paste support
- Resize support
- ANSI color support

## Integration Strategy

### Phase 1: Backend API Layer

1. **Create Web Server Module** (`codex-cli/src/web-server/`)
   ```typescript
   // server.ts
   export class MTRWebServer {
     private io: Server;
     private agentManager: AgentManager;
     
     async handleConnection(socket: Socket) {
       // Handle WebSocket connections
     }
     
     async handleUserInput(sessionId: string, input: string) {
       // Route to existing agent system
     }
   }
   ```

2. **Session Management Adapter**
   - Extend existing session.ts to support multiple concurrent sessions
   - Add Redis for distributed session storage
   - Implement session persistence and recovery

3. **WebSocket Protocol**
   ```typescript
   // Client -> Server
   interface ClientMessage {
     type: 'start_session' | 'user_input' | 'approval_response' | 'cancel';
     sessionId: string;
     data: any;
   }
   
   // Server -> Client  
   interface ServerMessage {
     type: 'agent_message' | 'tool_execution' | 'approval_request' | 'error';
     sessionId: string;
     data: any;
   }
   ```

### Phase 2: Frontend Implementation

1. **Project Structure**
   ```
   mtr-web/
   ├── src/
   │   ├── components/
   │   │   ├── Chat/
   │   │   ├── Editor/
   │   │   ├── Terminal/
   │   │   └── common/
   │   ├── hooks/
   │   ├── store/
   │   ├── utils/
   │   └── App.tsx
   ├── public/
   └── package.json
   ```

2. **State Management with Zustand**
   ```typescript
   interface MTRStore {
     sessions: Map<string, Session>;
     activeSessionId: string | null;
     messages: Message[];
     approvalQueue: ApprovalRequest[];
     // Actions
     addMessage: (message: Message) => void;
     handleApproval: (id: string, approved: boolean) => void;
   }
   ```

### Phase 3: Security and Authentication

1. **Authentication Flow**
   - JWT-based authentication
   - API key management UI
   - Provider configuration interface

2. **Security Measures**
   - WebSocket authentication
   - Rate limiting
   - Input sanitization
   - CSP headers

## Development Phases and Milestones

### Phase 1: Foundation (Weeks 1-3)
- [ ] Set up web server with Socket.io
- [ ] Create WebSocket protocol adapters
- [ ] Implement session management
- [ ] Basic React app scaffold
- [ ] CI/CD pipeline setup

### Phase 2: Core Features (Weeks 4-7)
- [ ] Chat interface with streaming
- [ ] Tool execution visualization
- [ ] Approval workflow UI
- [ ] File tree and basic editor
- [ ] Terminal emulator integration

### Phase 3: Advanced Features (Weeks 8-10)
- [ ] Monaco editor with full features
- [ ] Session history and search
- [ ] Configuration UI
- [ ] Multi-provider support
- [ ] Export/import functionality

### Phase 4: Polish and Testing (Weeks 11-12)
- [ ] UI/UX refinements
- [ ] Performance optimization
- [ ] Comprehensive testing
- [ ] Documentation
- [ ] Deployment guides

## Considerations for Feature Parity

### Critical Features to Maintain
1. **Approval Modes**: Full UI support for suggest/auto-edit/full-auto
2. **Sandboxing**: Maintain security model through backend
3. **Multi-provider**: Support all existing providers
4. **Session Management**: Full history and resume capability
5. **Configuration**: Web-based config editor

### Enhancement Opportunities
1. **Collaborative Sessions**: Multiple users in same session
2. **Visual Diff Tools**: Enhanced file change visualization
3. **Project Templates**: Quick-start templates
4. **Metrics Dashboard**: Usage analytics and insights
5. **Plugin System**: Extensible tool ecosystem

## Technical Challenges and Solutions

### 1. Real-time Streaming
**Challenge**: Smooth character-by-character streaming
**Solution**: Buffer management with requestAnimationFrame

### 2. Large File Handling
**Challenge**: Editor performance with large files
**Solution**: Virtual scrolling and lazy loading

### 3. Session Persistence
**Challenge**: Recovering from disconnections
**Solution**: Event sourcing with replay capability

### 4. Terminal Emulation
**Challenge**: Full PTY support in browser
**Solution**: Server-side PTY with xterm.js frontend

## Security Considerations

1. **API Key Storage**: Encrypted storage with secure transmission
2. **Command Execution**: All commands run server-side in sandbox
3. **File Access**: Scoped to project directory
4. **WebSocket Security**: TLS encryption and authentication
5. **Input Validation**: Comprehensive sanitization

## Performance Targets

- Initial load: < 3 seconds
- Message latency: < 100ms
- Streaming smoothness: 60 FPS
- Session recovery: < 2 seconds
- File operations: < 500ms

## Deployment Architecture

```yaml
version: '3.8'
services:
  web-ui:
    build: ./codex-web
    ports:
      - "3000:3000"
  
  api-server:
    build: ./codex-cli
    environment:
      - REDIS_URL=redis://redis:6379
    ports:
      - "3001:3001"
  
  redis:
    image: redis:alpine
    
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
```

## Conclusion

This implementation plan provides a comprehensive roadmap for developing a web-based UI for MTR CLI. The architecture leverages existing code while adding modern web capabilities, ensuring feature parity and enhanced user experience. The phased approach allows for iterative development with clear milestones and deliverables.