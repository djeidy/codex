export const ERROR_RESPONSES = {
  fileNotFound: (fileName: string): string => `I couldn't find the file "${fileName}". Available files are:
{fileList}

Please check the file name and try again.`,

  noFilesUploaded: `No log files have been uploaded yet. To analyze logs:
1. Click the paperclip icon in the chat input
2. Select your log files (you can select multiple)
3. Click upload

Supported formats: .log, .txt, .json, .xml, .csv`,

  commandBlocked: (_command: string): string => `I cannot execute that command because it would modify files. As a log analyzer, I can only perform read operations.

Instead, I can help you:
- Analyze log files for errors and patterns
- Search for specific content in logs
- Correlate events across multiple files
- Provide troubleshooting guidance

What would you like me to investigate?`,

  tsgNotFound: (tsgName: string): string => `The TSG "${tsgName}" was not found. Available TSGs are:
{tsgList}

You can create a new TSG or select an existing one from the settings.`,

  analysisError: (error: string): string => `I encountered an error while analyzing the logs:
${error}

This might be due to:
- Corrupted log file format
- Unsupported encoding
- File size limitations

Please try:
1. Checking the file format
2. Uploading a smaller portion of the log
3. Converting the file to UTF-8 encoding`
};

export function formatErrorResponse(
  template: string, 
  context: Record<string, string>
): string {
  let response = template;
  
  for (const [key, value] of Object.entries(context)) {
    response = response.replace(`{${key}}`, value);
  }
  
  return response;
}