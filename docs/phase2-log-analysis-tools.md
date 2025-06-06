# Phase 2: Implement Log Analysis Tools - Technical Implementation Guide

## Overview
This phase adds specialized log analysis capabilities to the agent, including tools for reading session files, analyzing log patterns, and accessing TSG documentation.

## Step 1: Create Log Analysis Tool

### 1.1 Create the log analyzer tool
**New file**: `codex-cli/src/utils/agent/tools/log-analyzer.ts`

```typescript
import { Tool } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';

interface LogPattern {
  pattern: RegExp;
  severity: 'error' | 'warning' | 'info';
  category: string;
}

const COMMON_LOG_PATTERNS: LogPattern[] = [
  { pattern: /ERROR|FATAL|CRITICAL/i, severity: 'error', category: 'errors' },
  { pattern: /WARN|WARNING/i, severity: 'warning', category: 'warnings' },
  { pattern: /Exception|Traceback/i, severity: 'error', category: 'exceptions' },
  { pattern: /timeout|timed out/i, severity: 'error', category: 'timeouts' },
  { pattern: /connection refused|connection error/i, severity: 'error', category: 'network' },
  { pattern: /authentication failed|401|403/i, severity: 'error', category: 'auth' },
  { pattern: /out of memory|OOM/i, severity: 'error', category: 'memory' },
  { pattern: /disk full|no space/i, severity: 'error', category: 'storage' }
];

export interface LogAnalysisResult {
  summary: {
    totalLines: number;
    errorCount: number;
    warningCount: number;
    timeRange?: { start: Date; end: Date };
  };
  patterns: {
    category: string;
    count: number;
    severity: string;
    samples: string[];
  }[];
  timeline?: {
    timestamp: Date;
    severity: string;
    message: string;
  }[];
}

export const logAnalyzerTool: Tool = {
  type: 'function',
  function: {
    name: 'analyze_logs',
    description: 'Analyze log files for patterns, errors, and insights. Can process multiple log formats and identify common issues.',
    parameters: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of file paths to analyze'
        },
        query: {
          type: 'string',
          description: 'Optional search query to filter log entries'
        },
        timeRange: {
          type: 'object',
          properties: {
            start: { type: 'string', format: 'date-time' },
            end: { type: 'string', format: 'date-time' }
          },
          description: 'Optional time range to filter logs'
        },
        includeTimeline: {
          type: 'boolean',
          description: 'Include a timeline of events (may be memory intensive for large logs)'
        }
      },
      required: ['files']
    }
  }
};

export async function executeLogAnalyzer(args: {
  files: string[];
  query?: string;
  timeRange?: { start: string; end: string };
  includeTimeline?: boolean;
}): Promise<LogAnalysisResult> {
  const result: LogAnalysisResult = {
    summary: {
      totalLines: 0,
      errorCount: 0,
      warningCount: 0
    },
    patterns: [],
    timeline: args.includeTimeline ? [] : undefined
  };

  const patternCounts = new Map<string, {
    count: number;
    severity: string;
    samples: string[];
  }>();

  // Process each file
  for (const filePath of args.files) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        result.summary.totalLines++;
        
        // Apply query filter if provided
        if (args.query && !line.toLowerCase().includes(args.query.toLowerCase())) {
          continue;
        }
        
        // Check against patterns
        for (const pattern of COMMON_LOG_PATTERNS) {
          if (pattern.pattern.test(line)) {
            // Update counts
            if (pattern.severity === 'error') result.summary.errorCount++;
            if (pattern.severity === 'warning') result.summary.warningCount++;
            
            // Track pattern occurrences
            const existing = patternCounts.get(pattern.category) || {
              count: 0,
              severity: pattern.severity,
              samples: []
            };
            
            existing.count++;
            if (existing.samples.length < 3) {
              existing.samples.push(line.trim().substring(0, 200));
            }
            
            patternCounts.set(pattern.category, existing);
            
            // Add to timeline if requested
            if (args.includeTimeline) {
              const timestamp = extractTimestamp(line);
              if (timestamp) {
                result.timeline!.push({
                  timestamp,
                  severity: pattern.severity,
                  message: line.trim().substring(0, 200)
                });
              }
            }
            
            break; // Only match first pattern per line
          }
        }
      }
    } catch (error) {
      throw new Error(`Failed to analyze file ${filePath}: ${error.message}`);
    }
  }
  
  // Convert pattern counts to result format
  result.patterns = Array.from(patternCounts.entries()).map(([category, data]) => ({
    category,
    count: data.count,
    severity: data.severity,
    samples: data.samples
  })).sort((a, b) => b.count - a.count);
  
  // Sort timeline by timestamp if included
  if (result.timeline) {
    result.timeline.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    // Set time range in summary
    if (result.timeline.length > 0) {
      result.summary.timeRange = {
        start: result.timeline[0].timestamp,
        end: result.timeline[result.timeline.length - 1].timestamp
      };
    }
  }
  
  return result;
}

function extractTimestamp(logLine: string): Date | null {
  // Common timestamp patterns
  const patterns = [
    /(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2})/,  // ISO format
    /(\d{2}\/\d{2}\/\d{4}\s\d{2}:\d{2}:\d{2})/,    // MM/DD/YYYY HH:MM:SS
    /(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})/,       // Mar 1 12:34:56
    /\[(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})\]/,  // [2024-01-01 12:34:56]
  ];
  
  for (const pattern of patterns) {
    const match = logLine.match(pattern);
    if (match) {
      const date = new Date(match[1]);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }
  
  return null;
}
```

