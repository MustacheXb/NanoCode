/**
 * CLI Commands
 * Command definitions for NanoCode
 */

import { Command } from 'commander';

/**
 * Initialize a new NanoCode project/session
 */
export const initCommand = new Command('init')
  .description('Initialize a new NanoCode session')
  .option('-c, --config <path>', 'Path to config file')
  .option('-d, --dir <path>', 'Working directory')
  .action(async (options) => {
    console.log('Initializing NanoCode session...');

    const { initSession } = await import('./prompts.js');
    await initSession(options);

    console.log('Session initialized!');
  });

/**
 * Run NanoCode with a prompt or skill
 */
export const runCommand = new Command('run')
  .description('Run NanoCode with a prompt or skill')
  .argument('[prompt...]', 'The prompt or command to execute')
  .option('-s, --skill <name>', 'Use a specific skill')
  .option('-f, --file <path>', 'Read prompt from file')
  .option('--non-interactive', 'Run in non-interactive mode')
  .option('--permission-level <level>', 'Permission level: bypass, accept, ask, plan')
  .action(async (promptArgs, options) => {
    const { runAgent } = await import('./prompts.js');

    let prompt = promptArgs.join(' ');

    if (options.file) {
      const fs = await import('fs/promises');
      const content = await fs.readFile(options.file, 'utf-8');
      prompt = content;
    }

    await runAgent(prompt, options);
  });

/**
 * Start interactive chat mode
 */
export const chatCommand = new Command('chat')
  .description('Start interactive chat mode')
  .option('-s, --session <id>', 'Resume an existing session')
  .option('-m, --model <name>', 'Use a specific model')
  .option('--permission-level <level>', 'Permission level: bypass, accept, ask, plan')
  .action(async (options) => {
    const { startChat } = await import('./prompts.js');
    await startChat(options);
  });

/**
 * Plan mode for complex tasks
 */
export const planCommand = new Command('plan')
  .description('Plan mode for complex multi-step tasks')
  .argument('[task...]', 'The task to plan')
  .option('-f, --file <path>', 'Read task from file')
  .option('--approve', 'Auto-approve the plan (skip review)')
  .action(async (taskArgs, options) => {
    const { planTask } = await import('./prompts.js');

    let task = taskArgs.join(' ');

    if (options.file) {
      const fs = await import('fs/promises');
      const content = await fs.readFile(options.file, 'utf-8');
      task = content;
    }

    await planTask(task, options);
  });

/**
 * Session management commands
 */
export const sessionCommand = new Command('session')
  .description('Manage sessions');

sessionCommand
  .command('list')
  .description('List all sessions')
  .action(async () => {
    const { listSessions } = await import('./prompts.js');
    await listSessions();
  });

sessionCommand
  .command('show <id>')
  .description('Show session details')
  .action(async (id) => {
    const { showSession } = await import('./prompts.js');
    await showSession(id);
  });

sessionCommand
  .command('delete <id>')
  .description('Delete a session')
  .action(async (id) => {
    const { deleteSession } = await import('./prompts.js');
    await deleteSession(id);
  });

/**
 * Tool management commands
 */
export const toolCommand = new Command('tool')
  .description('Manage tools');

toolCommand
  .command('list')
  .description('List all available tools')
  .option('-c, --category <name>', 'Filter by category')
  .action(async (options) => {
    const { listTools } = await import('./prompts.js');
    await listTools(options);
  });

toolCommand
  .command('enable <name>')
  .description('Enable a tool')
  .action(async (name) => {
    const { enableTool } = await import('./prompts.js');
    await enableTool(name);
  });

toolCommand
  .command('disable <name>')
  .description('Disable a tool')
  .action(async (name) => {
    const { disableTool } = await import('./prompts.js');
    await disableTool(name);
  });

/**
 * Skill management commands
 */
export const skillCommand = new Command('skill')
  .description('Manage skills');

skillCommand
  .command('list')
  .description('List all available skills')
  .option('-c, --category <name>', 'Filter by category')
  .action(async (options) => {
    const { listSkills } = await import('./prompts.js');
    await listSkills(options);
  });

skillCommand
  .command('run <name> [args...]')
  .description('Run a specific skill')
  .action(async (name, args) => {
    const { runSkill } = await import('./prompts.js');
    await runSkill(name, args);
  });

/**
 * Configuration commands
 */
export const configCommand = new Command('config')
  .description('Manage configuration');

configCommand
  .command('get [key]')
  .description('Get configuration value')
  .action(async (key) => {
    const { getConfig } = await import('./prompts.js');
    await getConfig(key);
  });

configCommand
  .command('set <key> <value>')
  .description('Set configuration value')
  .action(async (key, value) => {
    const { setConfig } = await import('./prompts.js');
    await setConfig(key, value);
  });

configCommand
  .command('edit')
  .description('Edit configuration file')
  .action(async () => {
    const { editConfig } = await import('./prompts.js');
    await editConfig();
  });