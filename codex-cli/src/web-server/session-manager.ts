import { v4 as uuidv4 } from 'uuid';

export interface WebSession {
  id: string;
  socketId: string;
  config: {
    provider: string;
    model: string;
    apiKey?: string;
    approvalMode?: 'suggest' | 'auto-edit' | 'full-auto';
  };
  messages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
  }>;
  lastResponseId?: string;
  createdAt: Date;
  lastActivity: Date;
}

interface CreateSessionOptions {
  socketId: string;
  config: WebSession['config'];
}

export class WebSessionManager {
  private sessions: Map<string, WebSession> = new Map();
  // TODO: Add Redis support for production
  
  constructor() {
    // Initialize session cleanup interval
    setInterval(() => this.cleanupStaleSessions(), 60000); // Every minute
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
    
    // TODO: Persist to Redis if available
    // if (this.redis) {
    //   this.redis.set(
    //     `session:${session.id}`,
    //     JSON.stringify(session),
    //     'EX',
    //     86400 // 24 hour expiry
    //   );
    // }
    
    return session;
  }
  
  async getSession(sessionId: string): Promise<WebSession | null> {
    // Check memory first
    if (this.sessions.has(sessionId)) {
      const session = this.sessions.get(sessionId)!;
      session.lastActivity = new Date();
      return session;
    }
    
    // TODO: Check Redis
    // if (this.redis) {
    //   const data = await this.redis.get(`session:${sessionId}`);
    //   if (data) {
    //     const session = JSON.parse(data);
    //     // Convert date strings back to Date objects
    //     session.createdAt = new Date(session.createdAt);
    //     session.lastActivity = new Date();
    //     session.messages.forEach(msg => {
    //       msg.timestamp = new Date(msg.timestamp);
    //     });
    //     this.sessions.set(sessionId, session);
    //     return session;
    //   }
    // }
    
    return null;
  }
  
  async updateSession(session: WebSession): Promise<void> {
    session.lastActivity = new Date();
    this.sessions.set(session.id, session);
    
    // TODO: Update in Redis
    // if (this.redis) {
    //   await this.redis.set(
    //     `session:${session.id}`,
    //     JSON.stringify(session),
    //     'EX',
    //     86400 // 24 hour expiry
    //   );
    // }
  }
  
  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    
    // TODO: Delete from Redis
    // if (this.redis) {
    //   await this.redis.del(`session:${sessionId}`);
    // }
  }
  
  async getAllSessions(): Promise<Array<WebSession>> {
    // For now, just return in-memory sessions
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
        // Session cleaned up: ${id}
      }
    }
  }
}