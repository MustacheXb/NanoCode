/**
 * Built-in LSP Tool
 * Language Server Protocol integration for code intelligence
 */

import type { Tool, ToolResult, CodeSymbol } from '../../types/index.js';
import {
  LSPClient,
  createLSPClient,
  getServerForLanguage,
  getInstallInstructions,
  isServerInstalled,
} from '../../parser/index.js';

// Global LSP client instances (one per language server)
const lspClients: Map<string, LSPClient> = new Map();
let rootPath: string = process.cwd();

/**
 * Set the root path for LSP operations
 */
export function setRootPath(path: string): void {
  rootPath = path;
}

/**
 * Get or create an LSP client for a language
 */
async function getLSPClient(language: string): Promise<LSPClient | null> {
  // Check if client already exists
  const existingClient = lspClients.get(language);
  if (existingClient && existingClient.isInitialized()) {
    return existingClient;
  }

  // Get server configuration
  const serverInfo = getServerForLanguage(language);
  if (!serverInfo) {
    return null;
  }

  // Check if server is installed
  const installed = await isServerInstalled(language);
  if (!installed) {
    const instructions = getInstallInstructions(language);
    console.error(`Language server not installed for ${language}. ${instructions}`);
    return null;
  }

  // Create and initialize client
  try {
    const client = createLSPClient(language, {
      command: serverInfo.command,
      args: serverInfo.args,
      languages: serverInfo.languages,
    });

    await client.initialize(rootPath);
    lspClients.set(language, client);

    return client;
  } catch (error) {
    console.error(`Failed to initialize LSP client for ${language}:`, error);
    return null;
  }
}

/**
 * Detect language from file extension
 */
function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
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
  };
  return languageMap[ext ?? ''] || 'typescript';
}

/**
 * Get code symbols from a file
 */
export const symbolsTool: Tool = {
  name: 'symbols',
  description: 'Extract symbols (functions, classes, variables) from a source file using LSP or Tree-sitter parsing.',
  parameters: [
    {
      name: 'file_path',
      type: 'string',
      description: 'The path to the source file',
      required: true,
    },
    {
      name: 'language',
      type: 'string',
      description: 'The programming language (auto-detected from file extension if not specified)',
      required: false,
    },
  ],
  dangerous: false,
  execute: async (params): Promise<ToolResult> => {
    try {
      const filePath = params.file_path as string;
      const language = (params.language as string) || detectLanguage(filePath);

      // Try LSP first
      const client = await getLSPClient(language);

      if (client) {
        // Read file content and open document
        const fs = await import('fs/promises');
        const content = await fs.readFile(filePath, 'utf-8');
        await client.openDocument(filePath, content);

        // Get symbols
        const lspSymbols = await client.getSymbols(filePath);

        // Convert LSP symbols to CodeSymbol format
        const symbols: CodeSymbol[] = lspSymbols.map((sym: { name: string; kind: number; range: { start: { line: number; character: number }; end: { line: number; character: number } } }) => ({
          name: sym.name,
          kind: lspSymbolKindToCodeSymbolKind(sym.kind),
          filePath,
          range: {
            start: { line: sym.range.start.line, column: sym.range.start.character },
            end: { line: sym.range.end.line, column: sym.range.end.character },
          },
        }));

        // Close document
        await client.closeDocument(filePath);

        return {
          success: true,
          data: { symbols, language, source: 'lsp' },
        };
      }

      // Fallback to Tree-sitter or regex
      const { createTreeSitterParser } = await import('../../parser/tree-sitter/parser.js');
      const parser = createTreeSitterParser();

      try {
        await parser.init();
        const fs = await import('fs/promises');
        const content = await fs.readFile(filePath, 'utf-8');
        const symbols = await parser.extractSymbols(content, filePath, language);

        return {
          success: true,
          data: { symbols, language, source: 'tree-sitter' },
        };
      } catch {
        // Final fallback to regex
        return {
          success: true,
          data: { symbols: [], language, source: 'regex', note: 'LSP and Tree-sitter not available' },
        };
      }
    } catch (error) {
      return {
        success: false,
        data: null,
        error: (error as Error).message,
      };
    }
  },
};

/**
 * Get LSP diagnostics for a file
 */
export const diagnosticsTool: Tool = {
  name: 'diagnostics',
  description: 'Get LSP diagnostics (errors, warnings) for a file.',
  parameters: [
    {
      name: 'file_path',
      type: 'string',
      description: 'The path to the source file',
      required: true,
    },
  ],
  dangerous: false,
  execute: async (params): Promise<ToolResult> => {
    try {
      const filePath = params.file_path as string;
      const language = detectLanguage(filePath);

      const client = await getLSPClient(language);

      if (!client) {
        const serverInfo = getServerForLanguage(language);
        return {
          success: false,
          data: null,
          error: `LSP server not available for ${language}. Install with: ${serverInfo?.installation || 'see documentation'}`,
        };
      }

      // Read file content and open document
      const fs = await import('fs/promises');
      const content = await fs.readFile(filePath, 'utf-8');
      await client.openDocument(filePath, content);

      // Get diagnostics
      const diagnostics = await client.getDiagnostics(filePath);

      // Close document
      await client.closeDocument(filePath);

      // Format diagnostics
      const formatted = diagnostics.map((d: { severity: string; message: string; range: { start: { line: number; character: number } }; source?: string; code?: string | number }) => ({
        severity: d.severity,
        message: d.message,
        line: d.range.start.line + 1,
        column: d.range.start.character + 1,
        source: d.source,
        code: d.code,
      }));

      return {
        success: true,
        data: {
          file: filePath,
          language,
          diagnostics: formatted,
          errorCount: formatted.filter((d: { severity: string }) => d.severity === 'Error').length,
          warningCount: formatted.filter((d: { severity: string }) => d.severity === 'Warning').length,
        },
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: (error as Error).message,
      };
    }
  },
};

