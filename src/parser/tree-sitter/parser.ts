/**
 * Tree-sitter Parser
 * Real AST parsing using web-tree-sitter (WASM-based)
 */

import type { CodeNode, CodeSymbol } from '../../types/index.js';

export interface ParseOptions {
  includeComments?: boolean;
  includeWhitespace?: boolean;
}

export interface ParseResult {
  tree: CodeNode;
  language: string;
  parseTimeMs: number;
}

export interface TreeSitterNode {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  childCount: number;
  children: TreeSitterNode[];
  namedChildren: TreeSitterNode[];
}

export interface QueryMatch {
  pattern: number;
  captures: Record<string, TreeSitterNode>;
}

/**
 * Tree-sitter Parser Implementation
 */
export class TreeSitterParser {
  private Parser: unknown = null;
  private loadedLanguages: Map<string, unknown> = new Map();
  private initialized = false;

  constructor() {
    // Languages will be loaded on demand
  }

  /**
   * Initialize the parser (loads web-tree-sitter)
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Dynamic import of web-tree-sitter
      const module = await import('web-tree-sitter');
      this.Parser = (module as any).default ?? module;
      await (this.Parser as any).init();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize web-tree-sitter:', error);
      throw new Error(
        'web-tree-sitter not installed. Run: npm install web-tree-sitter'
      );
    }
  }

  /**
   * Load a language binding
   */
  async loadLanguage(language: string): Promise<boolean> {
    if (!this.initialized) {
      await this.init();
    }

    if (this.loadedLanguages.has(language)) {
      return true;
    }

    try {
      const lang = await this.loadLanguageBinding(language);
      if (lang) {
        this.loadedLanguages.set(language, lang);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`Failed to load language ${language}:`, error);
      return false;
    }
  }

  /**
   * Parse code into an AST
   */
  async parse(code: string, language: string, options: ParseOptions = {}): Promise<ParseResult> {
    const startTime = Date.now();

    if (!this.initialized) {
      await this.init();
    }

    const langLoaded = await this.loadLanguage(language);
    if (!langLoaded) {
      return this.simplifiedParse(code, language, options);
    }

    try {
      const parser = new (this.Parser as any)();
      const lang = this.loadedLanguages.get(language);
      parser.setLanguage(lang);

      const tree = parser.parse(code);
      const rootNode = tree.rootNode;

      const codeNode = this.convertNode(rootNode, options);

      return {
        tree: codeNode,
        language,
        parseTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      console.error(`Parse error for ${language}:`, error);
      return this.simplifiedParse(code, language, options);
    }
  }

  /**
   * Query the syntax tree
   */
  async query(
    _tree: CodeNode,
    _queryString: string,
    _language: string
  ): Promise<QueryMatch[]> {
    // Not implemented - requires original tree
    return [];
  }

  /**
   * Extract symbols from code
   */
  async extractSymbols(
    code: string,
    filePath: string,
    language: string
  ): Promise<CodeSymbol[]> {
    if (!this.initialized) {
      await this.init();
    }

    const langLoaded = await this.loadLanguage(language);
    if (!langLoaded) {
      return [];
    }

    try {
      const parser = new (this.Parser as any)();
      const lang = this.loadedLanguages.get(language);
      parser.setLanguage(lang);

      const tree = parser.parse(code);
      const rootNode = tree.rootNode;

      return this.extractSymbolsFromNode(rootNode, filePath, code);
    } catch (error) {
      console.error('Symbol extraction error:', error);
      return [];
    }
  }

  /**
   * Get the language for a file extension
   */
  getLanguageForFile(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();

    const languageMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'tsx',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      rs: 'rust',
      go: 'go',
      java: 'java',
      c: 'c',
      cpp: 'cpp',
      h: 'c',
      hpp: 'cpp',
      cs: 'csharp',
      rb: 'ruby',
      php: 'php',
      swift: 'swift',
      kt: 'kotlin',
    };

    return languageMap[ext ?? ''] || 'unknown';
  }

  /**
   * Check if a language is supported
   */
  isLanguageSupported(language: string): boolean {
    const supportedLanguages = [
      'typescript',
      'tsx',
      'javascript',
      'python',
      'rust',
      'go',
      'java',
      'c',
      'cpp',
      'csharp',
      'ruby',
      'php',
      'swift',
      'kotlin',
    ];

    return supportedLanguages.includes(language);
  }

