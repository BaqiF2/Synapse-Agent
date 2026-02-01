/**
 * Message Types Tests
 *
 * Tests for Message type definitions and helper functions.
 */

import { describe, expect, it } from 'bun:test';
import {
  type Message,
  type TextPart,
  type MergeablePart,
  createTextMessage,
  extractText,
  toolResultToMessage,
  mergePart,
  appendToMessage,
} from '../../../src/providers/message.ts';

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

  describe('toolResultToMessage', () => {
    it('should convert tool result to message', () => {
      const result = { toolCallId: 'call1', returnValue: { isError: false, output: 'success', message: '', brief: '' } };
      const message = toolResultToMessage(result);

      expect(message.role).toBe('tool');
      expect(message.toolCallId).toBe('call1');
      expect(message.content).toHaveLength(1);
      expect((message.content[0] as TextPart).text).toBe('success');
    });

    it('should only include output and ignore message', () => {
      const result = {
        toolCallId: 'call2',
        returnValue: { isError: false, output: 'primary', message: 'secondary', brief: '' },
      };
      const message = toolResultToMessage(result);

      expect((message.content[0] as TextPart).text).toBe('primary');
    });
  });

  describe('mergePart', () => {
    it('should merge two text parts', () => {
      const target: MergeablePart = { type: 'text', text: 'Hello' };
      const source: MergeablePart = { type: 'text', text: ' world' };

      const merged = mergePart(target, source);

      expect(merged).toBe(true);
      expect((target as TextPart).text).toBe('Hello world');
    });

    it('should not merge different types', () => {
      const target: MergeablePart = { type: 'text', text: 'Hello' };
      const source: MergeablePart = { type: 'thinking', content: 'thinking' };

      const merged = mergePart(target, source);

      expect(merged).toBe(false);
      expect((target as TextPart).text).toBe('Hello');
    });

    it('should merge tool_call_delta into tool_call', () => {
      const target: MergeablePart = {
        type: 'tool_call',
        id: 'call1',
        name: 'Bash',
        input: {},
        _argumentsJson: '{"com',
      };
      const source: MergeablePart = { type: 'tool_call_delta', argumentsDelta: 'mand":"ls"}' };

      const merged = mergePart(target, source);

      expect(merged).toBe(true);
      expect((target as any)._argumentsJson).toBe('{"command":"ls"}');
    });
  });

  describe('appendToMessage', () => {
    it('should append text part to message content', () => {
      const message: Message = { role: 'assistant', content: [] };
      const part: MergeablePart = { type: 'text', text: 'Hello' };

      appendToMessage(message, part);

      expect(message.content).toHaveLength(1);
      expect(message.content[0]).toEqual({ type: 'text', text: 'Hello' });
    });

    it('should append tool call to message', () => {
      const message: Message = { role: 'assistant', content: [] };
      const part: MergeablePart = {
        type: 'tool_call',
        id: 'call1',
        name: 'Bash',
        input: { command: 'ls' },
        _argumentsJson: '{"command":"ls"}',
      };

      appendToMessage(message, part);

      expect(message.toolCalls).toHaveLength(1);
      expect(message.toolCalls![0]).toEqual({
        id: 'call1',
        name: 'Bash',
        arguments: '{"command":"ls"}',
      });
    });
  });
});