## Step 2: Create Session File Reader

### 2.1 Create session file reader tool
**New file**: `codex-cli/src/utils/agent/tools/session-file-reader.ts`

```typescript
import { Tool } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getSessionStoragePath } from '../../storage/session-storage';

export const sessionFileReaderTool: Tool = {
  type: 'function',
  function: {
    name: 'read_session_file',
    description: 'Read files uploaded in the current session. Use this to access log files and other documents uploaded by the user.',
    parameters: {
      type: 'object',
      properties: {
        fileName: {
          type: 'string',
          description: 'Name of the file to read from session uploads'
        },
        lineRange: {
          type: 'object',
          properties: {
            start: { type: 'number', minimum: 1 },
            end: { type: 'number', minimum: 1 }
          },
          description: 'Optional line range to read (1-indexed)'
        },
        encoding: {
          type: 'string',
          enum: ['utf-8', 'utf-16', 'ascii', 'base64'],
          description: 'File encoding (defaults to utf-8)'
        }
      },
      required: ['fileName']
    }
  }
};

export async function executeSessionFileReader(args: {
  fileName: string;
  lineRange?: { start: number; end: number };
  encoding?: string;
}, sessionId: string): Promise<string> {
  const sessionPath = getSessionStoragePath(sessionId);
  const filePath = path.join(sessionPath, 'uploads', args.fileName);
  
  // Security: Ensure file is within session directory
  const resolvedPath = path.resolve(filePath);
  const resolvedSessionPath = path.resolve(sessionPath);
  if (!resolvedPath.startsWith(resolvedSessionPath)) {
    throw new Error('Access denied: File path is outside session directory');
  }
  
  try {
    const encoding = (args.encoding || 'utf-8') as BufferEncoding;
    const content = await fs.readFile(filePath, encoding);
    
    if (args.lineRange) {
      const lines = content.split('\n');
      const start = Math.max(0, args.lineRange.start - 1);
      const end = Math.min(lines.length, args.lineRange.end);
      return lines.slice(start, end).join('\n');
    }
    
    return content;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // List available files to help user
      try {
        const files = await fs.readdir(path.join(sessionPath, 'uploads'));
        throw new Error(
          `File '${args.fileName}' not found in session uploads. ` +
          `Available files: ${files.join(', ')}`
        );
      } catch {
        throw new Error(`File '${args.fileName}' not found in session uploads.`);
      }
    }
    throw error;
  }
}

// Helper to list session files
export async function listSessionFiles(sessionId: string): Promise<string[]> {
  const sessionPath = getSessionStoragePath(sessionId);
  const uploadsPath = path.join(sessionPath, 'uploads');
  
  try {
    const files = await fs.readdir(uploadsPath);
    return files;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}
```

## Step 3: Create TSG Reader Tool

### 3.1 Create TSG reader tool
**New file**: `codex-cli/src/utils/agent/tools/tsg-reader.ts`

