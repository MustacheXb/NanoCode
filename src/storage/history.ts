/**
 * History Management
 * Tracks and retrieves execution history
 */

import type { HistoryRecord } from '../types/index.js';
import { NanoDatabase } from './database.js';

export class HistoryManager {
  private db: NanoDatabase;

  constructor(db: NanoDatabase) {
    this.db = db;
  }

  /**
   * Add a history record
   */
  addRecord(sessionId: string, type: HistoryRecord['type'], content: string): string {
    const id = crypto.randomUUID();
    const now = Date.now();

    this.db.prepare(`
      INSERT INTO history (id, session_id, timestamp, type, content)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, sessionId, now, type, content);

    return id;
  }

  /**
   * Get a history record by ID
   */
  getRecord(id: string): HistoryRecord | null {
    const row = this.db.get<{
      id: string;
      session_id: string;
      timestamp: number;
      type: string;
      content: string;
    }>(
      'SELECT id, session_id, timestamp, type, content FROM history WHERE id = ?',
      [id]
    );

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      sessionId: row.session_id,
      timestamp: row.timestamp,
      type: row.type as HistoryRecord['type'],
      content: row.content,
    };
  }

  /**
   * Get all history for a session
   */
  getSessionHistory(sessionId: string): HistoryRecord[] {
    const rows = this.db.all<{
      id: string;
      session_id: string;
      timestamp: number;
      type: string;
      content: string;
    }>(
      'SELECT id, session_id, timestamp, type, content FROM history WHERE session_id = ? ORDER BY timestamp ASC',
      [sessionId]
    );

    return rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      timestamp: row.timestamp,
      type: row.type as HistoryRecord['type'],
      content: row.content,
    }));
  }

  /**
   * Get recent history records
   */
  getRecentHistory(limit: number = 50): HistoryRecord[] {
    const rows = this.db.all<{
      id: string;
      session_id: string;
      timestamp: number;
      type: string;
      content: string;
    }>(
      'SELECT id, session_id, timestamp, type, content FROM history ORDER BY timestamp DESC LIMIT ?',
      [limit]
    );

    return rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      timestamp: row.timestamp,
      type: row.type as HistoryRecord['type'],
      content: row.content,
    })).reverse(); // Reverse to get chronological order
  }

  /**
   * Get history by type
   */
  getHistoryByType(sessionId: string, type: HistoryRecord['type']): HistoryRecord[] {
    const rows = this.db.all<{
      id: string;
      session_id: string;
      timestamp: number;
      type: string;
      content: string;
    }>(
      'SELECT id, session_id, timestamp, type, content FROM history WHERE session_id = ? AND type = ? ORDER BY timestamp ASC',
      [sessionId, type]
    );

    return rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      timestamp: row.timestamp,
      type: row.type as HistoryRecord['type'],
      content: row.content,
    }));
  }

  /**
   * Search history
   */
  searchHistory(query: string, limit: number = 50): HistoryRecord[] {
    const rows = this.db.all<{
      id: string;
      session_id: string;
      timestamp: number;
      type: string;
      content: string;
    }>(
      `SELECT id, session_id, timestamp, type, content
       FROM history
       WHERE content LIKE ?
       ORDER BY timestamp DESC
       LIMIT ?`,
      [`%${query}%`, limit]
    );

    return rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      timestamp: row.timestamp,
      type: row.type as HistoryRecord['type'],
      content: row.content,
    }));
  }

  /**
   * Delete a history record
   */
  deleteRecord(id: string): boolean {
    const result = this.db.prepare('DELETE FROM history WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * Delete all history for a session
   */
  deleteSessionHistory(sessionId: string): number {
    const result = this.db.prepare('DELETE FROM history WHERE session_id = ?').run(sessionId);
    return result.changes;
  }

  /**
   * Delete old history records
   */
  deleteOldRecords(olderThanMs: number): number {
    const cutoff = Date.now() - olderThanMs;
    const result = this.db.prepare('DELETE FROM history WHERE timestamp < ?').run(cutoff);
    return result.changes;
  }

  /**
   * Get history statistics
   */
  getStats(sessionId?: string): {
    totalRecords: number;
    messageRecords: number;
    toolCallRecords: number;
    observationRecords: number;
  } {
    const baseQuery = sessionId
      ? 'SELECT type, COUNT(*) as count FROM history WHERE session_id = ? GROUP BY type'
      : 'SELECT type, COUNT(*) as count FROM history GROUP BY type';

    const rows = this.db.all<{ type: string; count: number }>(baseQuery, sessionId ? [sessionId] : []);

    const stats = {
      totalRecords: 0,
      messageRecords: 0,
      toolCallRecords: 0,
      observationRecords: 0,
    };

    for (const row of rows) {
      stats.totalRecords += row.count;

      switch (row.type) {
        case 'message':
          stats.messageRecords = row.count;
          break;
        case 'tool_call':
          stats.toolCallRecords = row.count;
          break;
        case 'observation':
          stats.observationRecords = row.count;
          break;
      }
    }

    return stats;
  }

  /**
   * Export history for a session
   */
  exportSessionHistory(sessionId: string): string {
    const records = this.getSessionHistory(sessionId);
    return JSON.stringify(records, null, 2);
  }

  /**
   * Get history timeline
   */
  getTimeline(sessionId: string, maxEvents: number = 100): Array<{
    timestamp: number;
    type: HistoryRecord['type'];
    summary: string;
  }> {
    const records = this.getSessionHistory(sessionId).slice(-maxEvents);

    return records.map(record => ({
      timestamp: record.timestamp,
      type: record.type,
      summary: record.content.substring(0, 100) + (record.content.length > 100 ? '...' : ''),
    }));
  }

  /**
   * Clear all history
   */
  clearAll(): number {
    const result = this.db.prepare('DELETE FROM history').run();
    return result.changes;
  }
}

/**
 * Create a history manager
 */
export function createHistoryManager(db: NanoDatabase): HistoryManager {
  return new HistoryManager(db);
}

/**
 * Get the global history manager
 */
export async function getHistoryManager(): Promise<HistoryManager> {
  const { getDatabase } = await import('./database.js');
  const db = await getDatabase();
  return createHistoryManager(db);
}
