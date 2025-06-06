import * as fs from 'fs/promises';
import * as path from 'path';

// When running from codex-cli/bin/codex.js, we need to go up to the project root
// process.cwd() should be the project root when running via run-web-ui.sh
const SESSIONS_DIR = path.join(process.cwd(), 'sessions');

export interface SessionFile {
  name: string;
  path: string;
  size: number;
  uploadedAt: string;
  type: string;
}

export function getSessionStoragePath(sessionId: string): string {
  return path.join(SESSIONS_DIR, sessionId);
}

export async function initializeSessionStorage(sessionId: string): Promise<void> {
  const sessionPath = getSessionStoragePath(sessionId);
  
  await fs.mkdir(sessionPath, { recursive: true });
}

export async function saveSessionFile(
  sessionId: string,
  fileName: string,
  content: Buffer | string
): Promise<string> {
  await initializeSessionStorage(sessionId);
  
  const sessionPath = getSessionStoragePath(sessionId);
  const filePath = path.join(sessionPath, sanitizeFileName(fileName));
  
  await fs.writeFile(filePath, content);
  return filePath;
}

export async function cleanupOldSessions(maxAgeHours: number = 24): Promise<void> {
  try {
    const sessions = await fs.readdir(SESSIONS_DIR);
    const now = Date.now();
    const maxAge = maxAgeHours * 60 * 60 * 1000;
    
    const cleanupPromises = sessions.map(async (sessionId) => {
      const sessionPath = path.join(SESSIONS_DIR, sessionId);
      const stats = await fs.stat(sessionPath);
      
      if (now - stats.mtimeMs > maxAge) {
        await fs.rm(sessionPath, { recursive: true, force: true });
      }
    });
    
    await Promise.all(cleanupPromises);
  } catch (error) {
    // Ignore errors during cleanup
  }
}

export async function listSessionFiles(sessionId: string): Promise<Array<{
  name: string;
  path: string;
  size: number;
}>> {
  const sessionPath = getSessionStoragePath(sessionId);
  
  try {
    const files = await fs.readdir(sessionPath);
    const fileDetails = await Promise.all(files.map(async (fileName) => {
      const filePath = path.join(sessionPath, fileName);
      const stats = await fs.stat(filePath);
      return {
        name: fileName,
        path: filePath,
        size: stats.size
      };
    }));
    
    return fileDetails;
  } catch (error) {
    // Directory might not exist if no files uploaded
    return [];
  }
}

export function sanitizeFileName(fileName: string): string {
  // Remove path traversal attempts and invalid characters
  return fileName
    .replace(/[.]{2,}/g, '')
    .replace(/[/\\]/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function deleteSessionFile(
  sessionId: string,
  fileName: string
): Promise<void> {
  const filePath = path.join(
    getSessionStoragePath(sessionId),
    sanitizeFileName(fileName)
  );
  
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

export async function getSessionFileInfo(
  sessionId: string,
  fileName: string
): Promise<SessionFile | null> {
  const filePath = path.join(
    getSessionStoragePath(sessionId),
    sanitizeFileName(fileName)
  );
  
  try {
    const stats = await fs.stat(filePath);
    const content = await fs.readFile(filePath);
    
    return {
      name: fileName,
      path: filePath,
      size: stats.size,
      uploadedAt: stats.birthtime.toISOString(),
      type: detectFileType(fileName, content)
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function detectFileType(fileName: string, content: Buffer): string {
  const ext = path.extname(fileName).toLowerCase();
  
  // Check by extension first
  const extTypeMap: Record<string, string> = {
    '.log': 'log',
    '.txt': 'text',
    '.json': 'json',
    '.xml': 'xml',
    '.csv': 'csv',
    '.yaml': 'yaml',
    '.yml': 'yaml'
  };
  
  if (extTypeMap[ext]) {
    return extTypeMap[ext];
  }
  
  // Try to detect from content
  const textContent = content.toString('utf-8', 0, 1000);
  
  if (textContent.trim().startsWith('{') || textContent.trim().startsWith('[')) {
    return 'json';
  }
  if (textContent.trim().startsWith('<?xml')) {
    return 'xml';
  }
  
  return 'text';
}