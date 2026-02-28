/**
 * Build script for NanoCode
 */

import { execSync } from 'child_process';

console.log('Building NanoCode...');

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
