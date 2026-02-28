#!/usr/bin/env node

/**
 * NanoCode CLI
 * Main entry point for the command-line interface
 */

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Read package.json for version
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'));

// Import commands
import { runCommand } from './commands.js';
import { initCommand } from './commands.js';
import { chatCommand } from './commands.js';
import { planCommand } from './commands.js';

// Create CLI program
const program = new Command();

program
  .name('nanocode')
  .description('A command-line AI programming agent')
  .version(packageJson.version)
  .option('-v, --verbose', 'Enable verbose output')
  .option('-q, --quiet', 'Suppress non-error output')
  .option('--no-color', 'Disable colored output');

// Add commands
program.addCommand(runCommand);
program.addCommand(initCommand);
program.addCommand(chatCommand);
program.addCommand(planCommand);

// Parse arguments
program.parse(process.argv);

// Show help if no arguments provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
