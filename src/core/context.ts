/**
 * Context Management
 * Handles conversation context, memory, and observations
 */

import type {
  Context,
  ContextMetadata,
  Message,
  MemoryItem,
  Observation,
} from '../types/index.js';

export interface ContextOptions {
  maxMessages?: number;
  maxObservations?: number;
  maxMemoryItems?: number;
  compressOnThreshold?: number;
  maxTokens?: number;
}

export class ContextManager {
  private context: Context;
  private options: Required<ContextOptions>;

  constructor(
    initialContext?: Partial<Context>,
    options: ContextOptions = {}
  ) {
    this.options = {
      maxMessages: options.maxMessages ?? 100,
      maxObservations: options.maxObservations ?? 500,
      maxMemoryItems: options.maxMemoryItems ?? 1000,
      compressOnThreshold: options.compressOnThreshold ?? 0.9,
      maxTokens: options.maxTokens ?? 200000,
    };

    this.context = this.createContext(initialContext);
  }

  /**
   * Create a new context
   */
  private createContext(partial?: Partial<Context>): Context {
    return {
      messages: partial?.messages ?? [],
      memory: partial?.memory ?? [],
      observations: partial?.observations ?? [],
      metadata: partial?.metadata ?? {
        sessionId: crypto.randomUUID(),
        startTime: Date.now(),
        lastUpdate: Date.now(),
        tokensUsed: 0,
      },
    };
  }

  /**
   * Get the current context
   */
  getContext(): Context {
    return { ...this.context };
  }

  /**
   * Get context metadata
   */
  getMetadata(): ContextMetadata {
    return { ...this.context.metadata };
  }

  /**
   * Add a message to the context
   */
  addMessage(message: Message): void {
    this.context.messages.push(message);
    this.updateMetadata();

    // Check if we need to compress
    this.checkCompression();
  }

  /**
   * Add multiple messages
   */
  addMessages(messages: Message[]): void {
    this.context.messages.push(...messages);
    this.updateMetadata();
    this.checkCompression();
  }

  /**
   * Get messages filtered by role
   */
  getMessagesByRole(role: Message['role']): Message[] {
    return this.context.messages.filter(m => m.role === role);
  }

  /**
   * Get last N messages
   */
  getLastMessages(count: number): Message[] {
    return this.context.messages.slice(-count);
  }

  /**
   * Clear all messages
   */
  clearMessages(): void {
    this.context.messages = [];
    this.updateMetadata();
  }

  /**
   * Add a memory item
   */
  addMemory(item: Omit<MemoryItem, 'id' | 'timestamp'>): string {
    const memoryItem: MemoryItem = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      ...item,
    };

    this.context.memory.push(memoryItem);
    this.checkMemoryLimit();