```typescript
import { Tool } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getTSGStoragePath } from '../../storage/tsg-storage';

export const tsgReaderTool: Tool = {
  type: 'function',
  function: {
    name: 'read_tsg',
    description: 'Read troubleshooting guide (TSG) files. Use this to access reference documentation and troubleshooting procedures.',
    parameters: {
      type: 'object',
      properties: {
        tsgName: {
          type: 'string',
          description: 'Name of the TSG to read from'
        },
        fileName: {
          type: 'string',
          description: 'Specific file within the TSG (optional, omit to list files)'
        },
        searchQuery: {
          type: 'string',
          description: 'Search for content within TSG files'
        }
      },
      required: ['tsgName']
    }
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
}): Promise<string | TSGFile[]> {
  const tsgPath = getTSGStoragePath(args.tsgName);
  
  // If no specific file requested, list TSG contents
  if (!args.fileName && !args.searchQuery) {
    return await listTSGFiles(tsgPath);
  }
  
  // If search query provided, search across all TSG files
  if (args.searchQuery) {
    return await searchTSGContent(tsgPath, args.searchQuery);
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
    if (error.code === 'ENOENT') {
      throw new Error(`File '${args.fileName}' not found in TSG '${args.tsgName}'`);
    }
    throw error;
  }
}

async function listTSGFiles(tsgPath: string, relativePath: string = ''): Promise<TSGFile[]> {
  const files: TSGFile[] = [];
  const fullPath = path.join(tsgPath, relativePath);
  
  try {
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const entryPath = path.join(relativePath, entry.name);
      
      if (entry.isDirectory()) {
        files.push({
          path: entryPath,
          name: entry.name,
          size: 0,
          isDirectory: true
        });
        
        // Recursively list subdirectories
        const subFiles = await listTSGFiles(tsgPath, entryPath);
        files.push(...subFiles);
      } else {
        const stats = await fs.stat(path.join(fullPath, entry.name));
        files.push({
          path: entryPath,
          name: entry.name,
          size: stats.size,
          isDirectory: false
        });
      }
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`TSG '${path.basename(tsgPath)}' not found`);
    }
    throw error;
  }
  
  return files;
}

async function searchTSGContent(tsgPath: string, query: string): Promise<string> {
  const results: string[] = [];
  const files = await listTSGFiles(tsgPath);
  
  for (const file of files) {
    if (file.isDirectory) continue;
    
    // Only search in text files
    const ext = path.extname(file.name).toLowerCase();
    if (!['.md', '.txt', '.log', '.json', '.yaml', '.yml'].includes(ext)) {
      continue;
    }
    
    try {
      const content = await fs.readFile(path.join(tsgPath, file.path), 'utf-8');
      const lines = content.split('\n');
      const matches: string[] = [];
      
      lines.forEach((line, index) => {
        if (line.toLowerCase().includes(query.toLowerCase())) {
          matches.push(`  Line ${index + 1}: ${line.trim()}`);
        }
      });
      
      if (matches.length > 0) {
        results.push(`\n### ${file.path} (${matches.length} matches)\n${matches.slice(0, 5).join('\n')}`);
        if (matches.length > 5) {
          results.push(`  ... and ${matches.length - 5} more matches`);
        }
      }
    } catch (error) {
      // Skip files that can't be read
      continue;
    }
  }
  
  if (results.length === 0) {
    return `No matches found for "${query}" in TSG files`;
  }
  
  return `Search results for "${query}":\n${results.join('\n')}`;
}

