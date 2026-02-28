/**
 * SQLite Database Wrapper
 * Handles persistent storage for sessions, history, etc.
 */

import Database from 'better-sqlite3';
import { promises as fs } from 'fs';
import * as path from 'path';

export interface DatabaseConfig {
  path: string;
  memory?: boolean;
  readonly?: boolean;
}

/**
 * Base database class with connection management
 */
export class NanoDatabase {
  private db: Database.Database | null = null;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  /**
   * Initialize the database connection
   */
  async initialize(): Promise<void> {
    if (this.db) {
      return;
    }

    const dbPath = this.config.path;

    // Ensure directory exists
    if (!this.config.memory) {
      const dir = path.dirname(dbPath);
      await fs.mkdir(dir, { recursive: true });
    }

    this.db = new Database(dbPath, {
      readonly: this.config.readonly,
    });

    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');

    // Run migrations
    await this.runMigrations();
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Execute a SQL statement
   */
  prepare(sql: string): Database.Statement {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return this.db.prepare(sql);
  }

  /**
   * Execute a statement with parameters
   */
  execute(sql: string, params: unknown[] = []): void {
    const stmt = this.prepare(sql);
    stmt.run(...params);
  }

  /**
   * Get a single row
   */
  get<T>(sql: string, params: unknown[] = []): T | undefined {
    const stmt = this.prepare(sql);
    return stmt.get(...params) as T | undefined;
  }

  /**
   * Get all rows
   */
  all<T>(sql: string, params: unknown[] = []): T[] {
    const stmt = this.prepare(sql);
    return stmt.all(...params) as T[];
  }

  /**
   * Run migrations
   */
  private async runMigrations(): Promise<void> {
    if (!this.db) {
      return;
    }

    // Create migrations table if it doesn't exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      )
    `);

    // Check current version
    const result = this.get<{ version: number }>(
      'SELECT MAX(version) as version FROM migrations'
    );
    const currentVersion = result?.version || 0;

    // Define migrations
    const migrations = [
      {
        version: 1,
        sql: `
          CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            context_json TEXT NOT NULL,
            config_json TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at);
        `,
      },
      {
        version: 2,
        sql: `
          CREATE TABLE IF NOT EXISTS history (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            type TEXT NOT NULL,
            content TEXT NOT NULL,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
          );
          CREATE INDEX IF NOT EXISTS idx_history_session ON history(session_id);
          CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history(timestamp);
        `,
      },
      {
        version: 3,
        sql: `
          CREATE TABLE IF NOT EXISTS skills (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            description TEXT,
            alias_json TEXT,
            handler_code TEXT,
            category TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
        `,
      },
    ];

    // Run pending migrations
    for (const migration of migrations) {
      if (migration.version > currentVersion) {
        this.db.exec(migration.sql);
        this.db.prepare(
          'INSERT INTO migrations (version, applied_at) VALUES (?, ?)'
        ).run(migration.version, Date.now());
      }
    }
  }

  /**
   * Begin a transaction
   */
  transaction<T>(fn: () => T): T {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const tx = this.db.transaction(fn);
    return tx();
  }

  /**
   * Get database info
   */
  getInfo(): { path: string; size: number; memory: boolean } {
    const fsSync = require('fs');
    return {
      path: this.config.path,
      size: this.config.memory ? 0 : fsSync.statSync(this.config.path).size,
      memory: this.config.memory || false,
    };
  }

  /**
   * Vacuum the database
   */
  vacuum(): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    this.db.exec('VACUUM');
  }

  /**
   * Check database connection
   */
  isOpen(): boolean {
    return this.db !== null && this.db.open;
  }
}

/**
 * Create a database instance with default configuration
 */
export function createDatabase(config?: Partial<DatabaseConfig>): NanoDatabase {
  const defaultConfig: DatabaseConfig = {
    path: config?.path || path.join(process.cwd(), '.nanoagent', 'nanoagent.db'),
    memory: config?.memory || false,
    readonly: config?.readonly || false,
  };

  return new NanoDatabase(defaultConfig);
}

/**
 * Global database instance
 */
let globalDatabase: NanoDatabase | null = null;

/**
 * Get or create the global database instance
 */
export async function getDatabase(config?: Partial<DatabaseConfig>): Promise<NanoDatabase> {
  if (!globalDatabase) {
    globalDatabase = createDatabase(config);
    await globalDatabase.initialize();
  }

  return globalDatabase;
}
