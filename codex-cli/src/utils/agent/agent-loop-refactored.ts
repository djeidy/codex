import type { ApplyPatchCommand, ApprovalPolicy } from "../../approvals.js";
import type { AppConfig } from "../config.js";
import type { ResponseEvent } from "../responses.js";
import type {
  ResponseFunctionToolCall,
  ResponseInputItem,
  ResponseItem,
  ResponseCreateParams,
  FunctionTool,
  Tool,
} from "openai/resources/responses/responses.mjs";
import type { Reasoning } from "openai/resources.mjs";

import { AgentEventBridge } from "./event-bridge.js";
import { CLI_VERSION } from "../../version.js";
import {
  OPENAI_TIMEOUT_MS,
  OPENAI_ORGANIZATION,
  OPENAI_PROJECT,
  getBaseUrl,
  AZURE_OPENAI_API_VERSION,
} from "../config.js";
import { log } from "../logger/log.js";
import { parseToolCallArguments } from "../parsers.js";
import { responsesCreateViaChatCompletions } from "../responses.js";
import {
  ORIGIN,
  getSessionId,
  setCurrentModel,
  setSessionId,
} from "../session.js";
import { handleExecCommand } from "./handle-exec-command.js";
import { HttpsProxyAgent } from "https-proxy-agent";
import { randomUUID } from "node:crypto";
import OpenAI, { APIConnectionTimeoutError, AzureOpenAI } from "openai";

// Import the CommandConfirmation type from the original
export type { CommandConfirmation } from "./agent-loop.js";

// Constants from original
const RATE_LIMIT_RETRY_WAIT_MS = parseInt(
  process.env["OPENAI_RATE_LIMIT_RETRY_WAIT_MS"] || "500",
  10,
);
const PROXY_URL = process.env["HTTPS_PROXY"];
const alreadyProcessedResponses = new Set();
const alreadyStagedItemIds = new Set<string>();

const shellFunctionTool: FunctionTool = {
  type: "function",
  name: "shell",
  description: "Runs a shell command, and returns its output.",
  strict: false,
  parameters: {
    type: "object",
    properties: {
      command: { type: "array", items: { type: "string" } },
      workdir: {
        type: "string",
        description: "The working directory for the command.",
      },
      timeout: {
        type: "number",
        description:
          "The maximum time to wait for the command to complete in milliseconds.",
      },
    },
    required: ["command"],
    additionalProperties: false,
  },
};

const localShellTool: Tool = {
  //@ts-expect-error - waiting on sdk
  type: "local_shell",
};

export interface AgentLoopOptions {
  model: string;
  provider?: string;
  config?: AppConfig;
  instructions?: string;
  approvalPolicy: ApprovalPolicy;
  disableResponseStorage?: boolean;
  additionalWritableRoots: ReadonlyArray<string>;
  eventBridge?: AgentEventBridge;
}

/**
 * Refactored AgentLoop that uses event-based communication
 * instead of direct callbacks, making it UI-agnostic
 */
export class AgentLoopRefactored {
  private model: string;
  private provider: string;
  private instructions?: string;
  private approvalPolicy: ApprovalPolicy;
  private config: AppConfig;
  private additionalWritableRoots: ReadonlyArray<string>;
  private readonly disableResponseStorage: boolean;
  private oai: OpenAI;
  private events: AgentEventBridge;
  
  // State management
  private currentStream: unknown | null = null;
  private generation = 0;
  private execAbortController: AbortController | null = null;
  private canceled = false;
  private transcript: Array<ResponseInputItem> = [];
  private pendingAborts: Set<string> = new Set();
  private terminated = false;
  private readonly hardAbort = new AbortController();
  private sessionId: string;

