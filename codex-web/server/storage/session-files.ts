import type { SessionFile, EnhancedSession } from '../types/index.js';
import { log } from '../utils/logger.js';
import * as fs from 'fs/promises';

// In-memory storage for session files
const sessionFilesMap = new Map<string, SessionFile[]>();
const sessionMetadataMap = new Map<string, {
  activeTSG: string | null;
  fileUploadCount: number;
  totalUploadSize: number;
}>();

export function getEnhancedSession(sessionId: string): EnhancedSession {
  const files = sessionFilesMap.get(sessionId) || [];
  const metadata = sessionMetadataMap.get(sessionId) || {
    activeTSG: null,
    fileUploadCount: 0,
    totalUploadSize: 0
  };

  return {
    id: sessionId,
    uploadedFiles: files,
    activeTSG: metadata.activeTSG,
    sessionMetadata: {
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      fileUploadCount: metadata.fileUploadCount,
      totalUploadSize: metadata.totalUploadSize
    }
  } as EnhancedSession;
}

export function setActiveTSG(sessionId: string, tsgName: string | null): void {
  const metadata = sessionMetadataMap.get(sessionId) || {
    activeTSG: null,
    fileUploadCount: 0,
    totalUploadSize: 0
  };
  
  metadata.activeTSG = tsgName;
  sessionMetadataMap.set(sessionId, metadata);
  log(`Set active TSG for session ${sessionId}: ${tsgName}`);
}

export async function addSessionFile(sessionId: string, file: SessionFile): Promise<void> {
  const files = sessionFilesMap.get(sessionId) || [];
  const metadata = sessionMetadataMap.get(sessionId) || {
    activeTSG: null,
    fileUploadCount: 0,
    totalUploadSize: 0
  };
  
  // Check if file already exists
  const existingIndex = files.findIndex(f => f.name === file.name);
  if (existingIndex >= 0) {
    // Update existing file
    files[existingIndex] = file;
  } else {
    // Add new file
    files.push(file);
    metadata.fileUploadCount++;
  }
  
  // Update total size
  metadata.totalUploadSize = files.reduce((sum, f) => sum + f.size, 0);
  
  sessionFilesMap.set(sessionId, files);
  sessionMetadataMap.set(sessionId, metadata);
  log(`Added file ${file.name} to session ${sessionId}`);
}

export async function removeSessionFile(sessionId: string, fileName: string): Promise<boolean> {
  const files = sessionFilesMap.get(sessionId) || [];
  const metadata = sessionMetadataMap.get(sessionId) || {
    activeTSG: null,
    fileUploadCount: 0,
    totalUploadSize: 0
  };
  
  const fileIndex = files.findIndex(f => f.name === fileName);
  if (fileIndex < 0) {
    return false;
  }
  
  // Remove file from storage
  const file = files[fileIndex];
  try {
    await fs.unlink(file.path);
  } catch (error) {
    log(`Failed to delete file ${file.path}: ${error}`);
  }
  
  // Remove from list
  files.splice(fileIndex, 1);
  metadata.fileUploadCount = files.length;
  metadata.totalUploadSize = files.reduce((sum, f) => sum + f.size, 0);
  
  sessionFilesMap.set(sessionId, files);
  sessionMetadataMap.set(sessionId, metadata);
  log(`Removed file ${fileName} from session ${sessionId}`);
  
  return true;
}

export async function syncSessionFiles(sessionId: string): Promise<void> {
  const files = sessionFilesMap.get(sessionId) || [];
  const validFiles: SessionFile[] = [];
  
  // Check if each file still exists
  for (const file of files) {
    try {
      await fs.access(file.path);
      validFiles.push(file);
    } catch {
      log(`File ${file.path} no longer exists, removing from session`);
    }
  }
  
  sessionFilesMap.set(sessionId, validFiles);
  
  // Update metadata
  const metadata = sessionMetadataMap.get(sessionId) || {
    activeTSG: null,
    fileUploadCount: 0,
    totalUploadSize: 0
  };
  metadata.fileUploadCount = validFiles.length;
  metadata.totalUploadSize = validFiles.reduce((sum, f) => sum + f.size, 0);
  sessionMetadataMap.set(sessionId, metadata);
}

export function getSessionFiles(sessionId: string): SessionFile[] {
  return sessionFilesMap.get(sessionId) || [];
}