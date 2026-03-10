/**
 * LSP Client
 * Full implementation of Language Server Protocol client
 */

import { EventEmitter } from 'events';
import * as path from 'path';
import {
  JSONRPCHandler,
  JSONRPCResponse,
  JSONRPCNotification,
  createJSONRPCHandler,
} from './jsonrpc.js';
import {
  LSPProcessManager,
  createLSPProcessManager,
  ProcessStatus,
} from './process.js';
import { LSPCache, createLSPCache } from './cache.js';
import type {
  LSPServerConfig,
  LSPCapabilities,
  LSPDiagnostic,
  LSPCompletionItem,
  LSPSymbolInfo,
  LSPHover,
  LSPLocation,
} from './types.js';

export interface LSPClientOptions {
  timeoutMs?: number;
  cacheEnabled?: boolean;
  cacheTtlMs?: number;
}

type ClientEventMap = {
  'status-change': [ProcessStatus];
  'diagnostics': [string, LSPDiagnostic[]];
  'error': [Error];
  'log': [string];
};

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * LSP Client Implementation
 */
export class LSPClient extends EventEmitter<ClientEventMap> {
  private _config: LSPServerConfig;
  private processManager: LSPProcessManager;
  private jsonRpc: JSONRPCHandler;
  private cache: LSPCache;
  private options: Required<LSPClientOptions>;
  private capabilities: LSPCapabilities | null = null;
  private pendingRequests: Map<number | string, PendingRequest> = new Map();
  private buffer: Buffer = Buffer.alloc(0);
  private initialized = false;
  private rootPath: string = '';
  private openDocuments: Map<string, { version: number; content: string }> = new Map();

  constructor(name: string, config: LSPServerConfig, options: LSPClientOptions = {}) {
    super();
    this._config = config;
    this.options = {
      timeoutMs: options.timeoutMs ?? 30000,
      cacheEnabled: options.cacheEnabled ?? true,
      cacheTtlMs: options.cacheTtlMs ?? 30000,
    };
    this.jsonRpc = createJSONRPCHandler();
    this.cache = createLSPCache({
      enabled: this.options.cacheEnabled,
      ttlMs: this.options.cacheTtlMs,
    });
    this.processManager = createLSPProcessManager(name, this._config);

    this.setupProcessHandlers();
  }

  /**
   * Initialize the LSP server
   */
  async initialize(rootPath: string): Promise<LSPCapabilities> {
    if (this.initialized) {
      return this.capabilities!;
    }

    this.rootPath = rootPath;

    // Start the process
    await this.processManager.start();

    // Send initialize request
    const initParams = {
      processId: process.pid,
      rootUri: this.pathToUri(rootPath),
      capabilities: {
        textDocument: {
          completion: {
            completionItem: {
              snippetSupport: false,
            },
          },
          hover: {
            contentFormat: ['markdown', 'plaintext'],
          },
          definition: {
            linkSupport: true,
          },
          references: {},
          documentSymbol: {
            hierarchicalDocumentSymbolSupport: true,
          },
        },
      },
      workspace: {
        workspaceFolders: true,
      },
    };

    const response = await this.sendRequest('initialize', initParams);

    if (response.error) {
      throw new Error(`LSP initialize failed: ${response.error.message}`);
    }

    // Store capabilities
    this.capabilities = this.parseCapabilities(response.result as Record<string, unknown>);

    // Send initialized notification
    await this.sendNotification('initialized', {});

    this.initialized = true;
    this.emit('log', `LSP client initialized for ${rootPath}`);

    return this.capabilities;
  }

