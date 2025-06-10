import type { Server } from 'http';
import { WebSessionManager } from './core/session-manager.js';
import { WebSocketHandler } from './websocket/websocket-handler.js';
import { log } from './utils/logger.js';
import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class CodexWebServer {
  private app: express.Application;
  private httpServer: Server;
  private io: SocketIOServer;
  private sessionManager: WebSessionManager;
  
  constructor(private port: number = 3001) {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: process.env.WEB_UI_URL || ['http://localhost:3000', 'http://localhost:3002'],
        methods: ['GET', 'POST']
      },
      maxHttpBufferSize: 50 * 1024 * 1024, // 50MB for file uploads
      pingTimeout: 60000, // 60 seconds
      pingInterval: 25000, // 25 seconds
      transports: ['websocket', 'polling']
    });
    
    this.sessionManager = new WebSessionManager();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }
  
  private setupMiddleware(): void {
    this.app.use(cors({
      origin: process.env.WEB_UI_URL || ['http://localhost:3000', 'http://localhost:3002'],
      credentials: true
    }));
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ limit: '50mb', extended: true }));
    
    // Serve static files in production
    if (process.env.NODE_ENV === 'production') {
      this.app.use(express.static(path.join(__dirname, '../../dist')));
    }
  }
  
  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (_req, res) => {
      res.json({ 
        status: 'ok', 
        version: '1.0.0',
        name: 'codex-web-server'
      });
    });
    
    // Session list endpoint
    this.app.get('/api/sessions', async (_req, res) => {
      const sessions = await this.sessionManager.getAllSessions();
      res.json({ sessions });
    });
    
    // In production, serve the React app
    if (process.env.NODE_ENV === 'production') {
      this.app.get('*', (_req, res) => {
        res.sendFile(path.join(__dirname, '../../dist/index.html'));
      });
    }
  }
  
  private setupWebSocket(): void {
    this.io.on('connection', (socket) => {
      log(`New WebSocket connection: ${socket.id}`);
      
      const handler = new WebSocketHandler(socket, this.sessionManager);
      handler.initialize();
      
      socket.on('disconnect', () => {
        log(`WebSocket disconnected: ${socket.id}`);
      });
    });
  }
  
  async start(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.httpServer.listen(this.port, () => {
        log(`Codex Web Server running on port ${this.port}`);
        log(`Environment: ${process.env.NODE_ENV || 'development'}`);
        resolve();
      });
    });
  }
  
  async stop(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.io.close(() => {
        this.httpServer.close(() => {
          log('Codex Web Server stopped');
          resolve();
        });
      });
    });
  }
}

// Start server if running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = parseInt(process.env.PORT || '3001', 10);
  const server = new CodexWebServer(port);
  
  server.start().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
  
  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    log('SIGTERM received, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    log('SIGINT received, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });
}