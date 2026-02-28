/**
 * Sandbox Execution
 * Provides safe execution environment for code
 */

export interface SandboxOptions {
  allowedPaths?: string[];
  deniedPaths?: string[];
  timeoutMs?: number;
  maxMemoryMB?: number;
  maxCpuTimeMs?: number;
}

export interface SandboxResult {
  success: boolean;
  output?: string;
  error?: string;
  durationMs: number;
}

/**
 * Path-based sandbox that restricts file access
 */
export class PathSandbox {
  private allowedPaths: Set<string>;
  private deniedPaths: Set<string>;

  constructor(options: { allowed?: string[]; denied?: string[] } = {}) {
    this.allowedPaths = new Set(options.allowed || [process.cwd()]);
    this.deniedPaths = new Set(options.denied || []);
  }

  /**
   * Check if a path is allowed
   */
  isPathAllowed(path: string): boolean {
    const normalizedPath = this.normalizePath(path);

    // Check denied paths first
    for (const denied of this.deniedPaths) {
      if (normalizedPath.startsWith(this.normalizePath(denied))) {
        return false;
      }
    }

    // Check if path is within allowed paths
    for (const allowed of this.allowedPaths) {
      if (normalizedPath.startsWith(this.normalizePath(allowed))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Add an allowed path
   */
  addAllowedPath(path: string): void {
    this.allowedPaths.add(path);
  }

  /**
   * Add a denied path
   */
  addDeniedPath(path: string): void {
    this.deniedPaths.add(path);
  }

  /**
   * Get allowed paths
   */
  getAllowedPaths(): string[] {
    return Array.from(this.allowedPaths);
  }

  /**
   * Get denied paths
   */
   getDeniedPaths(): string[] {
    return Array.from(this.deniedPaths);
  }

  /**
   * Normalize path for comparison
   */
  private normalizePath(path: string): string {
    const { resolve, normalize } = require('path');
    return normalize(resolve(path)).toLowerCase();
  }
}

/**
 * Resource-limited sandbox
 * Note: Full sandboxing requires additional dependencies like isolated-vm
 * This provides basic resource monitoring
 */
export class ResourceSandbox {
  private timeoutMs: number;
  private maxMemoryMB: number;

  constructor(options: SandboxOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.maxMemoryMB = options.maxMemoryMB ?? 512;
    // maxCpuTimeMs reserved for future use
  }

  /**
   * Execute a function with resource limits
   */
  async execute<T>(
    fn: () => Promise<T> | T
  ): Promise<{ result: T; durationMs: number }> {
    const startTime = Date.now();

    // Wrap with timeout
    const result = await Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Sandbox timeout')), this.timeoutMs)
      ),
    ]);

    const durationMs = Date.now() - startTime;

    // Check memory usage (simplified)
    const memoryUsage = process.memoryUsage();
    const memoryMB = memoryUsage.heapUsed / 1024 / 1024;

    if (memoryMB > this.maxMemoryMB) {
      throw new Error(`Memory limit exceeded: ${memoryMB.toFixed(2)}MB > ${this.maxMemoryMB}MB`);
    }

    return { result, durationMs };
  }

  /**
   * Execute a command with resource limits
   */
  async executeCommand(command: string): Promise<SandboxResult> {
    const startTime = Date.now();

    try {
      const { execa } = await import('execa');

      const result = await execa(command, {
        shell: true,
        timeout: this.timeoutMs,
        stdio: 'pipe',
      });

      return {
        success: result.exitCode === 0,
        output: result.stdout,
        error: result.stderr || undefined,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Set timeout
   */
  setTimeout(ms: number): void {
    this.timeoutMs = ms;
  }

  /**
   * Set max memory
   */
  setMaxMemory(mb: number): void {
    this.maxMemoryMB = mb;
  }
}

/**
 * Combined sandbox with path and resource limits
 */
export class Sandbox {
  private pathSandbox: PathSandbox;
  private resourceSandbox: ResourceSandbox;

  constructor(options: SandboxOptions = {}) {
    this.pathSandbox = new PathSandbox({
      allowed: options.allowedPaths,
      denied: options.deniedPaths,
    });

    this.resourceSandbox = new ResourceSandbox(options);
  }

  /**
   * Execute a function with all sandbox constraints
   */
  async execute<T>(fn: () => Promise<T> | T): Promise<T> {
    return this.resourceSandbox.execute(fn).then(r => r.result);
  }

  /**
   * Execute a command with all sandbox constraints
   */
  async executeCommand(command: string): Promise<SandboxResult> {
    return this.resourceSandbox.executeCommand(command);
  }

  /**
   * Check if a path is allowed
   */
  isPathAllowed(path: string): boolean {
    return this.pathSandbox.isPathAllowed(path);
  }

  /**
   * Path sandbox access
   */
  get path(): PathSandbox {
    return this.pathSandbox;
  }

  /**
   * Resource sandbox access
   */
  get resource(): ResourceSandbox {
    return this.resourceSandbox;
  }
}

/**
 * Create a default sandbox instance
 */
export function createSandbox(options?: SandboxOptions): Sandbox {
  return new Sandbox(options);
}