  /**
   * Shutdown the LSP client
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    // Close all open documents
    for (const filePath of this.openDocuments.keys()) {
      await this.closeDocument(filePath);
    }

    // Send shutdown request
    try {
      await this.sendRequest('shutdown', undefined, 5000);
    } catch {
      // Ignore shutdown errors
    }

    // Send exit notification
    try {
      await this.sendNotification('exit', {});
    } catch {
      // Ignore exit errors
    }

    // Stop the process
    await this.processManager.stop();

    this.initialized = false;
    this.capabilities = null;
  }

  /**
   * Open a document in the language server
   */
  async openDocument(filePath: string, content: string): Promise<void> {
    const uri = this.pathToUri(filePath);
    const languageId = this.getLanguageId(filePath);

    this.openDocuments.set(filePath, { version: 1, content });

    const params = {
      textDocument: {
        uri,
        languageId,
        version: 1,
        text: content,
      },
    };

    await this.sendNotification('textDocument/didOpen', params);

    // Invalidate cache for this file
    this.cache.invalidateFile(filePath);
  }

  /**
   * Close a document in the language server
   */
  async closeDocument(filePath: string): Promise<void> {
    const uri = this.pathToUri(filePath);

    this.openDocuments.delete(filePath);

    const params = {
      textDocument: {
        uri,
      },
    };

    await this.sendNotification('textDocument/didClose', params);

    // Invalidate cache
    this.cache.invalidateFile(filePath);
  }

  /**
   * Update a document's content
   */
  async updateDocument(filePath: string, content: string): Promise<void> {
    const existing = this.openDocuments.get(filePath);
    const version = existing ? existing.version + 1 : 1;
    const uri = this.pathToUri(filePath);

    this.openDocuments.set(filePath, { version, content });

    const params = {
      textDocument: {
        uri,
        version,
      },
      contentChanges: [{ text: content }],
    };

    await this.sendNotification('textDocument/didChange', params);

    // Invalidate cache
    this.cache.invalidateFile(filePath);
  }

