# Phase 6: Update Agent Prompt and Behavior for Log Analysis - Technical Implementation Guide

## Overview
This phase transforms the agent's behavior from a coding assistant to a specialized log analyzer, updating prompts, system messages, and interaction patterns to focus on log investigation and troubleshooting.

## Step 1: Create Log Analyzer System Prompts

### 1.1 Main system prompt
**New file**: `codex-cli/src/prompts/log-analyzer-prompt.ts`

```typescript
export const LOG_ANALYZER_SYSTEM_PROMPT = `You are MTR Log Analyzer, a specialized AI assistant focused on analyzing log files and helping users troubleshoot issues.

## Your Capabilities
1. **Log Analysis**: Analyze uploaded log files to identify errors, warnings, patterns, and anomalies
2. **Pattern Recognition**: Detect common issues like timeouts, authentication failures, memory problems
3. **Timeline Analysis**: Understand event sequences and correlate timestamps
4. **Troubleshooting**: Provide actionable insights based on log content and TSG documentation

## Available Tools
- **shell**: Execute read-only commands for system inspection and log analysis
- **read_tsg**: Access troubleshooting guide documentation

## Important Constraints
- You CANNOT create, modify, or delete any files
- You can only read and analyze existing files
- Shell commands are restricted to read-only operations

## Interaction Guidelines
1. **Be Investigative**: Ask clarifying questions to understand the issue
2. **Be Specific**: Point to exact log entries and timestamps when discussing issues
3. **Be Actionable**: Provide clear steps for resolution
4. **Use TSGs**: When available, reference TSG documentation for known solutions
5. **Correlate Events**: Look for patterns across multiple log files

## Response Format
When analyzing logs:
1. Start with a summary of what you found
2. List specific errors or warnings with timestamps
3. Identify patterns or recurring issues
4. Provide recommendations based on findings
5. Reference TSG documentation when applicable`;

export const LOG_ANALYZER_CONTEXT_PROMPT = `## Current Session Information
{sessionContext}

## How to Proceed
1. If files are uploaded, start by analyzing them with shell commands (grep, awk, cat, etc.)
2. For specific investigations, use shell commands to examine particular sections
3. If a TSG is active, check for relevant troubleshooting procedures
4. Use shell commands to gather additional system information if needed

Remember: Focus on investigation and analysis, not file manipulation.`;
```

### 1.2 Specialized prompts for different scenarios
**New file**: `codex-cli/src/prompts/scenario-prompts.ts`

```typescript
export const SCENARIO_PROMPTS = {
  noFiles: `I see no log files have been uploaded yet. To help you analyze logs, please:
1. Click the paperclip icon to upload log files
2. You can upload multiple files at once
3. Supported formats include .log, .txt, .json, .xml, .csv

What type of issue are you trying to investigate?`,

  withTSG: `I see you have the "{tsgName}" troubleshooting guide active. I'll use this documentation to help analyze your logs.

What specific issue are you experiencing? I can check the TSG for relevant troubleshooting procedures.`,

  initialAnalysis: `I'll analyze the uploaded log files to identify any issues. Let me start by:
1. Scanning for errors and warnings
2. Identifying patterns
3. Checking timestamps for correlation
4. Looking for known issues

Please wait while I examine the files...`,

  multipleFiles: `I see you've uploaded {count} log files. I'll analyze them together to:
1. Correlate events across files
2. Build a timeline of issues
3. Identify root causes

This will help us understand the full picture of what's happening.`
};
```

## Step 2: Update Agent Loop for Log Analysis

### 2.1 Modify agent initialization
**File**: `codex-cli/src/utils/agent/agent-loop.ts`

```typescript
import { LOG_ANALYZER_SYSTEM_PROMPT, LOG_ANALYZER_CONTEXT_PROMPT } from '../../prompts/log-analyzer-prompt';
import { SCENARIO_PROMPTS } from '../../prompts/scenario-prompts';

export async function createAgentLoop(options: AgentLoopOptions) {
  const { sessionId, sessionManager, socket } = options;
  
  // Build initial context
  const session = sessionManager.getSession(sessionId);
  const sessionContext = await buildAgentContext(sessionId, session?.activeTSG);
  
  // Determine initial scenario
  const scenario = determineScenario(session);
  
  // Create system message
  const systemMessage = {
    role: 'system',
    content: LOG_ANALYZER_SYSTEM_PROMPT + '\n\n' + 
             LOG_ANALYZER_CONTEXT_PROMPT.replace('{sessionContext}', sessionContext)
  };
  
  // Add scenario-specific initial message if needed
  if (scenario && SCENARIO_PROMPTS[scenario]) {
    const initialAssistantMessage = {
      role: 'assistant',
      content: formatScenarioPrompt(SCENARIO_PROMPTS[scenario], session)
    };
    session.messages.push(initialAssistantMessage);
  }
  
  // Continue with agent loop...
}

