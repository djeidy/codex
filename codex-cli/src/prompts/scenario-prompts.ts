export const SCENARIO_PROMPTS = {
  noFiles: `I see no log files have been uploaded yet. To help you analyze logs, please:
1. Click the paperclip icon to upload log files
2. You can upload multiple files at once
3. Supported formats include .log, .txt, .json, .xml, .csv

What type of issue are you trying to investigate?`,

  withTSG: `I see you have the "{tsgName}" troubleshooting guide active. I'll use this documentation to help analyze your logs.

What specific issue are you experiencing? I can check the TSG for relevant troubleshooting procedures.`,

  initialAnalysis: `I'll analyze the uploaded log files to identify any issues. Let me start by:
1. Scanning for errors and warnings
2. Identifying patterns
3. Checking timestamps for correlation
4. Looking for known issues

Please wait while I examine the files...`,

  multipleFiles: `I see you've uploaded {count} log files. I'll analyze them together to:
1. Correlate events across files
2. Build a timeline of issues
3. Identify root causes

This will help us understand the full picture of what's happening.`
};