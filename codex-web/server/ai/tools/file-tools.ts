import * as fs from 'fs/promises';
import path from 'path';
import { log, error as logError } from '../../utils/logger.js';

interface FileResult {
  output?: string;
  error?: string;
  metadata?: {
    size?: number;
    lines?: number;
  };
}

// Simple path validation
function isPathSafe(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  const cwd = process.cwd();
  
  // Ensure path is within current working directory or allowed paths
  if (!resolved.startsWith(cwd) && !resolved.startsWith('/tmp')) {
    return false;
  }
  
  // Block access to sensitive files
  const sensitivePatterns = [
    /\.env$/,
    /\.git\//,
    /node_modules\//,
    /\.ssh\//,
    /private/,
    /secret/,
    /password/
  ];
  
  return !sensitivePatterns.some(pattern => pattern.test(resolved));
}

export async function readFile(filePath: string): Promise<FileResult> {
  try {
    if (!isPathSafe(filePath)) {
      return { error: 'Access to this file is restricted' };
    }
    
    const resolvedPath = path.resolve(filePath);
    const stats = await fs.stat(resolvedPath);
    
    if (!stats.isFile()) {
      return { error: 'Path is not a file' };
    }
    
    // Limit file size to 10MB
    if (stats.size > 10 * 1024 * 1024) {
      return { error: 'File too large (max 10MB)' };
    }
    
    const content = await fs.readFile(resolvedPath, 'utf-8');
    const lines = content.split('\n').length;
    
    log(`Read file: ${resolvedPath} (${stats.size} bytes, ${lines} lines)`);
    
    return {
      output: content,
      metadata: {
        size: stats.size,
        lines
      }
    };
  } catch (error) {
    logError(`Failed to read file: ${filePath}`, error as Error);
    return { 
      error: error instanceof Error ? error.message : 'Failed to read file' 
    };
  }
}

export async function writeFile(filePath: string, content: string): Promise<FileResult> {
  try {
    if (!isPathSafe(filePath)) {
      return { error: 'Access to this file is restricted' };
    }
    
    const resolvedPath = path.resolve(filePath);
    const dir = path.dirname(resolvedPath);
    
    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });
    
    // Write file
    await fs.writeFile(resolvedPath, content, 'utf-8');
    
    const stats = await fs.stat(resolvedPath);
    const lines = content.split('\n').length;
    
    log(`Wrote file: ${resolvedPath} (${stats.size} bytes, ${lines} lines)`);
    
    return {
      output: `File written successfully: ${filePath}`,
      metadata: {
        size: stats.size,
        lines
      }
    };
  } catch (error) {
    logError(`Failed to write file: ${filePath}`, error as Error);
    return { 
      error: error instanceof Error ? error.message : 'Failed to write file' 
    };
  }
}

export async function listFiles(dirPath: string): Promise<FileResult> {
  try {
    if (!isPathSafe(dirPath)) {
      return { error: 'Access to this directory is restricted' };
    }
    
    const resolvedPath = path.resolve(dirPath);
    const stats = await fs.stat(resolvedPath);
    
    if (!stats.isDirectory()) {
      return { error: 'Path is not a directory' };
    }
    
    const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
    const files: string[] = [];
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        files.push(`${entry.name}/`);
      } else {
        files.push(entry.name);
      }
    }
    
    log(`Listed directory: ${resolvedPath} (${files.length} entries)`);
    
    return {
      output: files.join('\n'),
      metadata: {
        size: files.length
      }
    };
  } catch (error) {
    logError(`Failed to list directory: ${dirPath}`, error as Error);
    return { 
      error: error instanceof Error ? error.message : 'Failed to list directory' 
    };
  }
}