function determineScenario(session: Session): string | null {
  if (!session.uploadedFiles || session.uploadedFiles.length === 0) {
    return 'noFiles';
  }
  
  if (session.uploadedFiles.length === 1 && session.messages.length === 0) {
    return 'initialAnalysis';
  }
  
  if (session.uploadedFiles.length > 1 && session.messages.length === 0) {
    return 'multipleFiles';
  }
  
  if (session.activeTSG && session.messages.length === 0) {
    return 'withTSG';
  }
  
  return null;
}

function formatScenarioPrompt(prompt: string, session: Session): string {
  return prompt
    .replace('{tsgName}', session.activeTSG || '')
    .replace('{count}', session.uploadedFiles.length.toString());
}
```

## Step 3: Create Intelligent Log Analysis Behaviors

### 3.1 Auto-analysis on file upload
**New file**: `codex-cli/src/utils/agent/auto-analysis.ts`

```typescript
export interface AutoAnalysisConfig {
  enabled: boolean;
  triggerOnUpload: boolean;
  minFileSizeForAuto: number; // bytes
  maxFileSizeForAuto: number; // bytes
}

export const DEFAULT_AUTO_ANALYSIS_CONFIG: AutoAnalysisConfig = {
  enabled: true,
  triggerOnUpload: true,
  minFileSizeForAuto: 100, // 100 bytes
  maxFileSizeForAuto: 10 * 1024 * 1024 // 10MB
};

export async function shouldAutoAnalyze(
  session: Session,
  newFiles: SessionFile[]
): Promise<boolean> {
  const config = await getAutoAnalysisConfig();
  
  if (!config.enabled || !config.triggerOnUpload) {
    return false;
  }
  
  // Check if files are within size limits
  const eligibleFiles = newFiles.filter(
    file => file.size >= config.minFileSizeForAuto && 
            file.size <= config.maxFileSizeForAuto
  );
  
  return eligibleFiles.length > 0;
}

export function generateAutoAnalysisMessage(files: SessionFile[]): string {
  const fileList = files.map(f => `- ${f.name} (${f.type})`).join('\n');
  
  return `I see you've uploaded the following log files:\n${fileList}\n\n` +
         `Let me analyze these files to identify any issues or patterns.`;
}
```

### 3.2 Update WebSocket handler for auto-analysis
**File**: `codex-cli/src/web-server/websocket-handler.ts`

```typescript
import { shouldAutoAnalyze, generateAutoAnalysisMessage } from '../utils/agent/auto-analysis';

// Update session file upload handler
private async handleSessionFileUpload(socket: Socket, message: SessionFileUploadMessage) {
  // ... existing upload logic ...
  
  // After successful upload
  const newFiles = uploadedFiles.map(f => ({
    name: f.name,
    path: f.path,
    size: f.size,
    type: f.type,
    uploadedAt: new Date().toISOString()
  }));
  
  // Check if we should auto-analyze
  if (await shouldAutoAnalyze(session, newFiles)) {
    // Send auto-analysis trigger
    socket.emit('message', {
      type: 'auto-analysis:trigger',
      data: {
        message: generateAutoAnalysisMessage(newFiles),
        files: newFiles.map(f => f.name)
      }
    });
  }
}
```

## Step 4: Enhanced Error Messages and Guidance

### 4.1 Create helpful error responses
**New file**: `codex-cli/src/utils/agent/error-responses.ts`

```typescript
export const ERROR_RESPONSES = {
  fileNotFound: (fileName: string) => `I couldn't find the file "${fileName}". Available files are:
{fileList}

Please check the file name and try again.`,

  noFilesUploaded: `No log files have been uploaded yet. To analyze logs:
1. Click the paperclip icon in the chat input
2. Select your log files (you can select multiple)
3. Click upload

Supported formats: .log, .txt, .json, .xml, .csv`,

  commandBlocked: (command: string) => `I cannot execute that command because it would modify files. As a log analyzer, I can only perform read operations.

Instead, I can help you:
- Analyze log files for errors and patterns
- Search for specific content in logs
- Correlate events across multiple files
- Provide troubleshooting guidance

What would you like me to investigate?`,

  tsgNotFound: (tsgName: string) => `The TSG "${tsgName}" was not found. Available TSGs are:
{tsgList}

You can create a new TSG or select an existing one from the settings.`,

  analysisError: (error: string) => `I encountered an error while analyzing the logs:
${error}

This might be due to:
- Corrupted log file format
- Unsupported encoding
- File size limitations

Please try:
1. Checking the file format
2. Uploading a smaller portion of the log
3. Converting the file to UTF-8 encoding`
};

