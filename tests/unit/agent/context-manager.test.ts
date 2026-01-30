/**
 * Context Manager Tests
 */

import { describe, expect, it } from 'bun:test';
import { ContextManager } from '../../../src/agent/context-manager.ts';

const hasToolResult = (messages: Array<{ content: unknown }>): boolean => {
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (typeof block === 'object' && block) {
        const typedBlock = block as { type?: string };
        if (typedBlock.type === 'tool_result') {
          return true;
        }
      }
    }
  }
  return false;
};

describe('ContextManager', () => {
  it('removes dangling tool_result blocks after trimming', () => {
    const contextManager = new ContextManager({ maxTokens: 1 });

    contextManager.addAssistantToolCall('', [
      { id: 't1', name: 'Bash', input: { command: 'echo hi' } },
    ]);
    contextManager.addToolResults([
      { type: 'tool_result', tool_use_id: 't1', content: 'hi', is_error: false },
    ]);

    // This message forces trimming of the oldest entry (tool_use), leaving tool_result dangling.
    contextManager.addUserMessage('next');

    const messages = contextManager.getMessages();
    expect(hasToolResult(messages)).toBe(false);
  });
});
