import { WebSession } from '../core/session-manager.js';
import { log, error as logError } from '../utils/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base directory for session persistence
const SESSION_PERSIST_DIR = path.join(__dirname, '../../data/sessions-persist');

export interface PersistedSession extends WebSession {
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

// Ensure persistence directory exists
async function ensurePersistDir(): Promise<void> {
  await fs.mkdir(SESSION_PERSIST_DIR, { recursive: true });
}

export async function saveSession(session: PersistedSession): Promise<void> {
  try {
    await ensurePersistDir();
    
    const sessionFile = path.join(SESSION_PERSIST_DIR, `${session.id}.json`);
    
    // Convert dates to ISO strings for JSON serialization
    const sessionData = {
      ...session,
      createdAt: session.createdAt.toISOString(),
      lastActivity: session.lastActivity.toISOString(),
      messages: session.messages.map(msg => ({
        ...msg,
        timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : msg.timestamp
      })),
      agentActivity: session.agentActivity?.map(activity => ({
        ...activity,
        timestamp: activity.timestamp instanceof Date ? activity.timestamp.toISOString() : activity.timestamp
      })),
      toolExecutions: session.toolExecutions?.map(exec => ({
        ...exec,
        timestamp: exec.timestamp instanceof Date ? exec.timestamp.toISOString() : exec.timestamp
      }))
    };
    
    await fs.writeFile(sessionFile, JSON.stringify(sessionData, null, 2));
    log(`Session persisted: ${session.id}`);
  } catch (err) {
    logError(`Failed to save session ${session.id}:`, err as Error);
  }
}

export async function loadSession(sessionId: string): Promise<PersistedSession | null> {
  try {
    const sessionFile = path.join(SESSION_PERSIST_DIR, `${sessionId}.json`);
    
    try {
      await fs.access(sessionFile);
    } catch {
      // File doesn't exist
      return null;
    }
    
    const data = await fs.readFile(sessionFile, 'utf-8');
    const sessionData = JSON.parse(data);
    
    // Convert ISO strings back to Date objects
    const session: PersistedSession = {
      ...sessionData,
      createdAt: new Date(sessionData.createdAt),
      lastActivity: new Date(sessionData.lastActivity),
      messages: sessionData.messages.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp)
      })),
      agentActivity: sessionData.agentActivity?.map((activity: any) => ({
        ...activity,
        timestamp: new Date(activity.timestamp)
      })),
      toolExecutions: sessionData.toolExecutions?.map((exec: any) => ({
        ...exec,
        timestamp: new Date(exec.timestamp)
      }))
    };
    
    log(`Session loaded from disk: ${sessionId}`);
    return session;
  } catch (err) {
    logError(`Failed to load session ${sessionId}:`, err as Error);
    return null;
  }
}

export async function deletePersistedSession(sessionId: string): Promise<void> {
  try {
    const sessionFile = path.join(SESSION_PERSIST_DIR, `${sessionId}.json`);
    await fs.unlink(sessionFile);
    log(`Persisted session deleted: ${sessionId}`);
  } catch (err) {
    // Ignore if file doesn't exist
    if ((err as any).code !== 'ENOENT') {
      logError(`Failed to delete persisted session ${sessionId}:`, err as Error);
    }
  }
}

export async function listPersistedSessions(): Promise<string[]> {
  try {
    await ensurePersistDir();
    const files = await fs.readdir(SESSION_PERSIST_DIR);
    return files
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
  } catch (err) {
    logError('Failed to list persisted sessions:', err as Error);
    return [];
  }
}

export async function getSessionMetadata(sessionId: string): Promise<{
  id: string;
  createdAt: string;
  lastActivity: string;
  messageCount: number;
  hasAgentActivity: boolean;
} | null> {
  try {
    const session = await loadSession(sessionId);
    if (!session) return null;
    
    return {
      id: session.id,
      createdAt: session.createdAt.toISOString(),
      lastActivity: session.lastActivity.toISOString(),
      messageCount: session.messages.length,
      hasAgentActivity: (session.agentActivity?.length || 0) > 0
    };
  } catch (err) {
    logError(`Failed to get session metadata ${sessionId}:`, err as Error);
    return null;
  }
}