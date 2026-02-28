/**
 * Session Management
 * Handles session persistence and retrieval
 */

import type { Context, Session, AgentConfig } from '../types/index.js';
import { NanoDatabase } from './database.js';

export interface SessionOptions {
  sessionId?: string;
  context?: Partial<Context>;
  config?: Partial<AgentConfig>;
}

export class SessionManager {
  private db: NanoDatabase;

  constructor(db: NanoDatabase) {
    this.db = db;
  }

  /**
   * Create a new session
   */
  async createSession(options: SessionOptions = {}): Promise<Session> {
    const sessionId = options.sessionId || crypto.randomUUID();
    const now = Date.now();

    const context: Context = {
      messages: [],
      memory: [],
      observations: [],
      metadata: {
        sessionId,
        startTime: now,
        lastUpdate: now,
        tokensUsed: 0,
      },
      ...options.context,
    };

    const session: Session = {
      id: sessionId,
      createdAt: now,
      updatedAt: now,
      context,
      config: options.config ? { ...this.getDefaultConfig(), ...options.config } : this.getDefaultConfig(),
    };

    this.saveSession(session);

    return session;
  }

  /**
   * Save a session to the database
   */
  saveSession(session: Session): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO sessions (id, created_at, updated_at, context_json, config_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      session.id,
      session.createdAt,
      session.updatedAt,
      JSON.stringify(session.context),
      JSON.stringify(session.config)
    );
  }

  /**
   * Load a session from the database
   */
  loadSession(sessionId: string): Session | null {
    const row = this.db.get<{
      id: string;
      created_at: number;
      updated_at: number;
      context_json: string;
      config_json: string;
    }>(
      'SELECT id, created_at, updated_at, context_json, config_json FROM sessions WHERE id = ?',
      [sessionId]
    );

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      context: JSON.parse(row.context_json) as Context,
      config: JSON.parse(row.config_json) as AgentConfig,
    };
  }

  /**
   * Get all sessions
   */
  getAllSessions(): Session[] {
    const rows = this.db.all<{
      id: string;
      created_at: number;
      updated_at: number;
      context_json: string;
      config_json: string;
    }>('SELECT id, created_at, updated_at, context_json, config_json FROM sessions ORDER BY updated_at DESC');

    return rows.map(row => ({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      context: JSON.parse(row.context_json) as Context,
      config: JSON.parse(row.config_json) as AgentConfig,
    }));
  }

  /**
   * Get session summaries (lightweight)
   */
  getSessionSummaries(): Array<{
    id: string;
    createdAt: number;
    updatedAt: number;
    messageCount: number;
    tokensUsed: number;
  }> {
    const rows = this.db.get<{ json: string }>(
      `SELECT json_group_array(
         json_object(
           'id', id,
           'createdAt', created_at,
           'updatedAt', updated_at,
           'messageCount', json_extract(context_json, '$.metadata.tokensUsed')
         )
       ) as json
       FROM sessions`
    );

    if (!rows?.json) {
      return [];
    }

    const sessions = JSON.parse(rows.json) as Array<{
      id: string;
      createdAt: number;
      updatedAt: number;
      messageCount: number;
    }>;

    // Note: This is a simplified version
    return sessions.map(s => ({
      ...s,
      tokensUsed: s.messageCount || 0,
    }));
  }

  /**
   * Update a session
   */
  updateSession(sessionId: string, updates: Partial<Session>): boolean {
    const existing = this.loadSession(sessionId);

    if (!existing) {
      return false;
    }

    const updated: Session = {
      ...existing,
      ...updates,
      id: existing.id, // Preserve ID
      updatedAt: Date.now(),
    };

    this.saveSession(updated);
    return true;
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId: string): boolean {
    const result = this.db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    return result.changes > 0;
  }

  /**
   * Delete old sessions
   */
  deleteOldSessions(olderThanMs: number): number {
    const cutoff = Date.now() - olderThanMs;
    const result = this.db.prepare('DELETE FROM sessions WHERE updated_at < ?').run(cutoff);
    return result.changes;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): Session | null {
    return this.loadSession(sessionId);
  }

  /**
   * Get most recent session
   */
  getRecentSession(): Session | null {
    const row = this.db.get<{
      id: string;
      created_at: number;
      updated_at: number;
      context_json: string;
      config_json: string;
    }>(
      'SELECT id, created_at, updated_at, context_json, config_json FROM sessions ORDER BY updated_at DESC LIMIT 1'
    );

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      context: JSON.parse(row.context_json) as Context,
      config: JSON.parse(row.config_json) as AgentConfig,
    };
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): AgentConfig {
    return {
      llm: {
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        model: 'claude-3-5-sonnet-20241022',
        maxTokens: 4096,
        temperature: 0,
      },
      tools: {
        enabled: ['read', 'write', 'edit', 'bash', 'search', 'glob'],
        mcpServers: [],
      },
      security: {
        permissionLevel: 'ask',
        sandboxEnabled: true,
      },
      compression: {
        maxContextTokens: 200000,
        memoryStrategy: 'lru',
      },
      storage: {
        dbPath: '.nanoagent/nanoagent.db',
        sessionTTL: 7 * 24 * 60 * 60 * 1000, // 7 days
      },
    };
  }

  /**
   * Export sessions as JSON
   */
  exportSessions(): string {
    const sessions = this.getAllSessions();
    return JSON.stringify(sessions, null, 2);
  }

  /**
   * Import sessions from JSON
   */
  importSessions(json: string): number {
    const sessions = JSON.parse(json) as Session[];

    let imported = 0;

    for (const session of sessions) {
      this.saveSession(session);
      imported++;
    }

    return imported;
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions(ttl: number = 7 * 24 * 60 * 60 * 1000): number {
    return this.deleteOldSessions(ttl);
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    const result = this.db.get<{ count: number }>('SELECT COUNT(*) as count FROM sessions');
    return result?.count || 0;
  }
}

/**
 * Create a session manager
 */
export function createSessionManager(db: NanoDatabase): SessionManager {
  return new SessionManager(db);
}

/**
 * Get the global session manager
 */
export async function getSessionManager(): Promise<SessionManager> {
  const { getDatabase } = await import('./database.js');
  const db = await getDatabase();
  return createSessionManager(db);
}
