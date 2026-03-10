/**
 * LSP Client
 * Re-export from the LSP module
 */

export {
  LSPClient,
  createLSPClient,
  type LSPClientOptions,
  type LSPServerConfig,
  type LSPCapabilities,
} from './lsp/client.js';

export type {
  LSPDiagnostic,
  LSPCompletionItem,
  LSPSymbolInfo,
  LSPHover,
  LSPLocation,
} from './lsp/types.js';

export {
  languageServers,
  getServerForExtension,
  getServerForLanguage,
  getSupportedLanguages,
  getServerNames,
  isServerInstalled,
  getInstallInstructions,
} from './lsp/servers/index.js';