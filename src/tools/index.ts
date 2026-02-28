/**
 * Tool Registry and Scheduler
 * Central hub for tool registration, discovery, and execution
 */

import type {
  Tool,
  ToolParameter,
  ToolResult,
  PermissionLevel,
} from '../types/index.js';
import { EventEmitter } from 'events';

export interface ToolRegistration {
  tool: Tool;
  enabled: boolean;
  category?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolExecutionOptions {
  permissionLevel: PermissionLevel;
  onPermissionRequest?: (tool: string, params: Record<string, unknown>) => Promise<boolean>;
  sandbox?: {
    enabled: boolean;
    timeoutMs: number;
    maxMemoryMB: number;
  };
}

export class ToolRegistry extends EventEmitter {
  private tools: Map<string, ToolRegistration>;
  private categories: Map<string, Set<string>>;
  private executionHistory: Array<{
    tool: string;
    timestamp: number;
    success: boolean;
    durationMs: number;
  }>;

  constructor() {
    super();
    this.tools = new Map();
    this.categories = new Map();
    this.executionHistory = [];
  }

  /**
   * Register a new tool
   */
  register(tool: Tool, category?: string, metadata?: Record<string, unknown>): void {
    const registration: ToolRegistration = {
      tool,
      enabled: true,
      category,
      metadata,
    };

    this.tools.set(tool.name, registration);

    // Update category index
    if (category) {
      if (!this.categories.has(category)) {
        this.categories.set(category, new Set());
      }
      this.categories.get(category)!.add(tool.name);
    }

    this.emit('toolRegistered', { name: tool.name, category });
  }

  /**
   * Register multiple tools at once
   */
  registerBatch(tools: Array<{ tool: Tool; category?: string; metadata?: Record<string, unknown> }>): void {
    for (const item of tools) {
      this.register(item.tool, item.category, item.metadata);
    }
  }

  /**
   * Unregister a tool
   */
  unregister(name: string): boolean {
    const registration = this.tools.get(name);

    if (!registration) {
      return false;
    }

    // Remove from category index
    if (registration.category) {
      this.categories.get(registration.category)?.delete(name);
    }

    this.tools.delete(name);
    this.emit('toolUnregistered', { name });
    return true;
  }

  /**
   * Get a tool by name
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name)?.tool;
  }

  /**
   * Get registration details
   */
  getRegistration(name: string): ToolRegistration | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool exists and is enabled
   */
  isAvailable(name: string): boolean {
    const registration = this.tools.get(name);
    return registration?.enabled ?? false;
  }

  /**
   * Enable or disable a tool
   */
  setEnabled(name: string, enabled: boolean): boolean {
    const registration = this.tools.get(name);

    if (!registration) {
      return false;
    }

    registration.enabled = enabled;
    this.emit('toolToggled', { name, enabled });
    return true;
  }

  /**
   * Enable or disable all tools in a category
   */
  setCategoryEnabled(category: string, enabled: boolean): void {
    const toolNames = this.categories.get(category);

    if (toolNames) {
      for (const name of toolNames) {
        this.setEnabled(name, enabled);
      }
    }
  }

