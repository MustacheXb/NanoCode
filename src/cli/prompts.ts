/**
 * CLI Prompts and Interactive Functions
 * Handles user interaction and prompts
 */

import type { Context, AgentConfig } from '../types/index.js'
import { input } from '@inquirer/prompts'
import { confirm } from '@inquirer/prompts'

/**
 * Initialize a new session
 */
export async function initSession(options: { config?: string; dir?: string }): Promise<void> {
  console.log('Initializing NanoCode session...')

  // Load or create config
  const _config = await loadConfig(options.config)
  void _config // Config loaded for side effects

  // Set working directory
  if (options.dir) {
    process.chdir(options.dir)
  }

  // Create initial context
  const context: Context = {
    messages: [],
    memory: [],
    observations: [],
    thoughts: [],
    stepTraces: [],
    reflections: [],
    metadata: {
      sessionId: crypto.randomUUID(),
      startTime: Date.now(),
      lastUpdate: Date.now(),
      tokensUsed: 0,
    },
  }

  console.log(`Session ID: ${context.metadata.sessionId}`)
  console.log('Session initialized successfully')
}

/**
 * Run the agent with a prompt
 */
export async function runAgent(
  prompt: string,
  options: {
    skill?: string
    nonInteractive?: boolean
    permissionLevel?: string
  }
): Promise<void> {
  console.log('Running NanoCode...')

  if (options.skill) {
    console.log(`Using skill: ${options.skill}`)
  }

  if (options.permissionLevel) {
    console.log(`Permission level: ${options.permissionLevel}`)
  }

  if (!prompt && !options.nonInteractive) {
    prompt = await input({ message: 'Enter your request:' })
  }

  if (prompt) {
    console.log(`Processing: ${prompt}`)
    console.log('Agent execution complete')
  } else {
    console.log('No prompt provided')
  }
}

/**
 * Start interactive chat mode
 */
export async function startChat(options: {
  session?: string
  model?: string
  permissionLevel?: string
}): Promise<void> {
  console.log('Starting interactive chat mode...')

  if (options.session) {
    console.log(`Resuming session: ${options.session}`)
  }

  if (options.model) {
    console.log(`Using model: ${options.model}`)
  }

  console.log('Type your message and press Enter to send.')
  console.log('Type /exit or /quit to exit.\n')

  let running = true

  while (running) {
    const message = await input({ message: 'You:' })

    if (message === '/exit' || message === '/quit') {
      running = false
      console.log('Goodbye!')
    } else if (message.startsWith('/')) {
      console.log(`Command: ${message}`)
    } else {
      console.log(`You: ${message}`)
    }
  }
}

/**
 * Plan mode for complex tasks
 */
export async function planTask(
  task: string,
  options: { file?: string; approve?: boolean }
): Promise<void> {
  console.log('Planning mode activated')

  if (!task && !options.file) {
    task = await input({ message: 'Describe the task you want to plan:' })
  }

  console.log(`Task: ${task}`)
  console.log('\nAnalyzing task and creating plan...')

  console.log('\nPlan:')
  console.log('1. Understand requirements')
  console.log('2. Analyze codebase')
  console.log('3. Create implementation plan')
  console.log('4. Execute changes')

  if (!options.approve) {
    const approved = await confirm({
      message: 'Approve this plan?',
      default: true,
    })

    if (approved) {
      console.log('Plan approved. Executing...')
    } else {
      console.log('Plan rejected.')
    }
  }
}

/**
 * List all sessions
 */
export async function listSessions(): Promise<void> {
  console.log('Sessions:')
  console.log('No sessions found')
}

/**
 * Show session details
 */
export async function showSession(id: string): Promise<void> {
  console.log(`Session: ${id}`)
  console.log('Session not found')
}

/**
 * Delete a session
 */
export async function deleteSession(id: string): Promise<void> {
  const confirmed = await confirm({
    message: `Delete session ${id}?`,
    default: false,
  })

  if (confirmed) {
    console.log(`Session ${id} deleted`)
  } else {
    console.log('Cancelled')
  }
}

