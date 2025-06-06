# Phase 5: Session-Based File Upload System - Technical Implementation Guide

## Overview
This phase completes the integration of session-based file uploads, allowing users to upload log files for analysis during their current session. Files are temporary and automatically cleaned up after the session ends.

## Step 1: Complete Backend Session File Management

### 1.1 Enhance session file tracking
**File**: `codex-cli/src/utils/session.ts`

```typescript
import { listSessionFiles } from './storage/session-storage';

export interface SessionFile {
  name: string;
  path: string;
  size: number;
  uploadedAt: string;
  type: string;
}

export interface Session {
  id: string;
  messages: Message[];
  uploadedFiles: SessionFile[];
  activeTSG: string | null;
  sessionMetadata: {
    createdAt: string;
    lastActivity: string;
    fileUploadCount: number;
    totalUploadSize: number;
  };
}

export async function addSessionFile(
  session: Session, 
  file: SessionFile
): Promise<void> {
  session.uploadedFiles.push(file);
  session.sessionMetadata.fileUploadCount++;
  session.sessionMetadata.totalUploadSize += file.size;
  session.sessionMetadata.lastActivity = new Date().toISOString();
}

export async function removeSessionFile(
  session: Session,
  fileName: string
): Promise<boolean> {
  const index = session.uploadedFiles.findIndex(f => f.name === fileName);
  if (index === -1) return false;
  
  const file = session.uploadedFiles[index];
  session.uploadedFiles.splice(index, 1);
  session.sessionMetadata.fileUploadCount--;
  session.sessionMetadata.totalUploadSize -= file.size;
  
  // Also delete from filesystem
  const { deleteSessionFile } = await import('./storage/session-storage');
  await deleteSessionFile(session.id, fileName);
  
  return true;
}

export async function syncSessionFiles(session: Session): Promise<void> {
  // Sync session files with filesystem
  const filesOnDisk = await listSessionFiles(session.id);
  
  // Remove files from session that no longer exist on disk
  session.uploadedFiles = session.uploadedFiles.filter(
    file => filesOnDisk.includes(file.name)
  );
}
```

### 1.2 Add file deletion to storage
**File**: `codex-cli/src/utils/storage/session-storage.ts`

```typescript
// Add to existing file

export async function deleteSessionFile(
  sessionId: string,
  fileName: string
): Promise<void> {
  const filePath = path.join(
    getSessionStoragePath(sessionId),
    'uploads',
    sanitizeFileName(fileName)
  );
  
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
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
    'uploads',
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
    if (error.code === 'ENOENT') {
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
```

## Step 2: Enhance WebSocket Handlers for File Operations

### 2.1 Add file management handlers
**File**: `codex-cli/src/web-server/websocket-handler.ts`

```typescript
// Add new message types
interface SessionFileDeleteMessage {
  type: 'session:file:delete';
  sessionId: string;
  data: {
    fileName: string;
  };
}

interface SessionFileListMessage {
  type: 'session:file:list';
  sessionId: string;
}

interface SessionFilePreviewMessage {
  type: 'session:file:preview';
  sessionId: string;
  data: {
    fileName: string;
    lines?: number;
  };
}

// Add handlers
private async handleSessionFileDelete(socket: Socket, message: SessionFileDeleteMessage) {
  const session = this.sessionManager.getSession(message.sessionId);
  if (!session) {
    throw new Error('Session not found');
  }
  
  const success = await removeSessionFile(session, message.data.fileName);
  
  if (success) {
    socket.emit('message', {
      type: 'session:file:delete:success',
      data: { fileName: message.data.fileName }
    });
    
    // Broadcast updated file list to all clients in session
    this.broadcastToSession(message.sessionId, {
      type: 'session:files:updated',
      data: { files: session.uploadedFiles }
    });
  } else {
    throw new Error(`File ${message.data.fileName} not found`);
  }
}

private async handleSessionFileList(socket: Socket, message: SessionFileListMessage) {
  const session = this.sessionManager.getSession(message.sessionId);
  if (!session) {
    throw new Error('Session not found');
  }
  
  // Sync with filesystem
  await syncSessionFiles(session);
  
  socket.emit('message', {
    type: 'session:file:list:response',
    data: {
      files: session.uploadedFiles,
      totalSize: session.sessionMetadata.totalUploadSize,
      count: session.sessionMetadata.fileUploadCount
    }
  });
}

private async handleSessionFilePreview(socket: Socket, message: SessionFilePreviewMessage) {
  const { fileName, lines = 50 } = message.data;
  
  try {
    const content = await executeSessionFileReader(
      {
        fileName,
        lineRange: { start: 1, end: lines }
      },
      message.sessionId
    );
    
    socket.emit('message', {
      type: 'session:file:preview:response',
      data: {
        fileName,
        content,
        truncated: content.split('\n').length >= lines
      }
    });
  } catch (error) {
    socket.emit('error', {
      type: 'session:file:preview:error',
      message: error.message
    });
  }
}

// Update the main message handler
private async handleMessage(socket: Socket, message: any) {
  switch (message.type) {
    // ... existing cases ...
    
    case 'session:file:delete':
      await this.handleSessionFileDelete(socket, message);
      break;
    case 'session:file:list':
      await this.handleSessionFileList(socket, message);
      break;
    case 'session:file:preview':
      await this.handleSessionFilePreview(socket, message);
      break;
  }
}
```

