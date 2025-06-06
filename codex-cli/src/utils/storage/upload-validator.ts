import * as path from 'path';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// Default settings for TSG uploads
export const DEFAULT_TSG_SETTINGS = {
  maxUploadSize: 100, // 100MB
  allowedFileTypes: [
    '.md', '.txt', '.log', '.json', '.yaml', '.yml',
    '.png', '.jpg', '.jpeg', '.gif', '.svg',
    '.pdf', '.docx', '.xlsx'
  ],
  autoCleanupEnabled: true,
  cleanupAgeHours: 24 * 7 // 1 week
};

// Default settings for session uploads
export const DEFAULT_SESSION_SETTINGS = {
  maxUploadSize: 50, // 50MB
  sessionTimeout: 24, // 24 hours
  maxFilesPerSession: 100
};

export async function validateTSGUpload(files: Array<{
  path: string;
  size: number;
  type?: string;
}>): Promise<ValidationResult> {
  const settings = DEFAULT_TSG_SETTINGS;
  
  // Check total size
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const maxSizeBytes = settings.maxUploadSize * 1024 * 1024;
  
  if (totalSize > maxSizeBytes) {
    return {
      valid: false,
      error: `Total upload size ${(totalSize / 1024 / 1024).toFixed(2)}MB exceeds limit of ${settings.maxUploadSize}MB`
    };
  }
  
  // Check file types and security
  for (const file of files) {
    // Security: Check for path traversal first
    if (file.path.includes('..') || path.isAbsolute(file.path)) {
      return {
        valid: false,
        error: `Invalid file path: ${file.path}`
      };
    }
    
    const ext = path.extname(file.path).toLowerCase();
    if (!settings.allowedFileTypes.includes(ext)) {
      return {
        valid: false,
        error: `File type '${ext}' is not allowed. Allowed types: ${settings.allowedFileTypes.join(', ')}`
      };
    }
  }
  
  return { valid: true };
}

export async function validateSessionUpload(files: Array<{
  name: string;
  size: number;
}>): Promise<ValidationResult> {
  const settings = DEFAULT_SESSION_SETTINGS;
  
  // Check file count
  if (files.length > settings.maxFilesPerSession) {
    return {
      valid: false,
      error: `Too many files. Maximum ${settings.maxFilesPerSession} files per session`
    };
  }
  
  // Check total size
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const maxSizeBytes = settings.maxUploadSize * 1024 * 1024;
  
  if (totalSize > maxSizeBytes) {
    return {
      valid: false,
      error: `Total upload size ${(totalSize / 1024 / 1024).toFixed(2)}MB exceeds limit of ${settings.maxUploadSize}MB`
    };
  }
  
  return { valid: true };
}