export function formatErrorResponse(
  template: string, 
  context: Record<string, any>
): string {
  let response = template;
  
  for (const [key, value] of Object.entries(context)) {
    response = response.replace(`{${key}}`, value);
  }
  
  return response;
}
```

## Step 5: Update Frontend for Log Analysis UX

### 5.1 Add auto-analysis handling
**File**: `codex-web/src/components/ChatView.tsx`

```typescript
// Add to ChatView component
useEffect(() => {
  if (!socket) return;
  
  socket.on('message', (message) => {
    if (message.type === 'auto-analysis:trigger') {
      // Automatically send the analysis request
      handleSendMessage(message.data.message);
    }
  });
  
  return () => {
    socket.off('message');
  };
}, [socket]);

// Add welcome message for new sessions
useEffect(() => {
  if (messages.length === 0 && !hasShownWelcome) {
    const welcomeMessage: Message = {
      role: 'assistant',
      content: `Welcome to MTR Log Analyzer! I'm here to help you analyze log files and troubleshoot issues.

To get started:
1. Upload log files using the 📎 button
2. Select a TSG from settings if you have specific troubleshooting guides
3. Ask me questions about your logs

I can identify errors, detect patterns, and provide troubleshooting guidance based on your logs.`
    };
    
    addMessage(welcomeMessage);
    setHasShownWelcome(true);
  }
}, [messages, hasShownWelcome]);
```

### 5.2 Add visual indicators for analysis
**New file**: `codex-web/src/components/AnalysisIndicator.tsx`

```tsx
import React from 'react';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface AnalysisIndicatorProps {
  status: 'idle' | 'analyzing' | 'complete' | 'error';
  fileCount?: number;
  errorCount?: number;
  warningCount?: number;
}

export function AnalysisIndicator({ 
  status, 
  fileCount = 0, 
  errorCount = 0, 
  warningCount = 0 
}: AnalysisIndicatorProps) {
  if (status === 'idle') return null;
  
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 dark:bg-blue-900 rounded-lg mb-2">
      {status === 'analyzing' && (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Analyzing {fileCount} files...</span>
        </>
      )}
      
      {status === 'complete' && (
        <>
          <CheckCircle className="w-4 h-4 text-green-600" />
          <span className="text-sm">
            Analysis complete: {errorCount > 0 && `${errorCount} errors, `}
            {warningCount > 0 && `${warningCount} warnings`}
            {errorCount === 0 && warningCount === 0 && 'No issues found'}
          </span>
        </>
      )}
      
      {status === 'error' && (
        <>
          <AlertCircle className="w-4 h-4 text-red-600" />
          <span className="text-sm">Analysis failed. Please try again.</span>
        </>
      )}
    </div>
  );
}
```

## Step 6: Update Tool Descriptions for Clarity

### 6.1 Enhanced tool descriptions
**File**: `codex-cli/src/utils/agent/tools/log-analyzer.ts`

```typescript
export const logAnalyzerTool: Tool = {
  type: 'function',
  function: {
    name: 'analyze_logs',
    description: `Analyze log files to identify errors, warnings, patterns, and anomalies.
    
This tool will:
- Scan for error patterns and severity levels
- Extract timestamps and build event timelines  
- Identify common issues (timeouts, auth failures, memory problems)
- Provide statistical summary of log contents
- Sample problematic log entries

Use this as your primary tool for initial log investigation.`,
    parameters: {
      // ... existing parameters ...
    }
  }
};
```

## Step 7: Agent Behavior Configuration

### 7.1 Create behavior configuration
**New file**: `codex-cli/src/utils/agent/behavior-config.ts`

```typescript
export interface AgentBehaviorConfig {
  mode: 'log-analyzer';
  autoAnalysis: {
    enabled: boolean;
    onFileUpload: boolean;
    summaryFirst: boolean;
  };
  responses: {
    includeLineNumbers: boolean;
    maxLogLinesInResponse: number;
    groupSimilarErrors: boolean;
    includeTimestamps: boolean;
  };
  investigation: {
    askClarifyingQuestions: boolean;
    suggestNextSteps: boolean;
    correlateAcrossFiles: boolean;
  };
}