## Step 3: Create File Manager Component

### 3.1 Session File Manager
**New file**: `codex-web/src/components/SessionFileManager.tsx`

```tsx
import React, { useState, useEffect } from 'react';
import { FileText, Trash2, Eye, Download, Search } from 'lucide-react';
import { useCodexStore } from '../store/useCodexStore';

interface SessionFileManagerProps {
  sessionId: string;
  onClose?: () => void;
}

export function SessionFileManager({ sessionId, onClose }: SessionFileManagerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    fileName: string;
    content: string;
    truncated: boolean;
  } | null>(null);
  
  const {
    sessionFiles,
    fetchSessionFiles,
    deleteSessionFile,
    previewSessionFile
  } = useCodexStore();

  useEffect(() => {
    fetchSessionFiles();
    
    // Refresh every 5 seconds
    const interval = setInterval(fetchSessionFiles, 5000);
    return () => clearInterval(interval);
  }, [fetchSessionFiles]);

  const handleDelete = async (fileName: string) => {
    if (confirm(`Delete ${fileName}?`)) {
      await deleteSessionFile(fileName);
      if (selectedFile === fileName) {
        setSelectedFile(null);
        setPreview(null);
      }
    }
  };

  const handlePreview = async (fileName: string) => {
    setSelectedFile(fileName);
    const previewData = await previewSessionFile(fileName);
    setPreview(previewData);
  };

  const filteredFiles = sessionFiles.filter(file =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  return (
    <div className="flex h-full">
      {/* File List */}
      <div className="w-1/3 border-r dark:border-gray-700 p-4">
        <div className="mb-4">
          <h3 className="text-lg font-medium mb-2">Session Files</h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              className="w-full pl-10 pr-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
            />
          </div>
        </div>

        <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(100% - 120px)' }}>
          {filteredFiles.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              {searchQuery ? 'No files match your search' : 'No files uploaded yet'}
            </p>
          ) : (
            filteredFiles.map((file) => (
              <div
                key={file.name}
                className={`
                  p-3 border rounded cursor-pointer transition-colors
                  ${selectedFile === file.name 
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900' 
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700 dark:border-gray-700'
                  }
                `}
                onClick={() => handlePreview(file.name)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2 flex-1">
                    <FileText className="w-4 h-4 mt-0.5 text-gray-500" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{file.name}</p>
                      <p className="text-xs text-gray-500">
                        {formatFileSize(file.size)} • {file.type}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDate(file.uploadedAt)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(file.name);
                    }}
                    className="p-1 hover:bg-red-100 dark:hover:bg-red-900 rounded text-red-600"
                    title="Delete file"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Summary */}
        {sessionFiles.length > 0 && (
          <div className="mt-4 pt-4 border-t dark:border-gray-700 text-sm text-gray-600">
            Total: {sessionFiles.length} files, {
              formatFileSize(sessionFiles.reduce((sum, f) => sum + f.size, 0))
            }
          </div>
        )}
      </div>

      {/* File Preview */}
      <div className="flex-1 p-4">
        {preview ? (
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">{preview.fileName}</h3>
              <div className="flex items-center gap-2">
                <button
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                  title="Download full file"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-800 rounded p-4">
              <pre className="text-sm font-mono whitespace-pre-wrap">
                {preview.content}
              </pre>
              {preview.truncated && (
                <p className="text-center text-gray-500 mt-4">
                  ... Preview truncated. Download file to see full content ...
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500">
            <div className="text-center">
              <Eye className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p>Select a file to preview</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

## Step 4: Integrate File Manager with Chat

### 4.1 Update ChatView
**File**: `codex-web/src/components/ChatView.tsx`

```tsx
import { SessionFileManager } from './SessionFileManager';
import { Files } from 'lucide-react';

