/**
 * Built-in Bash Tool
 * Shell command execution
 */

import type { Tool, ToolResult } from '../../types/index.js';
import { execa } from 'execa';

/**
 * Execute a bash command
 */
export const bashTool: Tool = {
  name: 'bash',
  description: 'Execute a bash command. Returns stdout and stderr.',
  parameters: [
    {
      name: 'command',
      type: 'string',
      description: 'The bash command to execute',
      required: true,
    },
    {
      name: 'timeout',
      type: 'number',
      description: 'Maximum execution time in milliseconds',
      required: false,
      default: 120000,
    },
    {
      name: 'cwd',
      type: 'string',
      description: 'Working directory for the command',
      required: false,
    },
    {
      name: 'env',
      type: 'object',
      description: 'Additional environment variables',
      required: false,
    },
  ],
  dangerous: true, // Executes arbitrary shell commands
  execute: async (params): Promise<ToolResult> => {
    try {
      const command = params.command as string;
      const timeout = (params.timeout as number) ?? 120000;
      const cwd = params.cwd as string | undefined;
      const env = params.env as Record<string, string> | undefined;

      // Security check: prevent dangerous commands
      const dangerousPatterns = [
        /\brm\s+-rf\s+\//,
        /\bdd\s+if=.*\s+of=\/dev\/sda/,
        /\bchmod\s+777\s+\//,
        />\s*\/dev\/sda/,
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(command)) {
          return {
            success: false,
            data: null,
            error: 'Command blocked: potentially dangerous operation detected',
          };
        }
      }

      const result = await execa(command, {
        shell: true,
        cwd: cwd ?? process.cwd(),
        env: env ? { ...process.env, ...env } : undefined,
        timeout,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      return {
        success: result.exitCode === 0,
        data: {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
        },
      };
    } catch (error) {
      if ((error as any).timedOut) {
        return {
          success: false,
          data: null,
          error: 'Command timed out',
        };
      }

      const execError = error as {
        stdout?: string;
        stderr?: string;
        exitCode?: number;
        message: string;
      };

      return {
        success: false,
        data: {
          stdout: execError.stdout || '',
          stderr: execError.stderr || '',
          exitCode: execError.exitCode,
        },
        error: execError.message,
      };
    }
  },
};

/**
 * Run multiple bash commands in sequence
 */
export const chainTool: Tool = {
  name: 'chain',
  description: 'Run multiple bash commands in sequence (separated by &&). Returns combined output.',
  parameters: [
    {
      name: 'commands',
      type: 'array',
      description: 'Array of commands to execute in sequence',
      required: true,
    },
    {
      name: 'timeout',
      type: 'number',
      description: 'Total maximum execution time in milliseconds',
      required: false,
      default: 300000,
    },
  ],
  dangerous: true,
  execute: async (params): Promise<ToolResult> => {
    try {
      const commands = params.commands as string[];
      const timeout = (params.timeout as number) ?? 300000;

      // Chain commands with &&
      const command = commands.join(' && ');

      return await bashTool.execute({ command, timeout });
    } catch (error) {
      return {
        success: false,
        data: null,
        error: (error as Error).message,
      };
    }
  },
};
