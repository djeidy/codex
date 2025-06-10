import OpenAI from 'openai';
import type { 
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionChunk
} from 'openai/resources/chat/completions';
import { Stream } from 'openai/streaming';
import { log, error as logError } from '../utils/logger.js';
import type { SessionConfig } from '../types/index.js';
import { executeCommand } from './tools/exec-tool.js';
import { readFile, writeFile, listFiles } from './tools/file-tools.js';
import { readTSG, listTSGs } from './tools/tsg-tools.js';
import { analyzeSessionFiles } from './tools/session-file-tools.js';

export type ApprovalPolicy = 'suggest' | 'auto-edit' | 'full-auto';

export interface AgentLoopParams {
  model: string;
  provider: string;
  config: SessionConfig;
  instructions?: string;
  approvalPolicy: ApprovalPolicy;
  sessionId: string;
  activeTSG?: string | null;
  onChunk: (chunk: any) => void;
  onToolCall: (toolCall: any) => void;
  onToolResult: (result: any) => void;
  getCommandConfirmation?: (command: string[], applyPatch?: any) => Promise<{
    approved: boolean;
    customDenyMessage?: string;
  }>;
}

// Tool definitions
const tools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'shell',
      description: 'Execute a shell command',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'array',
            items: { type: 'string' },
            description: 'The command to execute as an array of strings'
          }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The path to the file'
          }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The path to the file'
          },
          content: {
            type: 'string',
            description: 'The content to write'
          }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files in a directory',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The directory path'
          }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_tsg',
      description: 'Read a Troubleshooting Guide (TSG) file or list files in a TSG',
      parameters: {
        type: 'object',
        properties: {
          tsgName: {
            type: 'string',
            description: 'Name of the TSG'
          },
          filePath: {
            type: 'string',
            description: 'Optional: specific file path within the TSG to read'
          }
        },
        required: ['tsgName']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_tsgs',
      description: 'List all available Troubleshooting Guides',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'analyze_session_files',
      description: 'Analyze uploaded session files for patterns, errors, and insights',
      parameters: {
        type: 'object',
        properties: {
          fileNames: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of file names to analyze'
          },
          pattern: {
            type: 'string',
            description: 'Optional: specific pattern or keyword to search for'
          }
        },
        required: ['fileNames']
      }
    }
  }
];

export class AgentLoop {
  private openai: OpenAI;
  private messages: ChatCompletionMessageParam[] = [];
  private abortController?: AbortController;
  private canceled = false;
  
  constructor(private params: AgentLoopParams) {
    // Initialize OpenAI client based on provider
    const apiKey = params.config.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('No API key provided');
    }

    this.openai = new OpenAI({
      apiKey,
      baseURL: this.getBaseURL(),
      timeout: 60000,
      maxRetries: 3
    });
    
