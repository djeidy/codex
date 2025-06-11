import type { SessionFile } from '../types/index.js';
import { log } from '../utils/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base directory for session file storage
const SESSION_STORAGE_DIR = path.join(__dirname, '../../data/sessions');

// Ensure storage directory exists
async function ensureStorageDir(sessionId: string): Promise<string> {
  const sessionDir = path.join(SESSION_STORAGE_DIR, sessionId);
  await fs.mkdir(sessionDir, { recursive: true });
  return sessionDir;
}

export async function saveSessionFile(
  sessionId: string,
  fileName: string,
  content: Buffer
): Promise<string> {
  const sessionDir = await ensureStorageDir(sessionId);
  const filePath = path.join(sessionDir, fileName);
  
  await fs.writeFile(filePath, content);
  log(`Saved session file: ${filePath}`);
  
  return filePath;
}

export async function getSessionFileInfo(
  sessionId: string,
  fileName: string
): Promise<SessionFile | null> {
  const sessionDir = path.join(SESSION_STORAGE_DIR, sessionId);
  const filePath = path.join(sessionDir, fileName);
  
  try {
    const stats = await fs.stat(filePath);
    
    return {
      name: fileName,
      path: filePath,
      size: stats.size,
      type: getFileType(fileName),
      uploadedAt: stats.birthtime.toISOString()
    };
  } catch (error) {
    log(`Failed to get file info for ${filePath}: ${error}`);
    return null;
  }
}

export async function deleteSessionFile(
  sessionId: string,
  fileName: string
): Promise<boolean> {
  const sessionDir = path.join(SESSION_STORAGE_DIR, sessionId);
  const filePath = path.join(sessionDir, fileName);
  
  try {
    await fs.unlink(filePath);
    log(`Deleted session file: ${filePath}`);
    return true;
  } catch (error) {
    log(`Failed to delete file ${filePath}: ${error}`);
    return false;
  }
}

export async function listSessionFiles(sessionId: string): Promise<SessionFile[]> {
  const sessionDir = path.join(SESSION_STORAGE_DIR, sessionId);
  
  try {
    const fileNames = await fs.readdir(sessionDir);
    const files: SessionFile[] = [];
    
    for (const fileName of fileNames) {
      const fileInfo = await getSessionFileInfo(sessionId, fileName);
      if (fileInfo) {
        files.push(fileInfo);
      }
    }
    
    return files;
  } catch (error) {
    // Directory doesn't exist yet
    return [];
  }
}

function getFileType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase().slice(1);
  const typeMap: Record<string, string> = {
    txt: 'text',
    log: 'log',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    csv: 'csv',
    md: 'markdown',
    png: 'image',
    jpg: 'image',
    jpeg: 'image',
    gif: 'image',
    svg: 'image'
  };
  
  return typeMap[ext] || 'unknown';
}