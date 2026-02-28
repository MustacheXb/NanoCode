/**
 * LLM Client - Interface for communicating with LLM providers
 * Supports Claude API, OpenAI API, and custom OpenAI-compatible APIs
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  LLMClient,
  LLMChatParams,
  LLMResponse,
  Message,
  Tool,
  ToolCall,
} from '../types/index.js';

export interface ClaudeClientConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface OpenAIClientConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export type LLMProviderConfig = ClaudeClientConfig | OpenAIClientConfig;

/**
 * Anthropic Claude client implementation
 */
export class ClaudeClient implements LLMClient {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(config: ClaudeClientConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: config.timeoutMs || 600000,
    });

    this.model = config.model || 'claude-3-5-sonnet-20241022';
    this.maxTokens = config.maxTokens || 4096;
    this.temperature = config.temperature || 0;
  }

  async chat(params: LLMChatParams): Promise<LLMResponse> {
    try {
      const messages = this.convertMessages(params.messages);
      const tools = params.tools ? this.convertTools(params.tools) : undefined;

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: params.maxTokens || this.maxTokens,
        temperature: params.temperature ?? this.temperature,
        messages,
        tools,
      });

      const content = response.content.find(c => c.type === 'text');

      const toolCalls = response.content
        .filter(c => c.type === 'tool_use')
        .map(t => ({
          id: (t as Anthropic.ToolUseBlock).id,
          name: (t as Anthropic.ToolUseBlock).name,
          parameters: (t as Anthropic.ToolUseBlock).input as Record<string, unknown>,
        }));

      return {
        content: content ? (content as Anthropic.TextBlock).text : '',
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        finishReason: this.mapFinishReason(response.stop_reason),
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
      };
    } catch (error) {
      console.error('LLM Client error:', error);
      throw new Error(`LLM request failed: ${(error as Error).message}`);
    }
  }

  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private convertMessages(messages: Message[]): Anthropic.MessageParam[] {
    const result: Anthropic.MessageParam[] = [];

    for (const message of messages) {
      switch (message.role) {
        case 'system':
          break;

        case 'user':
          result.push({
            role: 'user',
            content: message.content,
          });
          break;

        case 'assistant': {
          const assistantContent: Anthropic.TextBlockParam = {
            type: 'text',
            text: message.content,
          };

          const assistantMsg: Anthropic.MessageParam = {
            role: 'assistant',
            content: [assistantContent],
          };

          if (message.toolCalls && message.toolCalls.length > 0) {
            const toolUseBlocks = message.toolCalls.map(tc => ({
              type: 'tool_use' as const,
              id: tc.id,
              name: tc.name,
              input: tc.parameters,
            }));
            assistantMsg.content = [assistantContent, ...toolUseBlocks];
          }

          result.push(assistantMsg);
          break;
        }

        case 'tool':
          if (message.toolCallId) {
            const toolContent: Anthropic.ToolResultBlockParam = {
              type: 'tool_result',
              tool_use_id: message.toolCallId,
              content: message.content,
            };

            const lastMsg = result[result.length - 1];
            if (lastMsg && lastMsg.role === 'user') {
              if (Array.isArray(lastMsg.content)) {
                lastMsg.content.push(toolContent);
              } else {
                lastMsg.content = [
                  { type: 'text', text: lastMsg.content as string },
                  toolContent,
                ];
              }
            } else {
              result.push({
                role: 'user',
                content: [toolContent],
              });
            }
          }
          break;
      }
    }

    return result;
  }

  private convertTools(tools: Tool[]): Anthropic.Tool[] {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object',
        properties: this.convertToolParameters(tool.parameters),
        required: tool.parameters.filter(p => p.required).map(p => p.name),
      },
    }));
  }

  private convertToolParameters(parameters: Tool['parameters']): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const param of parameters) {
      result[param.name] = {
        type: this.mapParameterType(param.type),
        description: param.description,
      };
    }

    return result;
  }

  private mapParameterType(type: string): string {
    const typeMap: Record<string, string> = {
      'string': 'string',
      'number': 'number',
      'integer': 'integer',
      'boolean': 'boolean',
      'array': 'array',
      'object': 'object',
      'any': 'object',
    };

    return typeMap[type] || 'string';
  }

  private mapFinishReason(reason: string | null): LLMResponse['finishReason'] {
    const reasonMap: Record<string, LLMResponse['finishReason']> = {
      'end_turn': 'stop',
      'max_tokens': 'length',
      'stop_sequence': 'stop',
      'tool_use': 'tool_calls',
    };

    return reasonMap[reason || ''] || 'stop';
  }

  setModel(model: string): void {
    this.model = model;
  }

  setMaxTokens(maxTokens: number): void {
    this.maxTokens = maxTokens;
  }

  setTemperature(temperature: number): void {
    this.temperature = temperature;
  }
}

/**
 * OpenAI client implementation
 */
export class OpenAIClient implements LLMClient {
  private apiKey: string;
  private baseURL: string;
  private model: string;
  private maxTokens: number;
  private temperature: number;
  private timeoutMs: number;

  constructor(config: OpenAIClientConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseUrl || 'https://api.openai.com';
    this.model = config.model || 'gpt-4o';
    this.maxTokens = config.maxTokens || 4096;
    this.temperature = config.temperature || 0;
    this.timeoutMs = config.timeoutMs || 600000;
  }