  constructor(options: AgentLoopOptions) {
    this.model = options.model;
    this.provider = options.provider || "openai";
    this.instructions = options.instructions;
    this.approvalPolicy = options.approvalPolicy;
    this.config = options.config || { model: this.model, instructions: this.instructions || "" };
    this.additionalWritableRoots = options.additionalWritableRoots;
    this.disableResponseStorage = options.disableResponseStorage || false;
    this.events = options.eventBridge || new AgentEventBridge();
    
    // Initialize session
    this.sessionId = getSessionId() || randomUUID();
    setSessionId(this.sessionId);
    setCurrentModel(this.model);
    
    // Initialize OpenAI client
    const baseUrl = getBaseUrl(this.provider);
    const apiKey = this.config.apiKey;
    
    if (!apiKey) {
      throw new Error("OpenAI API key is required");
    }

    const httpAgent = PROXY_URL
      ? new HttpsProxyAgent(PROXY_URL, { rejectUnauthorized: false })
      : undefined;

    if (this.provider === "azure") {
      this.oai = new AzureOpenAI({
        httpAgent,
        baseURL: baseUrl,
        apiKey: apiKey,
        defaultQuery: { "api-version": AZURE_OPENAI_API_VERSION },
        timeout: OPENAI_TIMEOUT_MS,
      });
    } else {
      this.oai = new OpenAI({
        httpAgent,
        baseURL: baseUrl,
        apiKey: apiKey,
        organization: OPENAI_ORGANIZATION,
        project: OPENAI_PROJECT,
        timeout: OPENAI_TIMEOUT_MS,
        defaultHeaders: {
          "User-Agent": `OpenAI-Codex-CLI/${CLI_VERSION}`,
          Origin: ORIGIN,
        },
      });
    }

    this.hardAbort.signal.addEventListener(
      "abort",
      () => this.execAbortController?.abort(),
      { once: true },
    );
  }

  /**
   * Get the event bridge for subscribing to events
   */
  getEventBridge(): AgentEventBridge {
    return this.events;
  }

  /**
   * Cancel the current operation
   */
  public cancel(): void {
    if (this.terminated) {
      return;
    }

    this.currentStream = null;
    log(
      `AgentLoop.cancel() invoked – currentStream=${Boolean(
        this.currentStream,
      )} execAbortController=${Boolean(this.execAbortController)} generation=${
        this.generation
      }`,
    );
    
    (this.currentStream as { controller?: { abort?: () => void } } | null)
      ?.controller?.abort?.();

    this.canceled = true;
    this.execAbortController?.abort();
    this.execAbortController = new AbortController();
    
    log("AgentLoop.cancel(): execAbortController.abort() called");

    if (this.pendingAborts.size === 0) {
      try {
        this.events.emitResponseId("");
      } catch {
        /* ignore */
      }
    }

    this.events.emitLoading(false);
    this.events.emitCanceled();
    this.generation += 1;
    
    log(`AgentLoop.cancel(): generation bumped to ${this.generation}`);
  }

  /**
   * Terminate the agent loop permanently
   */
  public terminate(): void {
    if (this.terminated) {
      return;
    }
    
    this.terminated = true;
    this.cancel();
    this.hardAbort.abort();
    
    log("AgentLoop.terminate(): hardAbort signaled");
  }

  /**
   * Run the agent loop with the given input
   */
  public async run(
    input: Array<ResponseInputItem>,
    previousResponseId: string = "",
  ): Promise<void> {
    if (this.terminated) {
      throw new Error("AgentLoop has been terminated");
    }

    const thinkingStart = Date.now();
    const thisGeneration = ++this.generation;
    
    this.canceled = false;
    this.currentStream = null;
    this.execAbortController = new AbortController();
    
    log(
      `AgentLoop.run(): new execAbortController created for generation ${this.generation}`,
    );

    let lastResponseId: string = this.disableResponseStorage
      ? ""
      : previousResponseId;

    // Handle pending aborts
    const abortOutputs: Array<ResponseInputItem> = [];
    if (this.pendingAborts.size > 0) {
      for (const id of this.pendingAborts) {
        abortOutputs.push({
          type: "function_call_output",
          call_id: id,
          output: JSON.stringify({
            output: "aborted",
            metadata: { exit_code: 1, duration_seconds: 0 },
          }),
        } as ResponseInputItem.FunctionCallOutput);
      }
      this.pendingAborts.clear();
    }

    // Build input
    let turnInput: Array<ResponseInputItem> = [];
    let _transcriptPrefixLen = 0;

    const stripInternalFields = (
      item: ResponseInputItem,
    ): ResponseInputItem => {
      const clean = { ...item } as Record<string, unknown>;
      delete clean["duration_ms"];
      delete clean["id"];
      delete clean["status"];
      return clean as unknown as ResponseInputItem;
    };

    if (this.disableResponseStorage) {
      _transcriptPrefixLen = this.transcript.length;
      this.transcript.push(...this.filterToApiMessages(input));
      turnInput = [...this.transcript, ...abortOutputs].map(stripInternalFields);
    } else {
      turnInput = [...abortOutputs, ...input].map(stripInternalFields);
    }

    this.events.emitLoading(true);

    try {
      await this.runLoop(turnInput, lastResponseId, thisGeneration, thinkingStart);
      this.events.emitComplete();
    } catch (error) {
      this.events.emitError(error as Error);
      throw error;
    } finally {
      this.events.emitLoading(false);
    }
  }

