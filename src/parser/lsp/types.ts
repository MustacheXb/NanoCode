/**
 * LSP Server Configuration Types
 */

export interface LSPServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  languages?: string[];
}

export interface LSPCapabilities {
  definitionProvider: boolean;
  referencesProvider: boolean;
  diagnosticsProvider: boolean;
  completionProvider: boolean;
  hoverProvider: boolean;
  documentSymbolProvider: boolean;
  renameProvider: boolean;
  codeActionProvider: boolean;
}

export interface LSPDiagnostic {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  severity: 'Error' | 'Warning' | 'Information' | 'Hint';
  message: string;
  source?: string;
  code?: string | number;
}

export interface LSPCompletionItem {
  label: string;
  kind: number;
  detail?: string;
  documentation?: string;
  insertText?: string;
  sortText?: string;
}

export interface LSPSymbolInfo {
  name: string;
  kind: number;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  selectionRange: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  children?: LSPSymbolInfo[];
}

export interface LSPHover {
  contents: string | { kind: string; value: string } | Array<string | { language: string; value: string }>;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

export interface LSPLocation {
  uri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}