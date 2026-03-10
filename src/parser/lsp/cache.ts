/**
 * LSP Result Cache
 * Caches LSP responses to improve performance
 */

import * as crypto from 'crypto';
import * as fs from 'fs';

export interface CacheEntry<T> {
  key: string;
  value: T;
  timestamp: number;
  filePath: string;
  fileMtime: number;
  ttlMs: number;
}

export interface CacheOptions {
  enabled?: boolean;
  ttlMs?: number;
  maxSize?: number;
}

interface FileMtimeCache {
  mtime: number;
  checkedAt: number;
}

/**
 * LSP Result Cache with TTL and file modification tracking
 */
export class LSPCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private options: Required<CacheOptions>;
  private mtimeCache: Map<string, FileMtimeCache> = new Map();
  private mtimeCheckIntervalMs = 5000; // Check file mtime every 5 seconds max

  constructor(options: CacheOptions = {}) {
    this.options = {
      enabled: options.enabled ?? true,
      ttlMs: options.ttlMs ?? 30000, // 30 seconds default TTL
      maxSize: options.maxSize ?? 1000,
    };
  }

  /**
   * Generate a cache key
   */
  generateKey(
    method: string,
    filePath: string,
    position?: { line: number; column: number }
  ): string {
    const parts = [method, filePath];
    if (position) {
      parts.push(`${position.line}:${position.column}`);
    }
    return crypto.createHash('md5').update(parts.join('|')).digest('hex');
  }

  /**
   * Get a cached result
   */
  get<T>(key: string, filePath: string): T | null {
    if (!this.options.enabled) {
      return null;
    }

    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) {
      return null;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > entry.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    // Check file modification time
    if (!this.isFileUnchanged(filePath, entry.fileMtime)) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Set a cached result
   */
  set<T>(key: string, value: T, filePath: string, ttlMs?: number): void {
    if (!this.options.enabled) {
      return;
    }

    // Evict oldest entries if cache is full
    if (this.cache.size >= this.options.maxSize) {
      this.evictOldest();
    }

    const mtime = this.getFileMtime(filePath);
    const entry: CacheEntry<T> = {
      key,
      value,
      timestamp: Date.now(),
      filePath,
      fileMtime: mtime,
      ttlMs: ttlMs ?? this.options.ttlMs,
    };

    this.cache.set(key, entry);
  }

  /**
   * Invalidate all cache entries for a file
   */
  invalidateFile(filePath: string): void {
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache) {
      if (entry.filePath === filePath) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }

    this.mtimeCache.delete(filePath);
  }

  /**
   * Invalidate all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.mtimeCache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate?: number;
  } {
    return {
      size: this.cache.size,
      maxSize: this.options.maxSize,
    };
  }

  /**
   * Check if a file has been modified since the cached time
   */
  private isFileUnchanged(filePath: string, cachedMtime: number): boolean {
    const now = Date.now();
    const cached = this.mtimeCache.get(filePath);

    // Use cached mtime if checked recently
    if (cached && now - cached.checkedAt < this.mtimeCheckIntervalMs) {
      return cached.mtime === cachedMtime;
    }

    const currentMtime = this.getFileMtime(filePath);
    this.mtimeCache.set(filePath, { mtime: currentMtime, checkedAt: now });

    return currentMtime === cachedMtime;
  }

  /**
   * Get file modification time
   */
  private getFileMtime(filePath: string): number {
    try {
      const stat = fs.statSync(filePath);
      return stat.mtimeMs;
    } catch {
      return 0;
    }
  }

  /**
   * Evict the oldest cache entries (LRU)
   */
  private evictOldest(): void {
    // Remove 10% of entries, oldest first
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

    const toRemove = Math.ceil(this.options.maxSize * 0.1);
    for (let i = 0; i < toRemove && i < entries.length; i++) {
      this.cache.delete(entries[i][0]);
    }
  }

  /**
   * Enable caching
   */
  enable(): void {
    this.options.enabled = true;
  }

  /**
   * Disable caching
   */
  disable(): void {
    this.options.enabled = false;
  }

  /**
   * Check if caching is enabled
   */
  isEnabled(): boolean {
    return this.options.enabled;
  }
}

/**
 * Create an LSP cache
 */
export function createLSPCache(options?: CacheOptions): LSPCache {
  return new LSPCache(options);
}