# Phase 4: Build TSG UI Components - Technical Implementation Guide

## Overview
This phase implements the frontend components for TSG management, including a settings modal, TSG creation interface, file browser, and integration with the existing chat interface.

## Step 1: Create Settings Modal Component

### 1.1 Settings Modal
**New file**: `codex-web/src/components/SettingsModal.tsx`

```tsx
import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, FolderOpen, Check } from 'lucide-react';
import { useCodexStore } from '../store/useCodexStore';
import { TSGCreator } from './TSGCreator';
import { TSGFileViewer } from './TSGFileViewer';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'tsgs'>('tsgs');
  const [showCreator, setShowCreator] = useState(false);
  const [selectedTSG, setSelectedTSG] = useState<string | null>(null);
  
  const {
    tsgs,
    activeTSG,
    fetchTSGs,
    selectTSG,
    deleteTSG,
    config,
    updateConfig
  } = useCodexStore();

  useEffect(() => {
    if (isOpen) {
      fetchTSGs();
    }
  }, [isOpen, fetchTSGs]);

  if (!isOpen) return null;

  const handleCreateTSG = () => {
    setShowCreator(true);
  };

  const handleSelectTSG = async (tsgName: string | null) => {
    await selectTSG(tsgName);
  };

  const handleDeleteTSG = async (tsgName: string) => {
    if (confirm(`Are you sure you want to delete TSG "${tsgName}"?`)) {
      await deleteTSG(tsgName);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-4xl max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
          <h2 className="text-xl font-semibold">Settings</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b dark:border-gray-700">
          <button
            className={`px-4 py-2 font-medium ${
              activeTab === 'general'
                ? 'border-b-2 border-blue-500 text-blue-500'
                : 'text-gray-600 dark:text-gray-400'
            }`}
            onClick={() => setActiveTab('general')}
          >
            General
          </button>
          <button
            className={`px-4 py-2 font-medium ${
              activeTab === 'tsgs'
                ? 'border-b-2 border-blue-500 text-blue-500'
                : 'text-gray-600 dark:text-gray-400'
            }`}
            onClick={() => setActiveTab('tsgs')}
          >
            Troubleshooting Guides
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 120px)' }}>
          {activeTab === 'general' && (
            <div className="space-y-4">
              {/* Model Selection */}
              <div>
                <label className="block text-sm font-medium mb-2">Model</label>
                <select
                  value={config.model || 'gpt-4'}
                  onChange={(e) => updateConfig({ model: e.target.value })}
                  className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                >
                  <option value="gpt-4">GPT-4</option>
                  <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                  <option value="claude-2">Claude 2</option>
                </select>
              </div>

              {/* Theme */}
              <div>
                <label className="block text-sm font-medium mb-2">Theme</label>
                <select
                  value={config.theme || 'system'}
                  onChange={(e) => updateConfig({ theme: e.target.value })}
                  className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
            </div>
          )}

          {activeTab === 'tsgs' && (
            <div>
              {showCreator ? (
                <TSGCreator
                  onClose={() => setShowCreator(false)}
                  onSuccess={() => {
                    setShowCreator(false);
                    fetchTSGs();
                  }}
                />
              ) : selectedTSG ? (
                <TSGFileViewer
                  tsgName={selectedTSG}
                  onBack={() => setSelectedTSG(null)}
                />
              ) : (
                <div>
                  {/* TSG List Header */}
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium">Troubleshooting Guides</h3>
                    <button
                      onClick={handleCreateTSG}
                      className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                      <Plus className="w-4 h-4" />
                      Create New TSG
                    </button>
                  </div>

                  {/* TSG List */}
                  <div className="space-y-2">
                    {tsgs.length === 0 ? (
                      <p className="text-gray-500 text-center py-8">
                        No troubleshooting guides created yet.
                      </p>
                    ) : (
                      tsgs.map((tsg) => (
                        <div
                          key={tsg.name}
                          className="flex items-center justify-between p-3 border rounded hover:bg-gray-50 dark:hover:bg-gray-700 dark:border-gray-700"
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="radio"
                              name="activeTSG"
                              checked={activeTSG === tsg.name}
                              onChange={() => handleSelectTSG(tsg.name)}
                              className="w-4 h-4"
                            />
                            <div>
                              <h4 className="font-medium">{tsg.name}</h4>
                              <p className="text-sm text-gray-500">
                                {tsg.fileCount} files • {(tsg.size / 1024 / 1024).toFixed(2)} MB
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setSelectedTSG(tsg.name)}
                              className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                              title="View files"
                            >
                              <FolderOpen className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteTSG(tsg.name)}
                              className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900 rounded text-red-600"
                              title="Delete TSG"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Active TSG Indicator */}
                  {activeTSG && (
                    <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900 rounded">
                      <p className="text-sm">
                        <strong>Active TSG:</strong> {activeTSG}
                        <button
                          onClick={() => handleSelectTSG(null)}
                          className="ml-2 text-blue-600 hover:underline"
                        >
                          Deactivate
                        </button>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

## Step 2: Create TSG Creator Component

### 2.1 TSG Creator
**New file**: `codex-web/src/components/TSGCreator.tsx`

```tsx
import React, { useState, useRef } from 'react';
import { Upload, X, FileText, Folder, AlertCircle } from 'lucide-react';
import { useCodexStore } from '../store/useCodexStore';

