/**
 * Message Types Tests
 *
 * Tests for Message type definitions and helper functions.
 */

import { describe, expect, it } from 'bun:test';
import {
  type Message,
  type TextPart,
  createTextMessage,
  extractText,
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
});
