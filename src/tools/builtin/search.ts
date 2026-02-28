/**
 * Built-in Search Tools
 * grep, glob search operations
 */

import type { Tool, ToolResult } from '../../types/index.js';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Search for text in files (grep-like)
 */
export const grepTool: Tool = {
  name: 'grep',
  description: 'Search for text patterns in files. Supports regex patterns.',
  parameters: [
    {
      name: 'pattern',
      type: 'string',
      description: 'The regular expression pattern to search for',
      required: true,
    },
    {
      name: 'path',
      type: 'string',
      description: 'The directory or file path to search. Defaults to current directory.',
      required: false,
    },
    {
      name: 'glob',
      type: 'string',
      description: 'Glob pattern to filter files (e.g., "*.ts", "**/*.js")',
      required: false,
    },
    {
      name: 'output_mode',
      type: 'string',
      description: 'Output format: "content" shows matching lines, "files_with_matches" shows only file paths, "count" shows match counts',
      required: false,
      default: 'content',
    },
    {
      name: 'ignore_case',
      type: 'boolean',
      description: 'Perform case-insensitive search',
      required: false,
      default: false,
    },
  ],
  dangerous: false,
  execute: async (params): Promise<ToolResult> => {
    try {
      const pattern = params.pattern as string;
      const searchPath = (params.path as string) ?? '.';
      const globPattern = params.glob as string | undefined;
      const outputMode = (params.output_mode as string) ?? 'content';
      const ignoreCase = (params.ignore_case as boolean) ?? false;

      // Get files to search
      let files: string[] = [];

      if (globPattern) {
        const { globSync } = await import('fast-glob');
        files = globSync(path.join(searchPath, globPattern), { onlyFiles: true });
      } else {
        // Recursively find all files
        const { globSync } = await import('fast-glob');
        files = globSync(path.join(searchPath, '**/*'), { onlyFiles: true });
      }

      const regex = new RegExp(pattern, ignoreCase ? 'gi' : 'g');
      const results: Array<{
        file: string;
        line?: number;
        content?: string;
        count?: number;
      }> = [];

      for (const file of files) {
        try {
          const content = await fs.readFile(file, 'utf-8');
          const lines = content.split('\n');

          if (outputMode === 'count') {
            const matches = content.match(regex);
            const count = matches ? matches.length : 0;
            if (count > 0) {
              results.push({ file, count });
            }
          } else if (outputMode === 'files_with_matches') {
            if (regex.test(content)) {
              results.push({ file });
            }
          } else {
            // content mode - show matching lines
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              if (regex.test(line)) {
                results.push({
                  file,
                  line: i + 1,
                  content: line.trim(),
                });
              }
            }
          }
        } catch (err) {
          // Skip files that can't be read
          continue;
        }
      }

      return {
        success: true,
        data: { results, mode: outputMode },
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: (error as Error).message,
      };
    }
  },
};

/**
 * Find files matching a pattern
 */
export const globTool: Tool = {
  name: 'glob',
  description: 'Find files matching a glob pattern',
  parameters: [
    {
      name: 'pattern',
      type: 'string',
      description: 'The glob pattern (e.g., "**/*.ts", "src/**/*.json")',
      required: true,
    },
    {
      name: 'path',
      type: 'string',
      description: 'The base directory to search. Defaults to current directory.',
      required: false,
    },
    {
      name: 'only_files',
      type: 'boolean',
      description: 'Only return files, not directories',
      required: false,
      default: true,
    },
  ],
  dangerous: false,
  execute: async (params): Promise<ToolResult> => {
    try {
      const pattern = params.pattern as string;
      const searchPath = (params.path as string) ?? '.';
      const onlyFiles = (params.only_files as boolean) ?? true;

      const { globSync } = await import('fast-glob');
      const files = globSync(path.join(searchPath, pattern), { onlyFiles });

      return {
        success: true,
        data: { files, count: files.length },
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: (error as Error).message,
      };
    }
  },
};

/**
 * Search for a string (non-regex, simpler search)
 */
export const searchTool: Tool = {
  name: 'search',
  description: 'Search for a literal string in files. Faster than grep for simple searches.',
  parameters: [
    {
      name: 'query',
      type: 'string',
      description: 'The literal string to search for',
      required: true,
    },
    {
      name: 'path',
      type: 'string',
      description: 'The directory or file path to search. Defaults to current directory.',
      required: false,
    },
    {
      name: 'glob',
      type: 'string',
      description: 'Glob pattern to filter files',
      required: false,
    },
    {
      name: 'ignore_case',
      type: 'boolean',
      description: 'Perform case-insensitive search',
      required: false,
      default: false,
    },
  ],
  dangerous: false,
  execute: async (params): Promise<ToolResult> => {
    try {
      const query = params.query as string;
      const searchPath = (params.path as string) ?? '.';
      const globPattern = params.glob as string | undefined;
      const ignoreCase = (params.ignore_case as boolean) ?? false;

      // Get files to search
      let files: string[] = [];

      if (globPattern) {
        const { globSync } = await import('fast-glob');
        files = globSync(path.join(searchPath, globPattern), { onlyFiles: true });
      } else {
        const { globSync } = await import('fast-glob');
        files = globSync(path.join(searchPath, '**/*'), { onlyFiles: true });
      }

      const searchQuery = ignoreCase ? query.toLowerCase() : query;
      const results: Array<{
        file: string;
        line?: number;
        content?: string;
      }> = [];

      for (const file of files) {
        try {
          const content = await fs.readFile(file, 'utf-8');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineToCheck = ignoreCase ? line.toLowerCase() : line;

            if (lineToCheck.includes(searchQuery)) {
              results.push({
                file,
                line: i + 1,
                content: line.trim(),
              });
            }
          }
        } catch (err) {
          // Skip files that can't be read
          continue;
        }
      }

      return {
        success: true,
        data: { results, count: results.length },
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: (error as Error).message,
      };
    }
  },
};
