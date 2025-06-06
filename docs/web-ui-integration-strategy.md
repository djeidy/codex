# MTR Web UI Integration Strategy

## Overview

This document outlines the strategy for integrating the web UI with the existing MTR CLI codebase, ensuring minimal disruption to the current architecture while maximizing code reuse.

## Integration Architecture

### Layered Approach

```
┌─────────────────────────────────────────────────────┐
│                   Web UI Layer                       │
│         (New React App + WebSocket Client)          │
└─────────────────────┬───────────────────────────────┘
                      │ WebSocket API
┌─────────────────────┴───────────────────────────────┐
│              Web Server Adapter Layer                │
│    (New: Translates WebSocket ↔ Agent Events)      │
└─────────────────────┬───────────────────────────────┘
                      │ Direct Function Calls
┌─────────────────────┴───────────────────────────────┐
│            Existing MTR Core Layer                   │
│  (AgentLoop, Tools, Sandbox, Config - Unchanged)   │
└─────────────────────────────────────────────────────┘
```

## Phase 1: Web Server Adapter Implementation

### 1.1 Create Web Server Module

Create `codex-cli/src/web-server/index.ts`:

```typescript
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import express from 'express';
import { AgentLoop } from '../utils/agent/agent-loop';
import { WebSessionManager } from './session-manager';
import { WebSocketHandler } from './websocket-handler';

export class MTRWebServer {
  private app: express.Application;
  private io: SocketIOServer;
  private sessionManager: WebSessionManager;
  
  constructor(private port: number = 3001) {
    this.app = express();
    const httpServer = createServer(this.app);
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.WEB_UI_URL || 'http://localhost:3000',
        methods: ['GET', 'POST']
      }
    });
    
    this.sessionManager = new WebSessionManager();
    this.setupRoutes();
    this.setupWebSocket();
  }
  
  private setupWebSocket() {
    this.io.on('connection', (socket) => {
      const handler = new WebSocketHandler(socket, this.sessionManager);
      handler.initialize();
    });
  }
  
  async start() {
    await this.httpServer.listen(this.port);
    console.log(`MTR Web Server running on port ${this.port}`);
  }
}
```

### 1.2 WebSocket Handler

Create `codex-cli/src/web-server/websocket-handler.ts`:

```typescript
import { Socket } from 'socket.io';
import { AgentLoop } from '../utils/agent/agent-loop';
import { ResponseEvent } from '../utils/responses';

export class WebSocketHandler {
  private agentLoop?: AgentLoop;
  private currentGeneration = 0;
  
  constructor(
    private socket: Socket,
    private sessionManager: WebSessionManager
  ) {}
  
  initialize() {
    // Handle client messages
    this.socket.on('start_session', this.handleStartSession.bind(this));
    this.socket.on('user_input', this.handleUserInput.bind(this));
    this.socket.on('approval_response', this.handleApprovalResponse.bind(this));
    this.socket.on('cancel', this.handleCancel.bind(this));
    this.socket.on('disconnect', this.handleDisconnect.bind(this));
  }
  
  private async handleStartSession(data: StartSessionData) {
    const session = this.sessionManager.createSession({
      socketId: this.socket.id,
      config: data.config
    });
    
    // Initialize AgentLoop with session config
    this.agentLoop = new AgentLoop({
      provider: session.config.provider,
      model: session.config.model,
      onApprovalRequired: this.handleApprovalRequired.bind(this),
      onToolExecution: this.handleToolExecution.bind(this)
    });
    
    this.socket.emit('session_created', {
      sessionId: session.id,
      config: session.config
    });
  }
  
  private async handleUserInput(data: UserInputData) {
    if (!this.agentLoop) return;
    
    try {
      const stream = await this.agentLoop.processMessage(data.message);
      
      // Stream responses to client
      for await (const event of stream) {
        this.socket.emit('agent_event', {
          type: event.type,
          data: event,
          generation: this.currentGeneration
        });
      }
    } catch (error) {
      this.socket.emit('error', {
        message: error.message,
        code: error.code
      });
    }
  }
  
  private handleApprovalRequired(approval: ApprovalRequest) {
    this.socket.emit('approval_request', approval);
    
    // Return promise that resolves when approval is received
    return new Promise<boolean>((resolve) => {
      this.socket.once(`approval_${approval.id}`, (approved: boolean) => {
        resolve(approved);
      });
    });
  }
  
  private handleToolExecution(tool: ToolExecution) {
    this.socket.emit('tool_execution', {
      id: tool.id,
      type: tool.type,
      status: tool.status,
      data: tool.data
    });
  }
}
```

### 1.3 Session Manager Adapter

Create `codex-cli/src/web-server/session-manager.ts`:

