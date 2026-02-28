# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NanoAgent is a command-line AI programming agent inspired by Claude Code and OpenCode. It implements a self-driven intelligent agent with Agent Loop, MCP tool scheduling, context/memory compression, and code intelligence capabilities.

## Commands

```bash
# Build
pnpm run build          # Compile TypeScript to dist/

# Development
pnpm run dev            # Watch mode with tsx

# Testing
pnpm test               # Run all tests with vitest
pnpm test:unit          # Run unit tests only
pnpm test:integration   # Run integration tests only

# Code Quality
pnpm run lint           # Run ESLint
pnpm run format         # Format with Prettier

# Run CLI
node dist/cli/index.js --help
node dist/cli/index.js init
node dist/cli/index.js chat
node dist/cli/index.js run "your prompt"
```

## Architecture

### Core Components

- **Agent Loop** (`src/core/agent-loop.ts`): State machine implementing the observation → thought → action cycle. States: `idle` → `thinking` → `acting` → `observing` → `completed`. Emits events for each step.

- **Tool System** (`src/tools/`): Registry pattern for tool management. Built-in tools in `builtin/`, MCP protocol in `mcp/`. Each tool has name, description, parameters schema, and async execute function.

- **LLM Client** (`src/llm/client.ts`): Dual-provider support (Claude/OpenAI). Factory pattern creates appropriate client. Message conversion handles provider-specific formats.

- **Context Manager** (`src/core/context.ts`): Manages messages, memory items, and observations with automatic compression when token thresholds are exceeded.

### Data Flow

```
User Input → CLI → AgentLoop.run()
                    ↓
              Context.addMessage()
                    ↓
              LLMClient.chat()
                    ↓
              Tool execution (if tool_calls)
                    ↓
              Observation recorded
                    ↓
              Loop continues until stop
```

### Module Dependencies

```
cli → core → tools
            → llm → tokenizer
            → storage
            → security
```

## TypeScript Patterns

### Type Unions Instead of Enums

This project uses string literal type unions instead of TypeScript enums to avoid import issues with `import type`:

```typescript
// Correct pattern
export type AgentState = 'idle' | 'thinking' | 'acting' | 'observing' | 'completed' | 'error';
export type PermissionLevel = 'bypass' | 'accept' | 'ask' | 'plan';

// Avoid enums
```

### ESM JSON Imports

Node.js ESM requires special handling for JSON imports. Use fs.readFileSync instead of direct imports:

```typescript
// Correct pattern
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

// Avoid: import * as packageJson from '../package.json'
```

### Unused Parameter Convention

Prefix unused parameters with underscore to satisfy TypeScript:

```typescript
private method(required: string, _unused: string): void {
  // _unused parameter intentionally ignored
}
```

## Key Files

| File | Purpose |
|------|---------|
| `src/types/index.ts` | All shared type definitions |
| `src/core/agent-loop.ts` | Main agent state machine |
| `src/llm/client.ts` | Claude and OpenAI client implementations |
| `src/tools/index.ts` | Tool registry and execution |
| `src/storage/database.ts` | SQLite wrapper for persistence |
| `src/cli/index.ts` | CLI entry point with Commander.js |

## Configuration

Default config in `config/default.json`:
- LLM settings (apiKey, model, maxTokens)
- Tool enablement and MCP servers
- Security (permissionLevel: 'bypass'|'accept'|'ask'|'plan')
- Compression (maxContextTokens, memoryStrategy)

## Testing

Tests use Vitest. Place unit tests in `test/unit/` and integration tests in `test/integration/`. Test files should match `*.test.ts` pattern.