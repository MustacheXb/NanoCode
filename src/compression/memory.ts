/**
 * Memory Compression
 * Strategies for compressing memory items
 */

import type { MemoryItem } from '../types/index.js';

export type MemoryCompressionStrategy = 'none' | 'importance' | 'deduplicate' | 'summarize';

export interface MemoryCompressionOptions {
  strategy: MemoryCompressionStrategy;
  maxItems?: number;
  minImportance?: number;
}

/**
 * Memory compressor for managing long-term memory
 */
export class MemoryCompressor {
  private defaultMaxItems: number;
  private defaultMinImportance: number;

  constructor(maxItems: number = 500, minImportance: number = 0.1) {
    this.defaultMaxItems = maxItems;
    this.defaultMinImportance = minImportance;
  }

  /**
   * Compress memory using specified strategy
   */
  compress(
    memory: MemoryItem[],
    options?: Partial<MemoryCompressionOptions>
  ): MemoryItem[] {
    const opts: Required<MemoryCompressionOptions> = {
      strategy: options?.strategy || 'importance',
      maxItems: options?.maxItems ?? this.defaultMaxItems,
      minImportance: options?.minImportance ?? this.defaultMinImportance,
    };

    switch (opts.strategy) {
      case 'none':
        return memory;

      case 'importance':
        return this.compressByImportance(memory, opts);

      case 'deduplicate':
        return this.compressByDeduplication(memory, opts);

      case 'summarize':
        return this.compressBySummarization(memory, opts);

      default:
        return memory;
    }
  }

  /**
   * Compress by importance score
   */
  private compressByImportance(
    memory: MemoryItem[],
    options: Required<MemoryCompressionOptions>
  ): MemoryItem[] {
    // Filter by minimum importance
    let filtered = memory.filter(item => item.importance >= options.minImportance);

    // Sort by importance (descending) and recency (descending)
    filtered.sort((a, b) => {
      if (Math.abs(a.importance - b.importance) > 0.01) {
        return b.importance - a.importance;
      }
      return b.timestamp - a.timestamp;
    });

    // Keep top items
    return filtered.slice(0, options.maxItems);
  }

  /**
   * Compress by removing duplicates
   */
  private compressByDeduplication(
    memory: MemoryItem[],
    options: Required<MemoryCompressionOptions>
  ): MemoryItem[] {
    const seen = new Set<string>();
    const result: MemoryItem[] = [];

    for (const item of memory) {
      // Create a signature for the item
      const signature = this.createSignature(item);

      if (!seen.has(signature)) {
        seen.add(signature);
        result.push(item);
      }
    }

    // If still too many, compress by importance
    if (result.length > options.maxItems) {
      return this.compressByImportance(result, options);
    }

    return result;
  }

  /**
   * Compress by summarization
   */
  private compressBySummarization(
    memory: MemoryItem[],
    options: Required<MemoryCompressionOptions>
  ): MemoryItem[] {
    // Group by type
    const byType = new Map<MemoryItem['type'], MemoryItem[]>();

    for (const item of memory) {
      if (!byType.has(item.type)) {
        byType.set(item.type, []);
      }
      byType.get(item.type)!.push(item);
    }

    // For each type, decide whether to summarize
    const result: MemoryItem[] = [];

    for (const [type, items] of byType.entries()) {
      if (items.length <= 10) {
        // Keep small groups as-is
        result.push(...items);
      } else {
        // Summarize larger groups
        const summary = this.createSummary(type, items.slice(0, options.maxItems));
        result.push(summary);
      }
    }

    return result;
  }

  /**
   * Create a signature for deduplication
   */
  private createSignature(item: MemoryItem): string {
    // Use content hash or simplified content
    const simplified = item.content
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 200);

    return `${item.type}:${simplified}`;
  }

  /**
   * Create a summary memory item from multiple items
   */
  private createSummary(type: MemoryItem['type'], items: MemoryItem[]): MemoryItem {
    // Determine key topics from the items
    const keywords = this.extractKeywords(items);

    // Create a summary content
    const content = `[Summary of ${items.length} ${type} items]: ` +
                   `Main topics: ${keywords.slice(0, 5).join(', ')}. ` +
                   `Items cover period from ${new Date(items[0].timestamp).toLocaleDateString()} ` +
                   `to ${new Date(items[items.length - 1].timestamp).toLocaleDateString()}.`;

    // Calculate average importance
    const avgImportance =
      items.reduce((sum, item) => sum + item.importance, 0) / items.length;

    return {
      id: crypto.randomUUID(),
      type,
      content,
      importance: avgImportance * 1.1, // Slightly boost importance
      timestamp: Date.now(),
      references: items.map(item => item.id),
    };
  }

  /**
   * Extract keywords from memory items
   */
  private extractKeywords(items: MemoryItem[]): string[] {
    const wordCount = new Map<string, number>();

    for (const item of items) {
      // Extract words from content
      const words = item.content
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 3); // Ignore short words

      for (const word of words) {
        wordCount.set(word, (wordCount.get(word) || 0) + 1);
      }
    }

    // Filter and sort by frequency
    const commonWords = ['the', 'this', 'that', 'with', 'from', 'have', 'been', 'will', 'would'];
    const filtered = Array.from(wordCount.entries())
      .filter(([word]) => !commonWords.includes(word))
      .sort((a, b) => b[1] - a[1]);

    return filtered.slice(0, 10).map(([word]) => word);
  }

  /**
   * Boost importance of memory items
   */
  boostImportance(memory: MemoryItem[], ids: string[], factor: number = 1.5): MemoryItem[] {
    const idSet = new Set(ids);

    return memory.map(item => {
      if (idSet.has(item.id)) {
        return {
          ...item,
          importance: Math.min(1.0, item.importance * factor),
        };
      }
      return item;
    });
  }

  /**
   * Decay importance of memory items over time
   */
  decayImportance(memory: MemoryItem[], halflifeMs: number = 7 * 24 * 60 * 60 * 1000): MemoryItem[] {
    const now = Date.now();

    return memory.map(item => {
      const age = now - item.timestamp;
      const decayFactor = Math.pow(0.5, age / halflifeMs);

      return {
        ...item,
        importance: item.importance * decayFactor,
      };
    });
  }

  /**
   * Get memory statistics
   */
  getStats(memory: MemoryItem[]): {
    total: number;
    byType: Record<MemoryItem['type'], number>;
    avgImportance: number;
    oldestAge: number;
    newestAge: number;
  } {
    const now = Date.now();
    const byType: Record<MemoryItem['type'], number> = {} as any;
    let totalImportance = 0;
    let oldestAge = Infinity;
    let newestAge = 0;

    for (const item of memory) {
      // Count by type
      byType[item.type] = (byType[item.type] || 0) + 1;

      // Track importance
      totalImportance += item.importance;

      // Track age
      const age = now - item.timestamp;
      if (age < oldestAge) oldestAge = age;
      if (age > newestAge) newestAge = age;
    }

    return {
      total: memory.length,
      byType,
      avgImportance: memory.length > 0 ? totalImportance / memory.length : 0,
      oldestAge,
      newestAge,
    };
  }
}

/**
 * Create a memory compressor
 */
export function createMemoryCompressor(
  maxItems?: number,
  minImportance?: number
): MemoryCompressor {
  return new MemoryCompressor(maxItems, minImportance);
}