  private async runLoop(
    initialTurnInput: Array<ResponseInputItem>,
    initialLastResponseId: string,
    thisGeneration: number,
    thinkingStart: number,
  ): Promise<void> {
    let turnInput = initialTurnInput;
    let lastResponseId = initialLastResponseId;
    let transcriptPrefixLen = 0;
    let loopIteration = 0;

    log(`Starting runLoop with ${turnInput.length} input items, generation: ${thisGeneration}`);

    while (turnInput.length > 0) {
      loopIteration++;
      log(`RunLoop iteration ${loopIteration}: Processing ${turnInput.length} items`);

      if (this.canceled || this.hardAbort.signal.aborted) {
        log(`RunLoop cancelled at iteration ${loopIteration}`);
        return;
      }

      const streamStartTime = Date.now();
      const stream = await this.createStream(turnInput, lastResponseId);

      if (!stream) {
        log(`No stream created at iteration ${loopIteration}`);
        return;
      }

      log(`Stream created in ${Date.now() - streamStartTime}ms, processing...`);
      const processStartTime = Date.now();

      const result = await this.processStream(
        stream,
        thisGeneration,
        thinkingStart,
        transcriptPrefixLen,
      );

      const processTime = Date.now() - processStartTime;
      log(`Stream processed in ${processTime}ms, result: ${result ? 'success' : 'null'}`);

      if (result) {
        turnInput = result.newTurnInput;
        lastResponseId = result.lastResponseId;
        this.events.emitResponseId(lastResponseId);
        log(`Iteration ${loopIteration} complete: ${turnInput.length} new items, responseId: ${lastResponseId}`);
      } else {
        log(`Breaking loop at iteration ${loopIteration} due to null result`);
        break;
      }
    }

    log(`RunLoop completed after ${loopIteration} iterations`);
  }