    // Initialize with system message
    this.messages.push({
      role: 'system',
      content: this.buildSystemPrompt()
    });
  }
  
  private getBaseURL(): string {
    switch (this.params.provider) {
      case 'openai':
        return 'https://api.openai.com/v1';
      case 'anthropic':
        return 'https://api.anthropic.com/v1';
      default:
        // Allow custom providers
        return process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    }
  }
  
  private buildSystemPrompt(): string {
    let prompt = this.params.instructions || 
      'You are a helpful AI assistant specializing in log analysis and troubleshooting.';
    
    if (this.params.activeTSG) {
      prompt += `\n\nActive TSG: ${this.params.activeTSG}. ` +
        'Reference this guide when providing troubleshooting assistance.';
    }
    
    prompt += '\n\nYou have access to tools for executing commands, reading/writing files, ' +
      'and analyzing session logs. Use these tools to help diagnose and solve issues.';
    
    prompt += '\n\nIMPORTANT: When the user mentions uploaded files or when session files are present, ' +
      'use the analyze_session_files tool to analyze them. Do not use list_files to search for uploaded files.';
    
    return prompt;
  }
  
  async run(userMessage: string): Promise<void> {
    try {
      this.canceled = false;
      this.abortController = new AbortController();
      
      // Add user message
      this.messages.push({
        role: 'user',
        content: userMessage
      });
      
      // Generate a unique message ID for this response
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      
      // Create completion stream
      const stream = await this.openai.chat.completions.create({
        model: this.params.model,
        messages: this.messages,
        tools,
        tool_choice: 'auto',
        stream: true
      }, {
        signal: this.abortController.signal
      });
      
      await this.processStream(stream, messageId);
      
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        log('Agent loop cancelled');
      } else {
        logError('Error in agent loop:', err as Error);
        throw err;
      }
    }
  }
  
  private async processStream(stream: Stream<ChatCompletionChunk>, messageId?: string): Promise<void> {
    let currentContent = '';
    let currentToolCalls: any[] = [];
    let isFirstChunk = true;
    
    for await (const chunk of stream) {
      if (this.canceled) break;
      
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;
      
      // Handle content
      if (delta.content) {
        currentContent += delta.content;
        this.params.onChunk({
          type: 'content',
          content: delta.content,
          messageId: messageId,
          isFirstChunk: isFirstChunk
        });
        isFirstChunk = false;
      }
      
      // Handle tool calls
      if (delta.tool_calls) {
        for (const toolCall of delta.tool_calls) {
          const index = toolCall.index || 0;
          
          if (!currentToolCalls[index]) {
            currentToolCalls[index] = {
              id: toolCall.id!,
              type: 'function',
              function: {
                name: toolCall.function?.name || '',
                arguments: ''
              }
            };
          }
          
          if (toolCall.function?.arguments) {
            currentToolCalls[index].function.arguments += toolCall.function.arguments;
          }
        }
      }
    }
    
    // Add assistant message to history
    if (currentContent || currentToolCalls.length > 0) {
      const assistantMessage: ChatCompletionMessageParam = {
        role: 'assistant',
        content: currentContent || null,
        tool_calls: currentToolCalls.length > 0 ? currentToolCalls : undefined
      };
      this.messages.push(assistantMessage);
      
      // Emit completion event if we have a messageId and content
      if (messageId && currentContent) {
        this.params.onChunk({
          type: 'content',
          content: currentContent,
          messageId: messageId,
          isComplete: true
        });
      }
    }
    
    // Execute tool calls if any
    if (currentToolCalls.length > 0 && !this.canceled) {
      await this.executeToolCalls(currentToolCalls);
    }
  }
  
  private async executeToolCalls(toolCalls: any[]): Promise<void> {
    for (const toolCall of toolCalls) {
      if (this.canceled) break;
      
      try {
        const args = JSON.parse(toolCall.function.arguments);
        
        this.params.onToolCall({
          id: toolCall.id,
          name: toolCall.function.name,
          arguments: args,
          status: 'running'
        });
        
        let result: any;
        
        switch (toolCall.function.name) {
          case 'shell':
            // Check approval if needed
            if (this.params.approvalPolicy === 'suggest' && this.params.getCommandConfirmation) {
              const confirmation = await this.params.getCommandConfirmation(
                args.command,
                undefined
              );
              if (!confirmation.approved) {
                result = { 
                  output: confirmation.customDenyMessage || 'Command denied by user',
                  metadata: { exit_code: 1 }
                };
                break;
              }
            }
            result = await executeCommand(args.command, this.params.sessionId);
            break;
            
          case 'read_file':
            result = await readFile(args.path);
            break;
            
          case 'write_file':
            result = await writeFile(args.path, args.content);
            break;
            
          case 'list_files':
            result = await listFiles(args.path);
            break;
            
          case 'read_tsg':
            result = await readTSG(args.tsgName, args.filePath);
            break;
            
          case 'list_tsgs':
            result = await listTSGs();
            break;
            
          case 'analyze_session_files':
            result = await analyzeSessionFiles(
              this.params.sessionId,
              args.fileNames,
              args.pattern
            );
            break;
            
          default:
            result = { error: `Unknown tool: ${toolCall.function.name}` };
        }
        
        // Add tool result to messages
        this.messages.push({
          role: 'tool',
          content: JSON.stringify(result),
          tool_call_id: toolCall.id
        });
        
        this.params.onToolResult({
          id: toolCall.id,
          result,
          status: result.error ? 'error' : 'success'
        });
        
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        
        this.messages.push({
          role: 'tool',
          content: JSON.stringify({ error: errorMessage }),
          tool_call_id: toolCall.id
        });
        
        this.params.onToolResult({
          id: toolCall.id,
          result: { error: errorMessage },
          status: 'error'
        });
      }
    }
    
    // Continue the conversation with tool results
    if (toolCalls.length > 0 && !this.canceled) {
      // Generate a new message ID for the continuation
      const continuationMessageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      
      const stream = await this.openai.chat.completions.create({
        model: this.params.model,
        messages: this.messages,
        tools,
        tool_choice: 'auto',
        stream: true
      }, {
        signal: this.abortController?.signal
      });
      
      await this.processStream(stream, continuationMessageId);
    }
  }
  
  cancel(): void {
    this.canceled = true;
    if (this.abortController) {
      this.abortController.abort();
    }
  }
  
  getMessages(): ChatCompletionMessageParam[] {
    return [...this.messages];
  }
}