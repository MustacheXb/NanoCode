# Changelog

All notable changes to NanoCode will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-03-01

### Added

#### Core Foundation
- **Agent Loop**: State machine-driven agent execution with observation, thought, and action cycles
  - States: `idle` → `thinking` → `acting` → `observing` → `completed`
  - Event-driven architecture for step monitoring
- **Tool System**: Pluggable tool registry with built-in tools
  - File operations (read, write, edit, glob)
  - Search utilities (grep, pattern matching)
  - Bash command execution
  - LSP integration for code intelligence
  - Web fetch capabilities
  - MCP protocol client for external tool integration
- **LLM Client**: Dual-provider support
  - Claude (Anthropic) API integration
  - OpenAI API integration
  - Message format conversion between providers
- **Context Management**: Message and memory handling
  - Automatic token tracking
  - Context compression when thresholds exceeded
  - Memory strategy configuration

#### CLI Interface
- Command-line interface with Commander.js
- Commands: `run`, `init`, `chat`, `plan`
- Global options: `--version`, `--verbose`, `--quiet`, `--no-color`
- Interactive mode with Inquirer prompts

#### Storage & Persistence
- SQLite-based storage layer
- Session management and history tracking
- Database abstraction for queries

#### Security
- Permission model with four levels: `bypass`, `accept`, `ask`, `plan`
- Execution sandbox for safe tool operations
- Input validation at system boundaries

#### Code Intelligence
- Tree-sitter parser integration
- LSP client implementation
- Symbol indexing capabilities

### Infrastructure
- TypeScript project structure with ESM modules
- Build pipeline with `tsc`
- Development workflow with `tsx watch`
- Testing framework with Vitest
- Code quality tools: ESLint, Prettier

### Contributors
- MustacheXb

---

## Version History Summary

| Version | Date | Author | Description |
|---------|------|--------|-------------|
| 0.1.0 | 2026-03-01 | MustacheXb | Initial release with core agent loop, tool system, CLI interface |

---

## Roadmap

### [0.2.0] - Planned
- [ ] MCP server integration
- [ ] Enhanced context compression strategies
- [ ] Skill system implementation
- [ ] Improved error handling and recovery

### [0.3.0] - Planned
- [ ] Tree-sitter AST visualization
- [ ] Advanced LSP features (refactoring, diagnostics)
- [ ] Memory persistence across sessions
- [ ] Plugin architecture

### [1.0.0] - Planned
- [ ] Production-ready agent loop
- [ ] Comprehensive tool ecosystem
- [ ] Full MCP protocol support
- [ ] Complete documentation and examples