    return memoryItem.id;
  }

  /**
   * Get a memory item by ID
   */
  getMemory(id: string): MemoryItem | undefined {
    return this.context.memory.find(m => m.id === id);
  }

  /**
   * Search memory by content
   */
  searchMemory(query: string, type?: MemoryItem['type']): MemoryItem[] {
    const results = this.context.memory.filter(
      m => (type ? m.type === type : true) && m.content.toLowerCase().includes(query.toLowerCase())
    );

    // Sort by importance (descending) and timestamp (descending)
    return results.sort((a, b) => {
      if (a.importance !== b.importance) {
        return b.importance - a.importance;
      }
      return b.timestamp - a.timestamp;
    });
  }

  /**
   * Update memory importance
   */
  updateMemoryImportance(id: string, importance: number): void {
    const item = this.context.memory.find(m => m.id === id);
    if (item) {
      item.importance = importance;
    }
  }

  /**
   * Delete a memory item
   */
  deleteMemory(id: string): boolean {
    const index = this.context.memory.findIndex(m => m.id === id);
    if (index !== -1) {
      this.context.memory.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Add an observation
   */
  addObservation(observation: Omit<Observation, 'id' | 'timestamp'>): string {
    const obs: Observation = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      ...observation,
    };

    this.context.observations.push(obs);
    this.checkObservationLimit();

    return obs.id;
  }

  /**
   * Get observations by type
   */
  getObservationsByType(type: Observation['type']): Observation[] {
    return this.context.observations.filter(o => o.type === type);
  }

  /**
   * Get recent observations
   */
  getRecentObservations(count: number = 10): Observation[] {
    return this.context.observations.slice(-count);
  }

  /**
   * Mask/unmask observations (for compression)
   */
  setObservationMask(id: string, masked: boolean): void {
    const obs = this.context.observations.find(o => o.id === id);
    if (obs) {
      obs.masked = masked;
    }
  }

  /**
   * Get masked observations
   */
  getMaskedObservations(): Observation[] {
    return this.context.observations.filter(o => o.masked);
  }

  /**
   * Estimate token count for the context
   */
  estimateTokens(): number {
    let total = 0;

    for (const message of this.context.messages) {
      // Simple estimation: ~4 chars per token
      total += Math.ceil(message.content.length / 4);
    }

    return total;
  }

  /**
   * Update metadata timestamp
   */
  private updateMetadata(): void {
    this.context.metadata.lastUpdate = Date.now();
    this.context.metadata.tokensUsed = this.estimateTokens();
  }

  /**
   * Check if compression is needed and trigger it
   */
  private checkCompression(): void {
    const currentTokens = this.estimateTokens();
    const threshold = this.options.maxTokens * this.options.compressOnThreshold;

    if (currentTokens > threshold) {
      this.compress();
    }
  }

  /**
   * Compress the context
   */
  compress(): void {
    const targetTokens = this.options.maxTokens * 0.7; // Compress to 70% of max

    // Strategy 1: Remove old messages (keep system messages and recent messages)
    const systemMessages = this.context.messages.filter(m => m.role === 'system');
    const otherMessages = this.context.messages.filter(m => m.role !== 'system');

    let compressedMessages = [...systemMessages];
    let tokenCount = this.countMessagesTokens(compressedMessages);

    // Add messages from newest to oldest until we approach target
    for (let i = otherMessages.length - 1; i >= 0; i--) {
      const msg = otherMessages[i];
      const msgTokens = Math.ceil(msg.content.length / 4);

      if (tokenCount + msgTokens <= targetTokens) {
        compressedMessages.unshift(msg);
        tokenCount += msgTokens;
      }
    }

    this.context.messages = compressedMessages;

    // Strategy 2: Remove low-importance memory items
    if (this.context.memory.length > this.options.maxMemoryItems) {
      // Sort by importance and keep top items
      const sortedMemory = [...this.context.memory].sort((a, b) => b.importance - a.importance);
      this.context.memory = sortedMemory.slice(0, this.options.maxMemoryItems);
    }

    // Strategy 3: Remove old observations
    if (this.context.observations.length > this.options.maxObservations) {
      this.context.observations = this.context.observations.slice(-this.options.maxObservations);
    }

    this.updateMetadata();
  }

  /**
   * Count tokens in messages
   */
  private countMessagesTokens(messages: Message[]): number {
    return messages.reduce((total, msg) => {
      return total + Math.ceil(msg.content.length / 4);
    }, 0);
  }

  /**
   * Check memory limit
   */
  private checkMemoryLimit(): void {
    if (this.context.memory.length > this.options.maxMemoryItems) {
      // Sort by importance and keep top items
      const sortedMemory = [...this.context.memory].sort((a, b) => b.importance - a.importance);
      this.context.memory = sortedMemory.slice(0, this.options.maxMemoryItems);
    }
  }

  /**
   * Check observation limit
   */
  private checkObservationLimit(): void {
    if (this.context.observations.length > this.options.maxObservations) {
      this.context.observations = this.context.observations.slice(-this.options.maxObservations);
    }
  }

  /**
   * Reset the context
   */
  reset(keepSessionId: boolean = false): void {
    const sessionId = keepSessionId ? this.context.metadata.sessionId : crypto.randomUUID();
    this.context = {
      messages: [],
      memory: [],
      observations: [],
      metadata: {
        sessionId,
        startTime: Date.now(),
        lastUpdate: Date.now(),
        tokensUsed: 0,
      },
    };
  }

  /**
   * Export context as JSON
   */
  export(): string {
    return JSON.stringify(this.context, null, 2);
  }

  /**
   * Import context from JSON
   */
  import(json: string): void {
    this.context = JSON.parse(json) as Context;
  }

  /**
   * Get context summary
   */
  getSummary(): {
    messageCount: number;
    memoryCount: number;
    observationCount: number;
    estimatedTokens: number;
    sessionDuration: number;
  } {
    return {
      messageCount: this.context.messages.length,
      memoryCount: this.context.memory.length,
      observationCount: this.context.observations.length,
      estimatedTokens: this.estimateTokens(),
      sessionDuration: Date.now() - this.context.metadata.startTime,
    };
  }
}
