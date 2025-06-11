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
      // List files in TSG and read the main guide if available
      const files = await getTSGFiles(tsgName);
      
      // Look for main guide files (common names)
      const mainFiles = ['README.md', 'index.md', 'guide.md', 'troubleshooting.md'];
      const mainFile = files.find(f => mainFiles.includes(f.path.toLowerCase()));
      
      if (mainFile) {
        // Read the main guide file automatically
        const content = await readTSGFile(tsgName, mainFile.path);
        log(`Auto-read TSG main file: ${tsgName}/${mainFile.path}`);
        
        let output = `## ${tsgName} Troubleshooting Guide\n\n`;
        output += content;
        output += `\n\n---\n### Other files in this TSG:\n`;
        output += files.filter(f => f.path !== mainFile.path)
          .map(f => `- ${f.path} (${f.size} bytes)`).join('\n');
        
        return {
          output,
          metadata: {
            tsgName,
            count: files.length
          }
        };
      } else {
        // No main file found, just list files
        const fileList = files.map(f => `- ${f.path} (${f.size} bytes)`).join('\n');
        
        log(`Listed TSG files: ${tsgName} (${files.length} files)`);
        
        return {
          output: `## Files in ${tsgName} TSG:\n${fileList || 'No files in TSG'}\n\nUse read_tsg("${tsgName}", "filename") to read a specific file.`,
          metadata: {
            tsgName,
            count: files.length
          }
        };
      }
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