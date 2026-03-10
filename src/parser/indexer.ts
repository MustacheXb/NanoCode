/**
 * Code Indexer
 * Creates and manages symbol indexes for codebases
 */

import type { CodeSymbol } from '../types/index.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import { glob } from 'fast-glob';
import { TreeSitterParser, createTreeSitterParser } from './tree-sitter/parser.js';

export interface IndexerOptions {
  includePatterns?: string[];
  excludePatterns?: string[];
  ignoreDirs?: string[];
  useTreeSitter?: boolean;
}

export interface IndexResult {
  symbols: CodeSymbol[];
  filesIndexed: number;
  durationMs: number;
}

/**
 * Code indexer for building symbol databases
 */
export class CodeIndexer {
  private symbols: Map<string, CodeSymbol[]>;
  private symbolMap: Map<string, CodeSymbol>; // Quick lookup by unique key
  private options: Required<IndexerOptions>;
  private treeSitterParser: TreeSitterParser | null = null;

  constructor(options: IndexerOptions = {}) {
    this.symbols = new Map();
    this.symbolMap = new Map();
    this.options = {
      includePatterns: options.includePatterns || ['**/*.{ts,js,py,rs,go,java}'],
      excludePatterns: options.excludePatterns || ['**/node_modules/**', '**/dist/**', '**/build/**'],
      ignoreDirs: options.ignoreDirs || ['node_modules', 'dist', 'build', '.git'],
      useTreeSitter: options.useTreeSitter ?? true,
    };

    if (this.options.useTreeSitter) {
      this.treeSitterParser = createTreeSitterParser();
    }
  }

  /**
   * Initialize the indexer (loads Tree-sitter)
   */
  async init(): Promise<void> {
    if (this.treeSitterParser) {
      await this.treeSitterParser.init();
    }
  }

  /**
   * Index a directory
   */
  async indexDirectory(dirPath: string): Promise<IndexResult> {
    const startTime = Date.now();

    // Find all files to index
    const files = await glob(this.options.includePatterns.join(','), {
      cwd: dirPath,
      ignore: this.options.excludePatterns,
      onlyFiles: true,
    });

    // Process each file
    const symbols: CodeSymbol[] = [];

    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      const fileSymbols = await this.indexFile(fullPath);
      symbols.push(...fileSymbols);
    }

    // Store symbols
    for (const symbol of symbols) {
      this.addSymbol(symbol);
    }

    return {
      symbols,
      filesIndexed: files.length,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Index a single file
   */
  async indexFile(filePath: string): Promise<CodeSymbol[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();

    // Use appropriate parser based on file extension
    const languageMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'tsx',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.rs': 'rust',
      '.go': 'go',
      '.java': 'java',
      '.c': 'c',
      '.cpp': 'cpp',
      '.h': 'c',
      '.hpp': 'cpp',
    };

    const language = languageMap[ext] || 'unknown';

    // Try Tree-sitter first, fall back to regex
    if (this.treeSitterParser && this.treeSitterParser.isLanguageSupported(language)) {
      try {
        const tsSymbols = await this.treeSitterParser.extractSymbols(content, filePath, language);
        if (tsSymbols.length > 0) {
          return tsSymbols;
        }
      } catch (error) {
        // Fall back to regex extraction
        console.warn(`Tree-sitter parsing failed for ${filePath}, using regex fallback`);
      }
    }

    // Fallback: Extract symbols using regex
    return this.extractSymbolsRegex(content, filePath, language);
  }

  /**
   * Extract symbols from code using regex patterns
   * Fallback when Tree-sitter is not available
   */
  private extractSymbolsRegex(
    content: string,
    filePath: string,
    language: string
  ): CodeSymbol[] {
    const symbols: CodeSymbol[] = [];
    const lines = content.split('\n');

    // Define patterns for different languages
    const patterns = this.getPatternsForLanguage(language);

    for (const { kind, pattern } of patterns) {
      let match;

      for (let i = 0; i < lines.length; i++) {
        pattern.lastIndex = 0;
        const line = lines[i];

        while ((match = pattern.exec(line)) !== null) {
          const name = match[1] || match[2] || match[3];
          if (!name) continue;

          symbols.push({
            name,
            kind,
            filePath,
            range: {
              start: { line: i, column: line.indexOf(match[0]) },
              end: { line: i, column: line.indexOf(match[0]) + match[0].length },
            },
          });
        }
      }
    }

    return symbols;
  }

