/**
 * Token Counter
 * Counts tokens for various text inputs
 */

/**
 * Simple tokenizer that provides token counting
 */
export class Tokenizer {
  constructor(_encoding: string = 'cl100k_base') {
    // Encoding parameter reserved for future tokenizer implementation
  }

  /**
   * Initialize the tokenizer
   */
  async initialize(): Promise<void> {
    // No initialization needed for simple tokenizer
  }

  /**
   * Count tokens in text
   */
  count(text: string): number {
    // Fallback: rough estimation (4 chars per token)
    return Math.ceil(text.length / 4);
  }

  /**
   * Count tokens in an array of messages
   */
  countMessages(messages: Array<{ role: string; content: string }>): number {
    let total = 0;

    for (const message of messages) {
      // Add role tokens (approximate)
      total += this.count(message.role) + 1;
      // Add content tokens
      total += this.count(message.content);
    }

    return total;
  }

  /**
   * Estimate token count without loading tokenizer
   */
  static estimate(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

/**
 * Global tokenizer instance
 */
let globalTokenizer: Tokenizer | null = null;

/**
 * Get or create the global tokenizer
 */
export async function getTokenizer(encoding?: string): Promise<Tokenizer> {
  if (!globalTokenizer) {
    globalTokenizer = new Tokenizer(encoding);
    await globalTokenizer.initialize();
  }

  return globalTokenizer;
}

/**
 * Quick token count function
 */
export async function countTokens(text: string): Promise<number> {
  const tokenizer = await getTokenizer();
  return tokenizer.count(text);
}

/**
 * Synchronous token count (uses estimation if tokenizer not initialized)
 */
export function countTokensSync(text: string): number {
  if (globalTokenizer) {
    return globalTokenizer.count(text);
  }
  return Tokenizer.estimate(text);
}