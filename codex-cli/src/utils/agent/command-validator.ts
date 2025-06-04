const BLOCKED_COMMANDS = [
  // File write operations (match at word boundaries)
  '^cat.*>',     // Redirect cat
  '^tee\\b',        // Tee command
  '^dd\\b',         // Disk operations
  '^cp\\b',         // Copy files
  '^mv\\b',         // Move files
  '^rm\\b',         // Remove files
  '^touch\\b',      // Create files
  '^mkdir\\b',      // Create directories
  '^rmdir\\b',      // Remove directories
  '^chmod\\b',      // Change permissions
  '^chown\\b',      // Change ownership

  // Editors
  '^vi\\b', '^vim\\b', '^nano\\b', '^emacs\\b', '^code\\b', '^subl\\b',

  // Package managers (prevent installation)
  '^npm install\\b', '^yarn add\\b', '^pip install\\b', '^apt install\\b',
  '^brew install\\b', '^pacman -S\\b', '^yum install\\b', '^dnf install\\b',

  // Git write operations
  '^git add\\b', '^git commit\\b', '^git push\\b', '^git rm\\b',
  '^git reset\\b', '^git revert\\b', '^git merge\\b', '^git rebase\\b',

  // Apply patch operations
  '^apply_patch\\b'
];

const ALLOWED_PATTERNS = [
  // Explicitly allowed read operations
  /^(ls|dir|find|grep|cat|head|tail|less|more)(\s|$)/,
  /^(ps|top|htop|df|du|free|uname|whoami|pwd|date|uptime)(\s|$)/,
  /^git (status|log|diff|show|branch|remote|blame)(\s|$)/,
  /^(curl|wget)(\s|$)/,  // Allow curl/wget (will be validated separately for redirects)
  /^rg(\s|$)/,  // ripgrep for searching
  /^awk\s/, /^sed(\s|$)/, /^sort(\s|$)/, /^uniq(\s|$)/, /^wc(\s|$)/,  // Text processing (read-only)
  /^cd\s+.*&&\s+/, // Allow cd && command combinations
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

  // Check for shell redirects that write to files (but allow pipes)
  if (/\s*>\s*[^|]/.test(trimmedCommand) && !/curl|wget/.test(trimmedCommand)) {
    return {
      allowed: false,
      reason: 'Shell redirects that write to files are not allowed'
    };
  }

  // Check if command is explicitly allowed by patterns
  const isExplicitlyAllowed = ALLOWED_PATTERNS.some(pattern =>
    pattern.test(trimmedCommand)
  );

  if (isExplicitlyAllowed) {
    return { allowed: true };
  }

  // For complex commands (with &&, ||, |), validate each part
  if (/[&|]{1,2}/.test(trimmedCommand)) {
    return validateComplexCommand(trimmedCommand);
  }

  // For simple commands, check if the first word is in allowed list
  const firstWord = trimmedCommand.split(/\s+/)[0];
  const readOnlyCommands = ['ls', 'cat', 'grep', 'find', 'head', 'tail', 'less', 'more', 'ps', 'top', 'htop', 'df', 'du', 'free', 'whoami', 'pwd', 'date', 'uptime', 'uname', 'git', 'rg', 'curl', 'wget', 'awk', 'sed', 'sort', 'uniq', 'wc', 'cd'];

  if (readOnlyCommands.includes(firstWord || '')) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Command '${firstWord}' is not in the allowed list of read-only operations`
  };
}

function validateComplexCommand(command: string): {
  allowed: boolean;
  reason?: string;
} {
  // Split on && and || operators
  const parts = command.split(/\s*(?:&&|\|\|)\s*/);

  for (const part of parts) {
    const trimmedPart = part.trim();

    // Skip empty parts
    if (!trimmedPart) {
      continue;
    }

    // For piped commands, validate each command in the pipeline
    if (trimmedPart.includes('|')) {
      const pipeCommands = trimmedPart.split(/\s*\|\s*/);
      for (const pipeCmd of pipeCommands) {
        const result = validateSimpleCommand(pipeCmd.trim());
        if (!result.allowed) {
          return result;
        }
      }
    } else {
      const result = validateSimpleCommand(trimmedPart);
      if (!result.allowed) {
        return result;
      }
    }
  }

  return { allowed: true };
}

function validateSimpleCommand(command: string): {
  allowed: boolean;
  reason?: string;
} {
  const trimmedCommand = command.trim();
  const firstWord = trimmedCommand.split(/\s+/)[0];
  const readOnlyCommands = ['ls', 'cat', 'grep', 'find', 'head', 'tail', 'less', 'more', 'ps', 'top', 'htop', 'df', 'du', 'free', 'whoami', 'pwd', 'date', 'uptime', 'uname', 'git', 'rg', 'curl', 'wget', 'awk', 'sed', 'sort', 'uniq', 'wc', 'cd'];

  if (!readOnlyCommands.includes(firstWord || '')) {
    return {
      allowed: false,
      reason: `Command '${firstWord}' is not in the allowed list of read-only operations`
    };
  }

  return { allowed: true };
}
