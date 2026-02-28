# NanoCode 代码架构实现设计文档

## 目录

1. [系统概览](#系统概览)
2. [核心架构设计](#核心架构设计)
3. [Agent Loop 实现详解](#agent-loop-实现详解)
4. [工具系统架构](#工具系统架构)
5. [LLM 集成层](#llm-集成层)
6. [压缩策略实现](#压缩策略实现)
7. [代码解析模块](#代码解析模块)
8. [安全与权限](#安全与权限)
9. [持久化存储](#持久化存储)
10. [CLI 层设计](#cli-层设计)
11. [技能系统](#技能系统)
12. [数据流与状态流转](#数据流与状态流转)

---

## 系统概览

### 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLI Layer                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │
│  │   Commands  │  │   Prompts   │  │    UI       │                │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                │
└─────────┼──────────────────┼──────────────────┼────────────────────────┘
          │                  │                  │
          └──────────────────┴──────────────────┘
                             │
                    ┌────────▼────────┐
                    │  Orchestrator  │
                    └────────┬────────┘
                             │
    ┌──────────────────────────┼──────────────────────────┐
    │                          │                          │
    ▼                          ▼                          ▼
┌─────────┐            ┌─────────────┐            ┌─────────────┐
│  Agent  │            │   Skills    │            │   Config    │
│  Loop   │            │   Manager   │            │  Manager    │
└────┬────┘            └─────────────┘            └─────────────┘
     │
     ├───► Context Manager ──► Context Compression
     │
     ├───► Tool Registry ◄─► MCP Client
     │                │
     │                └─► Built-in Tools
     │                    ├─ File (read, write, edit)
     │                    ├─ Search (grep, glob)
     │                    ├─ Bash (execute)
     │                    ├─ LSP (symbols, definitions)
     │                    └─ Web (fetch, search)
     │
     └───► LLM Client
             ├─ Claude API
             ├─ OpenAI API
             └─ Custom Endpoints
                    │
                    ▼
             ┌─────────────┐
             │  Tokenizer  │
             └─────────────┘
                    │
                    ▼
             ┌─────────────┐
             │  Storage    │
             │  (SQLite)   │
             └─────────────┘
```

### 核心设计原则

1. **模块化**：各模块职责单一，接口清晰
2. **可扩展性**：通过插件化机制支持自定义工具、技能和 LLM
3. **类型安全**：全面使用 TypeScript，确保编译时类型检查
4. **异步优先**：所有 I/O 操作使用 Promise/Async-Await
5. **错误处理**：统一的错误处理和恢复机制

---

## 核心架构设计

### 模块分层

```
nanocode/
├── cli/              # 表现层：用户交互
├── core/             # 核心层：Agent Loop 和状态管理
├── tools/            # 工具层：工具注册与执行
├── llm/              # LLM 层：模型交互接口
├── compression/      # 压缩层：上下文管理
├── parser/           # 解析层：代码分析
├── security/         # 安全层：权限和沙箱
├── storage/          # 存储层：持久化
├── skills/           # 技能层：任务模板
└── types/            # 类型层：共享类型定义
```

### 依赖关系

```
CLI → Core → Tools
       → Skills
       → Config

Core → LLM → Tokenizer
     → Context → Compression
     → Tool Registry
     → Storage
     → Security

Tools → LSP → Parser
      → MCP Client
      → Built-in Tools

Skills → Core → Tools
```

---

## Agent Loop 实现详解

### 状态机定义

```typescript
enum AgentState {
  IDLE = 'idle',           // 初始状态
  PLANNING = 'planning',   // 规划阶段
  THINKING = 'thinking',   // 思考阶段
  ACTING = 'acting',       // 执行阶段
  OBSERVING = 'observing', // 观察阶段
  COMPLETED = 'completed', // 完成
  ERROR = 'error',        // 错误状态
}
```

### 状态转换流程

```
┌─────┐
│IDLE │
└──┬──┘
   │ 用户输入
   ▼
┌──────────┐
│ THINKING │
└────┬─────┘
     │
     ├─► 有工具调用 ──► ACTING ──► OBSERVING ──► THINKING
     │
     └─► 无工具调用且完成 ──► COMPLETED
```

### 核心循环实现

```typescript
class AgentLoop extends EventEmitter {
  private state: AgentState;
  private context: Context;
  private llmClient: LLMClient;
  private toolRegistry: ToolRegistry;

  async run(initialPrompt: string): Promise<Context> {
    // 1. 初始化
    this.state = AgentState.THINKING;
    this.addMessage({ role: 'user', content: initialPrompt });

    // 2. 主循环
    while (this.state !== AgentState.COMPLETED &&
           this.state !== AgentState.ERROR &&
           this.currentIteration < this.maxIterations) {

      // 思考阶段
      const response = await this.think();

      // 检查是否需要执行工具
      if (response.toolCalls?.length) {
        // 行动阶段
        const results = await this.act(response.toolCalls);

        // 观察阶段
        for (const result of results) {
          this.observe(result);
        }
      } else {
        // 任务完成
        this.state = AgentState.COMPLETED;
      }

      // 检查是否需要压缩
      this.checkCompression();

      this.currentIteration++;
    }

    return this.context;
  }
}
```

### 思考阶段 (Think)

```typescript
private async think(): Promise<LLMResponse> {
  // 构建请求
  const request = {
    messages: this.context.messages,
    tools: this.toolRegistry.exportSchemas(),
    maxTokens: this.config.maxTokens,
  };

  // 调用 LLM
  const response = await this.llmClient.chat(request);

  // 记录 Token 使用
  this.trackUsage(response.usage);

  return response;
}
```

### 行动阶段 (Act)

```typescript
private async act(toolCalls: ToolCall[]): Promise<ToolResult[]> {
  const results: ToolResult[] = [];

  for (const call of toolCalls) {
    // 权限检查
    const approved = await this.checkPermission(call);
    if (!approved) continue;

    // 执行工具
    const tool = this.toolRegistry.get(call.name);
    const result = await tool.execute(call.parameters);

    // 记录工具消息
    this.addMessage({
      role: 'tool',
      content: JSON.stringify(result),
      toolCallId: call.id,
    });

    results.push(result);
  }

  return results;
}
```

### 观察阶段 (Observe)

```typescript
private observe(result: ToolResult): void {
  // 记录观察
  this.context.observations.push({
    id: uuid(),
    type: 'tool_result',
    content: result.success
      ? JSON.stringify(result.data)
      : `Error: ${result.error}`,
    timestamp: Date.now(),
  });

  // 更新内存
  if (result.success && this.isImportant(result)) {
    this.context.memory.push({
      id: uuid(),
      type: 'fact',
      content: this.summarize(result.data),
      importance: this.calculateImportance(result),
      timestamp: Date.now(),
    });
  }
}
```

---

## 工具系统架构

### 工具注册表 (Tool Registry)

```typescript
class ToolRegistry {
  private tools: Map<string, ToolRegistration>;

  // 注册工具
  register(tool: Tool, category?: string): void {
    this.tools.set(tool.name, {
      tool,
      enabled: true,
      category,
    });
  }

  // 执行工具
  async execute(
    name: string,
    params: Record<string, unknown>,
    options: ToolExecutionOptions
  ): Promise<ToolResult> {
    // 1. 获取工具
    const tool = this.tools.get(name);
    if (!tool) return error('Tool not found');

    // 2. 验证参数
    const validation = this.validateParams(tool, params);
    if (!validation.valid) return error(validation.errors);

    // 3. 权限检查
    if (tool.dangerous && !options.bypass) {
      const approved = await options.onPermissionRequest?.(name, params);
      if (!approved) return error('Permission denied');
    }

    // 4. 执行
    return await tool.execute(params);
  }
}
```

### 内置工具实现

#### 文件工具

```typescript
export const readTool: Tool = {
  name: 'read',
  description: '读取文件内容',
  parameters: [
    { name: 'file_path', type: 'string', description: '文件路径', required: true },
    { name: 'offset', type: 'number', description: '起始行号', required: false },
    { name: 'limit', type: 'number', description: '最大行数', required: false },
  ],
  execute: async ({ file_path, offset, limit }) => {
    const content = await fs.readFile(file_path, 'utf-8');
    const lines = content.split('\n');

    if (offset || limit) {
      const start = offset || 0;
      const end = limit ? start + limit : lines.length;
      return { success: true, data: lines.slice(start, end).join('\n') };
    }

    return { success: true, data: content };
  },
};

export const writeTool: Tool = {
  name: 'write',
  description: '写入文件',
  parameters: [
    { name: 'file_path', type: 'string', required: true },
    { name: 'content', type: 'string', required: true },
  ],
  dangerous: true,
  execute: async ({ file_path, content }) => {
    await fs.mkdir(path.dirname(file_path), { recursive: true });
    await fs.writeFile(file_path, content, 'utf-8');
    return { success: true, data: `Wrote ${content.length} bytes` };
  },
};

export const editTool: Tool = {
  name: 'edit',
  description: '编辑文件（查找替换）',
  parameters: [
    { name: 'file_path', type: 'string', required: true },
    { name: 'old_string', type: 'string', required: true },
    { name: 'new_string', type: 'string', required: true },
    { name: 'replace_all', type: 'boolean', required: false },
  ],
  dangerous: true,
  execute: async ({ file_path, old_string, new_string, replace_all }) => {
    const content = await fs.readFile(file_path, 'utf-8');
    const count = (content.match(new RegExp(escapeRegex(old_string), 'g')) || []).length;

    if (count > 1 && !replace_all) {
      return {
        success: false,
        error: `Found ${count} occurrences, use replace_all: true to replace all`,
      };
    }

    const newContent = replace_all
      ? content.split(old_string).join(new_string)
      : content.replace(old_string, new_string);

    await fs.writeFile(file_path, newContent, 'utf-8');
    return { success: true, data: `Replaced ${count} occurrence(s)` };
  },
};
```

#### 搜索工具

```typescript
export const grepTool: Tool = {
  name: 'grep',
  description: '在文件中搜索文本',
  parameters: [
    { name: 'pattern', type: 'string', required: true },
    { name: 'path', type: 'string', required: false },
    { name: 'glob', type: 'string', required: false },
    { name: 'ignore_case', type: 'boolean', required: false },
  ],
  execute: async ({ pattern, path = '.', glob, ignore_case = false }) => {
    const files = await findFiles(path, glob);
    const regex = new RegExp(pattern, ignore_case ? 'gi' : 'g');
    const results: MatchResult[] = [];

    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          results.push({ file, line: i + 1, content: lines[i].trim() });
        }
      }
    }

    return { success: true, data: { results, count: results.length } };
  },
};

export const globTool: Tool = {
  name: 'glob',
  description: '查找匹配模式的文件',
  parameters: [
    { name: 'pattern', type: 'string', required: true },
    { name: 'path', type: 'string', required: false },
  ],
  execute: async ({ pattern, path = '.' }) => {
    const files = await fastGlob(pattern, { cwd: path, onlyFiles: true });
    return { success: true, data: { files, count: files.length } };
  },
};
```

#### Bash 工具

```typescript
export const bashTool: Tool = {
  name: 'bash',
  description: '执行 Shell 命令',
  parameters: [
    { name: 'command', type: 'string', required: true },
    { name: 'timeout', type: 'number', required: false },
    { name: 'cwd', type: 'string', required: false },
  ],
  dangerous: true,
  execute: async ({ command, timeout = 120000, cwd }) => {
    // 安全检查
    if (isDangerousCommand(command)) {
      return { success: false, error: 'Command blocked: potentially dangerous' };
    }

    // 执行命令
    const { stdout, stderr, exitCode } = await execa(command, {
      shell: true,
      cwd,
      timeout,
      stdio: 'pipe',
    });

    return {
      success: exitCode === 0,
      data: { stdout, stderr, exitCode },
    };
  },
};
```

### MCP 集成

```typescript
class MCPClient {
  private servers: Map<string, ChildProcess>;

  // 连接 MCP 服务器
  async connect(config: MCPServerConfig): Promise<boolean> {
    const process = spawn(config.command, config.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // 初始化握手
    await this.initializeServer(process);

    this.servers.set(config.name, process);
    return true;
  }

  // 调用 MCP 工具
  async callTool(
    serverName: string,
    toolName: string,
    params: Record<string, unknown>
  ): Promise<ToolResult> {
    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: toolName, arguments: params },
    };

    const response = await this.sendRequest(serverName, request);
    return response.result;
  }
}
```

---

## LLM 集成层

### LLM 客户端接口

```typescript
interface LLMClient {
  chat(params: LLMChatParams): Promise<LLMResponse>;
  countTokens(text: string): number;
}
```

### Claude 客户端实现

```typescript
class ClaudeClient implements LLMClient {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(config: ClaudeConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model || 'claude-3-5-sonnet-20241022';
    this.maxTokens = config.maxTokens || 8192;
  }

  async chat(params: LLMChatParams): Promise<LLMResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      messages: this.convertMessages(params.messages),
      tools: this.convertTools(params.tools),
    });

    // 解析响应
    return {
      content: this.extractContent(response),
      toolCalls: this.extractToolCalls(response),
      finishReason: response.stop_reason,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }

  countTokens(text: string): number {
    // 使用 tiktoken 精确计数
    const encoding = get_encoding('cl100k_base');
    return encoding.encode(text).length;
  }
}
```

### OpenAI 客户端实现

```typescript
class OpenAIClient implements LLMClient {
  private client: OpenAI;
  private model: string;
  private maxTokens: number;

  constructor(config: OpenAIConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
    this.model = config.model || 'gpt-4o';
    this.maxTokens = config.maxTokens || 4096;
  }

  async chat(params: LLMChatParams): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: this.maxTokens,
      messages: this.convertMessages(params.messages),
      tools: this.convertTools(params.tools),
    });

    const choice = response.choices[0];

    return {
      content: choice.message.content || '',
      toolCalls: choice.message.tool_calls?.map(tc => ({
        id: tc.id,
        name: tc.function.name,
        parameters: JSON.parse(tc.function.arguments),
      })),
      finishReason: choice.finish_reason === 'tool_calls' ? 'tool_calls' : 'stop',
      usage: {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      },
    };
  }

  countTokens(text: string): number {
    const encoding = get_encoding('cl100k_base');
    return encoding.encode(text).length;
  }
}
```

### LLM 工厂

```typescript
class LLMClientFactory {
  static create(config: LLMConfig): LLMClient {
    switch (config.provider) {
      case 'anthropic':
      case 'claude':
        return new ClaudeClient(config);
      case 'openai':
        return new OpenAIClient(config);
      default:
        throw new Error(`Unsupported provider: ${config.provider}`);
    }
  }
}
```

---

## 压缩策略实现

### 上下文压缩器

```typescript
class ContextCompressor {
  compress(
    context: Context,
    strategy: 'none' | 'lru' | 'smart' | 'summary'
  ): Context {
    switch (strategy) {
      case 'lru':
        return this.compressLRU(context);
      case 'smart':
        return this.compressSmart(context);
      case 'summary':
        return this.compressSummary(context);
      default:
        return context;
    }
  }

  private compressLRU(context: Context): Context {
    // 保留系统消息和最近 N 条消息
    const systemMessages = context.messages.filter(m => m.role === 'system');
    const recentMessages = context.messages
      .filter(m => m.role !== 'system')
      .slice(-this.maxMessages);

    return {
      ...context,
      messages: [...systemMessages, ...recentMessages],
    };
  }

  private compressSmart(context: Context): Context {
    // 基于重要性评分保留消息
    const scored = context.messages.map(msg => ({
      message: msg,
      score: this.scoreMessage(msg, context),
    }));

    // 按分数排序，保留高分的
    const sorted = scored.sort((a, b) => b.score - a.score);
    const kept = sorted.slice(0, this.maxMessages);

    return {
      ...context,
      messages: kept.map(s => s.message).sort(byTimestamp),
    };
  }

  private compressSummary(context: Context): Context {
    // 生成摘要替代旧消息
    const oldMessages = context.messages.slice(0, -this.recentCount);
    const summary = this.generateSummary(oldMessages);

    const summaryMessage: Message = {
      role: 'system',
      content: `[Summary]: ${summary}`,
      timestamp: Date.now(),
    };

    const recentMessages = context.messages.slice(-this.recentCount);

    return {
      ...context,
      messages: [
        ...context.messages.filter(m => m.role === 'system'),
        summaryMessage,
        ...recentMessages,
      ],
    };
  }
}
```

### 内存压缩器

```typescript
class MemoryCompressor {
  compress(
    memory: MemoryItem[],
    strategy: 'importance' | 'deduplicate' | 'summarize'
  ): MemoryItem[] {
    switch (strategy) {
      case 'importance':
        return this.compressByImportance(memory);
      case 'deduplicate':
        return this.compressByDeduplication(memory);
      case 'summarize':
        return this.compressBySummarization(memory);
    }
  }

  private compressByImportance(memory: MemoryItem[]): MemoryItem[] {
    // 过滤低重要性记忆
    return memory
      .filter(m => m.importance >= this.minImportance)
      .sort((a, b) => b.importance - a.importance)
      .slice(0, this.maxItems);
  }
}
```

### 观察掩码器

```typescript
class ObservationMasker {
  mask(
    observations: Observation[],
    strategy: 'none' | 'truncate' | 'adaptive'
  ): Observation[] {
    switch (strategy) {
      case 'truncate':
        return this.maskByTruncation(observations);
      case 'adaptive':
        return this.maskAdaptively(observations);
      default:
        return observations;
    }
  }

  private maskByTruncation(observations: Observation[]): Observation[] {
    return observations.map(obs => {
      if (obs.content.length <= this.maxLength) return obs;

      return {
        ...obs,
        content: obs.content.substring(0, this.maxLength) + '...[truncated]',
        masked: true,
      };
    });
  }
}
```

---

## 代码解析模块

### Tree-sitter 解析器

```typescript
class TreeSitterParser {
  private parsers: Map<string, Parser>;

  async parse(code: string, language: string): Promise<AST> {
    const parser = await this.getParser(language);
    const tree = parser.parse(code);

    return {
      root: tree.rootNode,
      symbols: this.extractSymbols(tree),
    };
  }

  private extractSymbols(tree: Tree): CodeSymbol[] {
    const symbols: CodeSymbol[] = [];

    const visit = (node: TreeNode) => {
      if (this.isSymbolNode(node)) {
        symbols.push({
          name: node.text,
          kind: this.getSymbolKind(node),
          range: node.range,
        });
      }

      for (const child of node.children) {
        visit(child);
      }
    };

    visit(tree.rootNode);
    return symbols;
  }
}
```

### 代码索引器

```typescript
class CodeIndexer {
  private symbols: Map<string, CodeSymbol[]>;
  private symbolIndex: Map<string, CodeSymbol>; // name -> symbol

  async indexDirectory(dirPath: string): Promise<void> {
    const files = await findSourceFiles(dirPath);

    for (const file of files) {
      const symbols = await this.indexFile(file);
      this.addSymbols(file, symbols);
    }
  }

  async indexFile(filePath: string): Promise<CodeSymbol[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    const language = this.detectLanguage(filePath);

    const parser = new TreeSitterParser();
    const ast = await parser.parse(content, language);

    return parser.extractSymbols(ast);
  }

  search(query: string): CodeSymbol[] {
    const results: CodeSymbol[] = [];

    for (const symbols of this.symbols.values()) {
      for (const symbol of symbols) {
        if (symbol.name.includes(query)) {
          results.push(symbol);
        }
      }
    }

    return results;
  }
}
```

### LSP 客户端

```typescript
class LSPClient {
  private connections: Map<string, LSPConnection>;

  async connect(language: string): Promise<void> {
    const server = await this.getLanguageServer(language);
    const connection = new LSPConnection(server);

    await connection.initialize();
    this.connections.set(language, connection);
  }

  async gotoDefinition(
    filePath: string,
    line: number,
    column: number
  ): Promise<Location | null> {
    const language = this.detectLanguage(filePath);
    const connection = this.connections.get(language);

    if (!connection) return null;

    return await connection.definition({
      textDocument: { uri: filePath },
      position: { line, character: column },
    });
  }

  async getDiagnostics(filePath: string): Promise<Diagnostic[]> {
    const language = this.detectLanguage(filePath);
    const connection = this.connections.get(language);

    if (!connection) return [];

    return await connection.diagnostics({ uri: filePath });
  }
}
```

---

## 安全与权限

### 权限管理器

```typescript
class PermissionManager {
  private permissionLevel: PermissionLevel;
  private cache: Map<string, boolean>;

  constructor(level: PermissionLevel = 'ask') {
    this.permissionLevel = level;
    this.cache = new Map();
  }

  requiresPermission(tool: Tool, params: Record<string, unknown>): boolean {
    const risk = this.assessRisk(tool, params);

    switch (this.permissionLevel) {
      case 'bypass':
        return false;
      case 'accept':
        return risk === 'critical';
      case 'ask':
        return risk !== 'low';
      case 'plan':
        return true;
    }
  }

  async requestPermission(
    tool: string,
    params: Record<string, unknown>
  ): Promise<boolean> {
    const key = `${tool}:${JSON.stringify(params)}`;

    // 检查缓存
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    // 请求用户确认
    const approved = await this.promptUser(tool, params);
    this.cache.set(key, approved);

    return approved;
  }

  private assessRisk(tool: Tool, params: Record<string, unknown>): RiskLevel {
    let risk = tool.dangerous ? 'medium' : 'low';

    // 检查危险模式
    const paramsStr = JSON.stringify(params).toLowerCase();

    if (/rm -rf/.test(paramsStr)) return 'critical';
    if (/chmod 777/.test(paramsStr)) return 'high';
    if (/sudo/.test(paramsStr)) risk = 'high';

    return risk;
  }
}
```

### 沙箱执行

```typescript
class Sandbox {
  private allowedPaths: Set<string>;
  private deniedPaths: Set<string>;
  private timeout: number;

  async execute(fn: () => Promise<any>): Promise<any> {
    // 超时保护
    return Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Sandbox timeout')), this.timeout)
      ),
    ]);
  }

  async executeCommand(command: string): Promise<SandboxResult> {
    // 路径检查
    if (this.isDangerousPath(command)) {
      throw new Error('Path not allowed');
    }

    // 模式检查
    if (this.isDangerousCommand(command)) {
      throw new Error('Command not allowed');
    }

    // 执行
    return await execa(command, { shell: true, timeout: this.timeout });
  }
}
```

---

## 持久化存储

### 数据库封装

```typescript
class NanoDatabase {
  private db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        context_json TEXT NOT NULL,
        config_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS history (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL
      );
    `);
  }

  saveSession(session: Session): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO sessions
      VALUES (?, ?, ?, ?, ?)
    `).run(
      session.id,
      session.createdAt,
      session.updatedAt,
      JSON.stringify(session.context),
      JSON.stringify(session.config)
    );
  }

  loadSession(id: string): Session | null {
    const row = this.db.get(
      'SELECT * FROM sessions WHERE id = ?',
      [id]
    );

    if (!row) return null;

    return {
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      context: JSON.parse(row.context_json),
      config: JSON.parse(row.config_json),
    };
  }
}
```

### 会话管理器

```typescript
class SessionManager {
  private db: NanoDatabase;

