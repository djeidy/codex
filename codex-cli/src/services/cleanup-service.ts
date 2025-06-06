import { log } from '../utils/logger/log.js';
import { cleanupOldSessions } from '../utils/storage/session-storage.js';
import { DEFAULT_SESSION_SETTINGS, DEFAULT_TSG_SETTINGS } from '../utils/storage/upload-validator.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

export class CleanupService {
  private intervalId: NodeJS.Timeout | null = null;
  
  start(): void {
    // Run cleanup every hour
    this.intervalId = setInterval(() => {
      this.runCleanup().catch(error => log(`Cleanup error: ${error}`));
    }, 60 * 60 * 1000);
    
    // Run initial cleanup
    this.runCleanup().catch(error => log(`Initial cleanup error: ${error}`));
  }
  
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
  
  private async runCleanup() {
    // Clean up old sessions
    const sessionTimeout = DEFAULT_SESSION_SETTINGS.sessionTimeout;
    await cleanupOldSessions(sessionTimeout);
    
    // Clean up old TSG files if enabled
    if (DEFAULT_TSG_SETTINGS.autoCleanupEnabled) {
      await this.cleanupOldTSGFiles(DEFAULT_TSG_SETTINGS.cleanupAgeHours);
    }
  }
  
  private async cleanupOldTSGFiles(maxAgeHours: number) {
    // Get current file's directory path in ES modules
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    // Use repository root for storage
    const REPO_ROOT = path.resolve(__dirname, '../../../..'); // Goes up to codex root
    const TSGS_DIR = path.join(REPO_ROOT, 'tsgs');
    
    try {
      const tsgs = await fs.readdir(TSGS_DIR, { withFileTypes: true });
      const now = Date.now();
      const maxAge = maxAgeHours * 60 * 60 * 1000;
      
      for (const tsg of tsgs) {
        if (!tsg.isDirectory()) {
          continue;
        }
        
        const tsgPath = path.join(TSGS_DIR, tsg.name);
        const metadataPath = path.join(tsgPath, '.metadata.json');
        
        try {
          // eslint-disable-next-line no-await-in-loop
          const metadataContent = await fs.readFile(metadataPath, 'utf-8');
          const metadata = JSON.parse(metadataContent);
          const updatedAt = new Date(metadata.updatedAt).getTime();
          
          // Only delete if TSG hasn't been updated recently
          if (now - updatedAt > maxAge) {
            // eslint-disable-next-line no-await-in-loop
            await fs.rm(tsgPath, { recursive: true, force: true });
          }
        } catch {
          // If metadata doesn't exist or is invalid, check directory modification time
          // eslint-disable-next-line no-await-in-loop
          const stats = await fs.stat(tsgPath);
          if (now - stats.mtimeMs > maxAge) {
            // eslint-disable-next-line no-await-in-loop
            await fs.rm(tsgPath, { recursive: true, force: true });
          }
        }
      }
    } catch (error) {
      // Ignore errors during cleanup - TSG directory might not exist
    }
  }
}