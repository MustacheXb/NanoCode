/**
 * Context Compression
 * Strategies for compressing conversation context
 */

import type { Context, Message } from '../types/index.js';

export type CompressionStrategy = 'none' | 'lru' | 'smart' | 'summary';

export interface CompressionOptions {
  strategy: CompressionStrategy;
  maxTokens?: number;
  keepSystemMessages?: boolean;
  keepRecentCount?: number;
}

export interface CompressionResult {
  originalTokens: number;
  compressedTokens: number;
  compressionRatio: number;
  strategy: CompressionStrategy;
}

/**
 * Context compressor using various strategies
 */
export class ContextCompressor {
  private defaultMaxTokens: number;
  private defaultStrategy: CompressionStrategy;

  constructor(maxTokens: number = 100000, strategy: CompressionStrategy = 'smart') {
    this.defaultMaxTokens = maxTokens;
    this.defaultStrategy = strategy;
  }

  /**
   * Compress context using the specified strategy
   */
  compress(context: Context, options?: Partial<CompressionOptions>): Context & CompressionResult {
    const opts: Required<CompressionOptions> = {
      strategy: options?.strategy ?? this.defaultStrategy,
      maxTokens: options?.maxTokens ?? this.defaultMaxTokens,
      keepSystemMessages: options?.keepSystemMessages ?? true,
      keepRecentCount: options?.keepRecentCount ?? 20,
    };

    const originalTokens = this.estimateTokens(context);

    let compressedContext: Context;

    switch (opts.strategy) {
      case 'none':
        compressedContext = context;
        break;

      case 'lru':
        compressedContext = this.compressLRU(context, opts);
        break;

      case 'smart':
        compressedContext = this.compressSmart(context, opts);
        break;

      case 'summary':
        compressedContext = this.compressSummary(context, opts);
        break;

      default:
        compressedContext = context;
    }

    const compressedTokens = this.estimateTokens(compressedContext);

    return {
      ...compressedContext,
      originalTokens,
      compressedTokens,
      compressionRatio: compressedTokens / originalTokens,
      strategy: opts.strategy,
    };
  }

  /**
   * LRU (Least Recently Used) compression
   */
  private compressLRU(context: Context, options: Required<CompressionOptions>): Context {
    const systemMessages = options.keepSystemMessages
      ? context.messages.filter(m => m.role === 'system')
      : [];

    const otherMessages = context.messages.filter(m => m.role !== 'system');
    const recentMessages = otherMessages.slice(-options.keepRecentCount);

    return {
      ...context,
      messages: [...systemMessages, ...recentMessages],
    };
  }

  /**
   * Smart compression
   */
  private compressSmart(context: Context, options: Required<CompressionOptions>): Context {
    const systemMessages = options.keepSystemMessages
      ? context.messages.filter(m => m.role === 'system')
      : [];

    // Score messages by importance
    const scoredMessages = context.messages
      .filter(m => m.role !== 'system')
      .map(msg => ({
        message: msg,
        score: this.scoreMessage(msg),
      }))
      .sort((a, b) => b.score - a.score);

    // Keep top messages up to token limit
    const keepMessages: Message[] = [];
    let tokenCount = this.countMessagesTokens(systemMessages);

    for (const { message } of scoredMessages) {
      const msgTokens = this.countMessageTokens(message);

      if (tokenCount + msgTokens <= options.maxTokens) {
        keepMessages.push(message);
        tokenCount += msgTokens;
      } else {
        break;
      }
    }

    // Sort kept messages by timestamp
    keepMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    return {
      ...context,
      messages: [...systemMessages, ...keepMessages],
    };
  }