/**
 * Go to definition
 */
export const gotoDefinitionTool: Tool = {
  name: 'goto_definition',
  description: 'Find the definition of a symbol at a specific location in a file.',
  parameters: [
    {
      name: 'file_path',
      type: 'string',
      description: 'The path to the source file',
      required: true,
    },
    {
      name: 'line',
      type: 'number',
      description: 'Line number (0-indexed)',
      required: true,
    },
    {
      name: 'column',
      type: 'number',
      description: 'Column number (0-indexed)',
      required: true,
    },
  ],
  dangerous: false,
  execute: async (params): Promise<ToolResult> => {
    try {
      const filePath = params.file_path as string;
      const line = params.line as number;
      const column = params.column as number;
      const language = detectLanguage(filePath);

      const client = await getLSPClient(language);

      if (!client) {
        const serverInfo = getServerForLanguage(language);
        return {
          success: false,
          data: null,
          error: `LSP server not available for ${language}. Install with: ${serverInfo?.installation || 'see documentation'}`,
        };
      }

      // Read file content and open document
      const fs = await import('fs/promises');
      const content = await fs.readFile(filePath, 'utf-8');
      await client.openDocument(filePath, content);

      // Get definition
      const definition = await client.gotoDefinition(filePath, line, column);

      // Close document
      await client.closeDocument(filePath);

      if (!definition) {
        return {
          success: true,
          data: { found: false, message: 'No definition found' },
        };
      }

      // Format result
      const formatLocation = (loc: { uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } }) => ({
        filePath: loc.uri.replace('file://', ''),
        line: loc.range.start.line + 1,
        column: loc.range.start.character + 1,
        endLine: loc.range.end.line + 1,
        endColumn: loc.range.end.character + 1,
      });

      const locations = Array.isArray(definition)
        ? definition.map(formatLocation)
        : [formatLocation(definition)];

      return {
        success: true,
        data: {
          found: true,
          locations,
        },
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: (error as Error).message,
      };
    }
  },
};

/**
 * Get references to a symbol
 */
export const referencesTool: Tool = {
  name: 'references',
  description: 'Find all references to a symbol at a specific location in a file.',
  parameters: [
    {
      name: 'file_path',
      type: 'string',
      description: 'The path to the source file',
      required: true,
    },
    {
      name: 'line',
      type: 'number',
      description: 'Line number (0-indexed)',
      required: true,
    },
    {
      name: 'column',
      type: 'number',
      description: 'Column number (0-indexed)',
      required: true,
    },
  ],
  dangerous: false,
  execute: async (params): Promise<ToolResult> => {
    try {
      const filePath = params.file_path as string;
      const line = params.line as number;
      const column = params.column as number;
      const language = detectLanguage(filePath);

      const client = await getLSPClient(language);

      if (!client) {
        const serverInfo = getServerForLanguage(language);
        return {
          success: false,
          data: null,
          error: `LSP server not available for ${language}. Install with: ${serverInfo?.installation || 'see documentation'}`,
        };
      }

      // Read file content and open document
      const fs = await import('fs/promises');
      const content = await fs.readFile(filePath, 'utf-8');
      await client.openDocument(filePath, content);

      // Get references
      const references = await client.getReferences(filePath, line, column);

      // Close document
      await client.closeDocument(filePath);

      // Format result
      const formatted = references.map((ref: { uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } }) => ({
        filePath: ref.uri.replace('file://', ''),
        line: ref.range.start.line + 1,
        column: ref.range.start.character + 1,
        endLine: ref.range.end.line + 1,
        endColumn: ref.range.end.character + 1,
      }));

      return {
        success: true,
        data: {
          count: formatted.length,
          references: formatted,
        },
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: (error as Error).message,
      };
    }
  },
};

/**
 * Get hover information
 */