// Helper to list available TSGs
export async function listAvailableTSGs(): Promise<string[]> {
  const tsgsPath = path.dirname(getTSGStoragePath(''));
  
  try {
    const entries = await fs.readdir(tsgsPath, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}
```

## Step 4: Create Storage Management Utilities

### 4.1 Session storage management
**New file**: `codex-cli/src/utils/storage/session-storage.ts`

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';

const CODEX_HOME = path.join(homedir(), '.codex');
const SESSIONS_DIR = path.join(CODEX_HOME, 'sessions');

export function getSessionStoragePath(sessionId: string): string {
  return path.join(SESSIONS_DIR, sessionId);
}

export async function initializeSessionStorage(sessionId: string): Promise<void> {
  const sessionPath = getSessionStoragePath(sessionId);
  const uploadsPath = path.join(sessionPath, 'uploads');
  
  await fs.mkdir(uploadsPath, { recursive: true });
}

export async function saveSessionFile(
  sessionId: string,
  fileName: string,
  content: Buffer | string
): Promise<string> {
  await initializeSessionStorage(sessionId);
  
  const uploadsPath = path.join(getSessionStoragePath(sessionId), 'uploads');
  const filePath = path.join(uploadsPath, sanitizeFileName(fileName));
  
  await fs.writeFile(filePath, content);
  return filePath;
}

export async function cleanupOldSessions(maxAgeHours: number = 24): Promise<void> {
  try {
    const sessions = await fs.readdir(SESSIONS_DIR);
    const now = Date.now();
    const maxAge = maxAgeHours * 60 * 60 * 1000;
    
    for (const sessionId of sessions) {
      const sessionPath = path.join(SESSIONS_DIR, sessionId);
      const stats = await fs.stat(sessionPath);
      
      if (now - stats.mtimeMs > maxAge) {
        await fs.rm(sessionPath, { recursive: true, force: true });
      }
    }
  } catch (error) {
    // Ignore errors during cleanup
  }
}

function sanitizeFileName(fileName: string): string {
  // Remove path traversal attempts and invalid characters
  return fileName
    .replace(/[.]{2,}/g, '')
    .replace(/[\/\\]/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_');
}
```

### 4.2 TSG storage management
**New file**: `codex-cli/src/utils/storage/tsg-storage.ts`

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';

const CODEX_HOME = path.join(homedir(), '.codex');
const TSGS_DIR = path.join(CODEX_HOME, 'tsgs');

export function getTSGStoragePath(tsgName: string): string {
  return path.join(TSGS_DIR, sanitizeTSGName(tsgName));
}

export async function createTSG(tsgName: string): Promise<void> {
  const tsgPath = getTSGStoragePath(tsgName);
  await fs.mkdir(tsgPath, { recursive: true });
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
  
  for (const file of files) {
    const filePath = path.join(tsgPath, file.path);
    const dirPath = path.dirname(filePath);
    
    await fs.mkdir(dirPath, { recursive: true });
    await fs.writeFile(filePath, file.content);
  }
}

export async function listTSGs(): Promise<string[]> {
  try {
    const entries = await fs.readdir(TSGS_DIR, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  } catch (error) {
    if (error.code === 'ENOENT') {
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
```

## Step 5: Update Agent Loop to Include New Tools

### 5.1 Update agent-loop.ts
**File**: `codex-cli/src/utils/agent/agent-loop.ts`

```typescript
import { logAnalyzerTool, executeLogAnalyzer } from './tools/log-analyzer';
import { sessionFileReaderTool, executeSessionFileReader } from './tools/session-file-reader';
import { tsgReaderTool, executeTSGReader } from './tools/tsg-reader';

// Add to tools array
const tools = [
  {
    type: 'function' as const,
    function: {
      name: 'shell',
      description: 'Execute shell commands for log analysis and system inspection',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The shell command to execute (read-only operations only)'
          }
        },
        required: ['command']
      }
    }
  },
  logAnalyzerTool,
  sessionFileReaderTool,
  tsgReaderTool
];

// Update tool execution handler
async function executeToolCall(toolCall: ToolCall, context: AgentContext): Promise<any> {
  switch (toolCall.function.name) {
    case 'shell': {
      // Existing shell command handling
      const args = JSON.parse(toolCall.function.arguments);
      const validation = validateCommand(args.command);
      if (!validation.allowed) {
        throw new Error(validation.reason);
      }
      return await executeShellCommand(args.command);
    }
    
    case 'analyze_logs': {
      const args = JSON.parse(toolCall.function.arguments);
      return await executeLogAnalyzer(args);
    }
    
    case 'read_session_file': {
      const args = JSON.parse(toolCall.function.arguments);
      return await executeSessionFileReader(args, context.sessionId);
    }
    
    case 'read_tsg': {
      const args = JSON.parse(toolCall.function.arguments);
      return await executeTSGReader(args);
    }
    
    default:
      throw new Error(`Unknown tool: ${toolCall.function.name}`);
  }
}
```

## Step 6: Create Tests for New Tools

### 6.1 Log analyzer tests
**New file**: `codex-cli/tests/log-analyzer.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { executeLogAnalyzer } from '../src/utils/agent/tools/log-analyzer';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

describe('Log Analyzer Tool', () => {
  let testDir: string;
  let testLogFile: string;
  
  beforeEach(async () => {
    testDir = path.join(tmpdir(), `log-analyzer-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    
    // Create test log file
    testLogFile = path.join(testDir, 'test.log');
    const logContent = `
2024-01-01 10:00:00 INFO Application started
2024-01-01 10:00:01 ERROR Connection refused to database
2024-01-01 10:00:02 WARNING Memory usage above 80%
2024-01-01 10:00:03 ERROR Timeout connecting to service
2024-01-01 10:00:04 INFO Request processed successfully
2024-01-01 10:00:05 FATAL Application crashed with OutOfMemoryError
    `.trim();
    
    await fs.writeFile(testLogFile, logContent);
  });
  
  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });
  
  it('should analyze log patterns', async () => {
    const result = await executeLogAnalyzer({
      files: [testLogFile]
    });
    
    expect(result.summary.totalLines).toBe(6);
    expect(result.summary.errorCount).toBe(3); // ERROR, FATAL, Timeout
    expect(result.summary.warningCount).toBe(1);
    
    const errorPattern = result.patterns.find(p => p.category === 'errors');
    expect(errorPattern).toBeDefined();
    expect(errorPattern?.count).toBeGreaterThan(0);
  });
  
  it('should filter by query', async () => {
    const result = await executeLogAnalyzer({
      files: [testLogFile],
      query: 'database'
    });
    
    expect(result.summary.totalLines).toBeLessThan(6);
    expect(result.patterns.length).toBeGreaterThan(0);
  });
  
  it('should extract timeline', async () => {
    const result = await executeLogAnalyzer({
      files: [testLogFile],
      includeTimeline: true
    });
    
    expect(result.timeline).toBeDefined();
    expect(result.timeline!.length).toBeGreaterThan(0);
    expect(result.summary.timeRange).toBeDefined();
  });
});
```

### 6.2 Session file reader tests
**New file**: `codex-cli/tests/session-file-reader.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { executeSessionFileReader } from '../src/utils/agent/tools/session-file-reader';
import { saveSessionFile, initializeSessionStorage } from '../src/utils/storage/session-storage';
import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';

describe('Session File Reader Tool', () => {
  const testSessionId = 'test-session-123';
  const testContent = 'Test log content\nLine 2\nLine 3';
  
  beforeEach(async () => {
    await initializeSessionStorage(testSessionId);
    await saveSessionFile(testSessionId, 'test.log', testContent);
  });
  
  afterEach(async () => {
    const sessionPath = path.join(homedir(), '.codex', 'sessions', testSessionId);
    await fs.rm(sessionPath, { recursive: true, force: true });
  });
  
  it('should read session file', async () => {
    const content = await executeSessionFileReader({
      fileName: 'test.log'
    }, testSessionId);
    
    expect(content).toBe(testContent);
  });
  
  it('should read line range', async () => {
    const content = await executeSessionFileReader({
      fileName: 'test.log',
      lineRange: { start: 2, end: 2 }
    }, testSessionId);
    
    expect(content).toBe('Line 2');
  });
  
  it('should handle file not found', async () => {
    await expect(executeSessionFileReader({
      fileName: 'nonexistent.log'
    }, testSessionId)).rejects.toThrow('not found');
  });
});
```

## Step 7: Update Agent Context

### 7.1 Add context about available files
**File**: `codex-cli/src/utils/agent/agent-loop.ts`

```typescript
// Add to agent context builder
async function buildAgentContext(sessionId: string, activeTSG?: string): Promise<string> {
  const sessionFiles = await listSessionFiles(sessionId);
  const availableTSGs = await listAvailableTSGs();
  
  let context = `
## Available Tools
- shell: Execute read-only shell commands
- analyze_logs: Analyze log files for patterns and errors
- read_session_file: Read files uploaded in this session
- read_tsg: Read troubleshooting guide documentation

## Session Context
- Session ID: ${sessionId}
- Uploaded files: ${sessionFiles.join(', ') || 'None'}
`;

  if (activeTSG) {
    const tsgFiles = await executeTSGReader({ tsgName: activeTSG });
    context += `
## Active TSG: ${activeTSG}
The user has selected the "${activeTSG}" troubleshooting guide. Use the read_tsg tool to access relevant documentation.
`;
  }

  context += `
## Available TSGs: ${availableTSGs.join(', ') || 'None'}
`;

  return context;
}
```

## Verification Checklist

After implementing Phase 2:

1. [ ] Log analyzer tool can process multiple log files
2. [ ] Pattern detection identifies errors, warnings, and common issues
3. [ ] Session file reader can access uploaded files
4. [ ] TSG reader can list and read TSG documentation
5. [ ] Storage utilities create proper directory structure
6. [ ] Security checks prevent path traversal
7. [ ] Tests pass for all new tools
8. [ ] Agent context includes file information

## Next Steps

After Phase 2 is complete:
- Phase 3: Create TSG management system (backend WebSocket handlers)
- Phase 4: Build UI components for TSG management
- Phase 5: Implement file upload functionality in the UI