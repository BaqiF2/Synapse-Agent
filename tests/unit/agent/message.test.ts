/**
 * Message Types Tests
 *
 * Tests for Message type definitions and helper functions.
 */

import { describe, expect, it } from 'bun:test';
import type Anthropic from '@anthropic-ai/sdk';
import {
  type Message,
  type TextPart,
  createTextMessage,
  extractText,
  toAnthropicMessage,
  toolResultToMessage,
} from '../../../src/agent/message.ts';

describe('Message', () => {
  describe('createTextMessage', () => {
    it('should create a user text message', () => {
      const message = createTextMessage('user', 'Hello');

      expect(message.role).toBe('user');
      expect(message.content).toHaveLength(1);
      expect(message.content[0]).toEqual({ type: 'text', text: 'Hello' });
    });

    it('should create an assistant text message', () => {
      const message = createTextMessage('assistant', 'Hi there');

      expect(message.role).toBe('assistant');
      expect(message.content).toHaveLength(1);
      expect((message.content[0] as TextPart).text).toBe('Hi there');
    });
  });

  describe('extractText', () => {
    it('should extract text from a single text part', () => {
      const message: Message = {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello world' }],
      };

      expect(extractText(message)).toBe('Hello world');
    });

    it('should concatenate multiple text parts', () => {
      const message: Message = {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'text', text: 'world' },
        ],
      };

      expect(extractText(message)).toBe('Hello world');
    });

    it('should skip non-text parts', () => {
      const message: Message = {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'thinking', content: 'thinking...', signature: undefined },
          { type: 'text', text: ' world' },
        ],
      };

      expect(extractText(message)).toBe('Hello world');
    });

    it('should return empty string for no text parts', () => {
      const message: Message = {
        role: 'assistant',
        content: [],
      };

      expect(extractText(message)).toBe('');
    });
  });

  describe('toAnthropicMessage', () => {
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

  describe('toolResultToMessage', () => {
    it('should convert tool result to message', () => {
      const result = { toolCallId: 'call1', output: 'success', isError: false };
      const message = toolResultToMessage(result);

      expect(message.role).toBe('tool');
      expect(message.toolCallId).toBe('call1');
      expect(message.content).toHaveLength(1);
      expect((message.content[0] as TextPart).text).toBe('success');
    });
  });
});
