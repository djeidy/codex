export interface AgentBehaviorConfig {
  mode: 'log-analyzer';
  autoAnalysis: {
    enabled: boolean;
    onFileUpload: boolean;
    summaryFirst: boolean;
  };
  responses: {
    includeLineNumbers: boolean;
    maxLogLinesInResponse: number;
    groupSimilarErrors: boolean;
    includeTimestamps: boolean;
  };
  investigation: {
    askClarifyingQuestions: boolean;
    suggestNextSteps: boolean;
    correlateAcrossFiles: boolean;
  };
}

export const DEFAULT_BEHAVIOR_CONFIG: AgentBehaviorConfig = {
  mode: 'log-analyzer',
  autoAnalysis: {
    enabled: true,
    onFileUpload: true,
    summaryFirst: true
  },
  responses: {
    includeLineNumbers: true,
    maxLogLinesInResponse: 10,
    groupSimilarErrors: true,
    includeTimestamps: true
  },
  investigation: {
    askClarifyingQuestions: true,
    suggestNextSteps: true,
    correlateAcrossFiles: true
  }
};

export function getAgentInstruction(config: AgentBehaviorConfig): string {
  const instructions: Array<string> = [];
  
  if (config.responses.includeLineNumbers) {
    instructions.push('Always include line numbers when referencing log entries');
  }
  
  if (config.responses.groupSimilarErrors) {
    instructions.push('Group similar errors together in your analysis');
  }
  
  if (config.investigation.askClarifyingQuestions) {
    instructions.push('Ask clarifying questions to better understand the issue');
  }
  
  if (config.investigation.suggestNextSteps) {
    instructions.push('Always suggest next steps for investigation or resolution');
  }
  
  return instructions.join('\n');
}