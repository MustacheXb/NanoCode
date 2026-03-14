import type { LLMClient, LLMChatParams, LLMResponse, Message } from '../../src/types/index.js'

/**
 * Mock LLM client for testing
 */
export class MockLLMClient implements LLMClient {
  private responses: string[] = []
  private responseIndex = 0

  constructor(responses?: string[]) {
    this.responses = responses || [
      'I need to think about this problem.',
      'Let me analyze the situation.',
      'I will execute the necessary actions.',
      'The task has been completed successfully.',
    ]
  }

  async chat(params: LLMChatParams): Promise<LLMResponse> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 50))

    // Get next response
    const response = this.responses[this.responseIndex % this.responses.length]
    this.responseIndex++

    return {
      content: response,
      finishReason: 'stop',
      usage: {
        inputTokens: this.countTokens(JSON.stringify(params.messages)),
        outputTokens: this.countTokens(response),
        totalTokens: 0,
      },
    }
  }

  countTokens(text: string): number {
    // Simple token count approximation (4 chars per token)
    return Math.ceil(text.length / 4)
  }

  setResponses(responses: string[]): void {
    this.responses = responses
    this.responseIndex = 0
  }
}
