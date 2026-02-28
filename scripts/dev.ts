/**
 * Development script for NanoAgent
 */

import { spawn } from 'child_process';

console.log('Starting NanoAgent in development mode...');

// Run with tsx watch for hot reload
const child = spawn('npx', ['tsx', 'watch', 'src/cli/index.ts'], {
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