interface TSGCreatorProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface FileItem {
  path: string;
  file: File;
  size: number;
}

export function TSGCreator({ onClose, onSuccess }: TSGCreatorProps) {
  const [tsgName, setTsgName] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { createTSG } = useCodexStore();

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const fileItems: FileItem[] = [];

    for (const file of selectedFiles) {
      // Get relative path from webkitRelativePath
      const relativePath = (file as any).webkitRelativePath || file.name;
      
      fileItems.push({
        path: relativePath,
        file: file,
        size: file.size
      });
    }

    setFiles(fileItems);
    setError(null);
  };

  const handleCreateTSG = async () => {
    if (!tsgName.trim()) {
      setError('Please enter a TSG name');
      return;
    }

    if (files.length === 0) {
      setError('Please select files to upload');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      // Convert files to base64 for upload
      const processedFiles = await Promise.all(
        files.map(async (item) => {
          const content = await fileToBase64(item.file);
          return {
            path: item.path,
            content: content,
            type: item.file.type,
            size: item.size
          };
        })
      );

      await createTSG(tsgName, description, processedFiles);
      onSuccess();
    } catch (err) {
      setError(err.message || 'Failed to create TSG');
    } finally {
      setIsUploading(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = reader.result as string;
        // Remove data URL prefix
        const base64Content = base64.split(',')[1];
        resolve(base64Content);
      };
      reader.onerror = reject;
    });
  };

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium">Create New TSG</h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900 text-red-600 dark:text-red-300 rounded flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-2">TSG Name</label>
        <input
          type="text"
          value={tsgName}
          onChange={(e) => setTsgName(e.target.value)}
          placeholder="e.g., Meeting Room Team TSG"
          className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
          maxLength={100}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">
          Description (optional)
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description of this TSG"
          className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
          rows={3}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Upload Folder</label>
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center hover:border-gray-400 cursor-pointer"
        >
          <Upload className="w-12 h-12 mx-auto mb-3 text-gray-400" />
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Click to select a folder to upload
          </p>
          <p className="text-xs text-gray-500 mt-1">
            All files and subfolders will be included
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFolderSelect}
          webkitdirectory=""
          directory=""
          multiple
          className="hidden"
        />
      </div>

      {files.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">
            Selected Files ({files.length} files, {(totalSize / 1024 / 1024).toFixed(2)} MB)
          </h4>
          <div className="max-h-48 overflow-y-auto border rounded p-2 space-y-1">
            {files.map((item, index) => (
              <div key={index} className="flex items-center gap-2 text-sm">
                {item.path.endsWith('/') ? (
                  <Folder className="w-4 h-4 text-gray-500" />
                ) : (
                  <FileText className="w-4 h-4 text-gray-500" />
                )}
                <span className="truncate flex-1">{item.path}</span>
                <span className="text-gray-500">
                  {(item.size / 1024).toFixed(1)} KB
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={onClose}
          className="px-4 py-2 border rounded hover:bg-gray-50 dark:hover:bg-gray-700"
          disabled={isUploading}
        >
          Cancel
        </button>
        <button
          onClick={handleCreateTSG}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          disabled={isUploading || !tsgName.trim() || files.length === 0}
        >
          {isUploading ? 'Creating...' : 'Create TSG'}
        </button>
      </div>
    </div>
  );
}

// Add to HTML to enable directory selection
declare module 'react' {
  interface HTMLAttributes<T> extends AriaAttributes, DOMAttributes<T> {
    webkitdirectory?: string;
    directory?: string;
  }
}
```

## Step 3: Create TSG File Viewer

### 3.1 TSG File Viewer
**New file**: `codex-web/src/components/TSGFileViewer.tsx`

```tsx
import React, { useState, useEffect } from 'react';
import { ArrowLeft, FileText, Folder, Search } from 'lucide-react';
import { useCodexStore } from '../store/useCodexStore';

interface TSGFileViewerProps {
  tsgName: string;
  onBack: () => void;
}

interface TSGFile {
  path: string;
  name: string;
  size: number;
  type: string;
  isDirectory: boolean;
}

export function TSGFileViewer({ tsgName, onBack }: TSGFileViewerProps) {
  const [files, setFiles] = useState<TSGFile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  
  const { getTSGFiles } = useCodexStore();

  useEffect(() => {
    loadFiles();
  }, [tsgName]);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const tsgFiles = await getTSGFiles(tsgName);
      setFiles(tsgFiles);
    } catch (error) {
      console.error('Failed to load TSG files:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredFiles = files.filter(file => 
    file.path.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const fileTree = buildFileTree(filteredFiles);

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-medium flex-1">{tsgName} Files</h3>
      </div>

      <div className="mb-4">
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

      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading files...</div>
      ) : filteredFiles.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          {searchQuery ? 'No files found matching your search.' : 'No files in this TSG.'}
        </div>
      ) : (
        <div className="border rounded dark:border-gray-700">
          <FileTreeNode node={fileTree} level={0} />
        </div>
      )}
    </div>
  );
}

interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  children: Map<string, FileTreeNode>;
}

function buildFileTree(files: TSGFile[]): FileTreeNode {
  const root: FileTreeNode = {
    name: '/',
    path: '/',
    isDirectory: true,
    children: new Map()
  };

  for (const file of files) {
    const parts = file.path.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          path: parts.slice(0, i + 1).join('/'),
          isDirectory: !isLast || file.isDirectory,
          size: isLast ? file.size : undefined,
          children: new Map()
        });
      }

      current = current.children.get(part)!;
    }
  }

  return root;
}

interface FileTreeNodeProps {
  node: FileTreeNode;
  level: number;
}

function FileTreeNode({ node, level }: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(level < 2);

  if (node.name === '/') {
    return (
      <>
        {Array.from(node.children.values()).map((child) => (
          <FileTreeNode key={child.path} node={child} level={level} />
        ))}
      </>
    );
  }

  return (
    <div>
      <div
        className={`flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer ${
          level === 0 ? '' : 'border-t dark:border-gray-700'
        }`}
        style={{ paddingLeft: `${level * 20 + 12}px` }}
        onClick={() => node.isDirectory && setExpanded(!expanded)}
      >
        {node.isDirectory ? (
          <Folder className="w-4 h-4 text-gray-500" />
        ) : (
          <FileText className="w-4 h-4 text-gray-500" />
        )}
        <span className="flex-1">{node.name}</span>
        {node.size !== undefined && (
          <span className="text-sm text-gray-500">
            {(node.size / 1024).toFixed(1)} KB
          </span>
        )}
      </div>
      {node.isDirectory && expanded && (
        <>
          {Array.from(node.children.values()).map((child) => (
            <FileTreeNode key={child.path} node={child} level={level + 1} />
          ))}
        </>
      )}
    </div>
  );
}
```

## Step 4: Create File Upload Component

### 4.1 File Uploader
**New file**: `codex-web/src/components/FileUploader.tsx`

```tsx
import React, { useState, useRef } from 'react';
import { Upload, X, FileText, CheckCircle } from 'lucide-react';

