# Phase 3: TSG Management System (Backend) - Technical Implementation Guide

## Overview
This phase implements the backend infrastructure for TSG (Troubleshooting Guide) management, including WebSocket handlers, file upload processing, and configuration management.

## Step 1: Update WebSocket Message Types

### 1.1 Define message types
**File**: `codex-cli/src/web-server/types.ts` (create if doesn't exist)

```typescript
// TSG-related message types
export interface TSGMessage {
  type: 'tsg:create' | 'tsg:list' | 'tsg:select' | 'tsg:delete' | 'tsg:upload' | 'tsg:get-files';
  sessionId: string;
  data?: any;
}

export interface TSGCreateMessage extends TSGMessage {
  type: 'tsg:create';
  data: {
    name: string;
  };
}

export interface TSGSelectMessage extends TSGMessage {
  type: 'tsg:select';
  data: {
    name: string | null; // null to deselect
  };
}

export interface TSGUploadMessage extends TSGMessage {
  type: 'tsg:upload';
  data: {
    tsgName: string;
    files: Array<{
      path: string;
      content: string; // Base64 encoded
      type: string;
      size: number;
    }>;
  };
}

// Session file upload message
export interface SessionFileUploadMessage {
  type: 'session:upload';
  sessionId: string;
  data: {
    files: Array<{
      name: string;
      content: string; // Base64 encoded
      type: string;
      size: number;
    }>;
  };
}

// Response messages
export interface TSGListResponse {
  type: 'tsg:list:response';
  data: {
    tsgs: Array<{
      name: string;
      fileCount: number;
      createdAt: string;
      size: number;
    }>;
    activeTSG: string | null;
  };
}

export interface TSGFilesResponse {
  type: 'tsg:files:response';
  data: {
    tsgName: string;
    files: Array<{
      path: string;
      name: string;
      size: number;
      type: string;
    }>;
  };
}
```

## Step 2: Implement TSG WebSocket Handlers

### 2.1 Update websocket handler
**File**: `codex-cli/src/web-server/websocket-handler.ts`

```typescript
import { 
  TSGMessage, 
  TSGCreateMessage, 
  TSGSelectMessage, 
  TSGUploadMessage,
  SessionFileUploadMessage,
  TSGListResponse,
  TSGFilesResponse 
} from './types';
import { 
  createTSG, 
  deleteTSG, 
  listTSGs, 
  uploadToTSG,
  getTSGFiles 
} from '../utils/storage/tsg-storage';
import { 
  saveSessionFile, 
  listSessionFiles 
} from '../utils/storage/session-storage';
import { getConfig, updateConfig } from '../utils/config';

// Add to existing WebSocket handler
export class WebSocketHandler {
  // ... existing code ...

  private async handleTSGMessage(socket: Socket, message: TSGMessage) {
    try {
      switch (message.type) {
        case 'tsg:create':
          await this.handleTSGCreate(socket, message as TSGCreateMessage);
          break;
        case 'tsg:list':
          await this.handleTSGList(socket, message);
          break;
        case 'tsg:select':
          await this.handleTSGSelect(socket, message as TSGSelectMessage);
          break;
        case 'tsg:delete':
          await this.handleTSGDelete(socket, message);
          break;
        case 'tsg:upload':
          await this.handleTSGUpload(socket, message as TSGUploadMessage);
          break;
        case 'tsg:get-files':
          await this.handleTSGGetFiles(socket, message);
          break;
      }
    } catch (error) {
      socket.emit('error', {
        type: 'tsg:error',
        message: error.message,
        originalType: message.type
      });
    }
  }

  private async handleTSGCreate(socket: Socket, message: TSGCreateMessage) {
    const { name } = message.data;
    
    // Validate name
    if (!name || name.length < 3 || name.length > 100) {
      throw new Error('TSG name must be between 3 and 100 characters');
    }
    
    await createTSG(name);
    
    // Send updated list
    await this.handleTSGList(socket, message);
    
    socket.emit('message', {
      type: 'tsg:create:success',
      data: { name }
    });
  }

  private async handleTSGList(socket: Socket, message: TSGMessage) {
    const tsgs = await listTSGs();
    const config = await getConfig();
    const activeTSG = config.activeTSG || null;
    
    // Get details for each TSG
    const tsgDetails = await Promise.all(tsgs.map(async (name) => {
      const files = await getTSGFiles(name);
      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      
      return {
        name,
        fileCount: files.length,
        createdAt: new Date().toISOString(), // Would need to track this
        size: totalSize
      };
    }));
    
    const response: TSGListResponse = {
      type: 'tsg:list:response',
      data: {
        tsgs: tsgDetails,
        activeTSG
      }
    };
    
    socket.emit('message', response);
  }

  private async handleTSGSelect(socket: Socket, message: TSGSelectMessage) {
    const { name } = message.data;
    
    // Update configuration
    const config = await getConfig();
    config.activeTSG = name;
    await updateConfig(config);
    
    // Update session if needed
    const session = this.sessionManager.getSession(message.sessionId);
    if (session) {
      session.activeTSG = name;
    }
    
    socket.emit('message', {
      type: 'tsg:select:success',
      data: { activeTSG: name }
    });
  }

  private async handleTSGDelete(socket: Socket, message: TSGMessage) {
    const { name } = message.data;
    
    // Check if it's the active TSG
    const config = await getConfig();
    if (config.activeTSG === name) {
      config.activeTSG = null;
      await updateConfig(config);
    }
    
    await deleteTSG(name);
    
    // Send updated list
    await this.handleTSGList(socket, message);
    
    socket.emit('message', {
      type: 'tsg:delete:success',
      data: { name }
    });
  }

  private async handleTSGUpload(socket: Socket, message: TSGUploadMessage) {
    const { tsgName, files } = message.data;
    
    // Convert base64 files to buffers
    const processedFiles = files.map(file => ({
      path: file.path,
      content: Buffer.from(file.content, 'base64')
    }));
    
    // Upload files
    await uploadToTSG(tsgName, processedFiles);
    
    // Send file list response
    await this.handleTSGGetFiles(socket, { ...message, data: { name: tsgName } });
    
    socket.emit('message', {
      type: 'tsg:upload:success',
      data: { tsgName, fileCount: files.length }
    });
  }

  private async handleTSGGetFiles(socket: Socket, message: TSGMessage) {
    const { name } = message.data;
    const files = await getTSGFiles(name);
    
    const response: TSGFilesResponse = {
      type: 'tsg:files:response',
      data: {
        tsgName: name,
        files: files.map(file => ({
          path: file.path,
          name: file.name,
          size: file.size,
          type: this.getFileType(file.name)
        }))
      }
    };
    
    socket.emit('message', response);
  }

  private async handleSessionFileUpload(socket: Socket, message: SessionFileUploadMessage) {
    const { sessionId, data } = message;
    const { files } = data;
    
    const uploadedFiles = await Promise.all(files.map(async (file) => {
      const content = Buffer.from(file.content, 'base64');
      const filePath = await saveSessionFile(sessionId, file.name, content);
      return {
        name: file.name,
        path: filePath,
        size: file.size,
        type: file.type
      };
    }));
    
    socket.emit('message', {
      type: 'session:upload:success',
      data: {
        files: uploadedFiles
      }
    });
    
    // Update session context
    const session = this.sessionManager.getSession(sessionId);
    if (session) {
      session.uploadedFiles = await listSessionFiles(sessionId);
    }
  }

  private getFileType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const typeMap: Record<string, string> = {
      'md': 'markdown',
      'txt': 'text',
      'log': 'log',
      'json': 'json',
      'yaml': 'yaml',
      'yml': 'yaml',
      'png': 'image',
      'jpg': 'image',
      'jpeg': 'image',
      'gif': 'image'
    };
    return typeMap[ext || ''] || 'unknown';
  }
}
```

## Step 3: Update Configuration System

### 3.1 Extend configuration types
**File**: `codex-cli/src/utils/config.ts`

```typescript
// Add to existing config interface
export interface CodexConfig {
  // ... existing fields ...
  
  // TSG configuration
  activeTSG?: string | null;
  tsgSettings?: {
    maxUploadSize: number; // in MB
    allowedFileTypes: string[];
    autoCleanupEnabled: boolean;
    cleanupAgeHours: number;
  };
  
  // Session settings
  sessionSettings?: {
    maxUploadSize: number; // in MB
    sessionTimeout: number; // in hours
    maxFilesPerSession: number;
  };
}

// Default TSG settings
export const DEFAULT_TSG_SETTINGS = {
  maxUploadSize: 100, // 100MB
  allowedFileTypes: [
    '.md', '.txt', '.log', '.json', '.yaml', '.yml',
    '.png', '.jpg', '.jpeg', '.gif', '.svg',
    '.pdf', '.docx', '.xlsx'
  ],
  autoCleanupEnabled: true,
  cleanupAgeHours: 24 * 7 // 1 week
};

export const DEFAULT_SESSION_SETTINGS = {
  maxUploadSize: 50, // 50MB
  sessionTimeout: 24, // 24 hours
  maxFilesPerSession: 100
};
```

## Step 4: Implement File Upload Validation

### 4.1 Create upload validator
**New file**: `codex-cli/src/utils/storage/upload-validator.ts`

```typescript
import { getConfig } from '../config';
import * as path from 'path';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export async function validateTSGUpload(files: Array<{
  path: string;
  size: number;
  type?: string;
}>): Promise<ValidationResult> {
  const config = await getConfig();
  const settings = config.tsgSettings || DEFAULT_TSG_SETTINGS;
  
  // Check total size
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const maxSizeBytes = settings.maxUploadSize * 1024 * 1024;
  
  if (totalSize > maxSizeBytes) {
    return {
      valid: false,
      error: `Total upload size ${(totalSize / 1024 / 1024).toFixed(2)}MB exceeds limit of ${settings.maxUploadSize}MB`
    };
  }
  
  // Check file types
  for (const file of files) {
    const ext = path.extname(file.path).toLowerCase();
    if (!settings.allowedFileTypes.includes(ext)) {
      return {
        valid: false,
        error: `File type '${ext}' is not allowed. Allowed types: ${settings.allowedFileTypes.join(', ')}`
      };
    }
    
    // Security: Check for path traversal
    if (file.path.includes('..') || path.isAbsolute(file.path)) {
      return {
        valid: false,
        error: `Invalid file path: ${file.path}`
      };
    }
  }
  
  return { valid: true };
}

export async function validateSessionUpload(files: Array<{
  name: string;
  size: number;
}>): Promise<ValidationResult> {
  const config = await getConfig();
  const settings = config.sessionSettings || DEFAULT_SESSION_SETTINGS;
  
  // Check file count
  if (files.length > settings.maxFilesPerSession) {
    return {
      valid: false,
      error: `Too many files. Maximum ${settings.maxFilesPerSession} files per session`
    };
  }
  
  // Check total size
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const maxSizeBytes = settings.maxUploadSize * 1024 * 1024;
  
  if (totalSize > maxSizeBytes) {
    return {
      valid: false,
      error: `Total upload size ${(totalSize / 1024 / 1024).toFixed(2)}MB exceeds limit of ${settings.maxUploadSize}MB`
    };
  }
  
  return { valid: true };
}
```

## Step 5: Enhanced TSG Storage Implementation

### 5.1 Update TSG storage with metadata
**File**: `codex-cli/src/utils/storage/tsg-storage.ts`

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';

const CODEX_HOME = path.join(homedir(), '.codex');
const TSGS_DIR = path.join(CODEX_HOME, 'tsgs');

interface TSGMetadata {
  name: string;
  createdAt: string;
  updatedAt: string;
  description?: string;
  tags?: string[];
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
    
    for (const entry of entries) {
      // Skip hidden files and metadata
      if (entry.name.startsWith('.')) continue;
      
      const fullPath = path.join(dirPath, entry.name);
      const relPath = path.join(relativePath, entry.name);
      
      if (entry.isDirectory()) {
        files.push({
          path: relPath,
          name: entry.name,
          size: 0,
          isDirectory: true
        });
        await scanDirectory(fullPath, relPath);
      } else {
        const stats = await fs.stat(fullPath);
        files.push({
          path: relPath,
          name: entry.name,
          size: stats.size,
          isDirectory: false
        });
      }
    }
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
  
  for (const file of files) {
    const filePath = path.join(tsgPath, file.path);
    const dirPath = path.dirname(filePath);
    
    await fs.mkdir(dirPath, { recursive: true });
    await fs.writeFile(filePath, file.content);
    
    processed++;
    if (onProgress) {
      onProgress(processed, files.length);
    }
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
```

## Step 6: Session Management Updates

### 6.1 Update session interface
**File**: `codex-cli/src/utils/session.ts`

```typescript
export interface Session {
  // ... existing fields ...
  
  // New fields for log analyzer
  uploadedFiles: string[];
  activeTSG: string | null;
  sessionMetadata: {
    createdAt: string;
    lastActivity: string;
    fileUploadCount: number;
  };
}

export function createSession(sessionId: string): Session {
  return {
    // ... existing fields ...
    
    uploadedFiles: [],
    activeTSG: null,
    sessionMetadata: {
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      fileUploadCount: 0
    }
  };
}

export function updateSessionActivity(session: Session): void {
  session.sessionMetadata.lastActivity = new Date().toISOString();
}
```

## Step 7: Background Tasks

### 7.1 Create cleanup service
**New file**: `codex-cli/src/services/cleanup-service.ts`

```typescript
import { cleanupOldSessions } from '../utils/storage/session-storage';
import { getConfig } from '../utils/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';

export class CleanupService {
  private intervalId: NodeJS.Timeout | null = null;
  
  start() {
    // Run cleanup every hour
    this.intervalId = setInterval(() => {
      this.runCleanup().catch(console.error);
    }, 60 * 60 * 1000);
    
    // Run initial cleanup
    this.runCleanup().catch(console.error);
  }
  
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
  
  private async runCleanup() {
    const config = await getConfig();
    
    // Clean up old sessions
    const sessionTimeout = config.sessionSettings?.sessionTimeout || 24;
    await cleanupOldSessions(sessionTimeout);
    
    // Clean up old TSG files if enabled
    if (config.tsgSettings?.autoCleanupEnabled) {
      await this.cleanupOldTSGFiles(config.tsgSettings.cleanupAgeHours);
    }
  }
  
  private async cleanupOldTSGFiles(maxAgeHours: number) {
    // This would clean up TSG files older than specified age
    // Implementation depends on specific requirements
  }
}
```

## Step 8: Tests for TSG Backend

### 8.1 TSG management tests
**New file**: `codex-cli/tests/tsg-management.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  createTSG, 
  deleteTSG, 
  listTSGs, 
  uploadToTSG, 
  getTSGFiles 
} from '../src/utils/storage/tsg-storage';
import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';

describe('TSG Management', () => {
  const testTSGName = 'test-tsg-123';
  const tsgsDir = path.join(homedir(), '.codex', 'tsgs');
  
  afterEach(async () => {
    // Cleanup
    try {
      await deleteTSG(testTSGName);
    } catch {}
  });
  
  it('should create TSG', async () => {
    await createTSG(testTSGName, 'Test TSG');
    
    const tsgs = await listTSGs();
    expect(tsgs).toContain(testTSGName);
    
    const metadata = await getTSGMetadata(testTSGName);
    expect(metadata?.name).toBe(testTSGName);
    expect(metadata?.description).toBe('Test TSG');
  });
  
  it('should upload files to TSG', async () => {
    await createTSG(testTSGName);
    
    const files = [
      { path: 'docs/guide.md', content: '# Guide\nContent' },
      { path: 'logs/error.log', content: 'Error log content' }
    ];
    
    await uploadToTSG(testTSGName, files);
    
    const tsgFiles = await getTSGFiles(testTSGName);
    expect(tsgFiles.length).toBe(4); // 2 files + 2 directories
    
    const guidefile = tsgFiles.find(f => f.name === 'guide.md');
    expect(guidefile).toBeDefined();
  });
  
  it('should delete TSG', async () => {
    await createTSG(testTSGName);
    await deleteTSG(testTSGName);
    
    const tsgs = await listTSGs();
    expect(tsgs).not.toContain(testTSGName);
  });
});
```

### 8.2 Upload validation tests
**New file**: `codex-cli/tests/upload-validator.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { validateTSGUpload, validateSessionUpload } from '../src/utils/storage/upload-validator';

describe('Upload Validator', () => {
  describe('TSG uploads', () => {
    it('should accept valid files', async () => {
      const files = [
        { path: 'docs/guide.md', size: 1024 },
        { path: 'logs/error.log', size: 2048 }
      ];
      
      const result = await validateTSGUpload(files);
      expect(result.valid).toBe(true);
    });
    
    it('should reject oversized uploads', async () => {
      const files = [
        { path: 'large.log', size: 200 * 1024 * 1024 } // 200MB
      ];
      
      const result = await validateTSGUpload(files);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds limit');
    });
    
    it('should reject invalid file types', async () => {
      const files = [
        { path: 'script.exe', size: 1024 }
      ];
      
      const result = await validateTSGUpload(files);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not allowed');
    });
    
    it('should reject path traversal', async () => {
      const files = [
        { path: '../../../etc/passwd', size: 1024 }
      ];
      
      const result = await validateTSGUpload(files);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid file path');
    });
  });
});
```

## Verification Checklist

After implementing Phase 3:

1. [ ] WebSocket handlers for TSG operations work correctly
2. [ ] TSG creation, listing, and deletion functions properly
3. [ ] File upload to TSG with validation
4. [ ] Session file upload functionality
5. [ ] Configuration persists TSG selection
6. [ ] Metadata tracking for TSGs
7. [ ] Security validation prevents path traversal
8. [ ] File size limits are enforced
9. [ ] Cleanup service removes old sessions
10. [ ] All tests pass

## Next Steps

After Phase 3 is complete:
- Phase 4: Build TSG UI components (React components for settings and management)
- Phase 5: Implement file upload UI with drag-and-drop
- Phase 6: Update agent prompts for log analysis focus