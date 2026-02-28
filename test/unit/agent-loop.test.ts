/**
 * Unit tests for Agent Loop
 */

import { describe, it, expect } from 'vitest';
import { AgentLoop } from '../../src/core/agent-loop.js';

describe('AgentLoop', () => {
  it('should create an agent loop', () => {
    const config = {
      llm: {
        apiKey: 'test-key',
        model: 'claude-3-5-sonnet-20241022',
        maxTokens: 4096,
        temperature: 0,
      },
      tools: {
        enabled: ['read', 'write'],
        mcpServers: [],
      },
      security: {
        permissionLevel: 'bypass' as const,
        sandboxEnabled: false,
      },
      compression: {
        maxContextTokens: 100000,
        memoryStrategy: 'lru' as const,
      },
      storage: {
        dbPath: ':memory:',
        sessionTTL: 86400000,
      },
    };

    const mockLLM = {
      chat: async () => ({
        content: 'Test response',
        finishReason: 'stop' as const,
        usage: {
          inputTokens: 10,
          outputTokens: 10,
          totalTokens: 20,
        },
      }),
      countTokens: (text: string) => Math.ceil(text.length / 4),
    };

    const tools = [
      {
        name: 'test',
        description: 'Test tool',
        parameters: [],
        execute: async () => ({ success: true, data: 'test' }),
      },
    ];

    const loop = new AgentLoop({
      config,
      llmClient: mockLLM,
      tools,
    });

    expect(loop.getState()).toBe('idle');
  });
});