  /**
   * Get regex patterns for a language
   */
  private getPatternsForLanguage(language: string): Array<{ kind: CodeSymbol['kind']; pattern: RegExp }> {
    const commonPatterns = [
      { kind: 'function' as const, pattern: /(?:function|def|func|fn)\s+(\w+)/g },
      { kind: 'class' as const, pattern: /class\s+(\w+)/g },
    ];

    const languagePatterns: Record<string, Array<{ kind: CodeSymbol['kind']; pattern: RegExp }>> = {
      javascript: [
        { kind: 'function', pattern: /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?function|\s*(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>)/g },
        { kind: 'class', pattern: /class\s+(\w+)/g },
        { kind: 'variable', pattern: /(?:const|let|var)\s+(\w+)\s*=/g },
      ],
      typescript: [
        { kind: 'function', pattern: /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?function|\s*(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>)/g },
        { kind: 'class', pattern: /class\s+(\w+)/g },
        { kind: 'interface', pattern: /interface\s+(\w+)/g },
        { kind: 'type', pattern: /type\s+(\w+)\s*=/g },
        { kind: 'enum', pattern: /enum\s+(\w+)/g },
      ],
      python: [
        { kind: 'function', pattern: /def\s+(\w+)/g },
        { kind: 'class', pattern: /class\s+(\w+)/g },
        { kind: 'variable', pattern: /^(\w+)\s*=/gm },
      ],
      rust: [
        { kind: 'function', pattern: /fn\s+(\w+)/g },
        { kind: 'type', pattern: /(?:struct|enum)\s+(\w+)/g },
        { kind: 'variable', pattern: /(?:let|const)\s+(?:mut\s+)?(\w+)/g },
      ],
      go: [
        { kind: 'function', pattern: /func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)/g },
        { kind: 'type', pattern: /type\s+(\w+)\s+(?:struct|interface)/g },
      ],
      java: [
        { kind: 'function', pattern: /(?:public|private|protected)?\s*(?:static)?\s*\w+\s+(\w+)\s*\([^)]*\)/g },
        { kind: 'class', pattern: /class\s+(\w+)/g },
        { kind: 'interface', pattern: /interface\s+(\w+)/g },
      ],
    };

    return languagePatterns[language] || commonPatterns;
  }

  /**
   * Add a symbol to the index
   */
  addSymbol(symbol: CodeSymbol): void {
    const key = this.getSymbolKey(symbol);

    if (!this.symbols.has(symbol.filePath)) {
      this.symbols.set(symbol.filePath, []);
    }

    this.symbols.get(symbol.filePath)!.push(symbol);
    this.symbolMap.set(key, symbol);
  }

  /**
   * Get a unique key for a symbol
   */
  private getSymbolKey(symbol: CodeSymbol): string {
    return `${symbol.filePath}:${symbol.kind}:${symbol.name}:${symbol.range.start.line}:${symbol.range.start.column}`;
  }

  /**
   * Search for symbols by name
   */
  searchByName(query: string): CodeSymbol[] {
    const results: CodeSymbol[] = [];

    for (const symbols of this.symbols.values()) {
      for (const symbol of symbols) {
        if (symbol.name.toLowerCase().includes(query.toLowerCase())) {
          results.push(symbol);
        }
      }
    }

    return results;
  }

  /**
   * Search for symbols by kind
   */
  searchByKind(kind: CodeSymbol['kind']): CodeSymbol[] {
    const results: CodeSymbol[] = [];

    for (const symbols of this.symbols.values()) {
      for (const symbol of symbols) {
        if (symbol.kind === kind) {
          results.push(symbol);
        }
      }
    }

    return results;
  }

  /**
   * Get symbols for a specific file
   */
  getFileSymbols(filePath: string): CodeSymbol[] {
    return this.symbols.get(filePath) || [];
  }

  /**
   * Find symbols in a specific file matching a query
   */
  findInFile(filePath: string, query: string): CodeSymbol[] {
    const fileSymbols = this.getFileSymbols(filePath);
    return fileSymbols.filter(s =>
      s.name.toLowerCase().includes(query.toLowerCase())
    );
  }

  /**
   * Get all symbols
   */
  getAllSymbols(): CodeSymbol[] {
    const all: CodeSymbol[] = [];

    for (const symbols of this.symbols.values()) {
      all.push(...symbols);
    }

    return all;
  }

  /**
   * Clear the index
   */
  clear(): void {
    this.symbols.clear();
    this.symbolMap.clear();
  }

  /**
   * Get index statistics
   */
  getStats(): {
    totalSymbols: number;
    totalFiles: number;
    byKind: Record<CodeSymbol['kind'], number>;
  } {
    const byKind: Record<CodeSymbol['kind'], number> = {} as any;

    for (const symbols of this.symbols.values()) {
      for (const symbol of symbols) {
        byKind[symbol.kind] = (byKind[symbol.kind] || 0) + 1;
      }
    }

    return {
      totalSymbols: this.symbolMap.size,
      totalFiles: this.symbols.size,
      byKind,
    };
  }

  /**
   * Export index as JSON
   */
  export(): string {
    return JSON.stringify({
      symbols: Array.from(this.symbolMap.values()),
      files: Array.from(this.symbols.keys()),
    }, null, 2);
  }

  /**
   * Import index from JSON
   */
  import(json: string): void {
    const data = JSON.parse(json) as {
      symbols: CodeSymbol[];
      files: string[];
    };

    this.clear();

    for (const symbol of data.symbols) {
      this.addSymbol(symbol);
    }
  }
}

/**
 * Create a code indexer
 */
export function createCodeIndexer(options?: IndexerOptions): CodeIndexer {
  return new CodeIndexer(options);
}