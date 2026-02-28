/**
 * Build script for NanoAgent
 */

import { execSync } from 'child_process';

console.log('Building NanoAgent...');

try {
  // Run TypeScript compiler
  console.log('Compiling TypeScript...');
  execSync('npx tsc', { stdio: 'inherit' });

  console.log('\nBuild complete!');
  console.log('Output directory: dist/');
  console.log('\nRun with: npm start');
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}
