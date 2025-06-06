import type { FunctionTool } from 'openai/resources/responses/responses.mjs';

import { getTSGStoragePath } from '../../storage/tsg-storage.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export const tsgReaderTool: FunctionTool = {
  type: 'function',
  name: 'read_tsg',
  description: `Access troubleshooting guide (TSG) documentation for known solutions and procedures.

This tool helps you:
- Browse TSG file structure and contents
- Read specific troubleshooting procedures
- Search across all TSG files for relevant solutions
- Reference established fixes for common issues

IMPORTANT: Use the exact TSG name from the "Available TSGs" list (e.g., "Meeting_Room_Teams_TSG").

Examples:
1. List files in TSG: {"tsgName": "Meeting_Room_Teams_TSG"}
2. Read specific file: {"tsgName": "Meeting_Room_Teams_TSG", "fileName": "Rigel/authentication/mtr_sign_in.md"}
3. Search in TSG: {"tsgName": "Meeting_Room_Teams_TSG", "searchQuery": "authentication error"}`,
  strict: false,
  parameters: {
    type: 'object',
    properties: {
      tsgName: {
        type: 'string',
        description: 'Exact name of the TSG directory (e.g., "Meeting_Room_Teams_TSG"). Do NOT include paths or file extensions.'
      },
      fileName: {
        type: 'string',
        description: 'Relative path to a specific file within the TSG (e.g., "Rigel/authentication/mtr_sign_in.md"). Optional - omit to list all files.'
      },
      searchQuery: {
        type: 'string',
        description: 'Text to search for within TSG files. Cannot be used with fileName.'
      }
    },
    required: ['tsgName'],
    additionalProperties: false
  }
};

export interface TSGFile {
  path: string;
  name: string;
  size: number;
  isDirectory: boolean;
}

export async function executeTSGReader(args: {
  tsgName: string;
  fileName?: string;
  searchQuery?: string;
}): Promise<string | Array<TSGFile>> {
  const tsgPath = getTSGStoragePath(args.tsgName);
  
  // If no specific file requested, list TSG contents
  if (!args.fileName && !args.searchQuery) {
    return listTSGFiles(tsgPath);
  }
  
  // If search query provided, search across all TSG files
  if (args.searchQuery) {
    return searchTSGContent(tsgPath, args.searchQuery);
  }
  
  // Read specific file
  const filePath = path.join(tsgPath, args.fileName!);
  
  // Security check
  const resolvedPath = path.resolve(filePath);
  const resolvedTSGPath = path.resolve(tsgPath);
  if (!resolvedPath.startsWith(resolvedTSGPath)) {
    throw new Error('Access denied: File path is outside TSG directory');
  }
  
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`File '${args.fileName}' not found in TSG '${args.tsgName}'`);
    }
    throw error;
  }
}

async function listTSGFiles(tsgPath: string, relativePath: string = ''): Promise<Array<TSGFile>> {
  const fullPath = path.join(tsgPath, relativePath);
  
  try {
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    
    const filePromises = entries.map(async (entry) => {
      const entryPath = path.join(relativePath, entry.name);
      
      if (entry.isDirectory()) {
        const dirFile: TSGFile = {
          path: entryPath,
          name: entry.name,
          size: 0,
          isDirectory: true
        };
        
        // Recursively list subdirectories
        const subFiles = await listTSGFiles(tsgPath, entryPath);
        return [dirFile, ...subFiles];
      } else {
        const stats = await fs.stat(path.join(fullPath, entry.name));
        const file: TSGFile = {
          path: entryPath,
          name: entry.name,
          size: stats.size,
          isDirectory: false
        };
        return [file];
      }
    });
    
    const allFiles = await Promise.all(filePromises);
    return allFiles.flat();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`TSG '${path.basename(tsgPath)}' not found`);
    }
    throw error;
  }
}

async function searchTSGContent(tsgPath: string, query: string): Promise<string> {
  const results: Array<string> = [];
  const files = await listTSGFiles(tsgPath);
  
  const searchPromises = files.map(async (file) => {
    if (file.isDirectory) {
      return null;
    }
    
    // Only search in text files
    const ext = path.extname(file.name).toLowerCase();
    if (!['.md', '.txt', '.log', '.json', '.yaml', '.yml'].includes(ext)) {
      return null;
    }
    
    try {
      const content = await fs.readFile(path.join(tsgPath, file.path), 'utf-8');
      const lines = content.split('\n');
      const matches: Array<string> = [];
      
      lines.forEach((line, index) => {
        if (line.toLowerCase().includes(query.toLowerCase())) {
          matches.push(`  Line ${index + 1}: ${line.trim()}`);
        }
      });
      
      if (matches.length > 0) {
        const result = `\n### ${file.path} (${matches.length} matches)\n${matches.slice(0, 5).join('\n')}`;
        if (matches.length > 5) {
          return `${result}\n  ... and ${matches.length - 5} more matches`;
        }
        return result;
      }
    } catch (error) {
      // Skip files that can't be read
      return null;
    }
    
    return null;
  });
  
  const searchResults = await Promise.all(searchPromises);
  results.push(...searchResults.filter((result): result is string => result != null));
  
  if (results.length === 0) {
    return `No matches found for "${query}" in TSG files`;
  }
  
  return `Search results for "${query}":\n${results.join('\n')}`;
}

// Helper to list available TSGs
export async function listAvailableTSGs(): Promise<Array<string>> {
  const tsgsPath = path.dirname(getTSGStoragePath(''));
  
  try {
    const entries = await fs.readdir(tsgsPath, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}