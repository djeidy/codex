import type { Socket } from 'socket.io';
import type { WebSession, WebSessionManager } from '../core/session-manager.js';
import type {
  TSGMessage,
  TSGCreateMessage,
  TSGSelectMessage,
  TSGUploadMessage,
  SessionFileUploadMessage,
  SessionFileDeleteMessage,
  SessionFileListMessage,
  SessionFilePreviewMessage,
  ApprovalResponse,
  SessionConfig
} from '../types/index.js';
import { log, error as logError } from '../utils/logger.js';
import { AgentLoop, type ApprovalPolicy } from '../ai/agent-loop.js';
import { v4 as uuidv4 } from 'uuid';
import {
  getEnhancedSession,
  setActiveTSG,
  addSessionFile,
  removeSessionFile,
  syncSessionFiles
} from '../storage/session-files.js';
import {
  saveSessionFile,
  getSessionFileInfo
} from '../storage/session-storage.js';
import {
  createTSG,
  deleteTSG,
  listTSGs,
  uploadToTSG,
  getTSGFiles,
  getTSGMetadata
} from '../storage/tsg-storage.js';
import * as fs from 'fs/promises';
import { shouldAutoAnalyze, generateAutoAnalysisMessage, type SessionFile } from '../ai/auto-analysis.js';

interface StartSessionData {
  config: SessionConfig;
}

interface UserInputData {
  message: string;
  sessionId: string;
}

interface CommandConfirmation {
  approved: boolean;
  customDenyMessage?: string;
}

export class WebSocketHandler {
  private agentLoop?: AgentLoop;
  private currentGeneration = 0;
  private currentSession?: WebSession;
  private pendingApprovals = new Map<
    string,
    (confirmation: CommandConfirmation) => void
  >();
  private streamingMessages = new Map<string, string>(); // Track accumulated content by messageId
  private currentStreamingMessageId?: string; // Track the current streaming message ID

  constructor(
    private socket: Socket,
    private sessionManager: WebSessionManager,
  ) {}

  initialize(): void {
    // Core session handlers
    this.socket.on('start_session', this.handleStartSession.bind(this));
    this.socket.on('user_input', this.handleUserInput.bind(this));
    this.socket.on('approval_response', this.handleApprovalResponse.bind(this));
    this.socket.on('cancel', this.handleCancel.bind(this));
    this.socket.on('resume_session', this.handleResumeSession.bind(this));
    this.socket.on('disconnect', this.handleDisconnect.bind(this));

    // TSG handlers
    this.socket.on('tsg:create', (data: TSGCreateMessage) =>
      this.handleTSGMessage(data),
    );
    this.socket.on('tsg:list', (data: TSGMessage) =>
      this.handleTSGMessage(data),
    );
    this.socket.on('tsg:select', (data: TSGSelectMessage) =>
      this.handleTSGMessage(data),
    );
    this.socket.on('tsg:delete', (data: TSGMessage) =>
      this.handleTSGMessage(data),
    );
    this.socket.on('tsg:upload', (data: TSGUploadMessage) =>
      this.handleTSGMessage(data),
    );
    this.socket.on('tsg:get-files', (data: TSGMessage) =>
      this.handleTSGMessage(data),
    );

    // Session file handlers
    this.socket.on('message', this.handleMessage.bind(this));

    // Error handler
    this.socket.on('error', (error: Error) => {
      logError('Socket error:', error);
    });
  }

  private async handleStartSession(data: StartSessionData): Promise<void> {
    try {
      const session = this.sessionManager.createSession({
        socketId: this.socket.id,
        config: data.config,
      });

      this.currentSession = session;
      const enhancedSession = getEnhancedSession(session.id);

      // Initialize AgentLoop
      this.agentLoop = new AgentLoop({
        model: session.config.model,
        provider: session.config.provider,
        config: session.config,
        instructions: this.buildSessionContext(session.id),
        approvalPolicy: (session.config.approvalMode || 'suggest') as ApprovalPolicy,
        sessionId: session.id,
        activeTSG: enhancedSession.activeTSG,
        onChunk: this.handleAgentChunk.bind(this),
        onToolCall: this.handleToolCall.bind(this),
        onToolResult: this.handleToolResult.bind(this),
        getCommandConfirmation: this.handleCommandConfirmation.bind(this),
      });

      this.socket.emit('session_created', {
        sessionId: session.id,
        config: session.config,
      });

    } catch (error) {
      this.handleError(error);
    }
  }