interface FileUploaderProps {
  onUpload: (files: File[]) => void;
  maxSize?: number; // in MB
  accept?: string;
  multiple?: boolean;
}

export function FileUploader({ 
  onUpload, 
  maxSize = 50, 
  accept = '.log,.txt,.json,.csv,.xml',
  multiple = true 
}: FileUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleFiles(files);
  };

  const handleFiles = (files: File[]) => {
    // Validate file sizes
    const maxSizeBytes = maxSize * 1024 * 1024;
    const validFiles = files.filter(file => {
      if (file.size > maxSizeBytes) {
        alert(`File ${file.name} exceeds maximum size of ${maxSize}MB`);
        return false;
      }
      return true;
    });

    setSelectedFiles(validFiles);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    setUploadStatus('uploading');
    
    try {
      await onUpload(selectedFiles);
      setUploadStatus('success');
      
      setTimeout(() => {
        setSelectedFiles([]);
        setUploadStatus('idle');
      }, 2000);
    } catch (error) {
      setUploadStatus('idle');
      alert('Failed to upload files');
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(files => files.filter((_, i) => i !== index));
  };

  const totalSize = selectedFiles.reduce((sum, file) => sum + file.size, 0);

  return (
    <div className="space-y-4">
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
          ${dragActive 
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900' 
            : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
          }
        `}
      >
        {uploadStatus === 'success' ? (
          <>
            <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
            <p className="text-sm text-green-600 dark:text-green-400">
              Files uploaded successfully!
            </p>
          </>
        ) : (
          <>
            <Upload className="w-12 h-12 mx-auto mb-3 text-gray-400" />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Drop log files here or click to browse
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Supported: {accept} (max {maxSize}MB per file)
            </p>
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileSelect}
        accept={accept}
        multiple={multiple}
        className="hidden"
      />

      {selectedFiles.length > 0 && uploadStatus !== 'success' && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium">
              Selected Files ({selectedFiles.length})
            </h4>
            <span className="text-sm text-gray-500">
              Total: {(totalSize / 1024 / 1024).toFixed(2)} MB
            </span>
          </div>
          
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {selectedFiles.map((file, index) => (
              <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700 rounded">
                <FileText className="w-4 h-4 text-gray-500" />
                <span className="flex-1 text-sm truncate">{file.name}</span>
                <span className="text-xs text-gray-500">
                  {(file.size / 1024).toFixed(1)} KB
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(index);
                  }}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={handleUpload}
            disabled={uploadStatus === 'uploading'}
            className="w-full mt-3 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {uploadStatus === 'uploading' ? 'Uploading...' : `Upload ${selectedFiles.length} Files`}
          </button>
        </div>
      )}
    </div>
  );
}
```

## Step 5: Update Zustand Store

### 5.1 Update store with TSG functionality
**File**: `codex-web/src/store/useCodexStore.ts`

```typescript
import { create } from 'zustand';
import { Socket } from 'socket.io-client';

interface TSG {
  name: string;
  fileCount: number;
  createdAt: string;
  size: number;
}

interface TSGFile {
  path: string;
  name: string;
  size: number;
  type: string;
  isDirectory: boolean;
}

interface CodexStore {
  // ... existing state ...
  
  // TSG state
  tsgs: TSG[];
  activeTSG: string | null;
  sessionFiles: string[];
  
  // Settings state
  isSettingsOpen: boolean;
  config: {
    model?: string;
    theme?: string;
    // ... other config
  };
  
  // TSG actions
  fetchTSGs: () => Promise<void>;
  createTSG: (name: string, description: string, files: any[]) => Promise<void>;
  selectTSG: (name: string | null) => Promise<void>;
  deleteTSG: (name: string) => Promise<void>;
  getTSGFiles: (name: string) => Promise<TSGFile[]>;
  
  // Session file actions
  uploadSessionFiles: (files: File[]) => Promise<void>;
  
  // Settings actions
  setSettingsOpen: (open: boolean) => void;
  updateConfig: (config: Partial<CodexStore['config']>) => void;
}

export const useCodexStore = create<CodexStore>((set, get) => ({
  // ... existing state ...
  
  tsgs: [],
  activeTSG: null,
  sessionFiles: [],
  isSettingsOpen: false,
  config: {},
  
  fetchTSGs: async () => {
    const socket = get().socket;
    if (!socket) return;
    
    return new Promise((resolve) => {
      socket.emit('message', {
        type: 'tsg:list',
        sessionId: get().sessionId
      });
      
      socket.once('message', (response) => {
        if (response.type === 'tsg:list:response') {
          set({
            tsgs: response.data.tsgs,
            activeTSG: response.data.activeTSG
          });
          resolve();
        }
      });
    });
  },
  
  createTSG: async (name: string, description: string, files: any[]) => {
    const socket = get().socket;
    if (!socket) return;
    
    // First create the TSG
    await new Promise((resolve, reject) => {
      socket.emit('message', {
        type: 'tsg:create',
        sessionId: get().sessionId,
        data: { name, description }
      });
      
      socket.once('message', (response) => {
        if (response.type === 'tsg:create:success') {
          resolve(response);
        } else if (response.type === 'error') {
          reject(new Error(response.message));
        }
      });
    });
    
    // Then upload files if any
    if (files.length > 0) {
      await new Promise((resolve, reject) => {
        socket.emit('message', {
          type: 'tsg:upload',
          sessionId: get().sessionId,
          data: { tsgName: name, files }
        });
        
        socket.once('message', (response) => {
          if (response.type === 'tsg:upload:success') {
            resolve(response);
          } else if (response.type === 'error') {
            reject(new Error(response.message));
          }
        });
      });
    }
  },
  
  selectTSG: async (name: string | null) => {
    const socket = get().socket;
    if (!socket) return;
    
    return new Promise((resolve) => {
      socket.emit('message', {
        type: 'tsg:select',
        sessionId: get().sessionId,
        data: { name }
      });
      
      socket.once('message', (response) => {
        if (response.type === 'tsg:select:success') {
          set({ activeTSG: name });
          resolve();
        }
      });
    });
  },
  
  deleteTSG: async (name: string) => {
    const socket = get().socket;
    if (!socket) return;
    
    return new Promise((resolve) => {
      socket.emit('message', {
        type: 'tsg:delete',
        sessionId: get().sessionId,
        data: { name }
      });
      
      socket.once('message', (response) => {
        if (response.type === 'tsg:delete:success') {
          resolve();
        }
      });
    });
  },
  
  getTSGFiles: async (name: string) => {
    const socket = get().socket;
    if (!socket) return [];
    
    return new Promise((resolve) => {
      socket.emit('message', {
        type: 'tsg:get-files',
        sessionId: get().sessionId,
        data: { name }
      });
      
      socket.once('message', (response) => {
        if (response.type === 'tsg:files:response') {
          resolve(response.data.files);
        }
      });
    });
  },
  
  uploadSessionFiles: async (files: File[]) => {
    const socket = get().socket;
    if (!socket) return;
    
    // Convert files to base64
    const processedFiles = await Promise.all(
      files.map(async (file) => {
        const content = await fileToBase64(file);
        return {
          name: file.name,
          content: content,
          type: file.type,
          size: file.size
        };
      })
    );
    
    return new Promise((resolve, reject) => {
      socket.emit('message', {
        type: 'session:upload',
        sessionId: get().sessionId,
        data: { files: processedFiles }
      });
      
      socket.once('message', (response) => {
        if (response.type === 'session:upload:success') {
          const fileNames = response.data.files.map((f: any) => f.name);
          set(state => ({
            sessionFiles: [...state.sessionFiles, ...fileNames]
          }));
          resolve();
        } else if (response.type === 'error') {
          reject(new Error(response.message));
        }
      });
    });
  },
  
  setSettingsOpen: (open: boolean) => set({ isSettingsOpen: open }),
  
  updateConfig: (config: Partial<CodexStore['config']>) => {
    set(state => ({
      config: { ...state.config, ...config }
    }));
    
    // Optionally persist to backend
    const socket = get().socket;
    if (socket) {
      socket.emit('message', {
        type: 'config:update',
        sessionId: get().sessionId,
        data: config
      });
    }
  }
}));

// Helper function
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64 = reader.result as string;
      const base64Content = base64.split(',')[1];
      resolve(base64Content);
    };
    reader.onerror = reject;
  });
}
```

## Step 6: Update Main App Component

### 6.1 Add settings button to App
**File**: `codex-web/src/App.tsx`

```tsx
import React from 'react';
import { Settings } from 'lucide-react';
import { TabbedChatView } from './components/TabbedChatView';
import { SettingsModal } from './components/SettingsModal';
import { useCodexStore } from './store/useCodexStore';

function App() {
  const { isSettingsOpen, setSettingsOpen } = useCodexStore();

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700">
        <div className="px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-semibold">MTR Log Analyzer</h1>
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <TabbedChatView />
      </main>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

export default App;
```

## Step 7: Update Chat View for File Upload

### 7.1 Add file upload to ChatView
**File**: `codex-web/src/components/ChatView.tsx`

```tsx
// Add to existing ChatView component
import { FileUploader } from './FileUploader';
import { Paperclip } from 'lucide-react';

export function ChatView({ sessionId }: ChatViewProps) {
  const [showFileUpload, setShowFileUpload] = useState(false);
  const { sessionFiles, activeTSG, uploadSessionFiles } = useCodexStore();

  const handleFileUpload = async (files: File[]) => {
    await uploadSessionFiles(files);
    setShowFileUpload(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Active TSG Indicator */}
      {activeTSG && (
        <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900 text-sm">
          <span className="font-medium">Active TSG:</span> {activeTSG}
        </div>
      )}

      {/* Session Files Indicator */}
      {sessionFiles.length > 0 && (
        <div className="px-4 py-2 bg-green-50 dark:bg-green-900 text-sm">
          <span className="font-medium">Session Files:</span> {sessionFiles.join(', ')}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {/* ... existing message rendering ... */}
      </div>

      {/* File Upload Modal */}
      {showFileUpload && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium mb-4">Upload Log Files</h3>
            <FileUploader onUpload={handleFileUpload} />
            <button
              onClick={() => setShowFileUpload(false)}
              className="mt-4 w-full px-4 py-2 border rounded hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="border-t dark:border-gray-700 p-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFileUpload(true)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            title="Upload files"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <ChatInput
            // ... existing props ...
          />
        </div>
      </div>
    </div>
  );
}
```

## Verification Checklist

After implementing Phase 4:

1. [ ] Settings modal opens and closes properly
2. [ ] TSG list displays created TSGs
3. [ ] TSG creation with folder upload works
4. [ ] TSG selection updates active TSG
5. [ ] TSG deletion removes TSG from list
6. [ ] File viewer shows TSG file structure
7. [ ] File upload component handles drag-and-drop
8. [ ] Session file upload integrates with chat
9. [ ] Active TSG indicator shows in chat
10. [ ] Store properly manages TSG state

## Next Steps

After Phase 4 is complete:
- Phase 5: Complete session-based file upload integration
- Phase 6: Update agent prompts and behavior for log analysis
- Phase 7: Testing and final integration