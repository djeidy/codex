import { log } from '../../utils/logger.js';
import { 
  listTSGs as listTSGsStorage, 
  getTSGFiles,
  readTSGFile 
} from '../../storage/tsg-storage.js';

interface TSGResult {
  output?: string;
  error?: string;
  metadata?: {
    count?: number;
    tsgName?: string;
  };
}

export async function readTSG(tsgName: string, filePath?: string): Promise<TSGResult> {
  try {
    if (filePath) {
      // Read specific file
      const content = await readTSGFile(tsgName, filePath);
      log(`Read TSG file: ${tsgName}/${filePath}`);
      
      return {
        output: content,
        metadata: {
          tsgName,
          count: 1
        }
      };
    } else {
      // List files in TSG
      const files = await getTSGFiles(tsgName);
      const fileList = files.map(f => `${f.path} (${f.size} bytes)`).join('\n');
      
      log(`Listed TSG files: ${tsgName} (${files.length} files)`);
      
      return {
        output: fileList || 'No files in TSG',
        metadata: {
          tsgName,
          count: files.length
        }
      };
    }
  } catch (error) {
    log(`Failed to read TSG: ${error}`);
    return { 
      error: error instanceof Error ? error.message : 'Failed to read TSG' 
    };
  }
}

export async function listTSGs(): Promise<TSGResult> {
  try {
    const tsgs = await listTSGsStorage();
    
    if (tsgs.length === 0) {
      return {
        output: 'No TSGs available',
        metadata: { count: 0 }
      };
    }
    
    const tsgList = tsgs.join('\n');
    log(`Listed TSGs: ${tsgs.length} available`);
    
    return {
      output: tsgList,
      metadata: { count: tsgs.length }
    };
  } catch (error) {
    log(`Failed to list TSGs: ${error}`);
    return { 
      error: error instanceof Error ? error.message : 'Failed to list TSGs' 
    };
  }
}