  /**
   * Get all supported languages
   */
  getSupportedLanguages(): string[] {
    return [
      'typescript',
      'javascript',
      'python',
      'rust',
      'go',
      'java',
      'c',
      'cpp',
      'csharp',
      'ruby',
      'php',
      'swift',
      'kotlin',
    ];
  }

  // Private methods

  private async loadLanguageBinding(language: string): Promise<unknown | null> {
    const languageWasmMap: Record<string, string> = {
      typescript: 'tree-sitter-typescript.wasm',
      tsx: 'tree-sitter-tsx.wasm',
      javascript: 'tree-sitter-javascript.wasm',
      python: 'tree-sitter-python.wasm',
      rust: 'tree-sitter-rust.wasm',
      go: 'tree-sitter-go.wasm',
      java: 'tree-sitter-java.wasm',
      c: 'tree-sitter-c.wasm',
      cpp: 'tree-sitter-cpp.wasm',
    };

    const wasmFile = languageWasmMap[language];
    if (!wasmFile) {
      return null;
    }

    try {
      const lang = await (this.Parser as any).Language.load(wasmFile);
      return lang;
    } catch {
      try {
        const cdnUrl = `https://cdn.jsdelivr.net/npm/tree-sitter-${language}@latest/${wasmFile}`;
        const lang = await (this.Parser as any).Language.load(cdnUrl);
        return lang;
      } catch {
        return null;
      }
    }
  }

  private convertNode(node: TreeSitterNode, options: ParseOptions): CodeNode {
    const children: CodeNode[] = [];

    for (const child of node.namedChildren) {
      if (!options.includeComments && child.type === 'comment') {
        continue;
      }

      children.push(this.convertNode(child, options));
    }

    return {
      type: node.type,
      text: node.text,
      range: {
        start: { line: node.startPosition.row, column: node.startPosition.column },
        end: { line: node.endPosition.row, column: node.endPosition.column },
      },
      children: children.length > 0 ? children : undefined,
    };
  }

  private extractSymbolsFromNode(
    node: TreeSitterNode,
    filePath: string,
    _code: string,
    _scope: string[] = []
  ): CodeSymbol[] {
    const symbols: CodeSymbol[] = [];

    const symbolKinds: Record<string, CodeSymbol['kind']> = {
      function_declaration: 'function',
      function_definition: 'function',
      method_definition: 'function',
      arrow_function: 'function',
      class_declaration: 'class',
      class_definition: 'class',
      interface_declaration: 'interface',
      interface_definition: 'interface',
      type_alias_declaration: 'type',
      enum_declaration: 'enum',
      enum_definition: 'enum',
      variable_declarator: 'variable',
      lexical_declaration: 'variable',
      function_item: 'function',
      struct_item: 'type',
      impl_item: 'type',
      trait_item: 'interface',
    };

    const symbolKind = symbolKinds[node.type];
    if (symbolKind) {
      const name = this.extractName(node);
      if (name) {
        symbols.push({
          name,
          kind: symbolKind,
          filePath,
          range: {
            start: { line: node.startPosition.row, column: node.startPosition.column },
            end: { line: node.endPosition.row, column: node.endPosition.column },
          },
        });
      }
    }

    for (const child of node.namedChildren) {
      symbols.push(...this.extractSymbolsFromNode(child, filePath, _code, []));
    }

    return symbols;
  }

  private extractName(node: TreeSitterNode): string | null {
    const nameNode = node.namedChildren.find(
      (c) => c.type === 'identifier' || c.type === 'property_identifier' || c.type === 'type_identifier'
    );

    return nameNode?.text ?? null;
  }

  private simplifiedParse(code: string, language: string, _options: ParseOptions): ParseResult {
    const startTime = Date.now();
    const lines = code.split('\n');

    const tree: CodeNode = {
      type: 'file',
      text: '',
      range: {
        start: { line: 0, column: 0 },
        end: { line: lines.length, column: lines[lines.length - 1]?.length || 0 },
      },
      children: lines.map((line, i) => ({
        type: 'line',
        text: line,
        range: {
          start: { line: i, column: 0 },
          end: { line: i, column: line.length },
        },
      })),
    };

    return {
      tree,
      language,
      parseTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Create a Tree-sitter parser
 */
export function createTreeSitterParser(): TreeSitterParser {
  return new TreeSitterParser();
}