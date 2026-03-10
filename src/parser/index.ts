/**
 * Parser Module Exports
 */

// LSP exports
export {
  LSPClient,
  createLSPClient,
  type LSPClientOptions,
  type LSPServerConfig,
  type LSPCapabilities,
} from './lsp/client.js';

export {
  JSONRPCHandler,
  createJSONRPCHandler,
  type JSONRPCRequest,
  type JSONRPCResponse,
  type JSONRPCNotification,
  type JSONRPCError,
  ErrorCodes,
} from './lsp/jsonrpc.js';

export {
  LSPProcessManager,
  createLSPProcessManager,
  type ProcessStatus,
  type ProcessOptions,
} from './lsp/process.js';

export {
  LSPCache,
  createLSPCache,
  type CacheOptions,
} from './lsp/cache.js';

export {
  languageServers,
  getServerForExtension,
  getServerForLanguage,
  getSupportedLanguages,
  getServerNames,
  isServerInstalled,
  getInstallInstructions,
  type LanguageServerInfo,
} from './lsp/servers/index.js';

export type {
  LSPDiagnostic,
  LSPCompletionItem,
  LSPSymbolInfo,
  LSPHover,
  LSPLocation,
} from './lsp/types.js';

// Tree-sitter exports
export {
  TreeSitterParser,
  createTreeSitterParser,
  type ParseOptions,
  type ParseResult,
} from './tree-sitter/parser.js';

export {
  languageQueries,
  getQueryForLanguage,
  getSupportedQueryLanguages,
  captureToSymbolKind,
} from './tree-sitter/queries/index.js';

// Indexer exports
export {
  CodeIndexer,
  createCodeIndexer,
  type IndexerOptions,
  type IndexResult,
} from './indexer.js';