# NanoAgent

A command-line AI programming agent powered by Claude, inspired by Claude Code and OpenCode.

## Overview

NanoAgent is a self-driven intelligent agent for software engineering tasks. It features a complete Agent Loop, MCP tool scheduling, context/memory compression, and intelligent codebase perception.

## Core Features

- **Agent Loop**: State machine-driven agent execution with observation, thought, and action cycles
- **Tool System**: Built-in tools (file, search, bash, LSP, web) and MCP protocol integration
- **Compression**: Context compression, memory management, and observation masking
- **Code Intelligence**: Tree-sitter parsing, LSP integration, and symbol indexing
- **Security**: Permission model (Plan/Ask/Accept/Bypass) and execution sandbox
- **Persistence**: SQLite-based session management and history tracking

## Quick Start

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run the CLI
nanoagent --help

# Development mode with hot reload
npm run dev
```

## Project Structure

```
nanoagent/
├── src/
│   ├── cli/                 # Command-line interface
│   ├── core/               # Core agent logic
│   ├── tools/              # Tool system
│   ├── compression/        # Compression strategies
│   ├── parser/             # Code parsing (Tree-sitter, LSP)
│   ├── security/           # Security & permissions
│   ├── storage/            # Persistent storage
│   ├── llm/                # LLM integration
│   ├── skills/             # Skill system
│   └── types/              # TypeScript types
├── config/                 # Configuration files
├── test/                   # Tests
└── scripts/                # Build scripts
```

## Development

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn

### Setup

```bash
# Clone and navigate to project
cd nanoagent

# Install dependencies
npm install

# Run tests
npm test

# Run with TypeScript compiler watch mode
npm run dev

# Build for production
npm run build
```

### Code Style

```bash
# Format code
npm run format

# Lint code
npm run lint
```

## Usage Examples

```bash
# Initialize a new session
nanoagent init

# Run with a specific skill
nanoagent run --skill commit

# Interactive mode
nanoagent chat

# Plan mode for complex tasks
nanoagent plan "Add user authentication"
```

## Configuration

Configuration is stored in `config/default.json`. Key options include:

- **LLM Settings**: API key, model selection
- **Tool Configuration**: Enabled tools, MCP servers
- **Security Settings**: Permission levels, sandbox options
- **Compression Settings**: Token limits, strategies

## Roadmap

### Phase 1: Core Foundation
- [x] Project structure
- [ ] Basic Agent Loop
- [ ] Built-in tools (file, search, bash)
- [ ] LLM client integration

### Phase 2: Tool System
- [ ] MCP protocol integration
- [ ] Tool registry and scheduling
- [ ] Permission model
- [ ] Sandbox execution

### Phase 3: Code Intelligence
- [ ] Tree-sitter parsing
- [ ] LSP client
- [ ] Symbol indexing

### Phase 4: Advanced Features
- [ ] Context compression
- [ ] Memory management
- [ ] Skill system
- [ ] UI/UX improvements

## License

MIT
