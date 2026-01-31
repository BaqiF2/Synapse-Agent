/**
 * Anthropic Client Tests
 *
 * Tests for the AnthropicClient class.
 */

import { describe, expect, it, beforeEach, mock, afterEach } from 'bun:test';

// Mock SettingsManager before importing AnthropicClient
mock.module('../../../src/config/settings-manager.ts', () => ({
  SettingsManager: class {
    getLlmConfig() {
      return {
        apiKey: 'test-api-key',
        baseURL: 'https://api.anthropic.com',
        model: 'claude-3-opus-20240229',
      };
    }
  },
}));

const { AnthropicClient } = await import('../../../src/agent/anthropic-client.ts');

describe('AnthropicClient', () => {
  describe('constructor', () => {
    it('should create client with default stream=true', () => {
      const client = new AnthropicClient();
      expect(client).toBeDefined();
      expect(client.modelName).toBe('claude-3-opus-20240229');
    });

    it('should allow disabling stream', () => {
      const client = new AnthropicClient({ stream: false });
      expect(client).toBeDefined();
    });
  });

  describe('thinkingEffort', () => {
    it('should return null when thinking not configured', () => {
      const client = new AnthropicClient();
      expect(client.thinkingEffort).toBe(null);
    });
  });

  describe('withThinking', () => {
    it('should return new instance with thinking configured', () => {
      const client = new AnthropicClient();
      const thinkingClient = client.withThinking('high');

      expect(thinkingClient).not.toBe(client);
      expect(thinkingClient.thinkingEffort).toBe('high');
      expect(client.thinkingEffort).toBe(null); // Original unchanged
    });

    it('should map off to disabled', () => {
      const client = new AnthropicClient().withThinking('off');
      expect(client.thinkingEffort).toBe('off');
    });

    it('should map low to 1024 tokens', () => {
      const client = new AnthropicClient().withThinking('low');
      expect(client.thinkingEffort).toBe('low');
    });

    it('should map medium to 4096 tokens', () => {
      const client = new AnthropicClient().withThinking('medium');
      expect(client.thinkingEffort).toBe('medium');
    });

    it('should map high to 32000 tokens', () => {
      const client = new AnthropicClient().withThinking('high');
      expect(client.thinkingEffort).toBe('high');
    });
  });

  describe('withGenerationKwargs', () => {
    it('should return new instance with updated kwargs', () => {
      const client = new AnthropicClient();
      const newClient = client.withGenerationKwargs({ temperature: 0.7 });

      expect(newClient).not.toBe(client);
    });
  });

  describe('generate', () => {
    it('should be defined', () => {
      const client = new AnthropicClient();
      expect(typeof client.generate).toBe('function');
    });
  });
});
