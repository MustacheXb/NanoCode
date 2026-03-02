# Core Module

**Purpose:** Agent loop state machine and context management

## OVERVIEW

Central orchestration layer. AgentLoop implements observation→thought→action cycle. Context manager handles messages, memory, and compression.

## WHERE TO LOOK

| Task                  | File            | Notes                                                   |
| --------------------- | --------------- | ------------------------------------------------------- |
| Modify agent behavior | `agent-loop.ts` | State machine: idle→thinking→acting→observing→completed |
| Context management    | `context.ts`    | Message history, memory items, token counting           |
| State definitions     | `state.ts`      | State transitions, event types                          |

## AGENT LOOP FLOW

```
run(prompt)
  → addMessage(user, prompt)
  → while (shouldContinue && iteration < max)
      → step()
        → think() → LLM call
        → act() → tool execution
        → observe() → record result
        → compressContext() if over threshold
  → emit('complete')
```

## STATE MACHINE

| State     | Trigger           | Next      |
| --------- | ----------------- | --------- |
| idle      | run()             | thinking  |
| thinking  | tool_calls        | acting    |
| thinking  | no tool_calls     | completed |
| acting    | execution done    | observing |
| observing | compression check | thinking  |
| error     | any error         | stopped   |

## EVENTS

- `start`, `step`, `complete`, `error`
- `permissionRequest` (dangerous tools)
- `compressing`, `compressed`

## CONTEXT COMPRESSION

Triggers when `tokensUsed > maxContextTokens`:

- `lru`: Keep system messages + last 50 non-system
- `smart`: LRU + importance scoring (stub)
- `none`: No compression

## CONVENTIONS

- **EventEmitter**: AgentLoop extends EventEmitter for async notifications
- **Permission checks**: Only when `permissionLevel !== 'bypass'`
- **Token tracking**: Update `metadata.tokensUsed` after each LLM call

## ANTI-PATTERNS

- **Blocking in constructor**: All async work in run()
- **Direct state mutation**: Use state machine transitions
- **Missing error handling**: Always set `result.error` on failure
