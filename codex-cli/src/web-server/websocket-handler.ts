import type { ApprovalPolicy } from "../approvals.js";
import type { WebSession, WebSessionManager } from "./session-manager.js";
import type {
  TSGMessage,
  TSGCreateMessage,
  TSGSelectMessage,
  TSGUploadMessage,
  SessionFileUploadMessage,
  SessionFileDeleteMessage,
  SessionFileListMessage,
  SessionFilePreviewMessage,
  TSGListResponse,
  TSGFilesResponse,
  SessionFileListResponse,
  SessionFilePreviewResponse,
  SessionFileDeleteSuccessMessage,
  SessionFilesUpdatedMessage,
} from "./types.js";
import type { CommandConfirmation } from "../utils/agent/agent-loop.js";
import type {
  ResponseItem,
  ResponseInputItem,
} from "openai/resources/responses/responses.mjs";
import type { Socket } from "socket.io";

import { AgentLoop } from "../utils/agent/agent-loop.js";
import {
  shouldAutoAnalyze,
  generateAutoAnalysisMessage,
  type SessionFile,
} from "../utils/agent/auto-analysis.js";
import { ReviewDecision } from "../utils/agent/review.js";
import { log } from "../utils/logger/log.js";
import {
  addSessionFile,
  removeSessionFile,
  syncSessionFiles,
  getEnhancedSession,
  setActiveTSG,
} from "../utils/session-files.js";
import {
  saveSessionFile,
  getSessionFileInfo,
} from "../utils/storage/session-storage.js";
import {
  createTSG,
  deleteTSG,
  listTSGs,
  uploadToTSG,
  getTSGFiles,
  getTSGMetadata,
} from "../utils/storage/tsg-storage.js";
import * as fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";

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
  private pendingApprovals = new Map<
    string,
    (confirmation: CommandConfirmation) => void
  >();

  constructor(
    private socket: Socket,
    private sessionManager: WebSessionManager,
  ) {}

  private buildSessionContext(sessionId: string): string {
    const enhancedSession = getEnhancedSession(sessionId);
    let context =
      "You are a helpful AI assistant specializing in log analysis and troubleshooting. You have access to session files and troubleshooting guides (TSGs) to help diagnose issues.\n\n";

    // Add session file information
    if (enhancedSession.uploadedFiles.length > 0) {
      context += `## Session Files (${enhancedSession.uploadedFiles.length} files)\n`;
      context += "The following files have been uploaded for analysis:\n";
      for (const file of enhancedSession.uploadedFiles) {
        context += `- ${file.name} (${file.type}, ${(file.size / 1024).toFixed(1)}KB)\n`;
      }
      context +=
        "\nYou can analyze these files to help diagnose issues. Focus on finding patterns, errors, and anomalies in the logs.\n\n";
    } else {
      context +=
        "## Session Files\nNo files have been uploaded yet. The user can upload log files for analysis.\n\n";
    }

    // Add active TSG information
    if (enhancedSession.activeTSG) {
      context += `## Active Troubleshooting Guide\nThe user has selected the "${enhancedSession.activeTSG}" TSG. You should reference this guide when providing troubleshooting assistance.\n\n`;
    }

    return context;
  }

  private refreshAgentContext(_sessionId: string): void {
    // Note: AgentLoop config is private, so we cannot directly update instructions
    // The context will be refreshed when a new agent loop is created or on user input
  }

  initialize(): void {
    // Handle client messages
    this.socket.on("start_session", this.handleStartSession.bind(this));
    this.socket.on("user_input", this.handleUserInput.bind(this));
    this.socket.on("approval_response", this.handleApprovalResponse.bind(this));
    this.socket.on("cancel", this.handleCancel.bind(this));
    this.socket.on("resume_session", this.handleResumeSession.bind(this));
    this.socket.on("disconnect", this.handleDisconnect.bind(this));

    // Handle TSG messages
    this.socket.on("tsg:create", (data: TSGCreateMessage) =>
      this.handleTSGMessage(data),
    );
    this.socket.on("tsg:list", (data: TSGMessage) =>
      this.handleTSGMessage(data),
    );
    this.socket.on("tsg:select", (data: TSGSelectMessage) =>
      this.handleTSGMessage(data),
    );
    this.socket.on("tsg:delete", (data: TSGMessage) =>
      this.handleTSGMessage(data),
    );
    this.socket.on("tsg:upload", (data: TSGUploadMessage) =>
      this.handleTSGMessage(data),
    );
    this.socket.on("tsg:get-files", (data: TSGMessage) =>
      this.handleTSGMessage(data),
    );

    // Handle session file management, uploads, and TSG messages through message event
    this.socket.on(
      "message",
      (
        data:
          | SessionFileDeleteMessage
          | SessionFileListMessage
          | SessionFilePreviewMessage
          | SessionFileUploadMessage
          | TSGMessage,
        callback?: (response?: { status: string; error?: string }) => void,
      ) => {
        log(
          `📨 Socket received message event, type: ${data?.type}, has callback: ${!!callback}`,
        );
        this.handleMessage(data)
          .then(() => {
            if (callback) {
              log(`✅ Sending acknowledgment for message type: ${data?.type}`);
              callback({ status: "received" });
            }
          })
          .catch((error) => {
            log(`❌ Error handling message: ${error}`);
            if (callback) {
              callback({
                status: "error",
                error: error instanceof Error ? error.message : "Unknown error",
              });
            }
          });
      },
    );

    // Add error handler
    this.socket.on("error", (error: Error) => {
      log(`🔴 Socket error: ${error.message}`);
    });
  }

  private async handleStartSession(data: StartSessionData): Promise<void> {
    try {
      const session = this.sessionManager.createSession({
        socketId: this.socket.id,
        config: data.config,
      });

      this.currentSession = session;

      // Get enhanced session to check for active TSG
      const enhancedSession = getEnhancedSession(session.id);

      // Initialize AgentLoop with session config
      this.agentLoop = new AgentLoop({
        model: session.config.model,
        provider: session.config.provider,
        approvalPolicy: session.config.approvalMode || "suggest",
        disableResponseStorage: false,
        additionalWritableRoots: [],
        onItem: this.handleAgentItem.bind(this),
        onLoading: this.handleLoadingState.bind(this),
        getCommandConfirmation: this.handleCommandConfirmation.bind(this),
        onLastResponseId: this.handleLastResponseId.bind(this),
        sessionId: session.id,
        activeTSG: enhancedSession.activeTSG,
        config: {
          model: session.config.model,
          apiKey: session.config.apiKey || process.env["OPENAI_API_KEY"] || "",
          instructions: this.buildSessionContext(session.id),
          provider: session.config.provider,
        },
      });

      this.socket.emit("session_created", {
        sessionId: session.id,
        config: session.config,
      });

      // If there's an active TSG, trigger automatic reading
      if (enhancedSession.activeTSG) {
        const systemMessage: ResponseInputItem = {
          type: "message",
          role: "system",
          content: [
            {
              type: "input_text",
              text: `A TSG named "${enhancedSession.activeTSG}" is already active for this session. Please read its index or table of contents to understand its structure and available troubleshooting procedures. Use read_tsg to list all files: {"tsgName": "${enhancedSession.activeTSG}"}, then read the main index or _TOC_.md file.`,
            },
          ],
        };

        await this.agentLoop.run([systemMessage], "");
      }
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
        throw new Error("Session not found");
      }

      this.currentSession = session;

      // Get enhanced session to check for active TSG
      const enhancedSession = getEnhancedSession(data.sessionId);

      // Re-initialize AgentLoop
      this.agentLoop = new AgentLoop({
        model: session.config.model,
        provider: session.config.provider,
        approvalPolicy: session.config.approvalMode || "suggest",
        disableResponseStorage: false,
        additionalWritableRoots: [],
        onItem: this.handleAgentItem.bind(this),
        onLoading: this.handleLoadingState.bind(this),
        getCommandConfirmation: this.handleCommandConfirmation.bind(this),
        onLastResponseId: this.handleLastResponseId.bind(this),
        sessionId: session.id,
        activeTSG: enhancedSession.activeTSG,
        config: {
          model: session.config.model,
          apiKey: session.config.apiKey,
          instructions: this.buildSessionContext(data.sessionId),
        },
      });

      this.socket.emit("session_resumed", {
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
      this.socket.emit("error", {
        message: "No active session",
        code: "NO_SESSION",
      });
      return;
    }

    try {
      // Create user message input
      const userInput: ResponseInputItem = {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: data.message,
          },
        ],
      };

      // Store message in session
      this.currentSession.messages.push({
        id: uuidv4(),
        role: "user",
        content: data.message,
        timestamp: new Date(),
      });

      // Update session
      await this.sessionManager.updateSession(this.currentSession);

      // Send user message event
      this.socket.emit("agent_event", {
        type: "user_message",
        data: {
          message: data.message,
          timestamp: new Date(),
        },
        generation: this.currentGeneration,
      });

      // Process with agent
      await this.agentLoop.run(
        [userInput],
        this.currentSession.lastResponseId || "",
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleAgentItem(item: ResponseItem): void {
    log(
      `🔥 Backend - handleAgentItem called with type: ${item.type}, item: ${JSON.stringify(item, null, 2)}`,
    );

    // Emit different events based on item type
    switch (item.type) {
      case "file_search_call":
      case "computer_call":
      case "computer_call_output":
      case "web_search_call":
        // Not implemented yet
        break;

      case "message":
        if (item.role === "assistant") {
          this.socket.emit("agent_event", {
            type: "assistant_message",
            data: {
              content: item.content,
              id: item.id,
              status: item.status,
            },
            generation: this.currentGeneration,
          });

          // Store assistant message
          if (
            this.currentSession &&
            item.content?.[0]?.type === "output_text"
          ) {
            const textContent = item.content[0] as {
              type: "output_text";
              text: string;
            };
            this.currentSession.messages.push({
              id: item.id,
              role: "assistant",
              content: textContent.text,
              timestamp: new Date(),
            });
          }
        }
        break;

      case "function_call":
        this.socket.emit("agent_event", {
          type: "tool_execution",
          data: {
            id:
              "call_id" in item
                ? item.call_id
                : "id" in item
                  ? (item as { id: string }).id
                  : "",
            name: item.name,
            arguments: item.arguments,
            status: "running",
          },
          generation: this.currentGeneration,
        });
        break;

      case "function_call_output": {
        let output;
        try {
          output = JSON.parse(item.output);
        } catch {
          output = { output: item.output };
        }

        // Determine status based on output content and metadata
        let status = "success"; // Default to success

        // Check for error indicators
        if (output.error) {
          // If there's an explicit error property, it's an error
          status = "error";
        } else if (output.metadata?.exit_code !== undefined) {
          // If exit_code is provided, use it (0 = success, non-zero = error)
          status = output.metadata.exit_code === 0 ? "success" : "error";
        }
        // For tools without metadata (like read_tsg), default to success
        // unless there's an explicit error property

        this.socket.emit("agent_event", {
          type: "tool_result",
          data: {
            id: item.call_id,
            output: output.output,
            metadata: output.metadata,
            status: status,
          },
          generation: this.currentGeneration,
        });
        break;
      }

      default:
        // Handle any other types that might be added in the future
        log(
          `❓ Unhandled agent item type: ${(item as ResponseItem).type}, full item: ${JSON.stringify(item, null, 2)}`,
        );
        break;
    }
  }

  private handleLoadingState(loading: boolean): void {
    this.socket.emit("agent_event", {
      type: "loading",
      data: { loading },
      generation: this.currentGeneration,
    });
  }

  private async handleCommandConfirmation(
    command: Array<string>,
    applyPatch: unknown,
  ): Promise<CommandConfirmation> {
    const approvalId = uuidv4();

    // Send approval request to client
    this.socket.emit("approval_request", {
      id: approvalId,
      command: command.join(" "),
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
            review: ReviewDecision.NO_CONTINUE,
            customDenyMessage: "Approval timeout",
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
        customDenyMessage: data.approved ? undefined : "User denied command",
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

  private async handleTSGMessage(message: TSGMessage): Promise<void> {
    try {
      switch (message.type) {
        case "tsg:create":
          await this.handleTSGCreate(message as TSGCreateMessage);
          break;
        case "tsg:list":
          await this.handleTSGList(message);
          break;
        case "tsg:select":
          await this.handleTSGSelect(message as TSGSelectMessage);
          break;
        case "tsg:delete":
          await this.handleTSGDelete(message);
          break;
        case "tsg:upload":
          await this.handleTSGUpload(message as TSGUploadMessage);
          break;
        case "tsg:get-files":
          await this.handleTSGGetFiles(message);
          break;
      }
    } catch (error) {
      this.socket.emit("error", {
        type: "tsg:error",
        message: error instanceof Error ? error.message : "Unknown error",
        originalType: message.type,
      });
    }
  }

  private async handleTSGCreate(message: TSGCreateMessage): Promise<void> {
    log(
      `🎯 handleTSGCreate called with message: ${JSON.stringify(message, null, 2)}`,
    );

    const { name, description } = message.data;

    // Validate name
    if (!name || name.length < 3 || name.length > 100) {
      throw new Error("TSG name must be between 3 and 100 characters");
    }

    log(
      `📁 Creating TSG with name: ${name}, description: ${description || "none"}`,
    );
    await createTSG(name);

    // Send updated list
    await this.handleTSGList(message);

    log(`✅ TSG created successfully, emitting success message`);
    this.socket.emit("message", {
      type: "tsg:create:success",
      data: { name },
    });
  }

  private async handleTSGList(message: TSGMessage): Promise<void> {
    const tsgs = await listTSGs();
    const { sessionId } = message;

    // Get active TSG from enhanced session
    const enhancedSession = getEnhancedSession(sessionId);
    const activeTSG = enhancedSession.activeTSG;

    // Get details for each TSG
    const tsgDetails = await Promise.all(
      tsgs.map(async (name) => {
        const files = await getTSGFiles(name);
        const totalSize = files.reduce((sum, file) => sum + file.size, 0);
        const metadata = await getTSGMetadata(name);

        return {
          name,
          fileCount: files.length,
          createdAt: metadata?.createdAt || new Date().toISOString(),
          size: totalSize,
        };
      }),
    );

    const response: TSGListResponse = {
      type: "tsg:list:response",
      data: {
        tsgs: tsgDetails,
        activeTSG,
      },
    };

    this.socket.emit("message", response);
  }

  private async handleTSGSelect(message: TSGSelectMessage): Promise<void> {
    const { name } = message.data;
    const { sessionId } = message;

    // Update the active TSG in the enhanced session
    setActiveTSG(sessionId, name);

    this.socket.emit("message", {
      type: "tsg:select:success",
      data: { activeTSG: name },
    });

    // Refresh agent context with new TSG information
    this.refreshAgentContext(sessionId);

    // Trigger automatic TSG reading when a TSG is selected
    if (this.agentLoop && this.currentSession) {
      // Send a system message to trigger TSG reading
      const systemMessage: ResponseInputItem = {
        type: "message",
        role: "system",
        content: [
          {
            type: "input_text",
            text: `The user has selected the "${name}" TSG. Please read its index or table of contents to understand its structure and available troubleshooting procedures. Use read_tsg to list all files: {"tsgName": "${name}"}, then read the main index or _TOC_.md file.`,
          },
        ],
      };

      // Process with agent to trigger TSG reading
      await this.agentLoop.run(
        [systemMessage],
        this.currentSession.lastResponseId || "",
      );
    }
  }

  private async handleTSGDelete(message: TSGMessage): Promise<void> {
    if (!message.data || !message.data.name) {
      throw new Error("Missing name in delete request");
    }
    const name = message.data.name;

    // Check if it's the active TSG in any session
    // For now, we'll handle this at the session level

    await deleteTSG(name);

    // Send updated list
    await this.handleTSGList(message);

    this.socket.emit("message", {
      type: "tsg:delete:success",
      data: { name },
    });
  }

  private async handleTSGUpload(message: TSGUploadMessage): Promise<void> {
    const { tsgName, files } = message.data;

    // Convert base64 files to buffers
    const processedFiles = files.map((file) => ({
      path: file.path,
      content: Buffer.from(file.content, "base64"),
    }));

    // Upload files
    await uploadToTSG(tsgName, processedFiles);

    // Send file list response
    await this.handleTSGGetFiles({ ...message, data: { name: tsgName } });

    this.socket.emit("message", {
      type: "tsg:upload:success",
      data: { tsgName, fileCount: files.length },
    });
  }

  private async handleTSGGetFiles(message: TSGMessage): Promise<void> {
    if (!message.data || !message.data.name) {
      throw new Error("Missing name in get files request");
    }
    const name = message.data.name;
    const files = await getTSGFiles(name);

    const response: TSGFilesResponse = {
      type: "tsg:files:response",
      data: {
        tsgName: name || "",
        files: files.map((file) => ({
          path: file.path,
          name: file.name,
          size: file.size,
          type: this.getFileType(file.name),
        })),
      },
    };

    this.socket.emit("message", response);
  }

  private async handleSessionFileUpload(
    message: SessionFileUploadMessage,
  ): Promise<void> {
    const { sessionId, data } = message;
    const { files } = data;

    log(
      `📤 Handling session file upload for session ${sessionId}, ${files.length} files`,
    );

    const uploadedFiles = await Promise.all(
      files.map(async (file) => {
        const content = Buffer.from(file.content, "base64");
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

    log(`✅ Files uploaded successfully, sending success message`);

    this.socket.emit("message", {
      type: "session:upload:success",
      data: {
        files: uploadedFiles,
      },
    });

    // Broadcast updated file list to all clients in session
    const enhancedSession = getEnhancedSession(sessionId);
    const response: SessionFilesUpdatedMessage = {
      type: "session:files:updated",
      data: {
        files: enhancedSession.uploadedFiles,
      },
    };
    this.socket.emit("message", response);

    // Refresh agent context with new file information
    this.refreshAgentContext(sessionId);

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
      this.socket.emit("message", {
        type: "auto-analysis:trigger",
        data: {
          message: generateAutoAnalysisMessage(newFiles),
          files: newFiles.map((f) => f.name),
        },
      });
    }
  }

  private async handleMessage(
    message:
      | SessionFileDeleteMessage
      | SessionFileListMessage
      | SessionFilePreviewMessage
      | SessionFileUploadMessage
      | TSGMessage,
  ): Promise<void> {
    try {
      log(`📩 Received message type: ${message.type}`);

      switch (message.type) {
        case "session:upload":
          await this.handleSessionFileUpload(
            message as SessionFileUploadMessage,
          );
          break;
        case "session:file:delete":
          await this.handleSessionFileDelete(message);
          break;
        case "session:file:list":
          await this.handleSessionFileList(message);
          break;
        case "session:file:preview":
          await this.handleSessionFilePreview(message);
          break;
        // Handle TSG messages
        case "tsg:create":
        case "tsg:list":
        case "tsg:select":
        case "tsg:delete":
        case "tsg:upload":
        case "tsg:get-files":
          await this.handleTSGMessage(message as TSGMessage);
          break;
      }
    } catch (error) {
      log(
        `❌ Error handling message: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
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
      const response: SessionFileDeleteSuccessMessage = {
        type: "session:file:delete:success",
        data: { fileName },
      };
      this.socket.emit("message", response);

      // Broadcast updated file list to all clients in session
      const enhancedSession = getEnhancedSession(sessionId);
      const updateMessage: SessionFilesUpdatedMessage = {
        type: "session:files:updated",
        data: {
          files: enhancedSession.uploadedFiles,
        },
      };
      this.socket.emit("message", updateMessage);
    } else {
      throw new Error(`File ${fileName} not found`);
    }
  }

  private async handleSessionFileList(
    message: SessionFileListMessage,
  ): Promise<void> {
    const { sessionId } = message;

    // Sync with filesystem
    await syncSessionFiles(sessionId);

    const enhancedSession = getEnhancedSession(sessionId);

    const response: SessionFileListResponse = {
      type: "session:file:list:response",
      data: {
        files: enhancedSession.uploadedFiles,
        totalSize: enhancedSession.sessionMetadata.totalUploadSize,
        count: enhancedSession.sessionMetadata.fileUploadCount,
      },
    };

    this.socket.emit("message", response);
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

    // Read file content with line limit
    const content = await fs.readFile(fileInfo.path, "utf-8");
    const contentLines = content.split("\n");
    const truncated = contentLines.length > lines;
    const previewContent = contentLines.slice(0, lines).join("\n");

    const response: SessionFilePreviewResponse = {
      type: "session:file:preview:response",
      data: {
        fileName,
        content: previewContent,
        truncated,
      },
    };

    this.socket.emit("message", response);
  }

  private getFileType(fileName: string): string {
    const ext = fileName.split(".").pop()?.toLowerCase();
    const typeMap: Record<string, string> = {
      md: "markdown",
      txt: "text",
      log: "log",
      json: "json",
      yaml: "yaml",
      yml: "yaml",
      png: "image",
      jpg: "image",
      jpeg: "image",
      gif: "image",
    };
    return typeMap[ext || ""] || "unknown";
  }

  private handleError(error: unknown): void {
    log(
      `WebSocket handler error: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    this.socket.emit("error", {
      message: error instanceof Error ? error.message : "Unknown error",
      code:
        error instanceof Error && "code" in error
          ? error.code
          : "UNKNOWN_ERROR",
      stack:
        process.env["NODE_ENV"] === "development"
          ? (error as Error).stack
          : undefined,
    });
  }
}