  async createSession(config: Partial<AgentConfig>): Promise<Session> {
    const session: Session = {
      id: uuid(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      context: this.createEmptyContext(),
      config: { ...this.getDefaultConfig(), ...config },
    };

    this.db.saveSession(session);
    return session;
  }

  async updateSession(id: string, updates: Partial<Session>): Promise<void> {
    const session = this.db.loadSession(id);
    if (!session) throw new Error('Session not found');

    const updated = {
      ...session,
      ...updates,
      id: session.id,
      updatedAt: Date.now(),
    };

    this.db.saveSession(updated);
  }

  async listSessions(): Promise<SessionSummary[]> {
    const rows = this.db.all(
      'SELECT id, created_at, updated_at FROM sessions ORDER BY updated_at DESC'
    );

    return rows.map(row => ({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }
}
```

---

## CLI 层设计

### 命令结构

```typescript
// 使用 Commander.js 定义命令
const program = new Command();

program
  .name('nanocode')
  .version('0.1.0');

// run 命令
program
  .command('run [prompt...]')
  .description('运行 NanoCode')
  .option('-s, --skill <name>', '使用指定技能')
  .option('-m, --model <name>', '使用指定模型')
  .action(async (prompt, options) => {
    await runAgent(prompt.join(' '), options);
  });

// chat 命令
program
  .command('chat')
  .description('启动交互式对话')
  .option('-s, --session <id>', '恢复指定会话')
  .action(async (options) => {
    await startChat(options);
  });

// plan 命令
program
  .command('plan [task...]')
  .description('规划模式')
  .action(async (task, options) => {
    await planTask(task.join(' '), options);
  });
```

### 交互式提示

```typescript
import input from '@inquirer/prompts/input';
import confirm from '@inquirer/prompts/confirm';

async function promptUser(message: string): Promise<string> {
  return await input({ message });
}

async function confirmAction(message: string): Promise<boolean> {
  return await confirm({ message, default: true });
}

async function selectOption(
  message: string,
  choices: string[]
): Promise<string> {
  return await select({ message, choices });
}
```

### 终端 UI（使用 Ink）

```tsx
import { render, Text, Box } from 'ink';

function App({ state, logs }: { state: AgentState; logs: string[] }) {
  return (
    <Box flexDirection="column">
      <Box>
        <Text bold color="green">
          NanoCode [{state}]
        </Text>
      </Box>
      <Box flexDirection="column">
        {logs.map((log, i) => (
          <Text key={i}>{log}</Text>
        ))}
      </Box>
    </Box>
  );
}

// 渲染 UI
const { unmount } = render(<App state="thinking" logs={[]} />);
```

---

## 技能系统

### 技能注册表

```typescript
class SkillRegistry {
  private skills: Map<string, Skill>;

  register(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  async execute(name: string, args: string[]): Promise<void> {
    const skill = this.skills.get(name);
    if (!skill) throw new Error(`Skill not found: ${name}`);

    const context = await this.getContext();
    await skill.handler(args, context);
  }
}
```

### 技能执行器

```typescript
class SkillExecutor {
  async execute(
    skill: Skill,
    args: string[],
    context: Context
  ): Promise<SkillResult> {
    const startTime = Date.now();

    try {
      // 超时保护
      const result = await Promise.race([
        skill.handler(args, context),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), this.timeout)
        ),
      ]);

      return {
        success: true,
        output: result,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        durationMs: Date.now() - startTime,
      };
    }
  }
}
```

### 内置技能

```typescript
// commit 技能
const commitSkill: Skill = {
  name: 'commit',
  description: '创建 Git 提交',
  category: 'git',
  handler: async (args, context) => {
    const message = args.join(' ') || 'Update code';

    // 分析变更
    const changes = await getGitChanges();

    // 生成提交信息（使用 LLM）
    const commitMessage = await generateCommitMessage(changes, context);

    // 执行提交
    await execa('git', ['add', '.']);
    await execa('git', ['commit', '-m', commitMessage]);

    console.log('✓ Commit created:', commitMessage);
  },
};

// review-pr 技能
const reviewPrSkill: Skill = {
  name: 'review-pr',
  description: '审查 Pull Request',
  category: 'git',
  handler: async (args, context) => {
    const prNumber = args[0];

    // 获取 PR 信息
    const pr = await getPullRequest(prNumber);
    const files = await getPrFiles(prNumber);

    // 分析变更
    const review = await analyzeChanges(files, context);

    // 输出审查结果
    console.log('PR Review:');
    console.log(JSON.stringify(review, null, 2));
  },
};
```

---

## 数据流与状态流转

### 完整的数据流

```
用户输入
   │
   ▼
┌─────────────┐
│ CLI Parser  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Agent Loop  │◄───┐
└──────┬──────┘     │
       │            │
       ▼            │
┌─────────────┐     │
│ Context Mgr │     │
└──────┬──────┘     │
       │            │
       ▼            │
┌─────────────┐     │
│ LLM Client  │     │
└──────┬──────┘     │
       │            │
       ▼            │
┌─────────────┐     │
│ Tool Reg   │     │
└──────┬──────┘     │
       │            │
       ▼            │
┌─────────────┐     │
│ Execution  │     │
└──────┬──────┘     │
       │            │
       └────────────┘
```

### 状态流转图

```
┌────────┐
│  Idle  │
└───┬────┘
    │ User Input
    ▼
┌───────────┐
│ Planning  │
└─────┬─────┘
      │ Plan Generated
      ▼
┌───────────┐
│ Thinking  │
└─────┬─────┘
      │
      ├──► Tool Call ──► Acting ──► Observing ──► Thinking
      │
      └──► No Tool Call ──► Completed
```

### 事件系统

```typescript
class AgentLoop extends EventEmitter {
  // 核心事件
  emit('start', { prompt: string });
  emit('step', { state, thought, action, result });
  emit('complete', { context, iterations });
  emit('error', { error });
  emit('compressing', { currentTokens });
  emit('compressed', { newTokens });
  emit('permissionRequest', { tool, parameters });
  emit('toolRegistered', tool);
}

// 使用示例
agent.on('step', ({ thought, action }) => {
  console.log('Thought:', thought);
  console.log('Action:', action);
});

agent.on('complete', ({ iterations }) => {
  console.log('Completed in', iterations, 'iterations');
});
```

---

## 扩展点与插件机制

### 自定义工具

```typescript
// 注册自定义工具
toolRegistry.register({
  name: 'my-custom-tool',
  description: '我的自定义工具',
  parameters: [
    { name: 'input', type: 'string', required: true },
  ],
  execute: async ({ input }) => {
    // 自定义逻辑
    return { success: true, data: `Processed: ${input}` };
  },
}, 'custom');
```

### 自定义技能

```typescript
// 注册自定义技能
skillRegistry.register({
  name: 'my-skill',
  description: '我的技能',
  category: 'custom',
  handler: async (args, context) => {
    // 技能逻辑
    console.log('Executing skill with args:', args);
  },
});
```

### 自定义压缩策略

```typescript
// 注册自定义压缩器
class CustomCompressor implements Compressor {
  compress(context: Context): Context {
    // 自定义压缩逻辑
    return context;
  }
}

contextCompressor.setStrategy('custom', new CustomCompressor());
```

---

## 性能优化建议

### 1. 并发处理

```typescript
// 并发执行多个工具
const results = await Promise.all(
  toolCalls.map(call => toolRegistry.execute(call.name, call.params, options))
);
```

### 2. 缓存策略

```typescript
class Cache {
  private cache: Map<string, { value: any; expires: number }>;

  get(key: string): any {
    const item = this.cache.get(key);
    if (!item || item.expires < Date.now()) {
      return undefined;
    }
    return item.value;
  }

  set(key: string, value: any, ttl: number): void {
    this.cache.set(key, {
      value,
      expires: Date.now() + ttl,
    });
  }
}
```

### 3. 流式处理

```typescript
// 流式读取大文件
async function* streamFile(filePath: string): AsyncGenerator<string> {
  const stream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: stream });

