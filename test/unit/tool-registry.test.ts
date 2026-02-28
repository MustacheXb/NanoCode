/**
 * Unit tests for Tool Registry
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from '../../src/tools/index.js';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('should register a tool', () => {
    const tool = {
      name: 'test',
      description: 'Test tool',
      parameters: [],
      execute: async () => ({ success: true, data: 'test' }),
    };

    registry.register(tool);

    expect(registry.get('test')).toBe(tool);
  });

  it('should list all tool names', () => {
    const tool1 = {
      name: 'test1',
      description: 'Test tool 1',
      parameters: [],
      execute: async () => ({ success: true, data: 'test' }),
    };

    const tool2 = {
      name: 'test2',
      description: 'Test tool 2',
      parameters: [],
      execute: async () => ({ success: true, data: 'test' }),
    };

    registry.registerBatch([
      { tool: tool1 },
      { tool: tool2 },
    ]);

    expect(registry.listNames()).toEqual(['test1', 'test2']);
  });

  it('should check if tool is available', () => {
    const tool = {
      name: 'test',
      description: 'Test tool',
      parameters: [],
      execute: async () => ({ success: true, data: 'test' }),
    };

    registry.register(tool);

    expect(registry.isAvailable('test')).toBe(true);
    expect(registry.isAvailable('nonexistent')).toBe(false);
  });

  it('should enable and disable tools', () => {
    const tool = {
      name: 'test',
      description: 'Test tool',
      parameters: [],
      execute: async () => ({ success: true, data: 'test' }),
    };

    registry.register(tool);

    expect(registry.isAvailable('test')).toBe(true);

    registry.setEnabled('test', false);

    expect(registry.isAvailable('test')).toBe(false);

    registry.setEnabled('test', true);

    expect(registry.isAvailable('test')).toBe(true);
  });

  it('should execute a tool', async () => {
    const tool = {
      name: 'test',
      description: 'Test tool',
      parameters: [
        {
          name: 'input',
          type: 'string',
          description: 'Input value',
          required: true,
        },
      ],
      execute: async (params: any) => ({
        success: true,
        data: params.input,
      }),
    };

    registry.register(tool);

    const result = await registry.execute('test', { input: 'hello' }, {
      permissionLevel: 'bypass',
    });

    expect(result.success).toBe(true);
    expect(result.data).toBe('hello');
  });

  it('should return error for missing required parameters', async () => {
    const tool = {
      name: 'test',
      description: 'Test tool',
      parameters: [
        {
          name: 'input',
          type: 'string',
          description: 'Input value',
          required: true,
        },
      ],
      execute: async () => ({ success: true, data: 'test' }),
    };

    registry.register(tool);

    const result = await registry.execute('test', {}, {
      permissionLevel: 'bypass',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing required parameter');
  });

  it('should get statistics', () => {
    const tool = {
      name: 'test',
      description: 'Test tool',
      parameters: [],
      execute: async () => ({ success: true, data: 'test' }),
    };

    registry.register(tool);

    const stats = registry.getStats();

    expect(stats.totalTools).toBe(1);
    expect(stats.enabledTools).toBe(1);
    expect(stats.totalExecutions).toBe(0);
  });
});
