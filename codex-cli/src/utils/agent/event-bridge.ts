import type { CommandConfirmation } from "./agent-loop.js";
import type { ApplyPatchCommand } from "../../approvals.js";
import type { ResponseItem } from "openai/resources/responses/responses.mjs";

import { EventEmitter } from "node:events";

/**
 * Events emitted by the agent loop during execution
 */
export interface AgentEvents {
  /** Emitted when a new response item is received from the model */
  item: (item: ResponseItem) => void;
  
  /** Emitted when the loading state changes */
  loading: (loading: boolean) => void;
  
  /** Emitted when a new response ID is received */
  responseId: (responseId: string) => void;
  
  /** Emitted when command confirmation is needed */
  confirmCommand: (
    command: Array<string>,
    applyPatch: ApplyPatchCommand | undefined,
    callback: (confirmation: CommandConfirmation) => void
  ) => void;
  
  /** Emitted when the agent encounters an error */
  error: (error: Error) => void;
  
  /** Emitted when the agent completes a run */
  complete: () => void;
  
  /** Emitted when the agent is canceled */
  canceled: () => void;
  
  /** Emitted when a tool call starts */
  toolCallStart: (toolName: string, args: unknown) => void;
  
  /** Emitted when a tool call completes */
  toolCallComplete: (toolName: string, result: unknown) => void;
}

/**
 * Type-safe event emitter for agent events
 */
export class AgentEventBridge extends EventEmitter {
  constructor() {
    super();
    // Increase max listeners to handle multiple subscribers
    this.setMaxListeners(20);
  }

  // Type-safe emit methods
  emitItem(item: ResponseItem): void {
    this.emit('item', item);
  }

  emitLoading(loading: boolean): void {
    this.emit('loading', loading);
  }

  emitResponseId(responseId: string): void {
    this.emit('responseId', responseId);
  }

  emitConfirmCommand(
    command: Array<string>,
    applyPatch: ApplyPatchCommand | undefined,
    callback: (confirmation: CommandConfirmation) => void
  ): void {
    this.emit('confirmCommand', command, applyPatch, callback);
  }

  emitError(error: Error): void {
    this.emit('error', error);
  }

  emitComplete(): void {
    this.emit('complete');
  }

  emitCanceled(): void {
    this.emit('canceled');
  }

  emitToolCallStart(toolName: string, args: unknown): void {
    this.emit('toolCallStart', toolName, args);
  }

  emitToolCallComplete(toolName: string, result: unknown): void {
    this.emit('toolCallComplete', toolName, result);
  }

  // Type-safe listener methods
  onItem(listener: (item: ResponseItem) => void): this {
    return this.on('item', listener);
  }

  onLoading(listener: (loading: boolean) => void): this {
    return this.on('loading', listener);
  }

  onResponseId(listener: (responseId: string) => void): this {
    return this.on('responseId', listener);
  }

  onConfirmCommand(
    listener: (
      command: Array<string>,
      applyPatch: ApplyPatchCommand | undefined,
      callback: (confirmation: CommandConfirmation) => void
    ) => void
  ): this {
    return this.on('confirmCommand', listener);
  }

  onError(listener: (error: Error) => void): this {
    return this.on('error', listener);
  }

  onComplete(listener: () => void): this {
    return this.on('complete', listener);
  }

  onCanceled(listener: () => void): this {
    return this.on('canceled', listener);
  }

  onToolCallStart(listener: (toolName: string, args: unknown) => void): this {
    return this.on('toolCallStart', listener);
  }

  onToolCallComplete(listener: (toolName: string, result: unknown) => void): this {
    return this.on('toolCallComplete', listener);
  }

  // Remove all listeners
  override removeAllListeners(): this {
    return super.removeAllListeners();
  }
}