  for await (const line of rl) {
    yield line;
  }
}

// 使用
for await (const line of streamFile(largeFile)) {
  // 处理每一行
}
```

---

## 测试策略

### 单元测试

```typescript
import { describe, it, expect } from 'vitest';

describe('ToolRegistry', () => {
  it('should register a tool', () => {
    const registry = new ToolRegistry();
    const tool = mockTool();

    registry.register(tool);

    expect(registry.get(tool.name)).toBe(tool);
  });

  it('should execute tool', async () => {
    const registry = new ToolRegistry();
    const tool = mockTool();

    const result = await registry.execute(tool.name, {}, {
      permissionLevel: 'bypass',
    });

    expect(result.success).toBe(true);
  });
});
```

### 集成测试

```typescript
import { describe, it, expect } from 'vitest';

describe('AgentLoop Integration', () => {
  it('should complete a simple task', async () => {
    const agent = createTestAgent();

    const result = await agent.run('Say hello');

    expect(result.messages[result.messages.length - 1].content)
      .toContain('hello');
  });
});
```

---

## 部署与打包

### 构建流程

```bash
# 1. 类型检查
npm run check

# 2. 编译
npm run build

# 3. 打包
npm run package

# 4. 测试
npm test
```

### 发布流程

```bash
# 1. 更新版本
npm version patch/minor/major

# 2. 发布到 npm
npm publish
```

---

## 未来展望

### 短期目标（v0.2）

- [ ] 完善所有内置工具
- [ ] 实现 MCP 完整协议
- [ ] 添加 LSP 真实集成
- [ ] 完善测试覆盖

### 中期目标（v0.5）

- [ ] 支持多智能体协作
- [ ] 实现子任务分配
- [ ] 添加代码审查技能
- [ ] 支持更多 LLM 提供商

### 长期目标（v1.0）

- [ ] 完整的 IDE 集成
- [ ] 企业级权限管理
- [ ] 性能优化和大规模项目支持
- [ ] 完整的文档和教程
