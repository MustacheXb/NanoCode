/**
 * Core type definitions for NanoCode
 */

// ===== Agent Types =====

export type AgentState =
  | 'idle'
  | 'planning'
  | 'thinking'
  | 'acting'
  | 'observing'
  | 'completed'
  | 'error';

export type PermissionLevel =
  | 'bypass'   // Execute without confirmation
  | 'accept'   // Auto-accept safe operations
  | 'ask'      // Ask before each operation
  | 'plan';    // Require full plan approval

export interface AgentConfig {
  llm: {
    apiKey: string;
    model: string;
    baseUrl?: string;
    maxTokens?: number;
    temperature?: number;
  };
  tools: {
    enabled: string[];
    mcpServers: MCPServerConfig[];
  };
  security: {
    permissionLevel: PermissionLevel;
    sandboxEnabled: boolean;
  };
  compression: {
    maxContextTokens: number;
    memoryStrategy: 'lru' | 'smart' | 'none';
  };
  storage: {
    dbPath: string;
    sessionTTL: number;
  };
}

export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

// ===== Message Types =====

export type MessageRole =
  | 'system'
  | 'user'
  | 'assistant'
  | 'tool';

export interface Message {
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  timestamp?: number;
}

export interface ToolCall {
  id: string;
  name: string;
  parameters: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  data: unknown;
  error?: string;
  tokenUsage?: number;
}

// ===== Tool Types =====

export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute: (params: Record<string, unknown>) => Promise<ToolResult>;
  dangerous?: boolean;
}

export interface ToolParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
  default?: unknown;
}

// ===== Context Types =====

export interface Context {
  messages: Message[];
  memory: MemoryItem[];
  observations: Observation[];
  metadata: ContextMetadata;
}

export interface ContextMetadata {
  sessionId: string;
  userId?: string;
  startTime: number;
  lastUpdate: number;
  tokensUsed: number;
}

export interface MemoryItem {
  id: string;
  type: 'fact' | 'observation' | 'code' | 'user';
  content: string;
  importance: number;
  timestamp: number;
  references: string[];
}

export interface Observation {
  id: string;
  type: 'file_read' | 'file_write' | 'command' | 'tool_result';
  content: string;
  masked?: boolean;
  timestamp: number;
}

// ===== LLM Types =====

export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  finishReason: 'stop' | 'length' | 'tool_calls' | 'error';
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

export interface LLMClient {
  chat(params: LLMChatParams): Promise<LLMResponse>;
  countTokens(text: string): number;
}

export interface LLMChatParams {
  messages: Message[];
  tools?: Tool[];
  maxTokens?: number;
  temperature?: number;
}

// ===== CLI Types =====

export interface CLICommand {
  name: string;
  description: string;
  options?: CLIOption[];
  action: (args: Record<string, unknown>) => Promise<void> | void;
}

export interface CLIOption {
  flag: string;
  description: string;
  default?: unknown;
  required?: boolean;
}

// ===== Storage Types =====

export interface Session {
  id: string;
  createdAt: number;
  updatedAt: number;
  context: Context;
  config: AgentConfig;
}

export interface HistoryRecord {
  id: string;
  sessionId: string;
  timestamp: number;
  type: 'message' | 'tool_call' | 'observation';
  content: string;
}

// ===== Parser Types =====

export interface CodeSymbol {
  name: string;
  kind: 'function' | 'class' | 'variable' | 'interface' | 'type' | 'enum';
  filePath: string;
  range: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  documentation?: string;
}

export interface CodeNode {
  type: string;
  text: string;
  range: CodeRange;
  children?: CodeNode[];
}

export interface CodeRange {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

// ===== Security Types =====

export interface PermissionRequest {
  tool: string;
  action: string;
  parameters: Record<string, unknown>;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface SandboxContext {
  allowedPaths: string[];
  deniedPaths: string[];
  timeoutMs: number;
  maxMemoryMB: number;
}

// ===== Skill Types =====

export interface Skill {
  name: string;
  description: string;
  alias?: string[];
  handler: (args: string[], context: Context) => Promise<void>;
  category: string;
}

export interface SkillContext {
  skill: Skill;
  args: string[];
  context: Context;
  timestamp: number;
}

// ===== LSP Types =====

export interface LSPServerStatus {
  name: string;
  status: 'starting' | 'running' | 'stopped' | 'error';
  pid?: number;
  uptimeMs?: number;
  lastError?: string;
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
  range: CodeRange;
  severity: 'error' | 'warning' | 'info' | 'hint';
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

export interface LSPHover {
  contents: string | { kind: string; value: string } | Array<string | { language: string; value: string }>;
  range?: CodeRange;
}

export interface LSPLocation {
  uri: string;
  range: CodeRange;
}

// ===== Tree-sitter Types =====

export interface TreeSitterOptions {
  includeComments: boolean;
  maxFileSizeKB: number;
}

export interface ParseResult {
  tree: CodeNode;
  language: string;
  parseTimeMs: number;
}

// ===== LSP Types =====

export interface LSPServerStatus {
  name: string;
  status: 'starting' | 'running' | 'stopped' | 'error';
  pid?: number;
  uptimeMs?: number;
  lastError?: string;
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
  range: CodeRange;
  severity: 'error' | 'warning' | 'info' | 'hint';
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

export interface LSPHover {
  contents: string | { kind: string; value: string } | Array<string | { language: string; value: string }>;
  range?: CodeRange;
}

export interface LSPLocation {
  uri: string;
  range: CodeRange;
}

// ===== Tree-sitter Types =====

export interface TreeSitterOptions {
  includeComments: boolean;
  maxFileSizeKB: number;
}

export interface ParseResult {
  tree: CodeNode;
  language: string;
  parseTimeMs: number;
}