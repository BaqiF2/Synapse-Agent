/**
 * Anthropic Client Tests
 *
 * Tests for the AnthropicClient class.
 */

import { describe, expect, it } from 'bun:test';

import { AnthropicClient } from '../../../src/providers/anthropic/anthropic-client.ts';

const testSettings = {
  apiKey: 'test-api-key',
  baseURL: 'https://api.anthropic.com',
  model: 'claude-3-opus-20240229',
};

const createClient = (options?: { stream?: boolean }) =>
  new AnthropicClient({ ...options, settings: testSettings });

describe('AnthropicClient', () => {
  describe('constructor', () => {
    it('should create client with default stream=true', () => {
      const client = createClient();
      expect(client).toBeDefined();
      expect(client.modelName).toBe('claude-3-opus-20240229');
    });

    it('should allow disabling stream', () => {
      const client = createClient({ stream: false });
      expect(client).toBeDefined();
    });
  });

  describe('thinkingEffort', () => {
    it('should return null when thinking not configured', () => {
      const client = createClient();
      expect(client.thinkingEffort).toBe(null);
    });
  });

  describe('withThinking', () => {
    it('should return new instance with thinking configured', () => {
      const client = createClient();
      const thinkingClient = client.withThinking('high');

      expect(thinkingClient).not.toBe(client);
      expect(thinkingClient.thinkingEffort).toBe('high');
      expect(client.thinkingEffort).toBe(null); // Original unchanged
    });

    it('should map off to disabled', () => {
      const client = createClient().withThinking('off');
      expect(client.thinkingEffort).toBe('off');
    });

    it('should map low to 1024 tokens', () => {
      const client = createClient().withThinking('low');
      expect(client.thinkingEffort).toBe('low');
    });

    it('should map medium to 4096 tokens', () => {
      const client = createClient().withThinking('medium');
      expect(client.thinkingEffort).toBe('medium');
    });

    it('should map high to 32000 tokens', () => {
      const client = createClient().withThinking('high');
      expect(client.thinkingEffort).toBe('high');
    });
  });

  describe('withGenerationKwargs', () => {
    it('should return new instance with updated kwargs', () => {
      const client = createClient();
      const newClient = client.withGenerationKwargs({ temperature: 0.7 });

      expect(newClient).not.toBe(client);
    });
  });

  describe('generate', () => {
    it('should be defined', () => {
      const client = createClient();
      expect(typeof client.generate).toBe('function');
    });
  });
});
