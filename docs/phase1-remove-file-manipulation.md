# Phase 1: Remove File Manipulation - Technical Implementation Guide

## Overview
This guide provides step-by-step instructions for removing all file manipulation capabilities from the MTR agent system while preserving read-only operations needed for log analysis.

## Step 1: Update Agent Tools Configuration

### 1.1 Modify agent-loop.ts
**File**: `codex-cli/src/utils/agent/agent-loop.ts`

Remove the apply_patch tool from the tools array:

```typescript
// Remove this import
// import { applyPatchTool } from './apply-patch';

// Update tools array (around line where tools are defined)
const tools = [
  // Keep only read-only tools
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
  }
  // Remove apply_patch tool
];
```

### 1.2 Modify agent-loop-refactored.ts
**File**: `codex-cli/src/utils/agent/agent-loop-refactored.ts`

Apply similar changes to the refactored version if it exists.

## Step 2: Update Shell Command Validation

### 2.1 Create command validator
**New file**: `codex-cli/src/utils/agent/command-validator.ts`

```typescript
const BLOCKED_COMMANDS = [
  // File write operations
  'echo.*>',    // Redirect output
  'echo.*>>',   // Append output
  'cat.*>',     // Redirect cat
  'tee',        // Tee command
  'dd',         // Disk operations
  'cp',         // Copy files
  'mv',         // Move files
  'rm',         // Remove files
  'touch',      // Create files
  'mkdir',      // Create directories
  'rmdir',      // Remove directories
  'chmod',      // Change permissions
  'chown',      // Change ownership
  
  // Editors
  'vi', 'vim', 'nano', 'emacs', 'code', 'subl',
  
  // Package managers (prevent installation)
  'npm install', 'yarn add', 'pip install', 'apt install',
  
  // Git write operations
  'git add', 'git commit', 'git push', 'git rm',
  'git reset', 'git revert', 'git merge'
];

const ALLOWED_PATTERNS = [
  // Explicitly allowed read operations
  /^(ls|dir|find|grep|cat|head|tail|less|more)\s/,
  /^(ps|top|htop|df|du|free|uname|whoami|pwd|date)\s/,
  /^git (status|log|diff|show|branch|remote)\s/,
  /^(curl|wget).*(-O-|-o-|--output-)/  // Only to stdout
];

export function validateCommand(command: string): {
  allowed: boolean;
  reason?: string;
} {
  const trimmedCommand = command.trim();
  
  // Check against blocked patterns
  for (const pattern of BLOCKED_COMMANDS) {
    const regex = new RegExp(pattern, 'i');
    if (regex.test(trimmedCommand)) {
      return {
        allowed: false,
        reason: `File manipulation commands are not allowed. Command matches blocked pattern: ${pattern}`
      };
    }
  }
  
  // Check for shell redirects
  if (/[>|&]/.test(trimmedCommand)) {
    return {
      allowed: false,
      reason: 'Shell redirects and pipes that write to files are not allowed'
    };
  }
  
  // Verify it's a read-only operation
  const isExplicitlyAllowed = ALLOWED_PATTERNS.some(pattern => 
    pattern.test(trimmedCommand)
  );
  
  if (!isExplicitlyAllowed) {
    // Default to blocking unknown commands that might write
    const firstWord = trimmedCommand.split(/\s+/)[0];
    if (!['ls', 'cat', 'grep', 'find', 'head', 'tail', 'less', 'more', 'ps', 'df'].includes(firstWord)) {
      return {
        allowed: false,
        reason: `Command '${firstWord}' is not in the allowed list of read-only operations`
      };
    }
  }
  
  return { allowed: true };
}
```

### 2.2 Update handle-exec-command.ts
**File**: `codex-cli/src/utils/agent/handle-exec-command.ts`

```typescript
import { validateCommand } from './command-validator';

export async function handleExecCommand(
  command: string,
  // ... other parameters
): Promise<ExecResult> {
  // Add validation before execution
  const validation = validateCommand(command);
  if (!validation.allowed) {
    throw new Error(`Command blocked: ${validation.reason}`);
  }
  
  // Continue with existing execution logic
  // ...
}
```

## Step 3: Remove File Operation Utilities

### 3.1 Remove or disable files
Mark these files for removal or comment out their exports:

- `codex-cli/src/utils/agent/apply-patch.ts`
- `codex-cli/src/utils/singlepass/file_ops.ts`
- `codex-cli/src/parse-apply-patch.ts`

### 3.2 Update imports
Search for and remove imports of these files throughout the codebase:

```bash
# Find all imports of apply-patch
grep -r "from.*apply-patch" codex-cli/src/
grep -r "require.*apply-patch" codex-cli/src/

# Find all imports of file_ops
grep -r "from.*file_ops" codex-cli/src/
```

