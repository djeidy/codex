import { log } from '../../utils/logger.js';
import { getSessionFiles } from '../../storage/session-files.js';
import * as fs from 'fs/promises';

interface AnalysisResult {
  output?: string;
  error?: string;
  metadata?: {
    filesAnalyzed: number;
    patternsFound?: number;
  };
}

export async function analyzeSessionFiles(
  sessionId: string,
  fileNames: string[],
  pattern?: string
): Promise<AnalysisResult> {
  try {
    log(`analyzeSessionFiles called with sessionId: ${sessionId}, fileNames: ${JSON.stringify(fileNames)}, pattern: ${pattern}`);
    
    const sessionFiles = getSessionFiles(sessionId);
    log(`Found ${sessionFiles.length} files in session: ${sessionFiles.map(f => f.name).join(', ')}`);
    
    // If no specific files are requested (empty array), analyze all session files
    const filesToAnalyze = fileNames.length === 0 
      ? sessionFiles 
      : sessionFiles.filter(f => fileNames.includes(f.name));
    
    log(`Files to analyze: ${filesToAnalyze.map(f => f.name).join(', ')}`);
    
    if (filesToAnalyze.length === 0) {
      return {
        error: 'No matching files found in session',
        metadata: { filesAnalyzed: 0 }
      };
    }
    
    const results: string[] = [];
    let totalMatches = 0;
    
    for (const file of filesToAnalyze) {
      try {
        const content = await fs.readFile(file.path, 'utf-8');
        const lines = content.split('\n');
        
        results.push(`\n=== Analysis of ${file.name} ===`);
        results.push(`File size: ${file.size} bytes`);
        results.push(`Total lines: ${lines.length}`);
        
        if (pattern) {
          // Search for pattern
          const regex = new RegExp(pattern, 'gi');
          const matches: string[] = [];
          
          lines.forEach((line, index) => {
            if (regex.test(line)) {
              matches.push(`Line ${index + 1}: ${line.trim()}`);
              totalMatches++;
            }
          });
          
          if (matches.length > 0) {
            results.push(`\nPattern matches for "${pattern}":`);
            results.push(...matches.slice(0, 20)); // Limit to 20 matches per file
            if (matches.length > 20) {
              results.push(`... and ${matches.length - 20} more matches`);
            }
          } else {
            results.push(`No matches found for pattern "${pattern}"`);
          }
        } else {
          // General analysis
          const errorPatterns = [
            /error/i,
            /exception/i,
            /failed/i,
            /critical/i,
            /fatal/i
          ];
          
          const errors: string[] = [];
          lines.forEach((line, index) => {
            if (errorPatterns.some(p => p.test(line))) {
              errors.push(`Line ${index + 1}: ${line.trim()}`);
            }
          });
          
          if (errors.length > 0) {
            results.push(`\nPotential issues found:`);
            results.push(...errors.slice(0, 10));
            if (errors.length > 10) {
              results.push(`... and ${errors.length - 10} more potential issues`);
            }
          } else {
            results.push('No obvious errors or issues detected');
          }
        }
      } catch (error) {
        results.push(`\nError analyzing ${file.name}: ${error}`);
      }
    }
    
    log(`Analyzed ${filesToAnalyze.length} session files for session ${sessionId}`);
    
    return {
      output: results.join('\n'),
      metadata: {
        filesAnalyzed: filesToAnalyze.length,
        patternsFound: totalMatches
      }
    };
  } catch (error) {
    log(`Failed to analyze session files: ${error}`);
    return { 
      error: error instanceof Error ? error.message : 'Failed to analyze files' 
    };
  }
}