export const DEFAULT_BEHAVIOR_CONFIG: AgentBehaviorConfig = {
  mode: 'log-analyzer',
  autoAnalysis: {
    enabled: true,
    onFileUpload: true,
    summaryFirst: true
  },
  responses: {
    includeLineNumbers: true,
    maxLogLinesInResponse: 10,
    groupSimilarErrors: true,
    includeTimestamps: true
  },
  investigation: {
    askClarifyingQuestions: true,
    suggestNextSteps: true,
    correlateAcrossFiles: true
  }
};

export function getAgentInstruction(config: AgentBehaviorConfig): string {
  const instructions: string[] = [];
  
  if (config.responses.includeLineNumbers) {
    instructions.push('Always include line numbers when referencing log entries');
  }
  
  if (config.responses.groupSimilarErrors) {
    instructions.push('Group similar errors together in your analysis');
  }
  
  if (config.investigation.askClarifyingQuestions) {
    instructions.push('Ask clarifying questions to better understand the issue');
  }
  
  if (config.investigation.suggestNextSteps) {
    instructions.push('Always suggest next steps for investigation or resolution');
  }
  
  return instructions.join('\n');
}
```

## Step 8: Remove Coding References

### 8.1 Clean up any coding-related content
**File**: `codex-cli/src/utils/agent/agent-loop.ts`

```typescript
// Remove or comment out:
// - References to file editing
// - Code generation prompts  
// - Programming language mentions
// - Git operations
// - Package management

// Replace with log analysis focused content
const REMOVED_PATTERNS = [
  /create.*file/i,
  /edit.*code/i,
  /implement.*feature/i,
  /git.*(add|commit|push)/i,
  /npm.*(install|update)/i,
  /write.*function/i
];

export function filterUserMessage(message: string): string {
  for (const pattern of REMOVED_PATTERNS) {
    if (pattern.test(message)) {
      return `I understand you're asking about file operations, but I'm a log analyzer and can only read and analyze files. 

How can I help you investigate your logs instead?`;
    }
  }
  return message;
}
```

## Verification Checklist

After implementing Phase 6:

1. [ ] Agent introduces itself as a log analyzer
2. [ ] System prompts focus on log analysis
3. [ ] Auto-analysis triggers on file upload
4. [ ] Error messages guide users appropriately
5. [ ] No references to file editing remain
6. [ ] Tool descriptions are clear for log analysis
7. [ ] Agent asks investigative questions
8. [ ] TSG context is properly utilized
9. [ ] Responses include specific log references
10. [ ] Agent suggests troubleshooting steps

## Configuration Examples

### Example 1: Error Investigation
```
User: "I'm seeing errors in my application"
Agent: "I'll help you investigate those errors. I see you've uploaded app.log. Let me analyze it for error patterns.

[Runs shell command: grep -i "error\|fail\|exception" app.log | head -20]

I found 15 errors in your log file:
- 8 timeout errors between 14:30-14:45
- 5 database connection errors at 14:32
- 2 authentication failures at 14:28

The timeline suggests the authentication failures may have triggered the subsequent issues. 

Would you like me to examine the specific error messages around 14:28?"
```

### Example 2: With TSG Active
```
User: "The meeting room isn't connecting"
Agent: "I see you have the 'Meeting Room Team TSG' active. Let me check for relevant troubleshooting procedures while analyzing your logs.

[Runs read_tsg tool]
[Runs shell command: grep -i "error\|fail\|exception" app.log | head -20]

Based on the TSG documentation and your logs, I found:
1. Multiple 'connection refused' errors to the signaling server
2. The TSG suggests this often indicates firewall issues

The troubleshooting steps from the TSG recommend:
1. Check port 443 is open
2. Verify the proxy settings
3. Test with 'telnet signal.teams.microsoft.com 443'

Shall I guide you through these steps?"
```

## Next Steps

After Phase 6 is complete:
- Phase 7: Comprehensive testing and integration
- Create user documentation
- Prepare migration guide