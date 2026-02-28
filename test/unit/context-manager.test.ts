/**
 * Unit tests for Context Manager
 */

import { describe, it, expect } from 'vitest';
import { ContextManager } from '../../src/core/context.js';

describe('ContextManager', () => {
  it('should create an empty context', () => {
    const manager = new ContextManager();
    const context = manager.getContext();

    expect(context.messages).toEqual([]);
    expect(context.memory).toEqual([]);
    expect(context.observations).toEqual([]);
    expect(context.metadata.sessionId).toBeDefined();
  });

  it('should add messages', () => {
    const manager = new ContextManager();

    manager.addMessage({
      role: 'user' as const,
      content: 'Hello',
      timestamp: Date.now(),
    });

    const messages = manager.getContext().messages;

    expect(messages.length).toBe(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('Hello');
  });

  it('should get messages by role', () => {
    const manager = new ContextManager();

    manager.addMessage({
      role: 'user' as const,
      content: 'User message',
      timestamp: Date.now(),
    });

    manager.addMessage({
      role: 'assistant' as const,
      content: 'Assistant message',
      timestamp: Date.now(),
    });

    const userMessages = manager.getMessagesByRole('user');
    const assistantMessages = manager.getMessagesByRole('assistant');

    expect(userMessages.length).toBe(1);
    expect(userMessages[0].content).toBe('User message');
    expect(assistantMessages.length).toBe(1);
    expect(assistantMessages[0].content).toBe('Assistant message');
  });

  it('should add memory items', () => {
    const manager = new ContextManager();

    const id = manager.addMemory({
      type: 'fact',
      content: 'Important fact',
      importance: 0.8,
      references: [],
    });

    const memory = manager.getMemory(id);

    expect(memory).toBeDefined();
    expect(memory?.content).toBe('Important fact');
    expect(memory?.importance).toBe(0.8);
  });

  it('should search memory', () => {
    const manager = new ContextManager();

    manager.addMemory({
      type: 'fact',
      content: 'TypeScript is awesome',
      importance: 0.9,
      references: [],
    });

    manager.addMemory({
      type: 'observation',
      content: 'Code uses Python',
      importance: 0.5,
      references: [],
    });

    const results = manager.searchMemory('type');

    expect(results.length).toBeGreaterThan(0);
  });

  it('should add observations', () => {
    const manager = new ContextManager();

    manager.addObservation({
      type: 'file_read',
      content: 'File contents',
    });

    const observations = manager.getContext().observations;

    expect(observations.length).toBe(1);
    expect(observations[0].type).toBe('file_read');
  });

  it('should estimate tokens', () => {
    const manager = new ContextManager();

    manager.addMessage({
      role: 'user' as const,
      content: 'This is a test message',
      timestamp: Date.now(),
    });

    const tokens = manager.estimateTokens();

    expect(tokens).toBeGreaterThan(0);
  });

  it('should compress context', () => {
    const manager = new ContextManager({ maxMessages: 5 });

    for (let i = 0; i < 10; i++) {
      manager.addMessage({
        role: 'user' as const,
        content: `Message ${i}`,
        timestamp: Date.now(),
      });
    }

    const messages = manager.getContext().messages;

    expect(messages.length).toBeLessThanOrEqual(5);
  });

  it('should get summary', () => {
    const manager = new ContextManager();

    manager.addMessage({
      role: 'user' as const,
      content: 'Hello',
      timestamp: Date.now(),
    });

    const summary = manager.getSummary();

    expect(summary.messageCount).toBe(1);
    expect(summary.memoryCount).toBe(0);
    expect(summary.observationCount).toBe(0);
  });
});
