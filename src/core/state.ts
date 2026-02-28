/**
 * Agent State Management
 * Handles state persistence and recovery
 */

import type {
  AgentConfig,
  Context,
  Message,
} from '../types/index.js';

export interface AgentStateSnapshot {
  version: string;
  timestamp: number;
  config: AgentConfig;
  context: Context;
  metadata: {
    totalTokensUsed: number;
    stepsExecuted: number;
    lastToolUsed?: string;
  };
}

export class AgentStateManager {
  private static readonly VERSION = '1.0.0';

  private snapshots: Map<string, AgentStateSnapshot>;
  private autoSaveEnabled: boolean;

  constructor(options: {
    autoSave?: boolean;
    autoSaveIntervalMs?: number;
  } = {}) {
    this.snapshots = new Map();
    this.autoSaveEnabled = options.autoSave ?? true;
    void options.autoSaveIntervalMs; // Reserved for future use
  }

  /**
   * Create a snapshot of current agent state
   */
  createSnapshot(
    _sessionId: string,
    config: AgentConfig,
    context: Context,
    metadata: AgentStateSnapshot['metadata']
  ): AgentStateSnapshot {
    return {
      version: AgentStateManager.VERSION,
      timestamp: Date.now(),
      config,
      context: this.sanitizeContext(context),
      metadata,
    };
  }

  /**
   * Save a snapshot
   */
  async saveSnapshot(
    sessionId: string,
    snapshot: AgentStateSnapshot,
    toDisk: boolean = this.autoSaveEnabled
  ): Promise<void> {
    this.snapshots.set(sessionId, snapshot);

    if (toDisk) {
      await this.saveToDisk(sessionId, snapshot);
    }
  }

  /**
   * Load a snapshot
   */
  async loadSnapshot(sessionId: string, fromDisk: boolean = true): Promise<AgentStateSnapshot | null> {
    if (this.snapshots.has(sessionId)) {
      return this.snapshots.get(sessionId)!;
    }

    if (fromDisk) {
      return await this.loadFromDisk(sessionId);
    }

    return null;
  }

  /**
   * List all available snapshots
   */
  listSnapshots(): Array<{ sessionId: string; timestamp: number; metadata: AgentStateSnapshot['metadata'] }> {
    return Array.from(this.snapshots.entries()).map(([id, snapshot]) => ({
      sessionId: id,
      timestamp: snapshot.timestamp,
      metadata: snapshot.metadata,
    }));
  }

  /**
   * Delete a snapshot
   */
  async deleteSnapshot(sessionId: string, fromDisk: boolean = true): Promise<void> {
    this.snapshots.delete(sessionId);

    if (fromDisk) {
      await this.deleteFromDisk(sessionId);
    }
  }

  /**
   * Clear all snapshots
   */
  async clearSnapshots(): Promise<void> {
    this.snapshots.clear();
    await this.clearFromDisk();
  }

  /**
   * Sanitize context before saving (remove sensitive data, etc.)
   */
  private sanitizeContext(context: Context): Context {
    return {
      ...context,
      messages: context.messages.map(msg => this.sanitizeMessage(msg)),
    };
  }

  /**
   * Sanitize individual message
   */
  private sanitizeMessage(message: Message): Message {
    // Remove sensitive content (API keys, tokens, etc.)
    let content = message.content;

    // Simple patterns to redact (in production, use more sophisticated methods)
    const sensitivePatterns = [
      /sk-ant-[a-zA-Z0-9_-]{40,}/g,  // Anthropic API keys
      /Bearer\s+[a-zA-Z0-9_-]{20,}/g, // Bearer tokens
      /password["\s:=]+[^\s"']+/gi,   // Passwords
    ];

    for (const pattern of sensitivePatterns) {
      content = content.replace(pattern, '[REDACTED]');
    }

    return { ...message, content };
  }

  /**
   * Save snapshot to disk
   */
  private async saveToDisk(sessionId: string, snapshot: AgentStateSnapshot): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');

    const stateDir = path.join(process.cwd(), '.nanoagent');
    const stateFile = path.join(stateDir, `${sessionId}.json`);

    try {
      await fs.mkdir(stateDir, { recursive: true });
      await fs.writeFile(stateFile, JSON.stringify(snapshot, null, 2), 'utf-8');
    } catch (error) {
      console.warn('Failed to save snapshot to disk:', (error as Error).message);
    }
  }

  /**
   * Load snapshot from disk
   */
  private async loadFromDisk(sessionId: string): Promise<AgentStateSnapshot | null> {
    const fs = await import('fs/promises');
    const path = await import('path');

    const stateFile = path.join(process.cwd(), '.nanoagent', `${sessionId}.json`);

    try {
      const content = await fs.readFile(stateFile, 'utf-8');
      return JSON.parse(content) as AgentStateSnapshot;
    } catch (error) {
      return null;
    }
  }

  /**
   * Delete snapshot from disk
   */
  private async deleteFromDisk(sessionId: string): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');

    const stateFile = path.join(process.cwd(), '.nanoagent', `${sessionId}.json`);

    try {
      await fs.unlink(stateFile);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  }

  /**
   * Clear all snapshots from disk
   */
  private async clearFromDisk(): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');

    const stateDir = path.join(process.cwd(), '.nanoagent');

    try {
      const files = await fs.readdir(stateDir);

      for (const file of files) {
        if (file.endsWith('.json')) {
          await fs.unlink(path.join(stateDir, file));
        }
      }
    } catch (error) {
      // Ignore if directory doesn't exist
    }
  }

  /**
   * Enable or disable auto-save
   */
  setAutoSave(enabled: boolean): void {
    this.autoSaveEnabled = enabled;
  }

  /**
   * Get auto-save status
   */
  isAutoSaveEnabled(): boolean {
    return this.autoSaveEnabled;
  }

  /**
   * Export all snapshots as JSON
   */
  exportSnapshots(): string {
    const data = Object.fromEntries(this.snapshots);
    return JSON.stringify(data, null, 2);
  }

  /**
   * Import snapshots from JSON
   */
  importSnapshots(json: string): void {
    const data = JSON.parse(json) as Record<string, AgentStateSnapshot>;

    for (const [sessionId, snapshot] of Object.entries(data)) {
      this.snapshots.set(sessionId, snapshot);
    }
  }
}
