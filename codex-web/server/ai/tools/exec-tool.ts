import { spawn } from 'child_process';
import { log, error as logError } from '../../utils/logger.js';

interface CommandResult {
  output: string;
  metadata: {
    exit_code: number;
    duration_seconds: number;
  };
}

// Simple command validation - in production, use more robust sandboxing
function isCommandSafe(command: string[]): boolean {
  const dangerousCommands = ['rm', 'del', 'format', 'dd', 'mkfs', 'fdisk'];
  const firstArg = command[0]?.toLowerCase();
  
  if (dangerousCommands.includes(firstArg)) {
    return false;
  }
  
  // Check for dangerous patterns
  const commandStr = command.join(' ');
  const dangerousPatterns = [
    /rm\s+-rf/i,
    />\s*\/dev\//,
    /\/etc\/passwd/,
    /\/etc\/shadow/
  ];
  
  return !dangerousPatterns.some(pattern => pattern.test(commandStr));
}

export async function executeCommand(
  command: string[],
  sessionId: string
): Promise<CommandResult> {
  const startTime = Date.now();
  
  // Basic safety check
  if (!isCommandSafe(command)) {
    return {
      output: 'Command blocked for safety reasons',
      metadata: {
        exit_code: 1,
        duration_seconds: 0
      }
    };
  }
  
  return new Promise((resolve) => {
    const cmd = command[0];
    const args = command.slice(1);
    
    log(`Executing command: ${command.join(' ')} (session: ${sessionId})`);
    
    const child = spawn(cmd, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        // Add session context to environment
        SESSION_ID: sessionId
      },
      shell: false,
      timeout: 30000 // 30 second timeout
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('error', (error) => {
      logError(`Command execution error: ${command.join(' ')}`, error);
      resolve({
        output: `Error executing command: ${error.message}`,
        metadata: {
          exit_code: 1,
          duration_seconds: (Date.now() - startTime) / 1000
        }
      });
    });
    
    child.on('close', (code) => {
      const duration = (Date.now() - startTime) / 1000;
      const output = stdout + (stderr ? `\n\nSTDERR:\n${stderr}` : '');
      
      log(`Command completed: ${command.join(' ')} (exit code: ${code}, duration: ${duration}s)`);
      
      resolve({
        output: output || '(no output)',
        metadata: {
          exit_code: code || 0,
          duration_seconds: duration
        }
      });
    });
  });
}