  /**
   * Get diagnostics for a file
   */
  async getDiagnostics(filePath: string): Promise<LSPDiagnostic[]> {
    if (!this.initialized) {
      throw new Error('LSP client not initialized');
    }

    const cacheKey = this.cache.generateKey('diagnostics', filePath);
    const cached = this.cache.get<LSPDiagnostic[]>(cacheKey, filePath);
    if (cached) {
      return cached;
    }

    const uri = this.pathToUri(filePath);

    try {
      const response = await this.sendRequest('textDocument/diagnostic', {
        textDocument: { uri },
      });

      const diagnostics = this.parseDiagnostics(response.result);
      this.cache.set(cacheKey, diagnostics, filePath);

      return diagnostics;
    } catch (error) {
      // Some servers don't support textDocument/diagnostic
      // Return empty array instead of throwing
      this.emit('log', `Diagnostics not available: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Get symbols for a file
   */
  async getSymbols(filePath: string): Promise<LSPSymbolInfo[]> {
    if (!this.initialized) {
      throw new Error('LSP client not initialized');
    }

    const cacheKey = this.cache.generateKey('symbols', filePath);
    const cached = this.cache.get<LSPSymbolInfo[]>(cacheKey, filePath);
    if (cached) {
      return cached;
    }

    const uri = this.pathToUri(filePath);

    const response = await this.sendRequest('textDocument/documentSymbol', {
      textDocument: { uri },
    });

    const symbols = (response.result as LSPSymbolInfo[] | undefined) ?? [];
    this.cache.set(cacheKey, symbols, filePath);

    return symbols;
  }

  /**
   * Go to definition
   */
  async gotoDefinition(
    filePath: string,
    line: number,
    character: number
  ): Promise<LSPLocation | LSPLocation[] | null> {
    if (!this.initialized) {
      throw new Error('LSP client not initialized');
    }

    const cacheKey = this.cache.generateKey('definition', filePath, { line, column: character });
    const cached = this.cache.get<LSPLocation | LSPLocation[] | null>(cacheKey, filePath);
    if (cached !== null) {
      return cached;
    }

    const uri = this.pathToUri(filePath);

    const response = await this.sendRequest('textDocument/definition', {
      textDocument: { uri },
      position: { line, character },
    });

    const result = this.parseLocationResponse(response.result);
    if (result) {
      this.cache.set(cacheKey, result, filePath);
    }

    return result;
  }

  /**
   * Find references
   */
  async getReferences(
    filePath: string,
    line: number,
    character: number
  ): Promise<LSPLocation[]> {
    if (!this.initialized) {
      throw new Error('LSP client not initialized');
    }

    const cacheKey = this.cache.generateKey('references', filePath, { line, column: character });
    const cached = this.cache.get<LSPLocation[]>(cacheKey, filePath);
    if (cached) {
      return cached;
    }

    const uri = this.pathToUri(filePath);

    const response = await this.sendRequest('textDocument/references', {
      textDocument: { uri },
      position: { line, character },
      context: { includeDeclaration: true },
    });

    const locations = (response.result as LSPLocation[] | undefined) ?? [];
    this.cache.set(cacheKey, locations, filePath);

    return locations;
  }

  /**
   * Get completions
   */
  async getCompletions(
    filePath: string,
    line: number,
    character: number
  ): Promise<LSPCompletionItem[]> {
    if (!this.initialized) {
      throw new Error('LSP client not initialized');
    }

    const cacheKey = this.cache.generateKey('completion', filePath, { line, column: character });
    const cached = this.cache.get<LSPCompletionItem[]>(cacheKey, filePath);
    if (cached) {
      return cached;
    }

    const uri = this.pathToUri(filePath);

    const response = await this.sendRequest('textDocument/completion', {
      textDocument: { uri },
      position: { line, character },
    });

    // Handle both CompletionItem[] and CompletionList
    const result = response.result as { items?: LSPCompletionItem[] } | LSPCompletionItem[] | null;
    const items = Array.isArray(result) ? result : result?.items ?? [];
    this.cache.set(cacheKey, items, filePath);

    return items;
  }

  /**
   * Get hover information
   */
  async hover(
    filePath: string,
    line: number,
    character: number
  ): Promise<LSPHover | null> {
    if (!this.initialized) {
      throw new Error('LSP client not initialized');
    }

    const cacheKey = this.cache.generateKey('hover', filePath, { line, column: character });
    const cached = this.cache.get<LSPHover | null>(cacheKey, filePath);
    if (cached !== null) {
      return cached;
    }

    const uri = this.pathToUri(filePath);

    const response = await this.sendRequest('textDocument/hover', {
      textDocument: { uri },
      position: { line, character },
    });

    const hover = response.result as LSPHover | null;
    if (hover) {
      this.cache.set(cacheKey, hover, filePath);
    }

    return hover;
  }

  /**
   * Get current status
   */
  getStatus(): ProcessStatus {
    return this.processManager.getStatus();
  }

  /**
   * Check if client is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get server capabilities
   */
  getCapabilities(): LSPCapabilities | null {
    return this.capabilities;
  }

  // Private methods

  private setupProcessHandlers(): void {
    this.processManager.on('stdout', (data: Buffer) => {
      this.handleData(data);
    });

    this.processManager.on('stderr', (data: Buffer) => {
      this.emit('log', `[stderr] ${data.toString()}`);
    });

    this.processManager.on('error', (error: Error) => {
      this.emit('error', error);
    });

    this.processManager.on('status-change', (status: ProcessStatus) => {
      this.emit('status-change', status);
    });

    this.processManager.on('exit', (code, signal) => {
      this.initialized = false;
      this.emit('log', `Process exited with code ${code}, signal ${signal}`);
    });
  }

  private handleData(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data]);

    while (this.buffer.length > 0) {
      const { message, consumed } = this.jsonRpc.parseMessage(this.buffer);

      if (!message) {
        break;
      }

      this.buffer = this.buffer.subarray(consumed);

      if (this.jsonRpc.isResponse(message)) {
        this.handleResponse(message);
      } else if (this.jsonRpc.isNotification(message)) {
        this.handleNotification(message);
      }
    }
  }

  private handleResponse(response: JSONRPCResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(new Error(response.error.message));
    } else {
      pending.resolve(response.result);
    }
  }

  private handleNotification(notification: JSONRPCNotification): void {
    if (notification.method === 'textDocument/publishDiagnostics') {
      const params = notification.params as { uri: string; diagnostics: LSPDiagnostic[] };
      const filePath = this.uriToPath(params.uri);
      this.emit('diagnostics', filePath, params.diagnostics);
    }
  }

  private sendRequest(
    method: string,
    params: unknown,
    timeoutMs?: number
  ): Promise<JSONRPCResponse> {
    return new Promise((resolve, reject) => {
      const request = this.jsonRpc.formatRequest(method, params);
      const id = request.id;

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, timeoutMs ?? this.options.timeoutMs);

      this.pendingRequests.set(id, {
        resolve: (value) => resolve({ jsonrpc: '2.0', id, result: value }),
        reject,
        timer,
      });

      const message = this.jsonRpc.serializeMessage(request);
      const stdin = this.processManager.getStdin();

      if (!stdin) {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(new Error('Process stdin not available'));
        return;
      }

      stdin.write(message);
    });
  }

  private async sendNotification(method: string, params: unknown): Promise<void> {
    const notification = this.jsonRpc.formatNotification(method, params);
    const message = this.jsonRpc.serializeMessage(notification);
    const stdin = this.processManager.getStdin();

    if (!stdin) {
      throw new Error('Process stdin not available');
    }

    stdin.write(message);
  }

  private parseCapabilities(result: Record<string, unknown>): LSPCapabilities {
    const caps = (result.capabilities as Record<string, unknown>) ?? {};
    return {
      definitionProvider: !!caps.definitionProvider,
      referencesProvider: !!caps.referencesProvider,
      diagnosticsProvider: !!caps.diagnosticProvider,
      completionProvider: !!caps.completionProvider,
      hoverProvider: !!caps.hoverProvider,
      documentSymbolProvider: !!caps.documentSymbolProvider,
      renameProvider: !!caps.renameProvider,
      codeActionProvider: !!caps.codeActionProvider,
    };
  }

  private parseDiagnostics(result: unknown): LSPDiagnostic[] {
    if (!result) return [];

    const items = (result as { items?: LSPDiagnostic[] })?.items ?? result;
    return Array.isArray(items) ? items : [];
  }

  private parseLocationResponse(result: unknown): LSPLocation | LSPLocation[] | null {
    if (!result) return null;
    if (Array.isArray(result)) {
      return result.length > 0 ? result : null;
    }
    return result as LSPLocation;
  }

  private pathToUri(filePath: string): string {
    // Convert file path to URI
    const absolute = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(this.rootPath, filePath);

    // On Windows, convert backslashes to forward slashes and add leading slash
    const normalized = process.platform === 'win32'
      ? '/' + absolute.replace(/\\/g, '/')
      : absolute;

    return `file://${normalized}`;
  }

  private uriToPath(uri: string): string {
    if (uri.startsWith('file://')) {
      return uri.slice(7);
    }
    return uri;
  }

  private getLanguageId(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescriptreact',
      js: 'javascript',
      jsx: 'javascriptreact',
      py: 'python',
      go: 'go',
      rs: 'rust',
      java: 'java',
      c: 'c',
      cpp: 'cpp',
    };
    return langMap[ext ?? ''] ?? 'plaintext';
  }
}

/**
 * Create an LSP client
 */
export function createLSPClient(
  name: string,
  config: LSPServerConfig,
  options?: LSPClientOptions
): LSPClient {
  return new LSPClient(name, config, options);
}

// Re-export types
export type { LSPServerConfig, LSPCapabilities } from './types.js';