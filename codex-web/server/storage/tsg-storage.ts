import { log } from '../utils/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base directory for TSG storage
const TSG_STORAGE_DIR = path.join(__dirname, '../../../data/tsgs');

interface TSGFile {
  path: string;
  name: string;
  size: number;
}

interface TSGMetadata {
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

// Ensure TSG storage directory exists
async function ensureTSGDir(): Promise<void> {
  await fs.mkdir(TSG_STORAGE_DIR, { recursive: true });
}

export async function createTSG(name: string, description?: string): Promise<void> {
  await ensureTSGDir();
  
  const tsgDir = path.join(TSG_STORAGE_DIR, name);
  await fs.mkdir(tsgDir, { recursive: true });
  
  // Create metadata file
  const metadata: TSGMetadata = {
    name,
    description,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  await fs.writeFile(
    path.join(tsgDir, 'metadata.json'),
    JSON.stringify(metadata, null, 2)
  );
  
  log(`Created TSG: ${name}`);
}

export async function deleteTSG(name: string): Promise<void> {
  const tsgDir = path.join(TSG_STORAGE_DIR, name);
  
  try {
    await fs.rm(tsgDir, { recursive: true, force: true });
    log(`Deleted TSG: ${name}`);
  } catch (error) {
    log(`Failed to delete TSG ${name}: ${error}`);
    throw error;
  }
}

export async function listTSGs(): Promise<string[]> {
  await ensureTSGDir();
  
  try {
    const entries = await fs.readdir(TSG_STORAGE_DIR, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  } catch (error) {
    log(`Failed to list TSGs: ${error}`);
    return [];
  }
}

export async function uploadToTSG(
  tsgName: string,
  files: Array<{ path: string; content: Buffer }>
): Promise<void> {
  const tsgDir = path.join(TSG_STORAGE_DIR, tsgName);
  
  // Ensure TSG exists
  try {
    await fs.access(tsgDir);
  } catch {
    throw new Error(`TSG ${tsgName} does not exist`);
  }
  
  // Upload files
  for (const file of files) {
    const filePath = path.join(tsgDir, file.path);
    const fileDir = path.dirname(filePath);
    
    // Ensure directory exists
    await fs.mkdir(fileDir, { recursive: true });
    
    // Write file
    await fs.writeFile(filePath, file.content);
    log(`Uploaded file to TSG ${tsgName}: ${file.path}`);
  }
  
  // Update metadata
  const metadataPath = path.join(tsgDir, 'metadata.json');
  try {
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata = JSON.parse(metadataContent) as TSGMetadata;
    metadata.updatedAt = new Date().toISOString();
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  } catch (error) {
    log(`Failed to update TSG metadata: ${error}`);
  }
}

export async function getTSGFiles(tsgName: string): Promise<TSGFile[]> {
  const tsgDir = path.join(TSG_STORAGE_DIR, tsgName);
  const files: TSGFile[] = [];
  
  async function scanDir(dir: string, relativePath: string = ''): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.join(relativePath, entry.name);
      
      if (entry.isDirectory()) {
        await scanDir(fullPath, relPath);
      } else if (entry.isFile() && entry.name !== 'metadata.json') {
        const stats = await fs.stat(fullPath);
        files.push({
          path: relPath,
          name: entry.name,
          size: stats.size
        });
      }
    }
  }
  
  try {
    await scanDir(tsgDir);
    return files;
  } catch (error) {
    log(`Failed to get TSG files for ${tsgName}: ${error}`);
    return [];
  }
}

export async function getTSGMetadata(tsgName: string): Promise<TSGMetadata | null> {
  const metadataPath = path.join(TSG_STORAGE_DIR, tsgName, 'metadata.json');
  
  try {
    const content = await fs.readFile(metadataPath, 'utf-8');
    return JSON.parse(content) as TSGMetadata;
  } catch (error) {
    log(`Failed to get TSG metadata for ${tsgName}: ${error}`);
    return null;
  }
}

export async function readTSGFile(tsgName: string, filePath: string): Promise<string> {
  const fullPath = path.join(TSG_STORAGE_DIR, tsgName, filePath);
  
  try {
    const content = await fs.readFile(fullPath, 'utf-8');
    return content;
  } catch (error) {
    log(`Failed to read TSG file ${tsgName}/${filePath}: ${error}`);
    throw new Error(`Failed to read file: ${error}`);
  }
}