/**
 * Message Formatting
 * Helper functions for formatting messages for LLM consumption
 */

import type { Message, ToolResult } from '../types/index.js';

/**
 * Format a user message
 */
export function formatUserMessage(content: string): Message {
  return {
    role: 'user',
    content,
    timestamp: Date.now(),
  };
}

/**
 * Format an assistant message
 */
export function formatAssistantMessage(
  content: string,
  toolCalls?: Message['toolCalls']
): Message {
  const message: Message = {
    role: 'assistant',
    content,
    timestamp: Date.now(),
  };

  if (toolCalls && toolCalls.length > 0) {
    message.toolCalls = toolCalls;
  }

  return message;
}

/**
 * Format a tool response message
 */
export function formatToolMessage(
  toolCallId: string,
  result: ToolResult
): Message {
  const content = result.success
    ? JSON.stringify(result.data)
    : `Error: ${result.error}`;

  return {
    role: 'tool',
    content,
    toolCallId,
    timestamp: Date.now(),
  };
}

/**
 * Format a system message
 */
export function formatSystemMessage(content: string): Message {
  return {
    role: 'system',
    content,
    timestamp: Date.now(),
  };
}

/**
 * Create default system message for the agent
 */
export function createDefaultSystemMessage(): Message {
  return formatSystemMessage(
    `You are NanoAgent, a helpful AI programming assistant. You assist users with software engineering tasks by:
1. Understanding user requests and asking clarifying questions when needed
2. Exploring codebases to understand structure and context
3. Writing, reading, and editing code using available tools
4. Running commands and tests when needed
5. Providing clear explanations and guidance

You have access to various tools for file operations, searching, running commands, and more. Use them thoughtfully to accomplish the user's goals.

When encountering errors, analyze them carefully and propose solutions. If you're unsure about something, ask the user for clarification.

Always be accurate, concise, and focused on helping the user complete their task.`
  );
}

/**
 * Compress conversation history by summarizing
 */
export function compressMessages(messages: Message[], keepRecent: number = 10): Message[] {
  if (messages.length <= keepRecent) {
    return messages;
  }

  const systemMessages = messages.filter(m => m.role === 'system');
  const recentMessages = messages.slice(-keepRecent);

  return [...systemMessages, ...recentMessages];
}

/**
 * Remove tool result messages from history (they can be large)
 */
export function removeToolResults(messages: Message[]): Message[] {
  return messages.filter(m => m.role !== 'tool');
}

/**
 * Deduplicate consecutive messages
 */
export function deduplicateMessages(messages: Message[]): Message[] {
  const result: Message[] = [];

  for (const message of messages) {
    const lastMessage = result[result.length - 1];

    if (!lastMessage || lastMessage.content !== message.content) {
      result.push(message);
    }
  }

  return result;
}

/**
 * Format messages for display in CLI
 */
export function formatMessageForDisplay(message: Message): string {
  const timestamp = new Date(message.timestamp || 0).toLocaleTimeString();

  const roleLabels: Record<string, string> = {
    user: 'User',
    assistant: 'Assistant',
    system: 'System',
    tool: 'Tool Result',
  };

  const roleLabel = roleLabels[message.role] || 'Unknown';
  const preview = message.content.substring(0, 100);

  return `[${timestamp}] ${roleLabel}: ${preview}${message.content.length > 100 ? '...' : ''}`;
}