export function ChatView({ sessionId }: ChatViewProps) {
  const [showFileManager, setShowFileManager] = useState(false);
  // ... existing state ...

  return (
    <div className="flex flex-col h-full">
      {/* File Manager Modal */}
      {showFileManager && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-6xl h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
              <h2 className="text-xl font-semibold">Session Files</h2>
              <button
                onClick={() => setShowFileManager(false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="h-[calc(80vh-64px)]">
              <SessionFileManager sessionId={sessionId} />
            </div>
          </div>
        </div>
      )}

      {/* Session Info Bar */}
      <div className="flex items-center gap-4 px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
        {activeTSG && (
          <div className="flex items-center gap-2 text-sm">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <span className="font-medium">TSG:</span> {activeTSG}
          </div>
        )}
        
        <div className="flex items-center gap-2 text-sm">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <span className="font-medium">Files:</span> {sessionFiles.length}
          <button
            onClick={() => setShowFileManager(true)}
            className="text-blue-600 hover:underline"
          >
            Manage
          </button>
        </div>
      </div>

      {/* Rest of chat view ... */}
      
      {/* Enhanced Input Area */}
      <div className="border-t dark:border-gray-700 p-4">
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => setShowFileUpload(true)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            title="Upload files"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowFileManager(true)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            title="Manage files"
          >
            <Files className="w-5 h-5" />
            {sessionFiles.length > 0 && (
              <span className="ml-1 text-xs bg-blue-500 text-white rounded-full px-1.5">
                {sessionFiles.length}
              </span>
            )}
          </button>
          
          {/* Quick file list */}
          {sessionFiles.length > 0 && sessionFiles.length <= 3 && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              {sessionFiles.map((file, i) => (
                <span key={file.name}>
                  {file.name}
                  {i < sessionFiles.length - 1 && ','}
                </span>
              ))}
            </div>
          )}
          {sessionFiles.length > 3 && (
            <span className="text-xs text-gray-500">
              {sessionFiles.length} files uploaded
            </span>
          )}
        </div>
        
        <ChatInput
          // ... existing props ...
        />
      </div>
    </div>
  );
}
```

## Step 5: Update Store for File Management

### 5.1 Add file management actions
**File**: `codex-web/src/store/useCodexStore.ts`

```typescript
// Add to store interface
interface CodexStore {
  // ... existing state ...
  
  // Enhanced session file state
  sessionFiles: SessionFile[];
  sessionFileStats: {
    totalSize: number;
    count: number;
  };
  
  // New file actions
  fetchSessionFiles: () => Promise<void>;
  deleteSessionFile: (fileName: string) => Promise<void>;
  previewSessionFile: (fileName: string, lines?: number) => Promise<{
    fileName: string;
    content: string;
    truncated: boolean;
  }>;
}

