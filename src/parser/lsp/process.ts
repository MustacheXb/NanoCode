/**
 * Language Server Process Manager
 * Manages the lifecycle of LSP server processes
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import type { LSPServerConfig } from './client.js';

export interface ProcessStatus {
  name: string;
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  pid?: number;
  uptimeMs?: number;
  lastError?: string;
}

export interface ProcessOptions {
  timeoutMs?: number;
  restartAttempts?: number;
  restartDelayMs?: number;
  healthCheckIntervalMs?: number;
}

type ProcessEventMap = {
  'stdout': [Buffer];
  'stderr': [Buffer];
  'exit': [number | null, string | null];
  'error': [Error];
  'status-change': [ProcessStatus];
};

/**
 * Language Server Process Manager
 */
export class LSPProcessManager extends EventEmitter<ProcessEventMap> {
  private process: ChildProcess | null = null;
  private config: LSPServerConfig;
  private options: Required<ProcessOptions>;
  private status: ProcessStatus;
  private startTime: number = 0;
  private restartCount: number = 0;
  private healthCheckTimer?: ReturnType<typeof setInterval>;
  private isShuttingDown: boolean = false;

  constructor(name: string, config: LSPServerConfig, options: ProcessOptions = {}) {
    super();
    this.config = config;
    this.options = {
      timeoutMs: options.timeoutMs ?? 30000,
      restartAttempts: options.restartAttempts ?? 3,
      restartDelayMs: options.restartDelayMs ?? 1000,
      healthCheckIntervalMs: options.healthCheckIntervalMs ?? 30000,
    };
    this.status = {
      name,
      status: 'stopped',
    };
  }

  /**
   * Start the language server process
   */
  async start(): Promise<void> {
    if (this.process && this.status.status === 'running') {
      return;
    }

    this.isShuttingDown = false;
    this.updateStatus('starting');

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Language server startup timeout (${this.options.timeoutMs}ms)`));
        this.kill();
      }, this.options.timeoutMs);

      try {
        this.process = spawn(this.config.command, this.config.args ?? [], {
          env: { ...process.env, ...this.config.env },
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: process.platform === 'win32',
        });

        this.startTime = Date.now();

        this.process.on('error', (error) => {
          clearTimeout(timeout);
          this.updateStatus('error', error.message);
          this.emit('error', error);
          reject(error);
        });

        this.process.on('exit', (code, signal) => {
          clearTimeout(timeout);
          this.emit('exit', code, signal);
          this.handleExit(code, signal);
        });

        this.process.stdout?.on('data', (data: Buffer) => {
          this.emit('stdout', data);
        });

        this.process.stderr?.on('data', (data: Buffer) => {
          this.emit('stderr', data);
        });

        // Process started successfully
        this.updateStatus('running', undefined, this.process.pid);
        clearTimeout(timeout);
        this.restartCount = 0;
        this.startHealthCheck();
        resolve();

      } catch (error) {
        clearTimeout(timeout);
        this.updateStatus('error', (error as Error).message);
        reject(error);
      }
    });
  }

  /**
   * Stop the language server process
   */
  async stop(): Promise<void> {
    if (!this.process) {
      return;
    }

    this.isShuttingDown = true;
    this.stopHealthCheck();
    this.updateStatus('stopping');

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.kill();
        resolve();
      }, 5000);

      this.process?.on('exit', () => {
        clearTimeout(timeout);
        this.updateStatus('stopped');
        this.process = null;
        resolve();
      });

      // Try graceful shutdown first
      this.process?.stdin?.end();

      // If process doesn't exit gracefully, force kill after timeout
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.kill();
        }
      }, 3000);
    });
  }

  /**
   * Force kill the process
   */
  kill(): void {
    if (this.process && !this.process.killed) {
      this.process.kill('SIGKILL');
      this.process = null;
      this.updateStatus('stopped');
    }
  }

  /**
   * Restart the language server
   */
  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  /**
   * Get the process stdin stream
   */
  getStdin(): NodeJS.WritableStream | null {
    return this.process?.stdin ?? null;
  }

  /**
   * Get the process stdout stream
   */
  getStdout(): NodeJS.ReadableStream | null {
    return this.process?.stdout ?? null;
  }

  /**
   * Get current status
   */
  getStatus(): ProcessStatus {
    return { ...this.status };
  }

  /**
   * Check if the process is running
   */
  isRunning(): boolean {
    return this.status.status === 'running' && this.process !== null;
  }

  /**
   * Handle process exit
   */
  private handleExit(_code: number | null, _signal: string | null): void {
    this.stopHealthCheck();

    const wasRunning = this.status.status === 'running';
    this.updateStatus('stopped', undefined, undefined);

    // Auto-restart if not intentional shutdown
    if (!this.isShuttingDown && wasRunning && this.restartCount < this.options.restartAttempts) {
      this.restartCount++;
      setTimeout(() => {
        this.start().catch((error) => {
          this.emit('error', error);
        });
      }, this.options.restartDelayMs);
    }

    this.process = null;
  }

  /**
   * Update the process status
   */
  private updateStatus(
    status: ProcessStatus['status'],
    lastError?: string,
    pid?: number
  ): void {
    const oldStatus = this.status.status;
    this.status = {
      name: this.status.name,
      status,
      pid: pid ?? (status === 'running' ? this.process?.pid : undefined),
      uptimeMs: status === 'running' ? Date.now() - this.startTime : undefined,
      lastError,
    };

    if (oldStatus !== status) {
      this.emit('status-change', this.status);
    }
  }

  /**
   * Start health check timer
   */
  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(() => {
      if (this.process && !this.process.killed) {
        // On Windows, we can't use pid to check if process is alive
        // Instead, we rely on exit event
        this.status.uptimeMs = Date.now() - this.startTime;
      }
    }, this.options.healthCheckIntervalMs);
  }

  /**
   * Stop health check timer
   */
  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }
}

/**
 * Create a process manager
 */
export function createLSPProcessManager(
  name: string,
  config: LSPServerConfig,
  options?: ProcessOptions
): LSPProcessManager {
  return new LSPProcessManager(name, config, options);
}