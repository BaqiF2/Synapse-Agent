/**
 * Anthropic Message Conversion Tests
 *
 * Tests for converting internal Message to Anthropic.MessageParam.
 */

import { describe, expect, it } from 'bun:test';
import type Anthropic from '@anthropic-ai/sdk';
import { toAnthropicMessage } from '../../../src/providers/anthropic/anthropic-client.ts';
import { createTextMessage, type Message } from '../../../src/providers/message.ts';

describe('toAnthropicMessage (provider)', () => {
  it('should convert user text message', () => {
    const message: Message = createTextMessage('user', 'Hello');
    const result = toAnthropicMessage(message);

    expect(result.role).toBe('user');
    expect(result.content).toBe('Hello');
  });

  it('should convert assistant message with tool calls', () => {
    const message: Message = {
      role: 'assistant',
      content: [{ type: 'text', text: 'Let me help' }],
      toolCalls: [{ id: 'call1', name: 'Bash', arguments: '{"command":"ls"}' }],
    };
    const result = toAnthropicMessage(message);

    expect(result.role).toBe('assistant');
    expect(Array.isArray(result.content)).toBe(true);
    const content = result.content as Anthropic.ContentBlockParam[];
    expect(content).toHaveLength(2);
    expect(content[0]).toEqual({ type: 'text', text: 'Let me help' });
    expect(content[1]).toMatchObject({
      type: 'tool_use',
      id: 'call1',
      name: 'Bash',
    });
  });

  it('should convert tool result message', () => {
    const message: Message = {
      role: 'tool',
      content: [{ type: 'text', text: 'file1.txt\nfile2.txt' }],
      toolCallId: 'call1',
    };
    const result = toAnthropicMessage(message);

    expect(result.role).toBe('user');
    expect(Array.isArray(result.content)).toBe(true);
    const content = result.content as Anthropic.ToolResultBlockParam[];
    expect(content[0]).toMatchObject({
      type: 'tool_result',
      tool_use_id: 'call1',
      content: 'file1.txt\nfile2.txt',
    });
  });
});