## Step 4: Update Tool Call Handlers

### 4.1 Modify tool execution
**File**: `codex-cli/src/utils/agent/agent-loop.ts`

Update the tool call handler to remove apply_patch handling:

```typescript
// In the tool execution section
if (toolCall.function.name === 'shell') {
  // Keep existing shell handling but with validation
  const args = JSON.parse(toolCall.function.arguments);
  const validation = validateCommand(args.command);
  
  if (!validation.allowed) {
    throw new Error(validation.reason);
  }
  
  // Execute command
  const result = await executeShellCommand(args.command);
  return result;
} 
// Remove apply_patch handling
// else if (toolCall.function.name === 'apply_patch') { ... }
```

## Step 5: Update Tests

### 5.1 Disable file manipulation tests
Comment out or remove test files:
- `codex-cli/tests/apply-patch.test.ts`
- `codex-cli/tests/exec-apply-patch.test.ts`
- `codex-cli/tests/parse-apply-patch.test.ts`

### 5.2 Add command validation tests
**New file**: `codex-cli/tests/command-validator.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { validateCommand } from '../src/utils/agent/command-validator';

describe('Command Validator', () => {
  describe('blocked commands', () => {
    const blockedCommands = [
      'echo "test" > file.txt',
      'cat file.txt > output.txt',
      'rm -rf /',
      'mv file1.txt file2.txt',
      'cp source.txt dest.txt',
      'touch newfile.txt',
      'vim file.txt',
      'git add .',
      'npm install express'
    ];
    
    blockedCommands.forEach(cmd => {
      it(`should block: ${cmd}`, () => {
        const result = validateCommand(cmd);
        expect(result.allowed).toBe(false);
        expect(result.reason).toBeDefined();
      });
    });
  });
  
  describe('allowed commands', () => {
    const allowedCommands = [
      'ls -la',
      'cat file.txt',
      'grep "error" logfile.txt',
      'find . -name "*.log"',
      'ps aux',
      'git status',
      'git log --oneline',
      'curl https://api.example.com'
    ];
    
    allowedCommands.forEach(cmd => {
      it(`should allow: ${cmd}`, () => {
        const result = validateCommand(cmd);
        expect(result.allowed).toBe(true);
      });
    });
  });
});
```

## Step 6: Update Agent System Prompt

### 6.1 Modify system prompts
Update any system prompts that mention file editing capabilities:

**Files to check**:
- `codex-cli/src/prompts/`
- `codex-rs/core/prompt.md`
- Any inline prompts in agent-loop.ts

Replace mentions of file editing with log analysis focus:

```typescript
const SYSTEM_PROMPT = `You are a specialized log analysis assistant. 
You can read and analyze files, but you cannot create, modify, or delete files.
Focus on investigating logs, identifying patterns, and providing insights.
Use shell commands for read-only operations like grep, cat, find, etc.`;
```

## Step 7: Update Error Messages

### 7.1 Create user-friendly error messages
**File**: `codex-cli/src/utils/agent/agent-loop.ts`

```typescript
// When a blocked command is attempted
catch (error) {
  if (error.message.includes('Command blocked')) {
    return {
      role: 'assistant',
      content: `I cannot execute that command because it would modify files. 
      As a log analyzer, I can only perform read operations. 
      Would you like me to help you analyze the logs in a different way?`
    };
  }
  // Handle other errors
}
```

## Step 8: Configuration Updates

### 8.1 Update default configuration
**File**: `codex-cli/src/utils/config.ts`

Remove or disable any configuration related to file operations:

```typescript
export const DEFAULT_CONFIG = {
  // Remove or comment out
  // autoApprove: false,
  // fileOperations: { enabled: false },
  
  // Keep these
  shellCommands: {
    enabled: true,
    readOnly: true,  // New flag
    maxOutputBytes: 100000,
    timeout: 30000
  }
};
```

## Verification Checklist

After implementing these changes, verify:

1. [ ] `apply_patch` tool is removed from agent tools
2. [ ] File write commands are blocked (test with `echo "test" > file.txt`)
3. [ ] Read commands still work (test with `cat README.md`)
4. [ ] Git read operations work (test with `git log`)
5. [ ] File manipulation tests are disabled
6. [ ] Command validation tests pass
7. [ ] Agent cannot create/modify/delete files through any means
8. [ ] Error messages are user-friendly when blocked commands are attempted

## Rollback Plan

If issues arise:

1. Git revert the commits
2. Restore original agent-loop.ts
3. Re-enable apply_patch tool
4. Remove command validator

Keep the changes in a separate branch until fully tested.

## Next Steps

After Phase 1 is complete and verified:
- Proceed to Phase 2: Implement log analysis tools
- Begin designing the TSG storage system
- Plan the UI components for file upload