```typescript
import { v4 as uuidv4 } from 'uuid';
import { Session } from '../utils/session';
import Redis from 'ioredis';

export class WebSessionManager {
  private sessions: Map<string, WebSession> = new Map();
  private redis?: Redis;
  
  constructor(redisUrl?: string) {
    if (redisUrl) {
      this.redis = new Redis(redisUrl);
    }
  }
  
  createSession(options: CreateSessionOptions): WebSession {
    const session: WebSession = {
      id: uuidv4(),
      socketId: options.socketId,
      config: options.config,
      messages: [],
      createdAt: new Date(),
      lastActivity: new Date()
    };
    
    this.sessions.set(session.id, session);
    
    // Persist to Redis if available
    if (this.redis) {
      this.redis.set(
        `session:${session.id}`,
        JSON.stringify(session),
        'EX',
        86400 // 24 hour expiry
      );
    }
    
    return session;
  }
  
  async getSession(sessionId: string): Promise<WebSession | null> {
    // Check memory first
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId)!;
    }
    
    // Check Redis
    if (this.redis) {
      const data = await this.redis.get(`session:${sessionId}`);
      if (data) {
        const session = JSON.parse(data);
        this.sessions.set(sessionId, session);
        return session;
      }
    }
    
    return null;
  }
}
```

## Phase 2: Minimal CLI Modifications

### 2.1 Extract Core Logic

Refactor `codex-cli/src/utils/agent/agent-loop.ts` to separate concerns:

```typescript
// Before: Tightly coupled to terminal UI
export class AgentLoop {
  constructor(private ink: any, private config: Config) {}
  
  async processMessage(message: string) {
    // Direct terminal rendering
    this.ink.render(<TerminalResponse />);
  }
}

// After: UI-agnostic with event callbacks
export class AgentLoop {
  constructor(private config: AgentConfig) {}
  
  async *processMessage(message: string): AsyncGenerator<AgentEvent> {
    // Yield events instead of rendering
    yield { type: 'message_start', data: { message } };
    
    // Process with AI
    const stream = await this.callAPI(message);
    
    for await (const chunk of stream) {
      yield { type: 'content_chunk', data: { chunk } };
      
      if (chunk.toolCall) {
        yield { type: 'tool_call', data: chunk.toolCall };
        const result = await this.executeTool(chunk.toolCall);
        yield { type: 'tool_result', data: result };
      }
    }
    
    yield { type: 'message_complete', data: {} };
  }
}
```

### 2.2 Create Event Bridge

Create `codex-cli/src/utils/agent/event-bridge.ts`:

```typescript
export interface AgentEventBridge {
  onMessage(handler: (event: MessageEvent) => void): void;
  onToolExecution(handler: (event: ToolEvent) => void): void;
  onApprovalRequired(handler: (event: ApprovalEvent) => Promise<boolean>): void;
  onError(handler: (error: Error) => void): void;
}

// Terminal implementation
export class TerminalEventBridge implements AgentEventBridge {
  constructor(private ink: any) {}
  
  onMessage(handler: (event: MessageEvent) => void) {
    // Render to terminal
  }
}

// Web implementation  
export class WebEventBridge implements AgentEventBridge {
  constructor(private socket: Socket) {}
  
  onMessage(handler: (event: MessageEvent) => void) {
    // Emit to WebSocket
  }
}
```

## Phase 3: Shared Components

### 3.1 Tool Execution Abstraction

Create shared tool execution interface:

```typescript
// codex-cli/src/utils/tools/interface.ts
export interface ToolExecutor {
  execute(tool: ToolCall): Promise<ToolResult>;
  canExecute(tool: ToolCall): boolean;
}

// codex-cli/src/utils/tools/registry.ts
export class ToolRegistry {
  private tools: Map<string, ToolExecutor> = new Map();
  
  register(name: string, executor: ToolExecutor) {
    this.tools.set(name, executor);
  }
  
  async execute(toolCall: ToolCall): Promise<ToolResult> {
    const executor = this.tools.get(toolCall.name);
    if (!executor) {
      throw new Error(`Unknown tool: ${toolCall.name}`);
    }
    
    return executor.execute(toolCall);
  }
}
```

### 3.2 Sandbox Abstraction

Ensure sandbox works for both CLI and web:

```typescript
// codex-cli/src/utils/sandbox/interface.ts
export interface SandboxExecutor {
  execute(command: string, options?: ExecOptions): Promise<ExecResult>;
  kill(pid: number): Promise<void>;
}

// Use existing implementations
export class MacOSSandbox implements SandboxExecutor {
  // Existing seatbelt implementation
}

export class LinuxSandbox implements SandboxExecutor {
  // Existing landlock implementation  
}
```

## Phase 4: Configuration and Authentication

### 4.1 Unified Config Management

Extend existing config system:

```typescript
// codex-cli/src/utils/config.ts
export interface WebUIConfig extends Config {
  webUI?: {
    enabled: boolean;
    port: number;
    cors: {
      origin: string | string[];
    };
    auth?: {
      type: 'none' | 'jwt' | 'oauth';
      secret?: string;
    };
  };
}

export class ConfigManager {
  // Existing config loading
  
  async loadWebConfig(): Promise<WebUIConfig> {
    const config = await this.load();
    
    // Merge with web-specific defaults
    return {
      ...config,
      webUI: {
        enabled: true,
        port: 3001,
        cors: { origin: '*' },
        auth: { type: 'none' },
        ...config.webUI
      }
    };
  }
}
```

### 4.2 Authentication Middleware

