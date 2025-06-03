import type { ApprovalPolicy } from '../approvals.js';
import type { CommandConfirmation } from '../utils/agent/agent-loop.js';
import type { ResponseItem, ResponseInputItem } from 'openai/resources/responses/responses.mjs';
import type { Socket } from 'socket.io';

import { type WebSession, WebSessionManager } from './session-manager.js';
import { AgentLoopRefactored } from '../utils/agent/agent-loop-refactored.js';
import { AgentEventBridge } from '../utils/agent/event-bridge.js';
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

/**
 * WebSocket handler that uses the refactored event-based agent loop
 */
export class WebSocketHandlerRefactored {
  private agentLoop?: AgentLoopRefactored;
  private eventBridge?: AgentEventBridge;
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
    
    log('WebSocket handler initialized');
  }
  
  private async handleStartSession(data: StartSessionData): Promise<void> {
    try {
      // Create new session
      const sessionId = uuidv4();
      const session: WebSession = {
        id: sessionId,
        messages: [],
        config: data.config,
        lastResponseId: '',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      this.sessionManager.create(session);
      this.currentSession = session;
      
      // Initialize agent loop with event bridge
      this.initializeAgentLoop(session);
      
      // Send session info to client
      this.socket.emit('session_started', {
        sessionId,
        config: data.config
      });
      
    } catch (error) {
      log('Error starting session:', error);
      this.socket.emit('error', {
        message: 'Failed to start session',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  private initializeAgentLoop(session: WebSession): void {
    // Create event bridge
    this.eventBridge = new AgentEventBridge();
    
    // Create agent loop with event bridge
    this.agentLoop = new AgentLoopRefactored({
      model: session.config.model,
      provider: session.config.provider,
      config: {
        provider: session.config.provider,
        apiKey: session.config.apiKey || process.env['OPENAI_API_KEY'] || '',
      },
      approvalPolicy: session.config.approvalMode,
      disableResponseStorage: false,
      additionalWritableRoots: [],
      eventBridge: this.eventBridge
    });
    
    // Subscribe to agent events
    this.subscribeToAgentEvents();
  }
  
  private subscribeToAgentEvents(): void {
    if (!this.eventBridge) return;
    
    // Handle new items
    this.eventBridge.onItem((item: ResponseItem) => {
      this.socket.emit('agent_event', {
        type: 'item',
        data: item
      });
      
      // Store in session
      if (this.currentSession) {
        this.currentSession.messages.push(item);
        this.sessionManager.update(this.currentSession);
      }
    });
    
    // Handle loading state
    this.eventBridge.onLoading((loading: boolean) => {
      this.socket.emit('agent_event', {
        type: 'loading',
        data: { loading }
      });
    });
    
    // Handle response ID updates
    this.eventBridge.onResponseId((responseId: string) => {
      if (this.currentSession) {
        this.currentSession.lastResponseId = responseId;
        this.sessionManager.update(this.currentSession);
      }
    });
    
    // Handle command confirmations
    this.eventBridge.onConfirmCommand((
      command: Array<string>,
      applyPatch: any,
      callback: (confirmation: CommandConfirmation) => void
    ) => {
      const approvalId = uuidv4();
      this.pendingApprovals.set(approvalId, callback);
      
      this.socket.emit('approval_requested', {
        approvalId,
        command,
        applyPatch
      });
    });
    
    // Handle errors
    this.eventBridge.onError((error: Error) => {
      this.socket.emit('agent_event', {
        type: 'error',
        data: {
          message: error.message
        }
      });
    });
    
    // Handle completion
    this.eventBridge.onComplete(() => {
      this.socket.emit('agent_event', {
        type: 'complete'
      });
    });
    
    // Handle cancellation
    this.eventBridge.onCanceled(() => {
      this.socket.emit('agent_event', {
        type: 'canceled'
      });
    });
    
    // Handle tool calls
    this.eventBridge.onToolCallStart((toolName: string, args: unknown) => {
      this.socket.emit('agent_event', {
        type: 'tool_call_start',
        data: { toolName, args }
      });
    });
    
    this.eventBridge.onToolCallComplete((toolName: string, result: unknown) => {
      this.socket.emit('agent_event', {
        type: 'tool_call_complete',
        data: { toolName, result }
      });
    });
  }
  
  private async handleUserInput(data: UserInputData): Promise<void> {
    if (!this.currentSession || !this.agentLoop) {
      this.socket.emit('error', {
        message: 'No active session'
      });
      return;
    }
    
    try {
      // Create user message input
      const userInput: ResponseInputItem = {
        type: 'message',
        role: 'user',
        content: [{
          type: 'input_text',
          text: data.message
        }]
      };
      
      // Store user message
      this.currentSession.messages.push(userInput as ResponseItem);
      this.sessionManager.update(this.currentSession);
      
      // Run agent with the user input
      await this.agentLoop.run([userInput], this.currentSession.lastResponseId || '');
      
    } catch (error) {
      log('Error processing user input:', error);
      this.socket.emit('error', {
        message: 'Failed to process input',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  private handleApprovalResponse(data: ApprovalResponseData): void {
    const callback = this.pendingApprovals.get(data.approvalId);
    if (!callback) {
      log('No pending approval found for ID:', data.approvalId);
      return;
    }
    
    // Remove from pending
    this.pendingApprovals.delete(data.approvalId);
    
    // Send response back to agent
    const confirmation: CommandConfirmation = {
      review: data.approved ? ReviewDecision.Approve : ReviewDecision.Deny,
      customDenyMessage: data.approved ? undefined : 'User denied the command'
    };
    
    callback(confirmation);
  }
  
  private handleCancel(): void {
    if (this.agentLoop) {
      this.agentLoop.cancel();
    }
  }
  
  private async handleResumeSession(sessionId: string): Promise<void> {
    const session = this.sessionManager.get(sessionId);
    if (!session) {
      this.socket.emit('error', {
        message: 'Session not found'
      });
      return;
    }
    
    this.currentSession = session;
    this.initializeAgentLoop(session);
    
    // Send session data to client
    this.socket.emit('session_resumed', {
      sessionId,
      messages: session.messages,
      config: session.config
    });
  }
  
  private handleDisconnect(): void {
    log('WebSocket disconnected');
    if (this.agentLoop) {
      this.agentLoop.terminate();
    }
    if (this.eventBridge) {
      this.eventBridge.removeAllListeners();
    }
  }
}