export const hoverTool: Tool = {
  name: 'hover',
  description: 'Get hover information for a symbol at a specific location.',
  parameters: [
    {
      name: 'file_path',
      type: 'string',
      description: 'The path to the source file',
      required: true,
    },
    {
      name: 'line',
      type: 'number',
      description: 'Line number (0-indexed)',
      required: true,
    },
    {
      name: 'column',
      type: 'number',
      description: 'Column number (0-indexed)',
      required: true,
    },
  ],
  dangerous: false,
  execute: async (params): Promise<ToolResult> => {
    try {
      const filePath = params.file_path as string;
      const line = params.line as number;
      const column = params.column as number;
      const language = detectLanguage(filePath);

      const client = await getLSPClient(language);

      if (!client) {
        const serverInfo = getServerForLanguage(language);
        return {
          success: false,
          data: null,
          error: `LSP server not available for ${language}. Install with: ${serverInfo?.installation || 'see documentation'}`,
        };
      }

      // Read file content and open document
      const fs = await import('fs/promises');
      const content = await fs.readFile(filePath, 'utf-8');
      await client.openDocument(filePath, content);

      // Get hover
      const hover = await client.hover(filePath, line, column);

      // Close document
      await client.closeDocument(filePath);

      if (!hover) {
        return {
          success: true,
          data: { found: false, message: 'No hover information available' },
        };
      }

      // Format hover content
      let hoverText: string;
      if (typeof hover.contents === 'string') {
        hoverText = hover.contents;
      } else if ('value' in hover.contents) {
        hoverText = hover.contents.value;
      } else if (Array.isArray(hover.contents)) {
        hoverText = hover.contents.map((c: string | { value: string }) =>
          typeof c === 'string' ? c : c.value
        ).join('\n');
      } else {
        hoverText = JSON.stringify(hover.contents);
      }

      return {
        success: true,
        data: {
          found: true,
          contents: hoverText,
          range: hover.range ? {
            startLine: hover.range.start.line + 1,
            startColumn: hover.range.start.character + 1,
            endLine: hover.range.end.line + 1,
            endColumn: hover.range.end.character + 1,
          } : undefined,
        },
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: (error as Error).message,
      };
    }
  },
};

/**
 * Get completions
 */
export const completionsTool: Tool = {
  name: 'completions',
  description: 'Get code completions at a specific location in a file.',
  parameters: [
    {
      name: 'file_path',
      type: 'string',
      description: 'The path to the source file',
      required: true,
    },
    {
      name: 'line',
      type: 'number',
      description: 'Line number (0-indexed)',
      required: true,
    },
    {
      name: 'column',
      type: 'number',
      description: 'Column number (0-indexed)',
      required: true,
    },
  ],
  dangerous: false,
  execute: async (params): Promise<ToolResult> => {
    try {
      const filePath = params.file_path as string;
      const line = params.line as number;
      const column = params.column as number;
      const language = detectLanguage(filePath);

      const client = await getLSPClient(language);

      if (!client) {
        const serverInfo = getServerForLanguage(language);
        return {
          success: false,
          data: null,
          error: `LSP server not available for ${language}. Install with: ${serverInfo?.installation || 'see documentation'}`,
        };
      }

      // Read file content and open document
      const fs = await import('fs/promises');
      const content = await fs.readFile(filePath, 'utf-8');
      await client.openDocument(filePath, content);

      // Get completions
      const completions = await client.getCompletions(filePath, line, column);

      // Close document
      await client.closeDocument(filePath);

      // Format completions
      const formatted = completions.map((c: { label: string; kind: number; detail?: string; insertText?: string }) => ({
        label: c.label,
        kind: completionKindToString(c.kind),
        detail: c.detail,
        insertText: c.insertText || c.label,
      }));

      return {
        success: true,
        data: {
          count: formatted.length,
          completions: formatted.slice(0, 50), // Limit to 50 results
        },
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: (error as Error).message,
      };
    }
  },
};

// Helper functions

function lspSymbolKindToCodeSymbolKind(kind: number): CodeSymbol['kind'] {
  // Map LSP SymbolKind to CodeSymbol kind
  // Only return valid CodeSymbol['kind'] values
  switch (kind) {
    case 5: return 'class';
    case 6: return 'function'; // method
    case 9: return 'function'; // constructor
    case 10: return 'enum';
    case 11: return 'interface';
    case 12: return 'function';
    case 13: return 'variable';
    case 22: return 'enum';
    case 23: return 'class'; // struct
    case 26: return 'type';
    default: return 'variable';
  }
}

function completionKindToString(kind: number): string {
  const kinds: Record<number, string> = {
    1: 'Text',
    2: 'Method',
    3: 'Function',
    4: 'Constructor',
    5: 'Field',
    6: 'Variable',
    7: 'Class',
    8: 'Interface',
    9: 'Module',
    10: 'Property',
    11: 'Unit',
    12: 'Value',
    13: 'Enum',
    14: 'Keyword',
    15: 'Snippet',
    16: 'Color',
    17: 'File',
    18: 'Reference',
    19: 'Folder',
    20: 'EnumMember',
    21: 'Constant',
    22: 'Struct',
    23: 'Event',
    24: 'Operator',
    25: 'TypeParameter',
  };
  return kinds[kind] || 'Unknown';
}

/**
 * Shutdown all LSP clients
 */
export async function shutdownAllClients(): Promise<void> {
  for (const [name, client] of lspClients) {
    try {
      await client.shutdown();
      console.log(`Shutdown LSP client: ${name}`);
    } catch (error) {
      console.error(`Failed to shutdown LSP client ${name}:`, error);
    }
  }
  lspClients.clear();
}