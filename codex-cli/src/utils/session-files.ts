import type { SessionFile } from './storage/session-storage';

import { listSessionFiles, deleteSessionFile, getSessionFileInfo } from './storage/session-storage';

export interface SessionFileMetadata {
  createdAt: string;
  lastActivity: string;
  fileUploadCount: number;
  totalUploadSize: number;
}

export interface EnhancedSession {
  id: string;
  uploadedFiles: Array<SessionFile>;
  activeTSG: string | null;
  sessionMetadata: SessionFileMetadata;
}

// In-memory session store
const sessionStore = new Map<string, EnhancedSession>();

export function getEnhancedSession(sessionId: string): EnhancedSession {
  if (!sessionStore.has(sessionId)) {
    sessionStore.set(sessionId, {
      id: sessionId,
      uploadedFiles: [],
      activeTSG: null,
      sessionMetadata: {
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        fileUploadCount: 0,
        totalUploadSize: 0
      }
    });
  }
  return sessionStore.get(sessionId)!;
}

export async function addSessionFile(
  sessionId: string,
  file: SessionFile
): Promise<void> {
  const session = getEnhancedSession(sessionId);
  session.uploadedFiles.push(file);
  session.sessionMetadata.fileUploadCount++;
  session.sessionMetadata.totalUploadSize += file.size;
  session.sessionMetadata.lastActivity = new Date().toISOString();
}

export async function removeSessionFile(
  sessionId: string,
  fileName: string
): Promise<boolean> {
  const session = getEnhancedSession(sessionId);
  const index = session.uploadedFiles.findIndex(f => f.name === fileName);
  if (index === -1) {
    return false;
  }
  
  const file = session.uploadedFiles[index];
  if (!file) {
    return false;
  }
  
  session.uploadedFiles.splice(index, 1);
  session.sessionMetadata.fileUploadCount--;
  session.sessionMetadata.totalUploadSize -= file.size;
  
  // Also delete from filesystem
  await deleteSessionFile(sessionId, fileName);
  
  return true;
}

export async function syncSessionFiles(sessionId: string): Promise<void> {
  const session = getEnhancedSession(sessionId);
  
  // Get files from disk
  const filesOnDisk = await listSessionFiles(sessionId);
  const fileNames = filesOnDisk.map(f => f.name);
  
  // Remove files from session that no longer exist on disk
  session.uploadedFiles = session.uploadedFiles.filter(
    file => fileNames.includes(file.name)
  );
  
  // Add new files from disk that aren't tracked yet
  const newFiles = filesOnDisk.filter(
    diskFile => !session.uploadedFiles.some(f => f.name === diskFile.name)
  );
  
  const fileInfoPromises = newFiles.map(diskFile => 
    getSessionFileInfo(sessionId, diskFile.name)
  );
  
  const fileInfos = await Promise.all(fileInfoPromises);
  
  for (const fileInfo of fileInfos) {
    if (fileInfo) {
      session.uploadedFiles.push(fileInfo);
    }
  }
  
  // Update metadata
  session.sessionMetadata.fileUploadCount = session.uploadedFiles.length;
  session.sessionMetadata.totalUploadSize = session.uploadedFiles.reduce((sum, f) => sum + f.size, 0);
}

export function setActiveTSG(sessionId: string, tsgName: string | null): void {
  const session = getEnhancedSession(sessionId);
  session.activeTSG = tsgName;
  session.sessionMetadata.lastActivity = new Date().toISOString();
}

export function getActiveTSG(sessionId: string): string | null {
  const session = getEnhancedSession(sessionId);
  return session.activeTSG;
}

export function clearSession(sessionId: string): void {
  sessionStore.delete(sessionId);
}

export function getSessionFiles(sessionId: string): Array<SessionFile> {
  const session = getEnhancedSession(sessionId);
  return session.uploadedFiles;
}