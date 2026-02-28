/**
 * Skill Executor
 * Executes skills and manages skill execution context
 */

import type { Context } from '../types/index.js';
import { skillRegistry } from './registry.js';

export interface SkillExecutionOptions {
  timeoutMs?: number;
  maxRetries?: number;
  context?: Context;
}

export interface SkillExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  durationMs: number;
}

/**
 * Executes skills with timeout and error handling
 */
export class SkillExecutor {
  private executionHistory: Array<{
    skill: string;
    timestamp: number;
    success: boolean;
    durationMs: number;
  }>;
  private defaultTimeout: number;

  constructor(timeoutMs: number = 300000) {
    this.executionHistory = [];
    this.defaultTimeout = timeoutMs;
  }

  /**
   * Execute a skill
   */
  async execute(
    name: string,
    args: string[],
    options: SkillExecutionOptions = {}
  ): Promise<SkillExecutionResult> {
    const skill = skillRegistry.get(name);

    if (!skill) {
      return {
        success: false,
        error: `Skill not found: ${name}`,
        durationMs: 0,
      };
    }

    if (!skillRegistry.isEnabled(name)) {
      return {
        success: false,
        error: `Skill is disabled: ${name}`,
        durationMs: 0,
      };
    }

    const startTime = Date.now();
    const timeout = options.timeoutMs ?? this.defaultTimeout;
    const context = options.context || this.createEmptyContext();

    const skillContext = {
      skill,
      args,
      context,
      timestamp: Date.now(),
    };
    void skillContext; // Reserved for future use

    try {
      // Execute with timeout
      const result = await this.executeWithTimeout(
        () => skill.handler(args, context),
        timeout
      );

      const durationMs = Date.now() - startTime;

      this.recordExecution(name, true, durationMs);

      return {
        success: true,
        output: result as string | undefined,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;

      this.recordExecution(name, false, durationMs);

      return {
        success: false,
        error: (error as Error).message,
        durationMs,
      };
    }
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Skill execution timeout')), timeoutMs)
      ),
    ]);
  }

  /**
   * Execute a skill with retries
   */
  async executeWithRetry(
    name: string,
    args: string[],
    options: SkillExecutionOptions = {}
  ): Promise<SkillExecutionResult> {
    const maxRetries = options.maxRetries ?? 3;
    let lastResult: SkillExecutionResult | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const result = await this.execute(name, args, options);

      if (result.success) {
        return result;
      }

      lastResult = result;

      if (attempt < maxRetries) {
        // Wait before retrying with exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }

    return lastResult || {
      success: false,
      error: 'Skill execution failed',
      durationMs: 0,
    };
  }

  /**
   * Record skill execution
   */
  private recordExecution(skill: string, success: boolean, durationMs: number): void {
    this.executionHistory.push({
      skill,
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
   * Get execution history
   */
  getExecutionHistory(limit?: number): Array<{
    skill: string;
    timestamp: number;
    success: boolean;
    durationMs: number;
  }> {
    return limit ? this.executionHistory.slice(-limit) : [...this.executionHistory];
  }

  /**
   * Get execution statistics
   */
  getStats(): {
    totalExecutions: number;
    successRate: number;
    averageDurationMs: number;
    topUsedSkills: Array<{ skill: string; count: number }>;
  } {
    const total = this.executionHistory.length;
    const successful = this.executionHistory.filter(e => e.success).length;
    const totalDuration = this.executionHistory.reduce((sum, e) => sum + e.durationMs, 0);

    // Calculate top used skills
    const skillCounts = new Map<string, number>();
    for (const exec of this.executionHistory) {
      skillCounts.set(exec.skill, (skillCounts.get(exec.skill) || 0) + 1);
    }

    const topUsedSkills = Array.from(skillCounts.entries())
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalExecutions: total,
      successRate: total > 0 ? successful / total : 0,
      averageDurationMs: total > 0 ? totalDuration / total : 0,
      topUsedSkills,
    };
  }

  /**
   * Clear execution history
   */
  clearHistory(): void {
    this.executionHistory = [];
  }

  /**
   * Create an empty context
   */
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

  /**
   * Set default timeout
   */
  setTimeout(timeoutMs: number): void {
    this.defaultTimeout = timeoutMs;
  }
}

/**
 * Global skill executor instance
 */
export const skillExecutor = new SkillExecutor();

/**
 * Execute a skill
 */
export async function executeSkill(
  name: string,
  args: string[],
  options?: SkillExecutionOptions
): Promise<SkillExecutionResult> {
  return skillExecutor.execute(name, args, options);
}

/**
 * Create a skill executor
 */
export function createSkillExecutor(timeoutMs?: number): SkillExecutor {
  return new SkillExecutor(timeoutMs);
}
