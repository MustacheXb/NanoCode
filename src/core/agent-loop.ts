/**
 * Agent Loop - Core state machine for the AI agent
 * Implements the observation -> thought -> action cycle
 */

import type {
  AgentConfig,
  AgentState,
  Context,
  LLMClient,
  LLMResponse,
  Message,
  Tool,
  ToolCall,
  ToolResult,
} from '../types/index.js';
import { EventEmitter } from 'events';

export interface AgentLoopOptions {
  config: AgentConfig;
  llmClient: LLMClient;
  tools: Tool[];
  initialContext?: Context;
}

export interface StepResult {
  state: AgentState;
  observation?: string;
  thought?: string;
  action?: ToolCall;
  toolResult?: ToolResult;
  error?: Error;
  shouldContinue: boolean;
}

export class AgentLoop extends EventEmitter {
  private state: AgentState = 'idle';
  private context: Context;
  private config: AgentConfig;
  private llmClient: LLMClient;
  private tools: Map<string, Tool>;
  private maxIterations: number;
  private currentIteration: number = 0;

  constructor(options: AgentLoopOptions) {
    super();

    this.config = options.config;
    this.llmClient = options.llmClient;
    this.tools = new Map();

    for (const tool of options.tools) {
      this.tools.set(tool.name, tool);
    }

    this.context = options.initialContext || this.createEmptyContext();

    this.maxIterations = this.config.compression.maxContextTokens / 1000;
  }

  private createEmptyContext(): Context {
    return {
      messages: [],
      memory: [],
      observations: [],
      metadata: {
        sessionId: crypto.randomUUID(),
        startTime: Date.now(),
        lastUpdate: Date.now(),
        tokensUsed: 0,
      },
    };
  }

  async run(initialPrompt: string): Promise<Context> {
    this.state = 'thinking';
    this.currentIteration = 0;

    this.addMessage({
      role: 'user',
      content: initialPrompt,
      timestamp: Date.now(),
    });

    this.emit('start', { prompt: initialPrompt });

    let shouldContinue = true;

    while (shouldContinue && this.currentIteration < this.maxIterations) {
      const result = await this.step();
      this.emit('step', result);

      if (result.error) {
        this.state = 'error';
        this.emit('error', result.error);
        break;
      }

      shouldContinue = result.shouldContinue;
      this.currentIteration++;
    }

    if (this.currentIteration >= this.maxIterations) {
      this.emit('maxIterationsReached', this.currentIteration);
    }

    this.state = 'completed';
    this.emit('complete', { context: this.context, iterations: this.currentIteration });

    return this.context;
  }

  async step(): Promise<StepResult> {
    const result: StepResult = {
      state: this.state,
      shouldContinue: true,
    };

    try {
      this.state = 'thinking';
      const llmResponse = await this.think();

      result.thought = llmResponse.content;

      if (llmResponse.finishReason === 'stop' || !llmResponse.toolCalls?.length) {
        this.addMessage({
          role: 'assistant',
          content: llmResponse.content,
          timestamp: Date.now(),
        });
        result.shouldContinue = false;
        return result;
      }

      this.state = 'acting';
      const toolResults = await this.act(llmResponse.toolCalls);

      result.action = llmResponse.toolCalls[0];
      result.toolResult = toolResults[0];

      this.state = 'observing';
      for (const toolResult of toolResults) {
        this.observe(toolResult);
      }

      if (this.context.metadata.tokensUsed > this.config.compression.maxContextTokens) {
        await this.compressContext();
      }

      this.state = 'thinking';

    } catch (error) {
      result.state = 'error';
      result.error = error as Error;
      result.shouldContinue = false;
    }

    return result;
  }

  private async think(): Promise<LLMResponse> {
    const availableTools = Array.from(this.tools.values());

    const response = await this.llmClient.chat({
      messages: this.context.messages,
      tools: availableTools,
      maxTokens: this.config.llm.maxTokens,
      temperature: this.config.llm.temperature,
    });

    this.context.metadata.tokensUsed += response.usage.totalTokens;
    this.context.metadata.lastUpdate = Date.now();

    this.addMessage({
      role: 'assistant',
      content: response.content,
      toolCalls: response.toolCalls,
      timestamp: Date.now(),
    });

    return response;
  }

  private async act(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    for (const toolCall of toolCalls) {
      const tool = this.tools.get(toolCall.name);

      if (!tool) {
        results.push({
          success: false,
          data: null,
          error: `Tool not found: ${toolCall.name}`,
        });
        continue;
      }

      if (this.config.security.permissionLevel !== 'bypass' && tool.dangerous) {
        const approved = await this.requestPermission(tool, toolCall);
        if (!approved) {
          results.push({
            success: false,
            data: null,
            error: `Tool execution denied by user: ${toolCall.name}`,
          });
          continue;
        }
      }

      try {
        const res = await tool.execute(toolCall.parameters);
        results.push(res);

        this.addMessage({
          role: 'tool',
          content: res.success ? JSON.stringify(res.data) : res.error || 'Unknown error',
          toolCallId: toolCall.id,
          timestamp: Date.now(),
        });
      } catch (error) {
        results.push({
          success: false,
          data: null,
          error: (error as Error).message,
        });
      }
    }

    return results;
  }

  private observe(result: ToolResult): void {
    this.context.observations.push({
      id: crypto.randomUUID(),
      type: 'tool_result',
      content: result.success ? JSON.stringify(result.data) : result.error || 'Unknown error',
      masked: false,
      timestamp: Date.now(),
    });
  }

  private async compressContext(): Promise<void> {
    this.emit('compressing', { currentTokens: this.context.metadata.tokensUsed });

    const strategy = this.config.compression.memoryStrategy;

    switch (strategy) {
      case 'lru':
        this.compressLRU();
        break;
      case 'smart':
        await this.compressSmart();
        break;
      case 'none':
        break;
    }

    this.emit('compressed', { newTokens: this.countContextTokens() });
  }

  private compressLRU(): void {
    const systemMessages = this.context.messages.filter(m => m.role === 'system');
    const recentMessages = this.context.messages
      .filter(m => m.role !== 'system')
      .slice(-50);

    this.context.messages = [...systemMessages, ...recentMessages];
  }

  private async compressSmart(): Promise<void> {
    this.compressLRU();
  }

  private countContextTokens(): number {
    return this.context.messages.reduce((total, msg) => {
      return total + this.llmClient.countTokens(msg.content);
    }, 0);
  }

  private async requestPermission(_tool: Tool, _toolCall: ToolCall): Promise<boolean> {
    this.emit('permissionRequest', {
      tool: _tool.name,
      parameters: _toolCall.parameters,
    });

    return true;
  }

  private addMessage(message: Message): void {
    this.context.messages.push(message);
  }

  getState(): AgentState {
    return this.state;
  }

  getContext(): Context {
    return this.context;
  }

  reset(): void {
    this.state = 'idle';
    this.context = this.createEmptyContext();
    this.currentIteration = 0;
  }

  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
    this.emit('toolRegistered', tool);
  }

  unregisterTool(name: string): void {
    this.tools.delete(name);
    this.emit('toolUnregistered', name);
  }
}

export function createAgentLoop(options: AgentLoopOptions): AgentLoop {
  return new AgentLoop(options);
}