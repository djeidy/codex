export interface AutoAnalysisConfig {
  enabled: boolean;
  triggerOnUpload: boolean;
  minFileSizeForAuto: number; // bytes
  maxFileSizeForAuto: number; // bytes
}

export const DEFAULT_AUTO_ANALYSIS_CONFIG: AutoAnalysisConfig = {
  enabled: true,
  triggerOnUpload: true,
  minFileSizeForAuto: 100, // 100 bytes
  maxFileSizeForAuto: 10 * 1024 * 1024 // 10MB
};

export interface SessionFile {
  name: string;
  path: string;
  size: number;
  type: string;
  uploadedAt: string;
}

export async function getAutoAnalysisConfig(): Promise<AutoAnalysisConfig> {
  // TODO: Load from user config if available
  return DEFAULT_AUTO_ANALYSIS_CONFIG;
}

export async function shouldAutoAnalyze(
  _session: { uploadedFiles?: Array<string> },
  newFiles: Array<SessionFile>
): Promise<boolean> {
  const config = await getAutoAnalysisConfig();
  
  if (!config.enabled || !config.triggerOnUpload) {
    return false;
  }
  
  // Check if files are within size limits
  const eligibleFiles = newFiles.filter(
    file => file.size >= config.minFileSizeForAuto && 
            file.size <= config.maxFileSizeForAuto
  );
  
  return eligibleFiles.length > 0;
}

export function generateAutoAnalysisMessage(files: Array<SessionFile>): string {
  const fileList = files.map(f => `- ${f.name} (${f.type})`).join('\n');
  
  return `I see you've uploaded the following log files:\n${fileList}\n\n` +
         `Let me analyze these files to identify any issues or patterns.`;
}