import { v4 as uuidv4 } from 'uuid';
import type { SessionConfig } from '../types/index.js';
import { log } from '../utils/logger.js';
import { 
  saveSession, 
  loadSession, 
  deletePersistedSession,
  listPersistedSessions,
  type PersistedSession 
} from '../storage/session-persistence.js';

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
  agentActivity?: Array<{
    id: string;
    timestamp: Date;
    type: 'tool_execution' | 'content' | 'error';
    data: any;
  }>;
  toolExecutions?: Array<{
    id: string;
    name: string;
    arguments: any;
    result: any;
    timestamp: Date;
  }>;
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
      },
      agentActivity: [],
      toolExecutions: []
    };
    
    this.sessions.set(session.id, session);
    
    // Save to disk asynchronously
    saveSession(session as PersistedSession).catch(err => 
      log(`Failed to persist new session: ${err}`)
    );
    
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
    
    // Try loading from disk
    const persistedSession = await loadSession(sessionId);
    if (persistedSession) {
      // Update activity timestamps
      const now = new Date();
      persistedSession.lastActivity = now;
      if (persistedSession.sessionMetadata) {
        persistedSession.sessionMetadata.lastActivity = now.toISOString();
      }
      
      // Cache in memory
      this.sessions.set(sessionId, persistedSession);
      log(`Session loaded from disk: ${sessionId}`);
      
      return persistedSession;
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
    
    // Save to disk asynchronously
    saveSession(session as PersistedSession).catch(err => 
      log(`Failed to persist session update: ${err}`)
    );
    
    log(`Session updated: ${session.id}`);
  }
  
  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    
    // Delete from disk
    await deletePersistedSession(sessionId);
    
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
  
  async listAvailableSessions(): Promise<Array<{ id: string; createdAt: string; lastActivity: string; messageCount: number }>> {
    // Get all persisted session IDs
    const persistedIds = await listPersistedSessions();
    
    // Combine with in-memory sessions
    const allSessionIds = new Set([
      ...this.sessions.keys(),
      ...persistedIds
    ]);
    
    const sessionList: Array<{ id: string; createdAt: string; lastActivity: string; messageCount: number }> = [];
    for (const id of allSessionIds) {
      const session = await this.getSession(id);
      if (session) {
        sessionList.push({
          id: session.id,
          createdAt: session.createdAt.toISOString(),
          lastActivity: session.lastActivity.toISOString(),
          messageCount: session.messages.length
        });
      }
    }
    
    // Sort by last activity (newest first)
    return sessionList.sort((a, b) => 
      new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    );
  }
  
  private cleanupStaleSessions(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivity.getTime() > maxAge) {
        // Only remove from memory cache, not from disk
        this.sessions.delete(id);
        log(`Stale session removed from memory cache: ${id}`);
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