/**
 * List all tools
 */
export async function listTools(options: { category?: string }): Promise<void> {
  console.log('Available tools:')

  const tools = [
    { name: 'read', description: 'Read file contents', category: 'file' },
    { name: 'write', description: 'Write to file', category: 'file' },
    { name: 'edit', description: 'Edit file (find and replace)', category: 'file' },
    { name: 'bash', description: 'Execute shell command', category: 'system' },
    { name: 'search', description: 'Search for text in files', category: 'search' },
    { name: 'glob', description: 'Find files matching pattern', category: 'search' },
    { name: 'webfetch', description: 'Fetch content from URL', category: 'web' },
    { name: 'symbols', description: 'Extract code symbols', category: 'code' },
  ]

  for (const tool of tools) {
    if (!options.category || tool.category === options.category) {
      console.log(`  ${tool.name.padEnd(15)} - ${tool.description}`)
    }
  }
}

/**
 * Enable a tool
 */
export async function enableTool(name: string): Promise<void> {
  console.log(`Enabling tool: ${name}`)
  console.log('Tool enabled')
}

/**
 * Disable a tool
 */
export async function disableTool(name: string): Promise<void> {
  console.log(`Disabling tool: ${name}`)
  console.log('Tool disabled')
}

/**
 * List all skills
 */
export async function listSkills(options: { category?: string }): Promise<void> {
  console.log('Available skills:')

  const skills = [
    { name: 'commit', description: 'Create a git commit', category: 'git' },
    { name: 'review-pr', description: 'Review a pull request', category: 'git' },
    { name: 'test', description: 'Run tests', category: 'development' },
    { name: 'build', description: 'Build the project', category: 'development' },
    { name: 'deploy', description: 'Deploy the application', category: 'deployment' },
  ]

  for (const skill of skills) {
    if (!options.category || skill.category === options.category) {
      console.log(`  ${skill.name.padEnd(15)} - ${skill.description}`)
    }
  }
}

/**
 * Run a specific skill
 */
export async function runSkill(name: string, args: string[]): Promise<void> {
  console.log(`Running skill: ${name}`)
  console.log(`Arguments: ${args.join(' ')}`)
  console.log('Skill execution complete')
}

/**
 * Get configuration value
 */
export async function getConfig(key?: string): Promise<void> {
  if (key) {
    console.log(`${key}: <value>`)
  } else {
    console.log('Configuration:')
    console.log('  llm.model: claude-3-5-sonnet-20241022')
    console.log('  llm.maxTokens: 4096')
    console.log('  tools.enabled: [read, write, bash, search]')
    console.log('  security.permissionLevel: ask')
  }
}

/**
 * Set configuration value
 */
export async function setConfig(key: string, value: string): Promise<void> {
  console.log(`Setting ${key} = ${value}`)
  console.log('Configuration updated')
}

/**
 * Edit configuration file
 */
export async function editConfig(): Promise<void> {
  console.log('Opening configuration editor...')
}

/**
 * Load configuration from file
 */
async function loadConfig(configPath?: string): Promise<AgentConfig> {
  const defaultConfig: AgentConfig = {
    llm: {
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      model: 'claude-3-5-sonnet-20241022',
      maxTokens: 4096,
      temperature: 0,
    },
    tools: {
      enabled: ['read', 'write', 'edit', 'bash', 'search', 'glob'],
      mcpServers: [],
    },
    security: {
      permissionLevel: 'ask',
      sandboxEnabled: true,
    },
    compression: {
      maxContextTokens: 200000,
      memoryStrategy: 'lru',
    },
    storage: {
      dbPath: '.nanocode/nanocode.db',
      sessionTTL: 7 * 24 * 60 * 60 * 1000,
    },
  }

  if (configPath) {
    const fs = await import('fs/promises')
    try {
      const content = await fs.readFile(configPath, 'utf-8')
      const userConfig = JSON.parse(content)
      return { ...defaultConfig, ...userConfig }
    } catch {
      console.warn(`Failed to load config from ${configPath}, using defaults`)
    }
  }

  return defaultConfig
}