  /**
   * Execute a tool
   */
  async execute(
    name: string,
    params: Record<string, unknown>,
    options: ToolExecutionOptions
  ): Promise<ToolResult> {
    const registration = this.tools.get(name);

    if (!registration) {
      return {
        success: false,
        data: null,
        error: `Tool not found: ${name}`,
      };
    }

    if (!registration.enabled) {
      return {
        success: false,
        data: null,
        error: `Tool is disabled: ${name}`,
      };
    }

    // Validate parameters
    const validation = this.validateParameters(registration.tool, params);
    if (!validation.valid) {
      return {
        success: false,
        data: null,
        error: `Invalid parameters: ${validation.errors.join(', ')}`,
      };
    }

    // Check permissions
    if (options.permissionLevel !== 'bypass' && registration.tool.dangerous) {
      const approved = options.onPermissionRequest
        ? await options.onPermissionRequest(name, params)
        : true;

      if (!approved) {
        return {
          success: false,
          data: null,
          error: `Tool execution denied: ${name}`,
        };
      }
    }

    const startTime = Date.now();

    try {
      // Execute with timeout if sandbox enabled
      const result = options.sandbox?.enabled
        ? await this.executeWithTimeout(registration.tool, params, options.sandbox.timeoutMs)
        : await registration.tool.execute(params);

      // Record execution
      this.recordExecution(name, result.success, Date.now() - startTime);

      return result;
    } catch (error) {
      this.recordExecution(name, false, Date.now() - startTime);

      return {
        success: false,
        data: null,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout(
    tool: Tool,
    params: Record<string, unknown>,
    timeoutMs: number
  ): Promise<ToolResult> {
    return Promise.race([
      tool.execute(params),
      new Promise<ToolResult>((_, reject) =>
        setTimeout(() => reject(new Error('Tool execution timeout')), timeoutMs)
      ),
    ]);
  }

  /**
   * Validate tool parameters
   */
  private validateParameters(
    tool: Tool,
    params: Record<string, unknown>
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const param of tool.parameters) {
      if (param.required && !(param.name in params)) {
        errors.push(`Missing required parameter: ${param.name}`);
      }
    }

    // Check for unknown parameters (optional strict mode)
    // for (const key in params) {
    //   if (!tool.parameters.find(p => p.name === key)) {
    //     errors.push(`Unknown parameter: ${key}`);
    //   }
    // }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Record tool execution for analytics
   */
  private recordExecution(tool: string, success: boolean, durationMs: number): void {
    this.executionHistory.push({
      tool,
      timestamp: Date.now(),
      success,
      durationMs,
    });

    // Keep only recent history
    if (this.executionHistory.length > 1000) {
      this.executionHistory.shift();
    }
  }

  /**
   * Get all registered tool names
   */
  listNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get all enabled tool names
   */
  listEnabled(): string[] {
    return Array.from(this.tools.entries())
      .filter(([_, reg]) => reg.enabled)
      .map(([name, _]) => name);
  }

  /**
   * Get all tools in a category
   */
  getByCategory(category: string): Tool[] {
    const toolNames = this.categories.get(category);
    if (!toolNames) {
      return [];
    }

    return Array.from(toolNames)
      .map(name => this.tools.get(name)?.tool)
      .filter((t): t is Tool => t !== undefined);
  }

  /**
   * Get all categories
   */
  listCategories(): string[] {
    return Array.from(this.categories.keys());
  }

  /**
   * Get execution statistics
   */
  getStats(): {
    totalTools: number;
    enabledTools: number;
    totalExecutions: number;
    successRate: number;
    averageDurationMs: number;
    topUsedTools: Array<{ tool: string; count: number }>;
  } {
    const totalExecutions = this.executionHistory.length;
    const successfulExecutions = this.executionHistory.filter(e => e.success).length;
    const totalDuration = this.executionHistory.reduce((sum, e) => sum + e.durationMs, 0);

    // Calculate top used tools
    const toolCounts = new Map<string, number>();
    for (const exec of this.executionHistory) {
      toolCounts.set(exec.tool, (toolCounts.get(exec.tool) || 0) + 1);
    }

    const topUsedTools = Array.from(toolCounts.entries())
      .map(([tool, count]) => ({ tool, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalTools: this.tools.size,
      enabledTools: Array.from(this.tools.values()).filter(r => r.enabled).length,
      totalExecutions,
      successRate: totalExecutions > 0 ? successfulExecutions / totalExecutions : 0,
      averageDurationMs: totalExecutions > 0 ? totalDuration / totalExecutions : 0,
      topUsedTools,
    };
  }

  /**
   * Get execution history
   */
  getExecutionHistory(limit?: number): typeof this.executionHistory {
    return limit ? this.executionHistory.slice(-limit) : [...this.executionHistory];
  }

  /**
   * Clear execution history
   */
  clearHistory(): void {
    this.executionHistory = [];
  }

  /**
   * Search tools by description
   */
  search(query: string): Tool[] {
    const lowerQuery = query.toLowerCase();

    return Array.from(this.tools.values())
      .filter(r => r.enabled)
      .map(r => r.tool)
      .filter(
        tool =>
          tool.name.toLowerCase().includes(lowerQuery) ||
          tool.description.toLowerCase().includes(lowerQuery)
      );
  }

  /**
   * Export tool schemas (for LLM consumption)
   */
  exportSchemas(): Array<{ name: string; description: string; parameters: ToolParameter[] }> {
    return Array.from(this.tools.values())
      .filter(r => r.enabled)
      .map(r => ({
        name: r.tool.name,
        description: r.tool.description,
        parameters: r.tool.parameters,
      }));
  }
}

/**
 * Global tool registry instance
 */
export const toolRegistry = new ToolRegistry();

/**
 * Helper to register a tool
 */
export function registerTool(
  name: string,
  description: string,
  parameters: ToolParameter[],
  execute: (params: Record<string, unknown>) => Promise<ToolResult>,
  options?: {
    category?: string;
    dangerous?: boolean;
    metadata?: Record<string, unknown>;
  }
): void {
  toolRegistry.register(
    {
      name,
      description,
      parameters,
      execute,
      dangerous: options?.dangerous,
    },
    options?.category,
    options?.metadata
  );
}