  /**
   * Summary compression
   */
  private compressSummary(context: Context, options: Required<CompressionOptions>): Context {
    const systemMessages = options.keepSystemMessages
      ? context.messages.filter(m => m.role === 'system')
      : [];

    const otherMessages = context.messages.filter(m => m.role !== 'system');
    const recentMessages = otherMessages.slice(-options.keepRecentCount);
    const oldMessages = otherMessages.slice(0, -options.keepRecentCount);

    // Create summary of old messages
    const summary = this.createSummary(oldMessages);

    const summaryMessage: Message = {
      role: 'system',
      content: `[Conversation Summary]: ${summary}`,
      timestamp: Date.now(),
    };

    return {
      ...context,
      messages: [...systemMessages, summaryMessage, ...recentMessages],
    };
  }

  /**
   * Score a message by importance
   */
  private scoreMessage(message: Message): number {
    let score = 0;

    // Prefer recent messages
    const age = Date.now() - (message.timestamp || 0);
    score += Math.max(0, 1 - age / (24 * 60 * 60 * 1000));

    // Prefer user messages
    if (message.role === 'user') {
      score += 0.5;
    }

    // Prefer messages with tool calls
    if (message.toolCalls && message.toolCalls.length > 0) {
      score += 0.3;
    }

    // Penalize long messages
    const length = message.content.length;
    if (length > 1000) {
      score -= 0.2;
    }

    return score;
  }

  /**
   * Create a summary of messages
   */
  private createSummary(messages: Message[]): string {
    const userMessages = messages.filter(m => m.role === 'user');
    const toolCalls = messages.filter(m => m.toolCalls && m.toolCalls.length > 0);

    const parts: string[] = [];

    if (userMessages.length > 0) {
      parts.push(`${userMessages.length} user requests discussed`);
    }

    if (toolCalls.length > 0) {
      const uniqueTools = new Set(
        toolCalls.flatMap(m => m.toolCalls?.map(tc => tc.name) || [])
      );
      parts.push(`Used ${uniqueTools.size} different tools`);
    }

    parts.push(`Earlier conversation contained ${messages.length} messages`);

    return parts.join('. ');
  }

  /**
   * Estimate token count for context
   */
  estimateTokens(context: Context): number {
    return this.countMessagesTokens(context.messages) +
           this.estimateMemoryTokens(context.memory) +
           this.estimateObservationTokens(context.observations);
  }

  /**
   * Count tokens in messages
   */
  countMessagesTokens(messages: Message[]): number {
    return messages.reduce((total, msg) => total + this.countMessageTokens(msg), 0);
  }

  /**
   * Count tokens in a single message
   */
  countMessageTokens(message: Message): number {
    const contentTokens = Math.ceil(message.content.length / 4);
    const metadataTokens = 10;

    const toolCallTokens = message.toolCalls
      ? message.toolCalls.reduce((total, tc) => {
          const paramsStr = JSON.stringify(tc.parameters);
          return total + Math.ceil((tc.name.length + paramsStr.length) / 4);
        }, 0)
      : 0;

    return contentTokens + metadataTokens + toolCallTokens;
  }

  /**
   * Estimate tokens for memory items
   */
  estimateMemoryTokens(memory: Context['memory']): number {
    return memory.reduce((total, item) => {
      return total + Math.ceil(item.content.length / 4);
    }, 0);
  }

  /**
   * Estimate tokens for observations
   */
  estimateObservationTokens(observations: Context['observations']): number {
    return observations.reduce((total, obs) => {
      if (obs.masked) return total;
      return total + Math.ceil(obs.content.length / 4);
    }, 0);
  }

  /**
   * Set default max tokens
   */
  setMaxTokens(maxTokens: number): void {
    this.defaultMaxTokens = maxTokens;
  }

  /**
   * Set default strategy
   */
  setStrategy(strategy: CompressionStrategy): void {
    this.defaultStrategy = strategy;
  }
}

/**
 * Create a context compressor
 */
export function createContextCompressor(
  maxTokens?: number,
  strategy?: CompressionStrategy
): ContextCompressor {
  return new ContextCompressor(maxTokens, strategy);
}