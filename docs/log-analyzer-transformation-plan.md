# MTR Log Analyzer Transformation Plan

## Overview
This document outlines the implementation plan for transforming MTR from a general coding assistant into a specialized professional log analyzer tool. The transformation involves removing file manipulation capabilities, adding log analysis features, and implementing a Troubleshooting Guide (TSG) system.

## Architecture Overview

### Current State
- **Agent System**: General-purpose coding assistant with file manipulation via `apply_patch`
- **Web UI**: Chat interface with session management
- **Backend**: WebSocket-based communication with agent tools

### Target State
- **Agent System**: Specialized log analyzer with investigation-driven approach
- **Web UI**: Enhanced with TSG management, file upload, and session-based analysis
- **Backend**: File storage system for sessions and TSGs, log analysis tools

## Implementation Phases

### Phase 1: Remove File Manipulation Capabilities

#### 1.1 Disable apply_patch tool
**File**: `codex-cli/src/utils/agent/agent-loop.ts`
- Remove `apply_patch` from available tools
- Remove file manipulation imports

#### 1.2 Update agent tools configuration
**File**: `codex-cli/src/utils/agent/agent-loop-refactored.ts`
- Remove file editing capabilities
- Preserve shell commands for log analysis only

#### 1.3 Remove file operation utilities
**Files to remove/disable**:
- `codex-cli/src/utils/agent/apply-patch.ts`
- `codex-cli/src/utils/singlepass/file_ops.ts`

#### 1.4 Update exec command handler
**File**: `codex-cli/src/utils/agent/handle-exec-command.ts`
- Add validation to prevent file write operations
- Allow only read operations and analysis commands

### Phase 2: Implement Log Analysis Tools

#### 2.1 Create log analysis tool
**New file**: `codex-cli/src/utils/agent/tools/log-analyzer.ts`
```typescript
interface LogAnalyzerTool {
  name: 'analyze_logs';
  description: 'Analyze log files for patterns, errors, and insights';
  parameters: {
    files: string[];
    query?: string;
    timeRange?: { start: Date; end: Date };
  };
}
```

#### 2.2 Create session file reader
**New file**: `codex-cli/src/utils/agent/tools/session-file-reader.ts`
```typescript
interface SessionFileReader {
  name: 'read_session_file';
  description: 'Read files uploaded in current session';
  parameters: {
    fileName: string;
    lineRange?: { start: number; end: number };
  };
}
```

#### 2.3 Create TSG reader
**New file**: `codex-cli/src/utils/agent/tools/tsg-reader.ts`
```typescript
interface TSGReader {
  name: 'read_tsg';
  description: 'Read troubleshooting guide files';
  parameters: {
    tsgName: string;
    fileName?: string;
  };
}
```

### Phase 3: Create TSG Management System (Backend)

#### 3.1 File storage structure
**New file**: `codex-cli/src/utils/storage/file-storage.ts`
```typescript
interface FileStorage {
  sessionFiles: Map<string, SessionFiles>;
  tsgs: Map<string, TSGFiles>;
  
  uploadSessionFile(sessionId: string, file: File): Promise<void>;
  uploadTSG(tsgName: string, files: File[]): Promise<void>;
  getSessionFiles(sessionId: string): Promise<File[]>;
  getTSGFiles(tsgName: string): Promise<File[]>;
}
```

#### 3.2 TSG configuration
**Update**: `codex-cli/src/utils/config.ts`
```typescript
interface TSGConfig {
  availableTSGs: string[];
  activeTSG?: string;
  tsgStoragePath: string;
}
```

#### 3.3 WebSocket handlers for TSG
**Update**: `codex-cli/src/web-server/websocket-handler.ts`
- Add handlers for TSG operations:
  - `createTSG`
  - `listTSGs`
  - `selectTSG`
  - `uploadToTSG`
  - `uploadSessionFile`

### Phase 4: Build TSG UI Components

#### 4.1 Settings Modal
**New file**: `codex-web/src/components/SettingsModal.tsx`
```tsx
interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Features:
// - TSG management tab
// - Create new TSG
// - Select active TSG
// - View TSG files
```

#### 4.2 TSG Creation Component
**New file**: `codex-web/src/components/TSGCreator.tsx`
```tsx
interface TSGCreatorProps {
  onCreateTSG: (name: string, files: File[]) => void;
}

// Features:
// - Name input
// - Folder upload (recursive)
// - File type validation
```

#### 4.3 File Upload Component
**New file**: `codex-web/src/components/FileUploader.tsx`
```tsx
interface FileUploaderProps {
  sessionId: string;
  onUpload: (files: File[]) => void;
}

// Features:
// - Drag and drop
// - Multiple file selection
// - Progress indicator
```

