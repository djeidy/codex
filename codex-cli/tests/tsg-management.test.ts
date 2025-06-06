import { describe, it, expect, afterEach } from 'vitest';
import { 
  createTSG, 
  deleteTSG, 
  listTSGs, 
  uploadToTSG, 
  getTSGFiles,
  getTSGMetadata
} from '../src/utils/storage/tsg-storage.js';

describe('TSG Management', () => {
  const testTSGName = 'test-tsg-123';
  
  afterEach(async () => {
    // Cleanup
    try {
      await deleteTSG(testTSGName);
    } catch {
      // Ignore errors
    }
  });
  
  it('should create TSG', async () => {
    await createTSG(testTSGName, 'Test TSG');
    
    const tsgs = await listTSGs();
    expect(tsgs).toContain(testTSGName);
    
    const metadata = await getTSGMetadata(testTSGName);
    expect(metadata?.name).toBe(testTSGName);
    expect(metadata?.description).toBe('Test TSG');
  });
  
  it('should upload files to TSG', async () => {
    await createTSG(testTSGName);
    
    const files = [
      { path: 'docs/guide.md', content: '# Guide\nContent' },
      { path: 'logs/error.log', content: 'Error log content' }
    ];
    
    await uploadToTSG(testTSGName, files);
    
    const tsgFiles = await getTSGFiles(testTSGName);
    expect(tsgFiles.length).toBe(4); // 2 files + 2 directories
    
    const guidefile = tsgFiles.find(f => f.name === 'guide.md');
    expect(guidefile).toBeDefined();
  });
  
  it('should delete TSG', async () => {
    await createTSG(testTSGName);
    await deleteTSG(testTSGName);
    
    const tsgs = await listTSGs();
    expect(tsgs).not.toContain(testTSGName);
  });
  
  it('should handle TSG with special characters in name', async () => {
    const specialName = 'test@#$%^&*()tsg';
    const sanitizedName = 'test_________tsg'; // Expected sanitized result
    
    await createTSG(specialName);
    
    const tsgs = await listTSGs();
    expect(tsgs).toContain(sanitizedName);
    
    // Cleanup
    await deleteTSG(specialName);
  });
  
  it('should track metadata updates', async () => {
    await createTSG(testTSGName);
    const initialMetadata = await getTSGMetadata(testTSGName);
    
    // Wait a bit to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Upload a file to trigger metadata update
    await uploadToTSG(testTSGName, [
      { path: 'test.txt', content: 'test content' }
    ]);
    
    const updatedMetadata = await getTSGMetadata(testTSGName);
    expect(updatedMetadata?.updatedAt).not.toBe(initialMetadata?.updatedAt);
  });
});