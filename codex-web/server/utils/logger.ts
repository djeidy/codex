import { createWriteStream, WriteStream } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Log levels
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

class Logger {
  private logStream?: WriteStream;
  private logToFile: boolean = process.env.LOG_TO_FILE === 'true';
  private logLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || LogLevel.INFO;

  constructor() {
    if (this.logToFile) {
      const logDir = path.join(__dirname, '../../data/logs');
      const logFile = path.join(logDir, `codex-web-${new Date().toISOString().split('T')[0]}.log`);
      
      // Create logs directory if it doesn't exist
      import('fs').then(fs => {
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }
      });
      
      this.logStream = createWriteStream(logFile, { flags: 'a' });
    }
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] ${message}`;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  private writeLog(level: LogLevel, message: string): void {
    if (!this.shouldLog(level)) return;

    const formattedMessage = this.formatMessage(level, message);
    
    // Console output with colors
    switch (level) {
      case LogLevel.ERROR:
        console.error('\x1b[31m%s\x1b[0m', formattedMessage); // Red
        break;
      case LogLevel.WARN:
        console.warn('\x1b[33m%s\x1b[0m', formattedMessage); // Yellow
        break;
      case LogLevel.INFO:
        console.info('\x1b[36m%s\x1b[0m', formattedMessage); // Cyan
        break;
      case LogLevel.DEBUG:
        console.log('\x1b[90m%s\x1b[0m', formattedMessage); // Gray
        break;
    }

    // File output
    if (this.logStream) {
      this.logStream.write(formattedMessage + '\n');
    }
  }

  debug(message: string): void {
    this.writeLog(LogLevel.DEBUG, message);
  }

  info(message: string): void {
    this.writeLog(LogLevel.INFO, message);
  }

  warn(message: string): void {
    this.writeLog(LogLevel.WARN, message);
  }

  error(message: string, error?: Error): void {
    let fullMessage = message;
    if (error) {
      fullMessage += ` - ${error.message}`;
      if (process.env.NODE_ENV === 'development' && error.stack) {
        fullMessage += `\n${error.stack}`;
      }
    }
    this.writeLog(LogLevel.ERROR, fullMessage);
  }
}

// Create singleton logger instance
const logger = new Logger();

// Export convenience functions
export const log = (message: string) => logger.info(message);
export const debug = (message: string) => logger.debug(message);
export const warn = (message: string) => logger.warn(message);
export const error = (message: string, err?: Error) => logger.error(message, err);

export default logger;