  private async handleResumeSession(data: {
    sessionId: string;
  }): Promise<void> {
    try {
      const session = await this.sessionManager.getSession(data.sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      this.currentSession = session;
      const enhancedSession = getEnhancedSession(data.sessionId);

      // Re-initialize AgentLoop
      this.agentLoop = new AgentLoop({
        model: session.config.model,
        provider: session.config.provider,
        config: session.config,
        instructions: this.buildSessionContext(data.sessionId),
        approvalPolicy: (session.config.approvalMode || 'suggest') as ApprovalPolicy,
        sessionId: session.id,
        activeTSG: enhancedSession.activeTSG,
        onChunk: this.handleAgentChunk.bind(this),
        onToolCall: this.handleToolCall.bind(this),
        onToolResult: this.handleToolResult.bind(this),
        getCommandConfirmation: this.handleCommandConfirmation.bind(this),
      });

      this.socket.emit('session_resumed', {
        sessionId: session.id,
        messages: session.messages,
        config: session.config,
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  private async handleUserInput(data: UserInputData): Promise<void> {
    if (!this.agentLoop || !this.currentSession) {
      this.socket.emit('error', {
        message: 'No active session',
        code: 'NO_SESSION',
      });
      return;
    }

    try {
      // Store user message
      this.currentSession.messages.push({
        id: uuidv4(),
        role: 'user',
        content: data.message,
        timestamp: new Date(),
      });

      await this.sessionManager.updateSession(this.currentSession);

      // Increment generation for new conversation turn
      this.currentGeneration++;
      
      // Send user message event
      this.socket.emit('agent_event', {
        type: 'user_message',
        data: {
          message: data.message,
          timestamp: new Date(),
        },
        generation: this.currentGeneration,
      });

      // Set loading state
      this.socket.emit('agent_event', {
        type: 'loading',
        data: { loading: true },
        generation: this.currentGeneration,
      });

      // Process with agent
      await this.agentLoop.run(data.message);

      // Clear loading state
      this.socket.emit('agent_event', {
        type: 'loading',
        data: { loading: false },
        generation: this.currentGeneration,
      });

    } catch (error) {
      // Clean up streaming state on error
      this.currentStreamingMessageId = undefined;
      this.streamingMessages.clear();
      
      this.handleError(error);
      this.socket.emit('agent_event', {
        type: 'loading',
        data: { loading: false },
        generation: this.currentGeneration,
      });
    }
  }

  private buildSessionContext(sessionId: string): string {
    const enhancedSession = getEnhancedSession(sessionId);
    let context = 'You are a helpful AI assistant specializing in log analysis and troubleshooting.\n\n';

    if (enhancedSession.uploadedFiles.length > 0) {
      context += `## Session Files (${enhancedSession.uploadedFiles.length} files)\n`;
      context += 'The following files have been uploaded for analysis:\n';
      for (const file of enhancedSession.uploadedFiles) {
        context += `- ${file.name} (${file.type}, ${(file.size / 1024).toFixed(1)}KB)\n`;
      }
      context += '\nIMPORTANT: Use the analyze_session_files tool to analyze these uploaded files. ';
      context += 'Do not try to find files using list_files - the uploaded files are available through analyze_session_files.\n\n';
    }

    if (enhancedSession.activeTSG) {
      context += `## Active Troubleshooting Guide\n`;
      context += `The user has selected the "${enhancedSession.activeTSG}" TSG.\n\n`;
    }

    return context;
  }

  private handleAgentChunk(chunk: any): void {
    if (chunk.type === 'content') {
      // Use the chunk's messageId if provided, otherwise use/create a consistent one
      let messageId: string;
      
      if (chunk.isFirstChunk) {
        // For the first chunk, use provided ID or generate a new one
        messageId = chunk.messageId || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        this.currentStreamingMessageId = messageId;
        this.streamingMessages.set(messageId, chunk.content);
      } else {
        // For subsequent chunks, use the current streaming message ID
        messageId = this.currentStreamingMessageId || chunk.messageId || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        
        if (!chunk.isComplete) {
          // Accumulate content during streaming
          const currentContent = this.streamingMessages.get(messageId) || '';
          this.streamingMessages.set(messageId, currentContent + chunk.content);
        }
      }
      
      // Get accumulated content
      const accumulatedContent = this.streamingMessages.get(messageId) || chunk.content;
      
      // Emit the appropriate event
      this.socket.emit('agent_event', {
        type: 'assistant_message',
        data: {
          content: [{
            type: 'output_text',
            text: accumulatedContent
          }],
          id: messageId,
          status: chunk.isComplete ? 'completed' : 'in_progress',
        },
        generation: this.currentGeneration,
      });
      
      // Clean up on completion and save message
      if (chunk.isComplete) {
        // Save the complete assistant message to the session
        if (this.currentSession && accumulatedContent) {
          this.currentSession.messages.push({
            id: messageId,
            role: 'assistant',
            content: accumulatedContent,
            timestamp: new Date()
          });
        }
        
        this.streamingMessages.delete(messageId);
        this.currentStreamingMessageId = undefined;
      }
    }
  }

  private handleToolCall(toolCall: any): void {
    this.socket.emit('agent_event', {
      type: 'tool_execution',
      data: {
        id: toolCall.id,
        name: toolCall.name,
        arguments: toolCall.arguments,
        status: 'running',
      },
      generation: this.currentGeneration,
    });
  }

  private handleToolResult(result: any): void {
    this.socket.emit('agent_event', {
      type: 'tool_result',
      data: {
        id: result.id,
        output: result.result.output || JSON.stringify(result.result),
        metadata: result.result.metadata,
        status: result.status,
      },
      generation: this.currentGeneration,
    });
  }

  private async handleCommandConfirmation(
    command: string[],
    applyPatch?: any,
  ): Promise<CommandConfirmation> {
    const approvalId = uuidv4();

    // Send approval request to client
    this.socket.emit('approval_request', {
      id: approvalId,
      command: command.join(' '),
      commandArray: command,
      applyPatch,
      timestamp: new Date(),
    });

    // Wait for client response
    return new Promise((resolve) => {
      this.pendingApprovals.set(approvalId, resolve);

      // Set timeout for approval
      setTimeout(() => {
        if (this.pendingApprovals.has(approvalId)) {
          this.pendingApprovals.delete(approvalId);
          resolve({
            approved: false,
            customDenyMessage: 'Approval timeout',
          });
        }
      }, 300000); // 5 minute timeout
    });
  }

  private handleApprovalResponse(data: ApprovalResponse): void {
    const resolver = this.pendingApprovals.get(data.approvalId);
    if (resolver) {
      this.pendingApprovals.delete(data.approvalId);
      resolver({
        approved: data.approved,
        customDenyMessage: data.approved ? undefined : 'User denied command',
      });
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
      this.agentLoop.cancel();
    }
    this.pendingApprovals.clear();
  }

  private async handleTSGMessage(message: TSGMessage): Promise<void> {
    try {
      switch (message.type) {
        case 'tsg:create':
          await this.handleTSGCreate(message as TSGCreateMessage);
          break;
        case 'tsg:list':
          await this.handleTSGList(message);
          break;
        case 'tsg:select':
          await this.handleTSGSelect(message as TSGSelectMessage);
          break;
        case 'tsg:delete':
          await this.handleTSGDelete(message);
          break;
        case 'tsg:upload':
          await this.handleTSGUpload(message as TSGUploadMessage);
          break;
        case 'tsg:get-files':
          await this.handleTSGGetFiles(message);
          break;
      }
    } catch (error) {
      this.socket.emit('error', {
        type: 'tsg:error',
        message: error instanceof Error ? error.message : 'Unknown error',
        originalType: message.type,
      });
    }
  }

  private async handleTSGCreate(message: TSGCreateMessage): Promise<void> {
    const { name, description } = message.data;
    
    if (!name || name.length < 3 || name.length > 100) {
      throw new Error('TSG name must be between 3 and 100 characters');
    }

    await createTSG(name, description);
    await this.handleTSGList(message);
    
    this.socket.emit('message', {
      type: 'tsg:create:success',
      data: { name },
    });
  }

  private async handleTSGList(message: TSGMessage): Promise<void> {
    const tsgs = await listTSGs();
    const { sessionId } = message;
    const enhancedSession = getEnhancedSession(sessionId);
    const activeTSG = enhancedSession.activeTSG;

    const tsgDetails = await Promise.all(
      tsgs.map(async (name) => {
        const files = await getTSGFiles(name);
        const totalSize = files.reduce((sum: number, file: any) => sum + file.size, 0);
        const metadata = await getTSGMetadata(name);

        return {
          name,
          fileCount: files.length,
          createdAt: metadata?.createdAt || new Date().toISOString(),
          size: totalSize,
        };
      }),
    );

    this.socket.emit('message', {
      type: 'tsg:list:response',
      data: {
        tsgs: tsgDetails,
        activeTSG,
      },
    });
  }

  private async handleTSGSelect(message: TSGSelectMessage): Promise<void> {
    const { name } = message.data;
    const { sessionId } = message;

    setActiveTSG(sessionId, name);

    this.socket.emit('message', {
      type: 'tsg:select:success',
      data: { activeTSG: name },
    });

    // Trigger automatic TSG reading
    if (this.agentLoop && this.currentSession && name) {
      const systemMessage = `The user has selected the "${name}" TSG. Please read its index or table of contents to understand its structure.`;
      await this.agentLoop.run(systemMessage);
    }
  }

  private async handleTSGDelete(message: TSGMessage): Promise<void> {
    if (!message.data || !message.data.name) {
      throw new Error('Missing name in delete request');
    }
    const name = message.data.name;

    await deleteTSG(name);
    await this.handleTSGList(message);

    this.socket.emit('message', {
      type: 'tsg:delete:success',
      data: { name },
    });
  }

  private async handleTSGUpload(message: TSGUploadMessage): Promise<void> {
    const { tsgName, files } = message.data;

    const processedFiles = files.map((file) => ({
      path: file.path,
      content: Buffer.from(file.content, 'base64'),
    }));

    await uploadToTSG(tsgName, processedFiles);
    await this.handleTSGGetFiles({ ...message, data: { name: tsgName } });

    this.socket.emit('message', {
      type: 'tsg:upload:success',
      data: { tsgName, fileCount: files.length },
    });
  }

  private async handleTSGGetFiles(message: TSGMessage): Promise<void> {
    if (!message.data || !message.data.name) {
      throw new Error('Missing name in get files request');
    }
    const name = message.data.name;
    const files = await getTSGFiles(name);

    this.socket.emit('message', {
      type: 'tsg:files:response',
      data: {
        tsgName: name,
        files: files.map((file) => ({
          path: file.path,
          name: file.name,
          size: file.size,
          type: this.getFileType(file.name),
        })),
      },
    });
  }

  private async handleSessionFileUpload(
    message: SessionFileUploadMessage,
  ): Promise<void> {
    const { sessionId, data } = message;
    const { files } = data;

    const uploadedFiles = await Promise.all(
      files.map(async (file: any) => {
        const content = Buffer.from(file.content, 'base64');
        const filePath = await saveSessionFile(sessionId, file.name, content);
        const fileInfo = await getSessionFileInfo(sessionId, file.name);
        if (fileInfo) {
          await addSessionFile(sessionId, fileInfo);
        }
        return {
          name: file.name,
          path: filePath,
          size: file.size,
          type: file.type,
        };
      }),
    );

    this.socket.emit('message', {
      type: 'session:upload:success',
      data: {
        files: uploadedFiles,
      },
    });

    // Broadcast updated file list
    const enhancedSession = getEnhancedSession(sessionId);
    this.socket.emit('message', {
      type: 'session:files:updated',
      data: {
        files: enhancedSession.uploadedFiles,
      },
    });

    // Check if we should auto-analyze the uploaded files
    const newFiles: Array<SessionFile> = uploadedFiles.map((f) => ({
      name: f.name,
      path: f.path,
      size: f.size,
      type: f.type,
      uploadedAt: new Date().toISOString(),
    }));

    const session = await this.sessionManager.getSession(sessionId);
    if (session && (await shouldAutoAnalyze(session, newFiles))) {
      // Send auto-analysis trigger
      this.socket.emit('message', {
        type: 'auto-analysis:trigger',
        data: {
          message: generateAutoAnalysisMessage(newFiles),
          files: newFiles.map((f) => f.name),
        },
      });
    }
  }

  private async handleMessage(
    message: any,
    callback?: (response?: { status: string; error?: string }) => void,
  ): Promise<void> {
    try {
      log(`Received message type: ${message.type}`);

      switch (message.type) {
        case 'session:upload':
          await this.handleSessionFileUpload(message);
          break;
        case 'session:file:delete':
          await this.handleSessionFileDelete(message);
          break;
        case 'session:file:list':
          await this.handleSessionFileList(message);
          break;
        case 'session:file:preview':
          await this.handleSessionFilePreview(message);
          break;
        case 'tsg:create':
        case 'tsg:list':
        case 'tsg:select':
        case 'tsg:delete':
        case 'tsg:upload':
        case 'tsg:get-files':
          await this.handleTSGMessage(message);
          break;
      }

      if (callback) {
        callback({ status: 'received' });
      }
    } catch (error) {
      logError('Error handling message:', error as Error);
      if (callback) {
        callback({
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      this.handleError(error);
    }
  }

  private async handleSessionFileDelete(
    message: SessionFileDeleteMessage,
  ): Promise<void> {
    const { sessionId, data } = message;
    const { fileName } = data;

    const success = await removeSessionFile(sessionId, fileName);

    if (success) {
      this.socket.emit('message', {
        type: 'session:file:delete:success',
        data: { fileName },
      });

      const enhancedSession = getEnhancedSession(sessionId);
      this.socket.emit('message', {
        type: 'session:files:updated',
        data: {
          files: enhancedSession.uploadedFiles,
        },
      });
    } else {
      throw new Error(`File ${fileName} not found`);
    }
  }

  private async handleSessionFileList(
    message: SessionFileListMessage,
  ): Promise<void> {
    const { sessionId } = message;

    await syncSessionFiles(sessionId);
    const enhancedSession = getEnhancedSession(sessionId);

    this.socket.emit('message', {
      type: 'session:file:list:response',
      data: {
        files: enhancedSession.uploadedFiles,
        totalSize: enhancedSession.sessionMetadata?.totalUploadSize || 0,
        count: enhancedSession.sessionMetadata?.fileUploadCount || 0,
      },
    });
  }

  private async handleSessionFilePreview(
    message: SessionFilePreviewMessage,
  ): Promise<void> {
    const { sessionId, data } = message;
    const { fileName, lines = 50 } = data;

    const fileInfo = await getSessionFileInfo(sessionId, fileName);
    if (!fileInfo) {
      throw new Error(`File ${fileName} not found`);
    }

    const content = await fs.readFile(fileInfo.path, 'utf-8');
    const contentLines = content.split('\n');
    const truncated = contentLines.length > lines;
    const previewContent = contentLines.slice(0, lines).join('\n');

    this.socket.emit('message', {
      type: 'session:file:preview:response',
      data: {
        fileName,
        content: previewContent,
        truncated,
      },
    });
  }

  private getFileType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const typeMap: Record<string, string> = {
      md: 'markdown',
      txt: 'text',
      log: 'log',
      json: 'json',
      yaml: 'yaml',
      yml: 'yaml',
      png: 'image',
      jpg: 'image',
      jpeg: 'image',
      gif: 'image',
    };
    return typeMap[ext || ''] || 'unknown';
  }

  private handleError(error: unknown): void {
    logError('WebSocket handler error:', error as Error);
    this.socket.emit('error', {
      message: error instanceof Error ? error.message : 'Unknown error',
      code:
        error instanceof Error && 'code' in error
          ? (error as any).code
          : 'UNKNOWN_ERROR',
      stack:
        process.env.NODE_ENV === 'development'
          ? (error as Error).stack
          : undefined,
    });
  }
}