// Add implementations
export const useCodexStore = create<CodexStore>((set, get) => ({
  // ... existing state ...
  
  sessionFileStats: {
    totalSize: 0,
    count: 0
  },
  
  fetchSessionFiles: async () => {
    const socket = get().socket;
    if (!socket) return;
    
    return new Promise((resolve) => {
      socket.emit('message', {
        type: 'session:file:list',
        sessionId: get().sessionId
      });
      
      socket.once('message', (response) => {
        if (response.type === 'session:file:list:response') {
          set({
            sessionFiles: response.data.files,
            sessionFileStats: {
              totalSize: response.data.totalSize,
              count: response.data.count
            }
          });
          resolve();
        }
      });
    });
  },
  
  deleteSessionFile: async (fileName: string) => {
    const socket = get().socket;
    if (!socket) return;
    
    return new Promise((resolve, reject) => {
      socket.emit('message', {
        type: 'session:file:delete',
        sessionId: get().sessionId,
        data: { fileName }
      });
      
      socket.once('message', (response) => {
        if (response.type === 'session:file:delete:success') {
          // Update local state
          set(state => ({
            sessionFiles: state.sessionFiles.filter(f => f.name !== fileName)
          }));
          resolve();
        } else if (response.type === 'error') {
          reject(new Error(response.message));
        }
      });
    });
  },
  
  previewSessionFile: async (fileName: string, lines: number = 50) => {
    const socket = get().socket;
    if (!socket) throw new Error('No socket connection');
    
    return new Promise((resolve, reject) => {
      socket.emit('message', {
        type: 'session:file:preview',
        sessionId: get().sessionId,
        data: { fileName, lines }
      });
      
      socket.once('message', (response) => {
        if (response.type === 'session:file:preview:response') {
          resolve(response.data);
        } else if (response.type === 'session:file:preview:error') {
          reject(new Error(response.message));
        }
      });
    });
  }
}));
```

## Step 6: Add Real-time File Updates

### 6.1 Socket event listeners
**File**: `codex-web/src/store/useCodexStore.ts`

```typescript
// Add to socket initialization
const initializeSocket = (socket: Socket) => {
  // ... existing listeners ...
  
  // Listen for file updates
  socket.on('message', (message) => {
    switch (message.type) {
      case 'session:files:updated':
        set({ sessionFiles: message.data.files });
        break;
        
      case 'session:upload:progress':
        // Handle upload progress
        set(state => ({
          uploadProgress: {
            ...state.uploadProgress,
            [message.data.fileName]: message.data.progress
          }
        }));
        break;
    }
  });
};
```

## Step 7: Add File Context to Agent

### 7.1 Update agent context builder
**File**: `codex-cli/src/utils/agent/agent-loop.ts`

```typescript
// Update context builder to include detailed file info
async function buildAgentContext(sessionId: string, activeTSG?: string): Promise<string> {
  const session = sessionManager.getSession(sessionId);
  if (!session) return '';
  
  let context = `
## Available Tools
- shell: Execute read-only shell commands
- analyze_logs: Analyze log files for patterns and errors
- read_session_file: Read files uploaded in this session
- read_tsg: Read troubleshooting guide documentation

## Session Context
- Session ID: ${sessionId}
- Session created: ${session.sessionMetadata.createdAt}
`;

  // Add uploaded files with details
  if (session.uploadedFiles.length > 0) {
    context += `\n## Uploaded Files (${session.uploadedFiles.length} files)\n`;
    for (const file of session.uploadedFiles) {
      context += `- ${file.name} (${file.type}, ${(file.size / 1024).toFixed(1)}KB)\n`;
    }
    context += `\nUse the read_session_file tool to access these files.\n`;
  } else {
    context += `\n## Uploaded Files\nNo files uploaded yet. The user can upload log files for analysis.\n`;
  }

  // Add TSG context
  if (activeTSG) {
    const tsgFiles = await executeTSGReader({ tsgName: activeTSG });
    context += `
## Active TSG: ${activeTSG}
The user has selected the "${activeTSG}" troubleshooting guide. 
Use the read_tsg tool with tsgName="${activeTSG}" to access documentation.
Available files: ${tsgFiles.length} files
`;
  }

  const availableTSGs = await listAvailableTSGs();
  if (availableTSGs.length > 0) {
    context += `\n## Available TSGs: ${availableTSGs.join(', ')}\n`;
  }

  return context;
}
```

## Verification Checklist

After implementing Phase 5:

1. [ ] Session files can be uploaded via UI
2. [ ] File list updates in real-time
3. [ ] File preview works for uploaded files
4. [ ] Files can be deleted from session
5. [ ] File manager shows all session files
6. [ ] Agent context includes file information
7. [ ] Session cleanup removes files
8. [ ] File size limits are enforced
9. [ ] Multiple file upload works
10. [ ] Progress feedback during upload

## Next Steps

After Phase 5 is complete:
- Phase 6: Update agent prompts for log analysis
- Phase 7: Comprehensive testing and integration