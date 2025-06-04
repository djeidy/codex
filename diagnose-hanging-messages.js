#!/usr/bin/env node

/**
 * Diagnostic script for hanging AI assistant messages
 * 
 * This script helps identify and debug issues where AI assistant messages
 * start generating but never complete. It monitors logs, processes, and
 * system state to provide insights into what might be causing the hang.
 */

const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');

class HangingMessageDiagnostic {
  constructor() {
    this.logFile = null;
    this.monitoring = false;
    this.startTime = Date.now();
    this.events = [];
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}`;
    console.log(logEntry);
    
    this.events.push({
      timestamp: Date.now(),
      level,
      message,
      relativeTime: Date.now() - this.startTime
    });
  }

  async checkSystemResources() {
    this.log('🔍 Checking system resources...');
    
    return new Promise((resolve) => {
      exec('ps aux | grep -E "(node|codex)" | grep -v grep', (error, stdout) => {
        if (stdout) {
          this.log('Active Node/Codex processes:');
          stdout.split('\n').filter(line => line.trim()).forEach(line => {
            this.log(`  ${line}`);
          });
        }
        
        exec('netstat -an | grep -E "(ESTABLISHED|LISTEN)" | grep -E "(3000|8080|443|80)"', (error, stdout) => {
          if (stdout) {
            this.log('Network connections:');
            stdout.split('\n').filter(line => line.trim()).forEach(line => {
              this.log(`  ${line}`);
            });
          }
          resolve();
        });
      });
    });
  }

  async checkLogFiles() {
    this.log('📋 Checking for log files...');
    
    const possibleLogPaths = [
      './logs',
      './codex-cli/logs',
      '/tmp/codex-logs',
      '~/.codex/logs'
    ];

    for (const logPath of possibleLogPaths) {
      try {
        if (fs.existsSync(logPath)) {
          const files = fs.readdirSync(logPath);
          this.log(`Found log directory: ${logPath}`);
          files.forEach(file => {
            if (file.includes('agent') || file.includes('stream') || file.includes('error')) {
              this.log(`  📄 ${file}`);
              this.analyzeLogFile(path.join(logPath, file));
            }
          });
        }
      } catch (error) {
        // Ignore permission errors
      }
    }
  }

  analyzeLogFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').slice(-100); // Last 100 lines
      
      let messageStarted = false;
      let messageCompleted = false;
      let lastEventTime = null;
      
      lines.forEach(line => {
        if (line.includes('Assistant message started') || line.includes('response event')) {
          messageStarted = true;
          lastEventTime = this.extractTimestamp(line);
          this.log(`  ✓ Message started at ${lastEventTime}`);
        }
        
        if (line.includes('response.completed') || line.includes('emitComplete')) {
          messageCompleted = true;
          const completedTime = this.extractTimestamp(line);
          this.log(`  ✓ Message completed at ${completedTime}`);
        }
        
        if (line.includes('timeout') || line.includes('hanging') || line.includes('Stream timeout')) {
          this.log(`  ⚠️  Timeout detected: ${line.trim()}`, 'WARN');
        }
        
        if (line.includes('error') || line.includes('Error')) {
          this.log(`  ❌ Error found: ${line.trim()}`, 'ERROR');
        }
      });
      
      if (messageStarted && !messageCompleted) {
        this.log(`  🚨 HANGING MESSAGE DETECTED in ${filePath}`, 'ERROR');
        this.log(`     Last event time: ${lastEventTime}`);
      }
      
    } catch (error) {
      this.log(`Error reading log file ${filePath}: ${error.message}`, 'ERROR');
    }
  }

  extractTimestamp(line) {
    const timestampMatch = line.match(/\[([\d-T:.Z]+)\]/);
    return timestampMatch ? timestampMatch[1] : 'unknown';
  }

  async monitorRealTime() {
    this.log('👀 Starting real-time monitoring...');
    this.monitoring = true;
    
    // Monitor for hanging processes
    const monitorInterval = setInterval(() => {
      if (!this.monitoring) {
        clearInterval(monitorInterval);
        return;
      }
      
      exec('ps aux | grep -E "(node.*codex|codex)" | grep -v grep', (error, stdout) => {
        if (stdout) {
          const processes = stdout.split('\n').filter(line => line.trim());
          processes.forEach(process => {
            const parts = process.split(/\s+/);
            const cpu = parseFloat(parts[2]);
            const memory = parseFloat(parts[3]);
            const time = parts[9];
            
            // Check for high CPU usage (might indicate hanging)
            if (cpu > 50) {
              this.log(`⚠️  High CPU usage detected: ${cpu}% - ${process}`, 'WARN');
            }
            
            // Check for long-running processes
            if (time && time.includes(':') && !time.startsWith('0:')) {
              this.log(`⏰ Long-running process: ${time} - ${process}`, 'WARN');
            }
          });
        }
      });
    }, 5000); // Check every 5 seconds

    // Monitor network connections
    setTimeout(() => {
      exec('lsof -i :443 -i :80 | grep node', (error, stdout) => {
        if (stdout) {
          this.log('Network connections from Node processes:');
          stdout.split('\n').filter(line => line.trim()).forEach(line => {
            this.log(`  ${line}`);
          });
        }
      });
    }, 2000);
  }

  async testMessageCompletion() {
    this.log('🧪 Testing message completion...');
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.log('❌ Test timed out - potential hanging message detected', 'ERROR');
        testProcess.kill();
        reject(new Error('Message completion test timed out'));
      }, 30000); // 30 second timeout

      const testProcess = spawn('node', ['-e', `
        console.log('Testing message completion...');
        setTimeout(() => {
          console.log('Assistant message started');
          setTimeout(() => {
            console.log('response.completed');
            process.exit(0);
          }, Math.random() * 10000); // Random delay up to 10 seconds
        }, 1000);
      `]);

      let messageStarted = false;
      let messageCompleted = false;

      testProcess.stdout.on('data', (data) => {
        const output = data.toString();
        this.log(`Test output: ${output.trim()}`);
        
        if (output.includes('Assistant message started')) {
          messageStarted = true;
          this.log('✓ Test message started');
        }
        
        if (output.includes('response.completed')) {
          messageCompleted = true;
          this.log('✓ Test message completed');
          clearTimeout(timeout);
          resolve();
        }
      });

      testProcess.on('close', (code) => {
        clearTimeout(timeout);
        if (messageStarted && !messageCompleted) {
          this.log('❌ Test message started but never completed', 'ERROR');
          reject(new Error('Message started but never completed'));
        } else if (!messageStarted) {
          this.log('❌ Test message never started', 'ERROR');
          reject(new Error('Message never started'));
        } else {
          resolve();
        }
      });
    });
  }

  generateReport() {
    this.log('\n📊 Diagnostic Report');
    this.log('==================');
    
    const errorEvents = this.events.filter(e => e.level === 'ERROR');
    const warnEvents = this.events.filter(e => e.level === 'WARN');
    
    this.log(`Total events: ${this.events.length}`);
    this.log(`Errors: ${errorEvents.length}`);
    this.log(`Warnings: ${warnEvents.length}`);
    this.log(`Runtime: ${Math.round((Date.now() - this.startTime) / 1000)}s`);
    
    if (errorEvents.length > 0) {
      this.log('\n❌ Errors detected:');
      errorEvents.forEach(event => {
        this.log(`  [${Math.round(event.relativeTime / 1000)}s] ${event.message}`);
      });
    }
    
    if (warnEvents.length > 0) {
      this.log('\n⚠️  Warnings:');
      warnEvents.forEach(event => {
        this.log(`  [${Math.round(event.relativeTime / 1000)}s] ${event.message}`);
      });
    }
    
    this.log('\n💡 Recommendations:');
    
    if (errorEvents.some(e => e.message.includes('HANGING MESSAGE'))) {
      this.log('  • Hanging messages detected - apply the fixes in MESSAGE_COMPLETION_FIXES.md');
      this.log('  • Check network connectivity and API timeouts');
      this.log('  • Review stream processing logic');
    }
    
    if (warnEvents.some(e => e.message.includes('High CPU'))) {
      this.log('  • High CPU usage detected - check for infinite loops');
      this.log('  • Consider implementing circuit breakers');
    }
    
    if (warnEvents.some(e => e.message.includes('timeout'))) {
      this.log('  • Timeout issues detected - review timeout configurations');
      this.log('  • Implement forced completion mechanisms');
    }
    
    this.log('\n🔧 Next Steps:');
    this.log('  1. Review the fixes in MESSAGE_COMPLETION_FIXES.md');
    this.log('  2. Run the test suite: node test-message-completion.js');
    this.log('  3. Monitor logs for completion events');
    this.log('  4. Implement additional timeout protections if needed');
  }

  async run() {
    this.log('🚀 Starting Hanging Message Diagnostic');
    
    try {
      await this.checkSystemResources();
      await this.checkLogFiles();
      await this.monitorRealTime();
      
      // Run for 10 seconds then generate report
      setTimeout(() => {
        this.monitoring = false;
        this.generateReport();
      }, 10000);
      
    } catch (error) {
      this.log(`Diagnostic failed: ${error.message}`, 'ERROR');
    }
  }
}

// Run diagnostic if this script is executed directly
if (require.main === module) {
  const diagnostic = new HangingMessageDiagnostic();
  diagnostic.run().catch(error => {
    console.error('Diagnostic runner failed:', error);
    process.exit(1);
  });
}

module.exports = HangingMessageDiagnostic;
