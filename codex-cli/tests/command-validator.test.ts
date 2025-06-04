import { describe, it, expect } from "vitest";
import { validateCommand } from "../src/utils/agent/command-validator";

describe("Command Validator", () => {
  describe("blocked commands", () => {
    const blockedCommands = [
      'echo "test" > file.txt',
      'echo "test" >> file.txt',
      "cat file.txt > output.txt",
      "rm -rf /",
      "rm file.txt",
      "mv file1.txt file2.txt",
      "cp source.txt dest.txt",
      "touch newfile.txt",
      "mkdir newdir",
      "rmdir olddir",
      "chmod 755 file.txt",
      "chown user:group file.txt",
      "vim file.txt",
      "nano file.txt",
      "emacs file.txt",
      "code file.txt",
      "git add .",
      'git commit -m "test"',
      "git push origin main",
      "git rm file.txt",
      "git reset --hard",
      "git revert HEAD",
      "git merge branch",
      "git rebase main",
      "npm install express",
      "yarn add lodash",
      "pip install requests",
      "apt install curl",
      "brew install git",
      "apply_patch",
      "tee output.txt",
      "dd if=/dev/zero of=file.txt",
    ];

    blockedCommands.forEach((cmd) => {
      it(`should block: ${cmd}`, () => {
        const result = validateCommand(cmd);
        expect(result.allowed).toBe(false);
        expect(result.reason).toBeDefined();
      });
    });
  });

  describe("allowed commands", () => {
    const allowedCommands = [
      "ls -la",
      "ls",
      "cat file.txt",
      'grep "error" logfile.txt',
      'find . -name "*.log"',
      "head -n 10 file.txt",
      "tail -f logfile.txt",
      "less file.txt",
      "more file.txt",
      "ps aux",
      "ps -ef",
      "top",
      "htop",
      "df -h",
      "du -sh *",
      "free -h",
      "uname -a",
      "whoami",
      "pwd",
      "date",
      "uptime",
      "git status",
      "git log --oneline",
      "git diff",
      "git show HEAD",
      "git branch",
      "git remote -v",
      "git blame file.txt",
      'rg "pattern" .',
      'awk "{print $1}" file.txt',
      "sort file.txt",
      "uniq file.txt",
      "wc -l file.txt",
      // Commands that were being blocked but should be allowed
      'head -n 50 "/Users/djeidy-work/WebstormProjects/codex/15 signout.txt"',
      'sed -n "1,50p" "/Users/djeidy-work/WebstormProjects/codex/15 signout.txt"',
      "sed -n 1,50p /Users/djeidy-work/WebstormProjects/codex/15\\ signout.txt",
      'rg call "/Users/djeidy-work/WebstormProjects/codex/15 signout.txt"',
      "cat /Users/djeidy-work/WebstormProjects/codex/15\\ signout.txt | head -n 50",
      'cd /Users/djeidy-work/WebstormProjects/codex && cat "15 signout.txt" | head -n 50',
    ];

    allowedCommands.forEach((cmd) => {
      it(`should allow: ${cmd}`, () => {
        const result = validateCommand(cmd);
        expect(result.allowed).toBe(true);
        expect(result.reason).toBeUndefined();
      });
    });
  });

  describe("shell redirects", () => {
    it("should block shell redirects that write to files", () => {
      const result = validateCommand("ls > output.txt");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Shell redirects");
    });

    it("should block shell appends", () => {
      const result = validateCommand('echo "test" >> log.txt');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Shell redirects");
    });

    it("should allow curl with output to stdout", () => {
      const result = validateCommand("curl https://api.example.com");
      expect(result.allowed).toBe(true);
    });
  });

  describe("unknown commands", () => {
    it("should block unknown commands that might write", () => {
      const result = validateCommand("unknowncommand arg1 arg2");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not in the allowed list");
    });

    it("should block empty commands", () => {
      const result = validateCommand("");
      expect(result.allowed).toBe(false);
    });

    it("should block whitespace-only commands", () => {
      const result = validateCommand("   ");
      expect(result.allowed).toBe(false);
    });
  });

  describe("debug specific failing command", () => {
    it("should debug grep command that is being blocked", () => {
      const cmd =
        "grep -a -n remoteParticipant /Users/djeidy-work/WebstormProjects/codex/15 signout.txt";
      const result = validateCommand(cmd);
      expect(result.allowed).toBe(true);
    });
  });
});