#### 4.4 Update Zustand store
**Update**: `codex-web/src/store/useCodexStore.ts`
```typescript
interface CodexStore {
  // Existing state...
  
  // New TSG state
  tsgs: string[];
  activeTSG: string | null;
  sessionFiles: File[];
  
  // New actions
  createTSG: (name: string, files: File[]) => void;
  selectTSG: (name: string | null) => void;
  uploadSessionFile: (file: File) => void;
}
```

### Phase 5: Implement Session-Based File Upload

#### 5.1 Session file management
**Update**: `codex-cli/src/utils/session.ts`
```typescript
interface Session {
  // Existing fields...
  
  uploadedFiles: string[];
  activeTSG?: string;
}
```

#### 5.2 File upload handlers
**Update**: `codex-web/src/components/ChatView.tsx`
- Add file upload button
- Display uploaded files
- Show active TSG indicator

#### 5.3 Update agent context
**Update**: `codex-cli/src/utils/agent/agent-loop.ts`
- Include session files in agent context
- Include active TSG files in agent context

### Phase 6: Update Agent Prompt and Behavior

#### 6.1 Create log analyzer system prompt
**New file**: `codex-cli/src/prompts/log-analyzer-prompt.ts`
```typescript
const LOG_ANALYZER_PROMPT = `
You are a specialized log analysis assistant. Your primary function is to:
1. Analyze uploaded log files for patterns, errors, and insights
2. Answer questions about log content
3. Provide troubleshooting guidance based on TSGs when available
4. Use investigation skills to identify issues

Available context:
- Session files: {sessionFiles}
- Active TSG: {activeTSG}
- TSG files: {tsgFiles}

You cannot create, modify, or delete files. Focus on analysis and insights.
`;
```

#### 6.2 Update agent initialization
**Update**: `codex-cli/src/utils/agent/agent-loop.ts`
- Use log analyzer prompt
- Remove coding-related instructions
- Add log analysis context

### Phase 7: Testing and Integration

#### 7.1 Remove file manipulation tests
- Remove tests for apply_patch
- Remove tests for file operations

#### 7.2 Add log analysis tests
**New files**:
- `codex-cli/tests/log-analyzer.test.ts`
- `codex-cli/tests/tsg-management.test.ts`
- `codex-cli/tests/session-files.test.ts`

#### 7.3 UI component tests
**New files**:
- `codex-web/tests/SettingsModal.test.tsx`
- `codex-web/tests/TSGCreator.test.tsx`
- `codex-web/tests/FileUploader.test.tsx`

## File Structure

### Session Files
```
~/.mtr/sessions/
  └── {session-id}/
      └── uploads/
          ├── log1.txt
          ├── log2.json
          └── error.log
```

### TSG Files
```
~/.mtr/tsgs/
  └── {tsg-name}/
      ├── authentication/
      │   └── auth-issues.md
      ├── network/
      │   └── connectivity.md
      └── README.md
```

## Migration Path

1. **Backup current configuration**
2. **Deploy Phase 1**: Remove file manipulation (breaking change)
3. **Deploy Phase 2-3**: Add log analysis backend
4. **Deploy Phase 4-5**: Add UI components
5. **Deploy Phase 6**: Update agent behavior
6. **Testing and validation**

## Security Considerations

1. **File upload validation**:
   - Size limits
   - File type restrictions
   - Virus scanning (if applicable)

2. **Path traversal protection**:
   - Sanitize file names
   - Restrict to designated directories

3. **Session isolation**:
   - Files accessible only within session
   - TSGs shared across sessions but read-only

## Performance Considerations

1. **File storage limits**:
   - Session files: Auto-cleanup after 24 hours
   - TSG files: Persistent with size limits

2. **Large file handling**:
   - Stream processing for large logs
   - Pagination for file listing

3. **Caching**:
   - Cache TSG file listings
   - Cache frequently accessed files

## UI/UX Considerations

1. **Clear indicators**:
   - Show active TSG prominently
   - Display uploaded files count
   - Progress bars for uploads

2. **Intuitive workflows**:
   - Drag-and-drop for file uploads
   - One-click TSG selection
   - Clear separation between session and TSG files

3. **Responsive design**:
   - Mobile-friendly file upload
   - Keyboard navigation support

## Dependencies

### New Dependencies
- `multer` or similar for file uploads
- `archiver` for TSG folder compression
- File type detection library

### Updated Dependencies
- Socket.io for file transfer support

## Timeline Estimate

- **Phase 1**: 2 days (remove file manipulation)
- **Phase 2**: 3 days (log analysis tools)
- **Phase 3**: 3 days (TSG backend)
- **Phase 4**: 4 days (UI components)
- **Phase 5**: 2 days (session uploads)
- **Phase 6**: 1 day (agent updates)
- **Phase 7**: 2 days (testing)

**Total**: ~17 development days

## Risk Mitigation

1. **Breaking changes**: Clear documentation and migration guide
2. **Data loss**: Backup mechanisms for TSGs
3. **Performance**: Load testing with large log files
4. **Security**: Security audit before deployment