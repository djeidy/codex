import type { Server } from 'http';

import { WebSessionManager } from './session-manager.js';
import { WebSocketHandler } from './websocket-handler.js';
import { log } from '../utils/logger/log.js';
import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

export class MTRWebServer {
  private app: express.Application;
  private httpServer: Server;
  private io: SocketIOServer;
  private sessionManager: WebSessionManager;
  
  constructor(private port: number = 3001) {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: process.env['WEB_UI_URL'] || ['http://localhost:3000', 'http://localhost:3002'],
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
      origin: process.env['WEB_UI_URL'] || ['http://localhost:3000', 'http://localhost:3002'],
      credentials: true
    }));
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ limit: '50mb', extended: true }));
  }
  
  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (_req, res) => {
      res.json({ status: 'ok', version: '1.0.0' });
    });
    
    // Session list endpoint
    this.app.get('/api/sessions', async (_req, res) => {
      const sessions = await this.sessionManager.getAllSessions();
      res.json({ sessions });
    });
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
        log(`MTR Web Server running on port ${this.port}`);
        resolve();
      });
    });
  }
  
  async stop(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.io.close(() => {
        this.httpServer.close(() => {
          log('MTR Web Server stopped');
          resolve();
        });
      });
    });
  }
}

// Export for CLI integration
export async function startWebServer(port?: number): Promise<MTRWebServer> {
  const server = new MTRWebServer(port);
  await server.start();
  return server;
}