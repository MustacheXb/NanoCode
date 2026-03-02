# Tools Built-in Module

**Purpose:** Core tool implementations for agent capabilities

## OVERVIEW

File, bash, search, LSP, and web tools. Each implements `Tool` interface from `src/types/index.ts`.

## WHERE TO LOOK

| Task                  | File        | Notes                                  |
| --------------------- | ----------- | -------------------------------------- |
| Add file operation    | `file.ts`   | read, write, edit, exists, list tools  |
| Add shell command     | `bash.ts`   | bash, chain tools with security checks |
| Add search capability | `search.ts` | grep, glob, search tools               |
| Add LSP integration   | `lsp.ts`    | LSP client operations                  |
| Add web operations    | `web.ts`    | HTTP requests, web scraping            |

## TOOL INTERFACE

```typescript
interface Tool {
  name: string
  description: string
  parameters: ToolParameter[]
  execute: (params: Record<string, unknown>) => Promise<ToolResult>
  dangerous?: boolean // Requires permission check
}
```

## CONVENTIONS

- **Safety**: Mark `dangerous: true` for destructive operations (write, bash, edit)
- **Error handling**: Always return `ToolResult` with success/error, never throw
- **Parameter validation**: Define all parameters in `parameters[]` array
- **File paths**: Use absolute paths or resolve relative to project root

## REGISTERING TOOLS

Tools auto-register via `src/tools/index.ts`:

```typescript
import { bashTool, chainTool } from './bash.js'
import { readTool, writeTool, editTool } from './file.js'

toolRegistry.register(bashTool, 'execution')
toolRegistry.register(readTool, 'filesystem')
```

## ANTI-PATTERNS

- **Throwing errors**: Return `{ success: false, error: '...' }` instead
- **Missing dangerous flag**: Shell commands, file writes MUST be marked dangerous
- **Hardcoded paths**: Use parameters for all paths