  private async createStream(
    turnInput: Array<ResponseInputItem>,
    lastResponseId: string,
  ): Promise<unknown | null> {
    const MAX_RETRIES = 5;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const tools = this.model.startsWith("codex") 
          ? [localShellTool] 
          : [shellFunctionTool];

        const reasoning = this.getReasoningConfig();
        const mergedInstructions = this.buildInstructions();

        const responseCall = this.getResponseCall();
        
        log(`instructions (length ${mergedInstructions.length}): ${mergedInstructions}`);

        const stream = await responseCall({
          model: this.model,
          instructions: mergedInstructions,
          input: turnInput,
          stream: true,
          parallel_tool_calls: false,
          reasoning,
          ...(this.config.flexMode ? { service_tier: "flex" } : {}),
          ...(this.disableResponseStorage
            ? { store: false }
            : {
                store: true,
                previous_response_id: lastResponseId || undefined,
              }),
          tools: tools,
          tool_choice: "auto",
        });

        this.currentStream = stream;
        return stream;
      } catch (error) {
        const handled = await this.handleStreamError(error, attempt);
        if (!handled) {
          throw error;
        }
      }
    }

    // If we reach here, all retries failed
    return null;
  }

  private async processStream(
    stream: unknown,
    thisGeneration: number,
    thinkingStart: number,
    transcriptPrefixLen: number,
  ): Promise<{ newTurnInput: Array<ResponseInputItem>; lastResponseId: string } | null> {
    const staged: Array<ResponseItem | undefined> = [];
    let lastResponseId = "";
    let newTurnInput: Array<ResponseInputItem> = [];
    let hasReceivedItems = false;
    let completionReceived = false;

    const stageItem = (item: ResponseItem) => {
      if (thisGeneration !== this.generation) {
        return;
      }

      if (item.id && alreadyStagedItemIds.has(item.id)) {
        return;
      }
      alreadyStagedItemIds.add(item.id);

      const idx = staged.push(item) - 1;

      setTimeout(() => {
        if (
          thisGeneration === this.generation &&
          !this.canceled &&
          !this.hardAbort.signal.aborted
        ) {
          this.events.emitItem(item);
          staged[idx] = undefined;

          if (this.disableResponseStorage) {
            this.updateTranscript(item);
          }
        }
      }, 3);
    };

    // Add timeout for stream processing to prevent hanging
    const streamTimeout = setTimeout(() => {
      if (!completionReceived && hasReceivedItems) {
        log(`Stream timeout: No completion event received after receiving items`);
        // Force completion if we've received items but no completion event
        this.forceStreamCompletion(lastResponseId, newTurnInput);
      }
    }, 30000); // 30 second timeout for completion after receiving items

    try {
      for await (const event of stream as AsyncIterable<ResponseEvent>) {
        log(`AgentLoop.run(): response event ${event.type}`);

        // Check for cancellation
        if (this.canceled || this.hardAbort.signal.aborted) {
          log(`Stream processing cancelled during event: ${event.type}`);
          clearTimeout(streamTimeout);
          return null;
        }

        if (event.type === "response.output_item.done") {
          hasReceivedItems = true;
          await this.handleOutputItem(event.item, stageItem, thinkingStart);
        }

        if (event.type === "response.completed") {
          completionReceived = true;
          clearTimeout(streamTimeout);
          const result = await this.handleResponseCompleted(
            event,
            thisGeneration,
            stageItem,
            transcriptPrefixLen,
          );

          lastResponseId = event.response.id;
          newTurnInput = result.newTurnInput;
          break; // Exit the loop after completion
        }
      }

      clearTimeout(streamTimeout);

      // If we received items but no completion event, force completion
      if (hasReceivedItems && !completionReceived) {
        log(`Warning: Stream ended without completion event, forcing completion`);
        this.forceStreamCompletion(lastResponseId, newTurnInput);
      }

      return { newTurnInput, lastResponseId };
    } catch (error) {
      clearTimeout(streamTimeout);
      log(`Stream processing error: ${error instanceof Error ? error.message : String(error)}`);

      if (await this.handleStreamProcessingError(error)) {
        return this.processStream(stream, thisGeneration, thinkingStart, transcriptPrefixLen);
      }
      throw error;
    }
  }

  private async handleOutputItem(
    item: any,
    stageItem: (item: ResponseItem) => void,
    thinkingStart: number,
  ): Promise<void> {
    if (item.type === "reasoning") {
      item.duration_ms = Date.now() - thinkingStart;
    }

    if (item.type === "function_call" || item.type === "local_shell_call") {
      const callId = item.call_id ?? item.id;
      if (callId) {
        this.pendingAborts.add(callId);
      }
    } else {
      stageItem(item as ResponseItem);
    }
  }

  private async handleResponseCompleted(
    event: any,
    thisGeneration: number,
    stageItem: (item: ResponseItem) => void,
    _transcriptPrefixLen: number,
  ): Promise<{ newTurnInput: Array<ResponseInputItem> }> {
    if (thisGeneration === this.generation && !this.canceled) {
      for (const item of event.response.output) {
        stageItem(item as ResponseItem);
      }
    }

    let newTurnInput: Array<ResponseInputItem> = [];
    
    if (
      event.response.status === "completed" ||
      (event.response.status as unknown as string) === "requires_action"
    ) {
      newTurnInput = await this.processEventsWithoutStreaming(
        event.response.output,
        stageItem,
      );

      if (this.disableResponseStorage) {
        const stripInternalFields = (item: ResponseInputItem): ResponseInputItem => {
          const clean = { ...item } as Record<string, unknown>;
          delete clean["duration_ms"];
          delete clean["id"];
          delete clean["status"];
          return clean as unknown as ResponseInputItem;
        };

        const cleaned = this.filterToApiMessages(
          event.response.output.map(stripInternalFields),
        );
        this.transcript.push(...cleaned);

        const delta = this.filterToApiMessages(
          newTurnInput.map(stripInternalFields),
        );

        if (delta.length === 0) {
          newTurnInput = [];
        } else {
          newTurnInput = [...this.transcript, ...delta];
        }
      }
    }

    return { newTurnInput };
  }

  private async handleFunctionCall(
    item: ResponseFunctionToolCall,
  ): Promise<Array<ResponseInputItem>> {
    if (this.canceled) {
      return [];
    }

    const isChatStyle = (item as any).function != null;
    const name: string | undefined = isChatStyle
      ? (item as any).function?.name
      : (item as any).name;
    const rawArguments: string | undefined = isChatStyle
      ? (item as any).function?.arguments
      : (item as any).arguments;
    const callId: string = (item as any).call_id ?? (item as any).id;

    const args = parseToolCallArguments(rawArguments ?? "{}");
    
    log(
      `handleFunctionCall(): name=${name ?? "undefined"} callId=${callId} args=${rawArguments}`,
    );

    if (args == null) {
      return [{
        type: "function_call_output",
        call_id: callId,
        output: `invalid arguments: ${rawArguments}`,
      }];
    }

    const outputItem: ResponseInputItem.FunctionCallOutput = {
      type: "function_call_output",
      call_id: callId,
      output: "no function found",
    };

    const additionalItems: Array<ResponseInputItem> = [];

    if (name === "container.exec" || name === "shell") {
      this.events.emitToolCallStart(name, args);
      
      // Create a wrapper for command confirmation that uses events
      const getCommandConfirmation = async (
        command: Array<string>,
        applyPatch: ApplyPatchCommand | undefined,
      ): Promise<any> => {
        return new Promise((resolve) => {
          this.events.emitConfirmCommand(command, applyPatch, resolve);
        });
      };

      const {
        outputText,
        metadata,
        additionalItems: additionalItemsFromExec,
      } = await handleExecCommand(
        args,
        this.config,
        this.approvalPolicy,
        this.additionalWritableRoots,
        getCommandConfirmation,
        this.execAbortController?.signal,
      );
      
      outputItem.output = JSON.stringify({ output: outputText, metadata });
      this.events.emitToolCallComplete(name, { outputText, metadata });

      if (additionalItemsFromExec) {
        additionalItems.push(...additionalItemsFromExec);
      }
    }

    return [outputItem, ...additionalItems];
  }

  private async processEventsWithoutStreaming(
    output: Array<any>,
    _stageItem: (item: ResponseItem) => void,
  ): Promise<Array<ResponseInputItem>> {
    const items: Array<ResponseInputItem> = [];
    
    for (const item of output) {
      if (
        !alreadyProcessedResponses.has(item.id) &&
        (item.type === "function_call" || item.type === "local_shell_call")
      ) {
        alreadyProcessedResponses.add(item.id);
        const result = await this.handleFunctionCall(item);
        items.push(...result);
      }
    }
    
    const flushPendingItems = () => {
      if (this.pendingAborts.size > 0) {
        this.pendingAborts.clear();
      }
    };
    
    flushPendingItems();
    return items;
  }

  // Helper methods
  private getReasoningConfig(): Reasoning | undefined {
    if (this.model.startsWith("o")) {
      const reasoning: Reasoning = { effort: "high" };
      if (
        this.model === "o3" ||
        this.model === "o4-mini" ||
        this.model === "codex-mini-latest"
      ) {
        reasoning.summary = "auto";
      }
      return reasoning;
    }
    return undefined;
  }

  private buildInstructions(): string {
    const prefix = `You are a specialized log analysis assistant. You can read and analyze files, but you cannot create, modify, or delete files. Focus on investigating logs, identifying patterns, and providing insights. Use shell commands for read-only operations like grep, cat, find, etc.\n`;
    return [prefix, this.instructions].filter(Boolean).join("\n");
  }

  private getResponseCall() {
    if (!this.config.provider || this.config.provider?.toLowerCase() === "openai") {
      return (params: ResponseCreateParams) => this.oai.responses.create(params);
    }
    return (params: ResponseCreateParams) =>
      responsesCreateViaChatCompletions(
        this.oai,
        params as ResponseCreateParams & { stream: true },
      );
  }

  private filterToApiMessages(items: Array<any>): Array<ResponseInputItem> {
    return items.filter(
      (item) =>
        item.type === "message" ||
        item.type === "function_call_output" ||
        item.type === "local_shell_call_output",
    );
  }

  private updateTranscript(item: ResponseItem): void {
    const role = (item as any).role;
    if (role !== "system") {
      if (
        (item as ResponseInputItem).type === "function_call" ||
        (item as ResponseInputItem).type === "reasoning" ||
        (item as ResponseInputItem).type === "local_shell_call" ||
        ((item as ResponseInputItem).type === "message" && (item as any).role === "user")
      ) {
        return;
      }

      const clone: ResponseInputItem = {
        ...(item as unknown as ResponseInputItem),
      } as ResponseInputItem;
      delete (clone as any).duration_ms;
      this.transcript.push(clone);
    }
  }

  private async handleStreamError(error: any, attempt: number): Promise<boolean> {
    const isTimeout = error instanceof APIConnectionTimeoutError;
    const ApiConnErrCtor = (OpenAI as any).APIConnectionError;
    const isConnectionError = ApiConnErrCtor ? error instanceof ApiConnErrCtor : false;
    const status = error?.status ?? error?.httpStatus ?? error?.statusCode;
    const isServerError = (typeof status === "number" && status >= 500) || error?.type === "server_error";
    
    if ((isTimeout || isServerError || isConnectionError) && attempt < 5) {
      log(`OpenAI request failed (attempt ${attempt}/5), retrying...`);
      return true;
    }

    const isTooManyTokensError =
      (error.param === "max_tokens" ||
        (typeof error.message === "string" && /max_tokens is too large/i.test(error.message))) &&
      error.type === "invalid_request_error";

    if (isTooManyTokensError) {
      this.events.emitItem({
        id: `error-${Date.now()}`,
        type: "message",
        role: "system",
        content: [{
          type: "input_text",
          text: "⚠️  The current request exceeds the maximum context length supported by the chosen model. Please shorten the conversation, run /clear, or switch to a model with a larger context window and try again.",
        }],
      });
      return false;
    }

    const isRateLimit = status === 429 || error.code === "rate_limit_exceeded" || error.type === "rate_limit_exceeded";
    
    if (isRateLimit && attempt < 5) {
      let delayMs = RATE_LIMIT_RETRY_WAIT_MS * 2 ** (attempt - 1);
      const msg = error?.message ?? "";
      const m = /(?:retry|try) again in ([\d.]+)s/i.exec(msg);
      if (m && m[1]) {
        const suggested = parseFloat(m[1]) * 1000;
        if (!Number.isNaN(suggested)) {
          delayMs = suggested;
        }
      }
      log(`OpenAI rate limit exceeded (attempt ${attempt}/5), retrying in ${Math.round(delayMs)} ms...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return true;
    }

    return false;
  }

  private async handleStreamProcessingError(error: any): Promise<boolean> {
    const isRateLimitError = (e: unknown): boolean => {
      if (!e || typeof e !== "object") {
        return false;
      }
      const ex: any = e;
      return ex.status === 429 || ex.code === "rate_limit_exceeded" || ex.type === "rate_limit_exceeded";
    };

    if (isRateLimitError(error)) {
      const waitMs = RATE_LIMIT_RETRY_WAIT_MS * 2;
      log(`OpenAI stream rate‑limited – retrying in ${waitMs} ms`);
      await new Promise((res) => setTimeout(res, waitMs));
      return true;
    }

    return false;
  }

  /**
   * Force completion when stream hangs without proper completion event
   */
  private forceStreamCompletion(lastResponseId: string, newTurnInput: Array<ResponseInputItem>): void {
    log(`Forcing stream completion - responseId: ${lastResponseId}, turnInput length: ${newTurnInput.length}`);

    // Emit completion event to unblock the UI
    this.events.emitComplete();

    // Emit loading false to stop loading indicators
    this.events.emitLoading(false);

    // If we have a response ID, emit it
    if (lastResponseId) {
      this.events.emitResponseId(lastResponseId);
    }
  }
}