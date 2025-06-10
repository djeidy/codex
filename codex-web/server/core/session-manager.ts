import { v4 as uuidv4 } from 'uuid';
import type { SessionConfig } from '../types/index.js';
import { log } from '../utils/logger.js';

export interface WebSession {
  id: string;
  socketId: string;
  config: SessionConfig;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
  }>;
  lastResponseId?: string;
  createdAt: Date;
  lastActivity: Date;
  uploadedFiles?: string[];
  activeTSG?: string | null;
  sessionMetadata?: {
    createdAt: string;
    lastActivity: string;
    fileUploadCount: number;
    totalUploadSize: number;
  };
}

interface CreateSessionOptions {
  socketId: string;
  config: SessionConfig;
}

export class WebSessionManager {
  private sessions: Map<string, WebSession> = new Map();
  private cleanupInterval: NodeJS.Timeout;
  
  constructor() {
    // Initialize session cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanupStaleSessions(), 60000); // Every minute
    log('Session manager initialized with cleanup interval');
  }
  
  createSession(options: CreateSessionOptions): WebSession {
    const now = new Date();
    const session: WebSession = {
      id: uuidv4(),
      socketId: options.socketId,
      config: options.config,
      messages: [],
      createdAt: now,
      lastActivity: now,
      uploadedFiles: [],
      activeTSG: null,
      sessionMetadata: {
        createdAt: now.toISOString(),
        lastActivity: now.toISOString(),
        fileUploadCount: 0,
        totalUploadSize: 0
      }
    };
    
    this.sessions.set(session.id, session);
    log(`Session created: ${session.id} for socket: ${options.socketId}`);
    
    return session;
  }
  
  async getSession(sessionId: string): Promise<WebSession | null> {
    // Check memory first
    if (this.sessions.has(sessionId)) {
      const session = this.sessions.get(sessionId)!;
      const now = new Date();
      session.lastActivity = now;
      if (session.sessionMetadata) {
        session.sessionMetadata.lastActivity = now.toISOString();
      }
      return session;
    }
    
    log(`Session not found: ${sessionId}`);
    return null;
  }
  
  async updateSession(session: WebSession): Promise<void> {
    session.lastActivity = new Date();
    if (session.sessionMetadata) {
      session.sessionMetadata.lastActivity = session.lastActivity.toISOString();
    }
    this.sessions.set(session.id, session);
    log(`Session updated: ${session.id}`);
  }
  
  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    log(`Session deleted: ${sessionId}`);
  }
  
  async getAllSessions(): Promise<Array<WebSession>> {
    // Return sessions sorted by last activity
    return Array.from(this.sessions.values())
      .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
  }
  
  async getSessionsBySocketId(socketId: string): Promise<Array<WebSession>> {
    return Array.from(this.sessions.values())
      .filter(session => session.socketId === socketId);
  }
  
  private cleanupStaleSessions(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivity.getTime() > maxAge) {
        this.sessions.delete(id);
        log(`Stale session cleaned up: ${id}`);
      }
    }
  }
  
  // Clean up resources
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.sessions.clear();
    log('Session manager destroyed');
  }
}