import type { ApprovalPolicy } from '../approvals.js';
import type { WebSession, WebSessionManager } from './session-manager.js';
import type { CommandConfirmation } from '../utils/agent/agent-loop.js';
import type { ResponseItem, ResponseInputItem } from 'openai/resources/responses/responses.mjs';
import type { Socket } from 'socket.io';


import { AgentLoop } from '../utils/agent/agent-loop.js';
import { ReviewDecision } from '../utils/agent/review.js';
import { log } from '../utils/logger/log.js';
import { v4 as uuidv4 } from 'uuid';

interface StartSessionData {
  config: {
    provider: string;
    model: string;
    approvalMode: ApprovalPolicy;
    apiKey?: string;
  };
}

interface UserInputData {
  message: string;
  sessionId: string;
}

interface ApprovalResponseData {
  approvalId: string;
  approved: boolean;
  sessionId: string;
}

export class WebSocketHandler {
  private agentLoop?: AgentLoop;
  private currentGeneration = 0;
  private currentSession?: WebSession;
  private pendingApprovals = new Map<string, (confirmation: CommandConfirmation) => void>();
  
  constructor(
    private socket: Socket,
    private sessionManager: WebSessionManager
  ) {}
  
  initialize(): void {
    // Handle client messages
    this.socket.on('start_session', this.handleStartSession.bind(this));
    this.socket.on('user_input', this.handleUserInput.bind(this));
    this.socket.on('approval_response', this.handleApprovalResponse.bind(this));
    this.socket.on('cancel', this.handleCancel.bind(this));
    this.socket.on('resume_session', this.handleResumeSession.bind(this));
    this.socket.on('disconnect', this.handleDisconnect.bind(this));
  }
  
  private async handleStartSession(data: StartSessionData): Promise<void> {
    try {
      const session = this.sessionManager.createSession({
        socketId: this.socket.id,
        config: data.config
      });
      
      this.currentSession = session;
      
      // Initialize AgentLoop with session config
      this.agentLoop = new AgentLoop({
        model: session.config.model,
        provider: session.config.provider,
        approvalPolicy: session.config.approvalMode || 'suggest',
        disableResponseStorage: false,
        additionalWritableRoots: [],
        onItem: this.handleAgentItem.bind(this),
        onLoading: this.handleLoadingState.bind(this),
        getCommandConfirmation: this.handleCommandConfirmation.bind(this),
        onLastResponseId: this.handleLastResponseId.bind(this),
        config: {
          model: session.config.model,
          apiKey: session.config.apiKey || process.env['OPENAI_API_KEY'] || '',
          instructions: 'You are a helpful AI assistant that helps with coding tasks.',
          provider: session.config.provider,
        }
      });
      
      this.socket.emit('session_created', {
        sessionId: session.id,
        config: session.config
      });
    } catch (error) {
      this.handleError(error);
    }
  }
  
  private async handleResumeSession(data: { sessionId: string }): Promise<void> {
    try {
      const session = await this.sessionManager.getSession(data.sessionId);
      if (!session) {
        throw new Error('Session not found');
      }
      
      this.currentSession = session;
      
      // Re-initialize AgentLoop
      this.agentLoop = new AgentLoop({
        model: session.config.model,
        provider: session.config.provider,
        approvalPolicy: session.config.approvalMode || 'suggest',
        disableResponseStorage: false,
        additionalWritableRoots: [],
        onItem: this.handleAgentItem.bind(this),
        onLoading: this.handleLoadingState.bind(this),
        getCommandConfirmation: this.handleCommandConfirmation.bind(this),
        onLastResponseId: this.handleLastResponseId.bind(this),
        config: {
          model: session.config.model,
          apiKey: session.config.apiKey,
          instructions: '',
        }
      });
      
      this.socket.emit('session_resumed', {
        sessionId: session.id,
        messages: session.messages,
        config: session.config
      });
    } catch (error) {
      this.handleError(error);
    }
  }
  
  private async handleUserInput(data: UserInputData): Promise<void> {
    if (!this.agentLoop || !this.currentSession) {
      this.socket.emit('error', {
        message: 'No active session',
        code: 'NO_SESSION'
      });
      return;
    }
    
    try {
      // Create user message input
      const userInput: ResponseInputItem = {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: data.message
          }
        ]
      };
      
      // Store message in session
      this.currentSession.messages.push({
        id: uuidv4(),
        role: 'user',
        content: data.message,
        timestamp: new Date()
      });
      
      // Update session
      await this.sessionManager.updateSession(this.currentSession);
      
