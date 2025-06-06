import * as fsSync from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';

// Find the project root by looking for the tsgs directory relative to cwd
function findProjectRoot(): string {
  // Start from current working directory
  let currentDir = process.cwd();
  
  // Walk up the directory tree looking for a directory that contains package.json with name "mtr-monorepo"
  while (currentDir !== path.dirname(currentDir)) {
    try {
      const packageJsonPath = path.join(currentDir, 'package.json');
      if (fsSync.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fsSync.readFileSync(packageJsonPath, 'utf-8'));
        if (packageJson.name === 'mtr-monorepo') {
          return currentDir;
        }
      }
    } catch {
      // Ignore errors and continue searching
    }
    currentDir = path.dirname(currentDir);
  }
  
  // Fallback to current working directory if not found
  return process.cwd();
}

// Use repository root for storage
const REPO_ROOT = findProjectRoot();
const TSGS_DIR = path.join(REPO_ROOT, 'tsgs');


interface TSGMetadata {
  name: string;
  createdAt: string;
  updatedAt: string;
  description?: string;
  tags?: Array<string>;
}

export function getTSGStoragePath(tsgName: string): string {
  return path.join(TSGS_DIR, sanitizeTSGName(tsgName));
}

export async function createTSG(tsgName: string, description?: string): Promise<void> {
  const tsgPath = getTSGStoragePath(tsgName);
  await fs.mkdir(tsgPath, { recursive: true });
  
  // Create metadata file
  const metadata: TSGMetadata = {
    name: tsgName,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    description
  };
  
  await fs.writeFile(
    path.join(tsgPath, '.metadata.json'),
    JSON.stringify(metadata, null, 2)
  );
}

export async function deleteTSG(tsgName: string): Promise<void> {
  const tsgPath = getTSGStoragePath(tsgName);
  await fs.rm(tsgPath, { recursive: true, force: true });
}

export async function uploadToTSG(
  tsgName: string,
  files: Array<{ path: string; content: Buffer | string }>
): Promise<void> {
  const tsgPath = getTSGStoragePath(tsgName);
  
  const uploadPromises = files.map(async (file) => {
    const filePath = path.join(tsgPath, file.path);
    const dirPath = path.dirname(filePath);
    
    await fs.mkdir(dirPath, { recursive: true });
    await fs.writeFile(filePath, file.content);
  });
  
  await Promise.all(uploadPromises);
  
  // Update metadata
  const metadata = await getTSGMetadata(tsgName);
  if (metadata) {
    metadata.updatedAt = new Date().toISOString();
    await fs.writeFile(
      path.join(tsgPath, '.metadata.json'),
      JSON.stringify(metadata, null, 2)
    );
  }
}

export async function listTSGs(): Promise<Array<string>> {
  try {
    const entries = await fs.readdir(TSGS_DIR, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      await fs.mkdir(TSGS_DIR, { recursive: true });
      return [];
    }
    throw error;
  }
}

function sanitizeTSGName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .substring(0, 100); // Limit length
}

export async function getTSGMetadata(tsgName: string): Promise<TSGMetadata | null> {
  try {
    const metadataPath = path.join(getTSGStoragePath(tsgName), '.metadata.json');
    const content = await fs.readFile(metadataPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export async function getTSGFiles(tsgName: string): Promise<Array<{
  path: string;
  name: string;
  size: number;
  isDirectory: boolean;
}>> {
  const tsgPath = getTSGStoragePath(tsgName);
  const files: Array<{
    path: string;
    name: string;
    size: number;
    isDirectory: boolean;
  }> = [];
  
  async function scanDirectory(dirPath: string, relativePath: string = '') {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    const scanPromises: Array<Promise<void>> = [];
    
    for (const entry of entries) {
      // Skip hidden files and metadata
      if (entry.name.startsWith('.')) {
        continue;
      }
      
      const fullPath = path.join(dirPath, entry.name);
      const relPath = path.join(relativePath, entry.name);
      
      if (entry.isDirectory()) {
        files.push({
          path: relPath,
          name: entry.name,
          size: 0,
          isDirectory: true
        });
        scanPromises.push(scanDirectory(fullPath, relPath));
      } else {
        scanPromises.push(
          fs.stat(fullPath).then(stats => {
            files.push({
              path: relPath,
              name: entry.name,
              size: stats.size,
              isDirectory: false
            });
          })
        );
      }
    }
    
    await Promise.all(scanPromises);
  }
  
  await scanDirectory(tsgPath);
  return files;
}

// Batch upload with progress callback
export async function uploadToTSGWithProgress(
  tsgName: string,
  files: Array<{ path: string; content: Buffer | string }>,
  onProgress?: (processed: number, total: number) => void
): Promise<void> {
  const tsgPath = getTSGStoragePath(tsgName);
  let processed = 0;
  
  // Process files sequentially to maintain progress tracking
  const processFile = async (file: { path: string; content: Buffer | string }) => {
    const filePath = path.join(tsgPath, file.path);
    const dirPath = path.dirname(filePath);
    
    await fs.mkdir(dirPath, { recursive: true });
    await fs.writeFile(filePath, file.content);
    
    processed++;
    if (onProgress) {
      onProgress(processed, files.length);
    }
  };
  
  // Process files sequentially for progress tracking
  for (const file of files) {
    // eslint-disable-next-line no-await-in-loop
    await processFile(file);
  }
  
  // Update metadata
  const metadata = await getTSGMetadata(tsgName);
  if (metadata) {
    metadata.updatedAt = new Date().toISOString();
    await fs.writeFile(
      path.join(tsgPath, '.metadata.json'),
      JSON.stringify(metadata, null, 2)
    );
  }
}