  async chat(params: LLMChatParams): Promise<LLMResponse> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      };

      const messages = this.convertMessages(params.messages);
      const tools = params.tools ? this.convertTools(params.tools) : undefined;

      const body: Record<string, unknown> = {
        model: this.model,
        messages,
        max_tokens: params.maxTokens || this.maxTokens,
        temperature: params.temperature ?? this.temperature,
      };

      if (tools && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = 'auto';
      }

      const url = `${this.baseURL}/v1/chat/completions`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }

      const data = (await response.json()) as {
        choices: Array<{
          message: {
            content: string | null;
            tool_calls?: Array<{
              id: string;
              function: { name: string; arguments: string };
            }>;
          };
          finish_reason: string;
        }>;
        usage: {
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens: number;
        };
      };

      const choice = data.choices[0];

      let toolCalls: ToolCall[] | undefined;
      if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
        toolCalls = choice.message.tool_calls.map(tc => ({
          id: tc.id,
          name: tc.function.name,
          parameters: JSON.parse(tc.function.arguments),
        }));
      }

      return {
        content: choice.message.content || '',
        toolCalls,
        finishReason: this.mapFinishReason(choice.finish_reason),
        usage: {
          inputTokens: data.usage.prompt_tokens,
          outputTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        },
      };
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new Error('Request timeout');
      }
      console.error('LLM Client error:', error);
      throw new Error(`LLM request failed: ${(error as Error).message}`);
    }
  }

  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private convertMessages(messages: Message[]): Array<{
    role: string;
    content: string | Array<Record<string, unknown>>;
    tool_calls?: Array<Record<string, unknown>>;
    tool_call_id?: string;
  }> {
    const result: Array<{
      role: string;
      content: string | Array<Record<string, unknown>>;
      tool_calls?: Array<Record<string, unknown>>;
      tool_call_id?: string;
    }> = [];

    for (const message of messages) {
      switch (message.role) {
        case 'system':
          result.push({
            role: 'system',
            content: message.content,
          });
          break;

        case 'user':
          if (message.toolCallId) {
            result.push({
              role: 'tool',
              tool_call_id: message.toolCallId,
              content: message.content,
            });
          } else {
            result.push({
              role: 'user',
              content: message.content,
            });
          }
          break;

        case 'assistant': {
          const assistantMsg: {
            role: string;
            content: string;
            tool_calls?: Array<Record<string, unknown>>;
          } = {
            role: 'assistant',
            content: message.content,
          };

          if (message.toolCalls && message.toolCalls.length > 0) {
            assistantMsg.tool_calls = message.toolCalls.map(tc => ({
              id: tc.id,
              type: 'function',
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.parameters),
              },
            }));
          }

          result.push(assistantMsg);
          break;
        }

        case 'tool':
          break;
      }
    }

    return result;
  }

  private convertTools(tools: Tool[]): Array<{
    type: string;
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }> {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: this.convertToolParameters(tool.parameters),
          required: tool.parameters.filter(p => p.required).map(p => p.name),
        },
      },
    }));
  }

  private convertToolParameters(parameters: Tool['parameters']): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const param of parameters) {
      result[param.name] = {
        type: this.mapParameterType(param.type),
        description: param.description,
      };
    }

    return result;
  }

  private mapParameterType(type: string): string {
    const typeMap: Record<string, string> = {
      'string': 'string',
      'number': 'number',
      'integer': 'integer',
      'boolean': 'boolean',
      'array': 'array',
      'object': 'object',
      'any': 'object',
    };

    return typeMap[type] || 'string';
  }

  private mapFinishReason(reason: string): LLMResponse['finishReason'] {
    const reasonMap: Record<string, LLMResponse['finishReason']> = {
      'stop': 'stop',
      'length': 'length',
      'content_filter': 'error',
      'tool_calls': 'tool_calls',
    };

    return reasonMap[reason] || 'stop';
  }

  setModel(model: string): void {
    this.model = model;
  }

  setMaxTokens(maxTokens: number): void {
    this.maxTokens = maxTokens;
  }

  setTemperature(temperature: number): void {
    this.temperature = temperature;
  }

  setBaseURL(baseUrl: string): void {
    this.baseURL = baseUrl;
  }
}

/**
 * Create an LLM client based on configuration
 */
export function createLLMClient(
  provider: 'claude' | 'openai' | 'anthropic' | 'custom',
  config: LLMProviderConfig
): LLMClient {
  switch (provider) {
    case 'claude':
    case 'anthropic':
      return new ClaudeClient(config as ClaudeClientConfig);
    case 'openai':
    case 'custom':
      return new OpenAIClient(config as OpenAIClientConfig);
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

/**
 * Default LLM client factory
 */
export function createDefaultLLMClient(
  provider: 'claude' | 'openai' = 'claude',
  apiKey: string,
  options?: {
    model?: string;
    baseUrl?: string;
    maxTokens?: number;
    temperature?: number;
  }
): LLMClient {
  const commonConfig = {
    apiKey,
    maxTokens: options?.maxTokens || 8192,
    temperature: options?.temperature || 0,
  };

  if (provider === 'claude') {
    return new ClaudeClient({
      ...commonConfig,
      model: options?.model || 'claude-3-5-sonnet-20241022',
    });
  } else {
    return new OpenAIClient({
      ...commonConfig,
      model: options?.model || 'gpt-4o',
      baseUrl: options?.baseUrl,
    });
  }
}