      // Send user message event
      this.socket.emit('agent_event', {
        type: 'user_message',
        data: {
          message: data.message,
          timestamp: new Date()
        },
        generation: this.currentGeneration
      });
      
      // Process with agent
      await this.agentLoop.run(
        [userInput],
        this.currentSession.lastResponseId || ''
      );
      
    } catch (error) {
      this.handleError(error);
    }
  }
  
  private handleAgentItem(item: ResponseItem): void {
    // Emit different events based on item type
    switch (item.type) {
      case 'file_search_call':
      case 'computer_call':
      case 'computer_call_output':
      case 'web_search_call':
        // Not implemented yet
        break;
        
      case 'message':
        if (item.role === 'assistant') {
          this.socket.emit('agent_event', {
            type: 'assistant_message',
            data: {
              content: item.content,
              id: item.id,
              status: item.status
            },
            generation: this.currentGeneration
          });
          
          // Store assistant message
          if (this.currentSession && item.content?.[0]?.type === 'output_text') {
            const textContent = item.content[0] as { type: 'output_text'; text: string };
            this.currentSession.messages.push({
              id: item.id,
              role: 'assistant',
              content: textContent.text,
              timestamp: new Date()
            });
          }
        }
        break;
        
      case 'function_call':
        this.socket.emit('agent_event', {
          type: 'tool_execution',
          data: {
            id: 'call_id' in item ? item.call_id : ('id' in item ? (item as { id: string }).id : ''),
            name: item.name,
            arguments: item.arguments,
            status: 'running'
          },
          generation: this.currentGeneration
        });
        break;
        
      case 'function_call_output': {
        let output;
        try {
          output = JSON.parse(item.output);
        } catch {
          output = { output: item.output };
        }
        
        this.socket.emit('agent_event', {
          type: 'tool_result',
          data: {
            id: item.call_id,
            output: output.output,
            metadata: output.metadata,
            status: output.metadata?.exit_code === 0 ? 'success' : 'error'
          },
          generation: this.currentGeneration
        });
        break;
      }
      
      default:
        // Handle any other types that might be added in the future
        log(`Unhandled agent item type: ${(item as ResponseItem).type}`);
        break;
    }
  }
  
  private handleLoadingState(loading: boolean): void {
    this.socket.emit('agent_event', {
      type: 'loading',
      data: { loading },
      generation: this.currentGeneration
    });
  }
  
  private async handleCommandConfirmation(
    command: Array<string>,
    applyPatch: unknown
  ): Promise<CommandConfirmation> {
    const approvalId = uuidv4();
    
    // Send approval request to client
    this.socket.emit('approval_request', {
      id: approvalId,
      command: command.join(' '),
      commandArray: command,
      applyPatch,
      timestamp: new Date()
    });
    
    // Wait for client response
    return new Promise((resolve) => {
      this.pendingApprovals.set(approvalId, resolve);
      
      // Set timeout for approval
      setTimeout(() => {
        if (this.pendingApprovals.has(approvalId)) {
          this.pendingApprovals.delete(approvalId);
          resolve({
            review: ReviewDecision.NO_CONTINUE,
            customDenyMessage: 'Approval timeout'
          });
        }
      }, 300000); // 5 minute timeout
    });
  }
  
  private handleApprovalResponse(data: ApprovalResponseData): void {
    const resolver = this.pendingApprovals.get(data.approvalId);
    if (resolver) {
      this.pendingApprovals.delete(data.approvalId);
      resolver({
        review: data.approved ? ReviewDecision.YES : ReviewDecision.NO_CONTINUE,
        customDenyMessage: data.approved ? undefined : 'User denied command'
      });
    }
  }
  
  private handleLastResponseId(responseId: string): void {
    if (this.currentSession) {
      this.currentSession.lastResponseId = responseId;
      this.sessionManager.updateSession(this.currentSession);
    }
  }
  
  private handleCancel(): void {
    if (this.agentLoop) {
      this.agentLoop.cancel();
    }
  }
  
  private handleDisconnect(): void {
    // Clean up
    if (this.agentLoop) {
      this.agentLoop.terminate();
    }
    this.pendingApprovals.clear();
  }
  
  private handleError(error: unknown): void {
    log(`WebSocket handler error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    this.socket.emit('error', {
      message: error instanceof Error ? error.message : 'Unknown error',
      code: error instanceof Error && 'code' in error ? error.code : 'UNKNOWN_ERROR',
      stack: process.env['NODE_ENV'] === 'development' ? (error as Error).stack : undefined
    });
  }
}