```typescript
// codex-cli/src/web-server/auth.ts
import jwt from 'jsonwebtoken';

export class AuthMiddleware {
  constructor(private config: WebUIConfig) {}
  
  async authenticate(socket: Socket, next: (err?: Error) => void) {
    if (this.config.webUI?.auth?.type === 'none') {
      return next();
    }
    
    const token = socket.handshake.auth.token;
    
    try {
      if (this.config.webUI?.auth?.type === 'jwt') {
        const payload = jwt.verify(
          token,
          this.config.webUI.auth.secret!
        );
        socket.data.user = payload;
      }
      
      next();
    } catch (error) {
      next(new Error('Authentication failed'));
    }
  }
}
```

## Phase 5: Development Workflow

### 5.1 Monorepo Structure

Update project structure:

```
mtr/
├── mtr-cli/          # Existing CLI
│   ├── src/
│   │   ├── web-server/ # New web server code
│   │   └── ...existing code
│   └── package.json
├── mtr-web/          # New React app
│   ├── src/
│   ├── public/
│   └── package.json
├── shared/             # Shared types/utils
│   ├── src/
│   └── package.json
└── package.json        # Root workspace
```

### 5.2 Shared Types Package

Create `shared/src/types.ts`:

```typescript
// Shared type definitions
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  tools?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
  result?: ToolResult;
}

export interface Session {
  id: string;
  messages: Message[];
  config: SessionConfig;
  createdAt: Date;
  lastActivity: Date;
}
```

### 5.3 Development Scripts

Update root `package.json`:

```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:cli\" \"npm run dev:web\" \"npm run dev:server\"",
    "dev:cli": "cd codex-cli && npm run dev",
    "dev:web": "cd codex-web && npm run dev",
    "dev:server": "cd codex-cli && npm run dev:server",
    "build": "npm run build:shared && npm run build:cli && npm run build:web",
    "test": "npm run test:cli && npm run test:web"
  }
}
```

## Phase 6: Migration Path

### 6.1 Backward Compatibility

Ensure CLI continues to work independently:

```typescript
// codex-cli/src/cli.tsx
const args = process.argv.slice(2);

if (args.includes('--web-server')) {
  // Start web server mode
  const server = new MTRWebServer();
  await server.start();
} else {
  // Normal CLI mode
  render(<App />);
}
```

### 6.2 Feature Flags

Implement gradual rollout:

```typescript
export interface FeatureFlags {
  webUI: boolean;
  webUIAuth: boolean;
  webUICollaboration: boolean;
}

export class FeatureManager {
  private flags: FeatureFlags;
  
  isEnabled(feature: keyof FeatureFlags): boolean {
    return this.flags[feature] ?? false;
  }
}
```

## Integration Testing Strategy

### Test Scenarios

1. **End-to-End Tests**
   ```typescript
   describe('Web UI Integration', () => {
     it('should handle full chat session', async () => {
       const client = io('http://localhost:3001');
       
       // Start session
       client.emit('start_session', { config });
       const session = await waitForEvent(client, 'session_created');
       
       // Send message
       client.emit('user_input', { 
         sessionId: session.id,
         message: 'Create a hello world file'
       });
       
       // Verify events
       const events = await collectEvents(client, [
         'agent_event',
         'tool_execution',
         'message_complete'
       ]);
       
       expect(events).toContainToolExecution('file_write');
     });
   });
   ```

2. **Performance Tests**
   - Message latency < 100ms
   - Concurrent session handling
   - Memory leak detection

3. **Security Tests**
   - Command injection prevention
   - Path traversal protection
   - Authentication bypass attempts

## Deployment Considerations

### Docker Compose Setup

```yaml
version: '3.8'

services:
  web-ui:
    build: ./codex-web
    ports:
      - "3000:3000"
    environment:
      - REACT_APP_API_URL=http://api:3001
    depends_on:
      - api
  
  api:
    build: ./codex-cli
    command: node dist/cli.js --web-server
    ports:
      - "3001:3001"
    volumes:
      - ./workspace:/workspace
      - ~/.mtr:/root/.mtr
    environment:
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
    security_opt:
      - seccomp:unconfined  # For sandboxing
  
  redis:
    image: redis:alpine
    volumes:
      - redis-data:/data

volumes:
  redis-data:
```

### Production Checklist

1. **Security**
   - [ ] Enable authentication
   - [ ] Configure CORS properly
   - [ ] Use HTTPS/WSS
   - [ ] Rate limiting

2. **Performance**
   - [ ] Enable Redis caching
   - [ ] Configure connection pooling
   - [ ] Set up CDN for static assets

3. **Monitoring**
   - [ ] Application metrics
   - [ ] Error tracking (Sentry)
   - [ ] WebSocket connection metrics

## Success Metrics

1. **Functional Parity**: 100% CLI features available in web
2. **Performance**: < 100ms latency for user interactions
3. **Reliability**: 99.9% uptime for web service
4. **User Adoption**: 50% of users trying web UI within 3 months
5. **Code Reuse**: > 80% of core logic shared between CLI and web

This integration strategy ensures a smooth transition from CLI to web UI while maintaining the robustness and security of the existing system.