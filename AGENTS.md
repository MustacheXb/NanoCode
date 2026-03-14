# PROJECT KNOWLEDGE BASE

**Generated:** 2026-03-02
**Commit:** c826113
**Branch:** main

## OVERVIEW

CLI AI programming agent implementing Agent Loop pattern (observation→thought→action). TypeScript/Node.js ESM. Dual LLM provider (Claude/OpenAI). MCP tool scheduling. SQLite persistence.

## STRUCTURE

```
nanocode/
├── src/
│   ├── cli/           # Commander.js CLI entry, commands, prompts
│   ├── core/          # AgentLoop state machine, context management
│   ├── tools/         # Tool registry + builtin (file, bash, search, lsp, web) + mcp
│   ├── llm/           # Dual-provider client (Claude/OpenAI), tokenizer
│   ├── compression/   # Context compression strategies (LRU, smart)
│   ├── parser/        # Tree-sitter, LSP client, symbol indexing
│   ├── security/      # Permission levels, sandbox execution
│   ├── storage/       # SQLite sessions, history, database wrapper
│   ├── skills/        # Skill registry and executor
│   └── types/         # All shared type definitions (single file)
├── config/            # default.json configuration
├── test/              # Vitest unit tests
└── dist/              # Compiled output
```

## WHERE TO LOOK

| Task                  | Location                 | Notes                                                   |
| --------------------- | ------------------------ | ------------------------------------------------------- |
| Add new tool          | `src/tools/builtin/`     | Implement Tool interface, register in index.ts          |
| Modify agent behavior | `src/core/agent-loop.ts` | State machine: idle→thinking→acting→observing→completed |
| Change LLM provider   | `src/llm/client.ts`      | Factory pattern creates Claude/OpenAI client            |
| Add message types     | `src/types/index.ts`     | ALL types in single file                                |
| Test patterns         | `test/unit/`             | Vitest, describe/it/expect, inline mocks                |
| Configuration         | `config/default.json`    | LLM, tools, security, compression settings              |

## CONVENTIONS

### Type Unions Over Enums

```typescript
// Correct
export type AgentState = 'idle' | 'thinking' | 'acting' | 'observing' | 'completed' | 'error'
// Avoid enums
```

### ESM JSON Imports

```typescript
// Correct - use fs.readFileSync
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'))
// Avoid: import pkg from './package.json'
```

### Unused Parameters

```typescript
private method(_unused: string): void { }  // Prefix with underscore
```

### Import Style

- Use `.js` extension in imports for ESM: `import { X } from './file.js'`
- `import type` for type-only imports

## ANTI-PATTERNS (THIS PROJECT)

- **Type suppression**: Never use `as any`, `@ts-ignore`, `@ts-expect-error`
- **Empty catch blocks**: Never `catch(e) {}`
- **Enums**: Use string literal type unions instead
- **Direct JSON imports**: Use fs.readFileSync pattern

## UNIQUE STYLES

- **Single types file**: All 251 lines of types in `src/types/index.ts`
- **Tool interface**: `name`, `description`, `parameters[]`, `execute()`, optional `dangerous`
- **Context compression**: Auto-triggers at `maxContextTokens` threshold
- **Permission levels**: `bypass` | `accept` | `ask` | `plan`
- **Memory strategies**: `lru` | `smart` | `none`

## COMMANDS

```bash
pnpm run build          # Compile TypeScript to dist/
pnpm run dev            # Watch mode with tsx
pnpm test               # Run all tests with vitest
pnpm test:unit          # Unit tests only
pnpm run lint           # ESLint
pnpm run format         # Prettier
node dist/cli/index.js --help
```

## NOTES

- **No CI/CD**: No .github/workflows directory
- **Integration tests**: `test/integration/thought-tracking.test.ts` validates Thought tracking
- **Duplicate configs**: Both `.prettierrc` and `prettier.config.js` exist
- **postinstall runs tsc**: Can slow npm installs
- **LSP unavailable in this environment**: typescript-language-server not installed globally

## THOUGHT TRACKING (NEW)

### Overview

ContextManager now includes comprehensive Thought tracking for the Agent Loop. Thoughts are automatically recorded during agent execution and can be queried, compressed, exported, and visualized.

### Key Features

- **Automatic Thought Recording**: Thoughts are tracked with state (thinking/acting/observing/completed/error)
- **Smart Compression**: LRU and smart compression strategies to manage memory
- **Multiple Export Formats**: JSON and CSV export for analysis
- **HTML Visualization**: Generate beautiful HTML reports with statistics
- **State-based Queries**: Filter thoughts by agent state
- **Metadata Support**: Rich metadata including confidence, alternatives, token usage

### API Usage

```typescript
// Add a thought
const thoughtId = contextManager.addThought({
  content: 'Analyzing the problem',
  state: 'thinking',
  metadata: {
    confidence: 0.95,
    tokensUsed: 42,
  },
})

// Get all thoughts
const allThoughts = await contextManager.getThoughts()

// Query by state
const thinkingThoughts = await contextManager.getThoughtsByState('thinking')

// Compress thoughts
await contextManager.compressThoughts()

// Export to JSON
const jsonExport = await contextManager.exportThoughts('json')

// Export to CSV
const csvExport = await contextManager.exportThoughts('csv')

// Generate HTML report
const htmlReport = await contextManager.generateThoughtReport()
```

### Integration with AgentLoop

The AgentLoop automatically creates Thought objects during state transitions:

- `thinking` state: Records LLM reasoning
- `acting` state: Records tool execution decisions
- `observing` state: Records observation analysis
- `completed` state: Records task completion
- `error` state: Records error conditions

### Testing

Integration tests in `test/integration/thought-tracking.test.ts` verify:

- Thought lifecycle tracking
- State-based querying
- Compression strategies
- Export functionality (JSON/CSV)
- HTML report generation
- Metadata handling
- Performance with large thought sets
