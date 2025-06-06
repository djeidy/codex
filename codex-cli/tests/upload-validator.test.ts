import { describe, it, expect } from 'vitest';
import { validateTSGUpload, validateSessionUpload } from '../src/utils/storage/upload-validator.js';

describe('Upload Validator', () => {
  describe('TSG uploads', () => {
    it('should accept valid files', async () => {
      const files = [
        { path: 'docs/guide.md', size: 1024 },
        { path: 'logs/error.log', size: 2048 }
      ];
      
      const result = await validateTSGUpload(files);
      expect(result.valid).toBe(true);
    });
    
    it('should reject oversized uploads', async () => {
      const files = [
        { path: 'large.log', size: 200 * 1024 * 1024 } // 200MB
      ];
      
      const result = await validateTSGUpload(files);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds limit');
    });
    
    it('should reject invalid file types', async () => {
      const files = [
        { path: 'script.exe', size: 1024 }
      ];
      
      const result = await validateTSGUpload(files);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not allowed');
    });
    
    it('should reject path traversal', async () => {
      const files = [
        { path: '../../../etc/passwd', size: 1024 }
      ];
      
      const result = await validateTSGUpload(files);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid file path');
    });
    
    it('should accept multiple valid files', async () => {
      const files = [
        { path: 'docs/readme.md', size: 1024 },
        { path: 'images/logo.png', size: 5120 },
        { path: 'config.yaml', size: 512 }
      ];
      
      const result = await validateTSGUpload(files);
      expect(result.valid).toBe(true);
    });
  });
  
  describe('Session uploads', () => {
    it('should accept valid session uploads', async () => {
      const files = [
        { name: 'log1.txt', size: 1024 },
        { name: 'log2.txt', size: 2048 }
      ];
      
      const result = await validateSessionUpload(files);
      expect(result.valid).toBe(true);
    });
    
    it('should reject too many files', async () => {
      const files = Array(101).fill(null).map((_, i) => ({
        name: `file${i}.txt`,
        size: 1024
      }));
      
      const result = await validateSessionUpload(files);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Too many files');
    });
    
    it('should reject oversized session uploads', async () => {
      const files = [
        { name: 'huge.log', size: 60 * 1024 * 1024 } // 60MB
      ];
      
      const result = await validateSessionUpload(files);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds limit');
    });
  });
});