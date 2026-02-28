/**
 * Built-in File Tools
 * read, write, edit operations
 */

import type { Tool, ToolResult } from '../../types/index.js';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Read file contents
 */
export const readTool: Tool = {
  name: 'read',
  description: 'Read the contents of a file. Returns the file text as a string.',
  parameters: [
    {
      name: 'file_path',
      type: 'string',
      description: 'The absolute or relative path to the file to read',
      required: true,
    },
    {
      name: 'offset',
      type: 'number',
      description: 'The line number to start reading from (0-indexed)',
      required: false,
      default: 0,
    },
    {
      name: 'limit',
      type: 'number',
      description: 'The maximum number of lines to read',
      required: false,
    },
  ],
  dangerous: false,
  execute: async (params): Promise<ToolResult> => {
    try {
      const filePath = params.file_path as string;
      const offset = (params.offset as number) ?? 0;
      const limit = params.limit as number | undefined;

      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      let resultLines = offset > 0 ? lines.slice(offset) : lines;
      if (limit !== undefined && limit > 0) {
        resultLines = resultLines.slice(0, limit);
      }

      const resultContent = resultLines.join('\n');

      return {
        success: true,
        data: resultContent,
        tokenUsage: resultContent.length / 4, // Rough estimate
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
 * Write file contents
 */
export const writeTool: Tool = {
  name: 'write',
  description: 'Write content to a file. Creates the file if it doesn\'t exist, overwrites if it does.',
  parameters: [
    {
      name: 'file_path',
      type: 'string',
      description: 'The absolute or relative path to the file to write',
      required: true,
    },
    {
      name: 'content',
      type: 'string',
      description: 'The content to write to the file',
      required: true,
    },
  ],
  dangerous: true, // Overwrites files
  execute: async (params): Promise<ToolResult> => {
    try {
      const filePath = params.file_path as string;
      const content = params.content as string;

      // Create directory if it doesn't exist
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      await fs.writeFile(filePath, content, 'utf-8');

      return {
        success: true,
        data: `Wrote ${content.length} characters to ${filePath}`,
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
 * Edit file contents (find and replace)
 */
export const editTool: Tool = {
  name: 'edit',
  description: 'Make exact string replacements in a file. The old_string must be unique in the file.',
  parameters: [
    {
      name: 'file_path',
      type: 'string',
      description: 'The absolute or relative path to the file to edit',
      required: true,
    },
    {
      name: 'old_string',
      type: 'string',
      description: 'The exact text to replace. Must be unique in the file.',
      required: true,
    },
    {
      name: 'new_string',
      type: 'string',
      description: 'The text to replace old_string with',
      required: true,
    },
    {
      name: 'replace_all',
      type: 'boolean',
      description: 'Replace all occurrences of old_string',
      required: false,
      default: false,
    },
  ],
  dangerous: true,
  execute: async (params): Promise<ToolResult> => {
    try {
      const filePath = params.file_path as string;
      const oldString = params.old_string as string;
      const newString = params.new_string as string;
      const replaceAll = (params.replace_all as boolean) ?? false;

      const content = await fs.readFile(filePath, 'utf-8');

      let newContent: string;
      if (replaceAll) {
        newContent = content.split(oldString).join(newString);
      } else {
        const count = (content.match(new RegExp(oldString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        if (count === 0) {
          return {
            success: false,
            data: null,
            error: 'old_string not found in file',
          };
        }
        if (count > 1) {
          return {
            success: false,
            data: null,
            error: `old_string appears ${count} times in file. Use replace_all: true to replace all occurrences, or provide more context to make it unique.`,
          };
        }
        newContent = content.replace(oldString, newString);
      }

      await fs.writeFile(filePath, newContent, 'utf-8');

      return {
        success: true,
        data: `Replaced ${replaceAll ? 'all occurrences' : 'one occurrence'} in ${filePath}`,
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
 * Check if a file exists
 */
export const existsTool: Tool = {
  name: 'exists',
  description: 'Check if a file or directory exists at the given path',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'The path to check',
      required: true,
    },
  ],
  dangerous: false,
  execute: async (params): Promise<ToolResult> => {
    try {
      const filePath = params.path as string;
      const stats = await fs.stat(filePath);
      const result = {
        exists: true,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
      };
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          success: true,
          data: { exists: false, isFile: false, isDirectory: false },
        };
      }
      return {
        success: false,
        data: null,
        error: (error as Error).message,
      };
    }
  },
};

/**
 * List files in a directory
 */
export const listTool: Tool = {
  name: 'list',
  description: 'List files in a directory',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'The directory path to list. Defaults to current directory.',
      required: false,
    },
    {
      name: 'recursive',
      type: 'boolean',
      description: 'List files recursively',
      required: false,
      default: false,
    },
    {
      name: 'pattern',
      type: 'string',
      description: 'Glob pattern to filter files',
      required: false,
    },
  ],
  dangerous: false,
  execute: async (params): Promise<ToolResult> => {
    try {
      const dirPath = (params.path as string) ?? '.';
      const recursive = (params.recursive as boolean) ?? false;
      const pattern = params.pattern as string | undefined;

      let files: string[] = [];

      if (recursive || pattern) {
        // Use fast-glob for recursive or pattern-based listing
        const { globSync } = await import('fast-glob');
        const globPattern = pattern
          ? path.join(dirPath, pattern)
          : path.join(dirPath, '**/*');
        files = globSync(globPattern, { onlyFiles: false });
      } else {
        files = await fs.readdir(dirPath);
        // Add path prefix
        files = files.map(f => path.join(dirPath, f));
      }

      return {
        success: true,
        data: { files },
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
