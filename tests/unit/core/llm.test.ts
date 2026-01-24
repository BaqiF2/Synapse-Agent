/**
 * Unit tests for LLM client.
 *
 * Tests the LLMClient class to ensure proper:
 * - client initialization with different configurations
 * - BASH_TOOL schema definition
 * - Conversation history management
 * - Tool result handling
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { BASH_TOOL, LLMClient, createLLMClient } from '../../../src/core/llm';
import { SynapseConfig } from '../../../src/core/config';

describe('BASH_TOOL', () => {
  test('should have correct schema structure', () => {
    expect(BASH_TOOL.name).toBe('Bash');
    expect(BASH_TOOL.description).toContain('Execute bash commands');
    expect(BASH_TOOL.input_schema.type).toBe('object');
    expect(BASH_TOOL.input_schema.properties.command).toBeDefined();
    expect(BASH_TOOL.input_schema.properties.restart).toBeDefined();
    expect(BASH_TOOL.input_schema.required).toEqual(['command']);
  });

  test('should define command parameter', () => {
    const commandProp = BASH_TOOL.input_schema.properties.command;
    expect(commandProp.type).toBe('string');
    expect(commandProp.description).toBeDefined();
  });

  test('should define restart parameter', () => {
    const restartProp = BASH_TOOL.input_schema.properties.restart;
    expect(restartProp.type).toBe('boolean');
    expect(restartProp.description).toBeDefined();
  });
});

describe('LLMClient', () => {
  test('should initialize with API key and base URL', () => {
    const client = new LLMClient('test-api-key', 'https://api.minimaxi.com/anthropic', 'MiniMax-M2');

    expect(client).toBeDefined();
    // Verify client is properly instantiated
    expect(typeof client.setSystemPrompt).toBe('function');
    expect(typeof client.clearHistory).toBe('function');
  });

  test('should initialize without base URL (official Anthropic API)', () => {
    const client = new LLMClient('test-api-key', undefined, 'claude-4-5-sonnet');

    expect(client).toBeDefined();
  });

  test('setSystemPrompt should set the system prompt', () => {
    const client = new LLMClient('test-key', undefined, 'model');
    client.setSystemPrompt('Test prompt');

    // Verify by checking getHistory (should not include system prompt in messages)
    const history = client.getHistory();
    expect(history.length).toBe(0); // System prompt is separate from messages
  });

  test('clearHistory should clear conversation history', () => {
    const client = new LLMClient('test-key', undefined, 'model');

    // Add a fake message manually using addToolResult
    client.addToolResult('test-id', 'test result');
    expect(client.getHistory().length).toBe(1);

    client.clearHistory();
    expect(client.getHistory().length).toBe(0);
  });

  test('addToolResult should add tool result to history', () => {
    const client = new LLMClient('test-key', undefined, 'model');

    client.addToolResult('tool-id-123', 'Command executed successfully');

    const history = client.getHistory();
    expect(history.length).toBe(1);
    expect(history[0].role).toBe('user');
    expect(Array.isArray(history[0].content)).toBe(true);
    const content = history[0].content as any[];
    expect(content[0].type).toBe('tool_result');
    expect(content[0].tool_use_id).toBe('tool-id-123');
    expect(content[0].content).toBe('Command executed successfully');
  });

  test('addToolResults should add multiple tool results in single message', () => {
    const client = new LLMClient('test-key', undefined, 'model');

    const results: Array<[string, string]> = [
      ['tool-id-1', 'Result 1'],
      ['tool-id-2', 'Result 2'],
      ['tool-id-3', 'Result 3'],
    ];

    client.addToolResults(results);

    const history = client.getHistory();
    expect(history.length).toBe(1); // Single message with multiple results
    expect(history[0].role).toBe('user');

    const content = history[0].content as any[];
    expect(content.length).toBe(3);
    expect(content[0].tool_use_id).toBe('tool-id-1');
    expect(content[1].tool_use_id).toBe('tool-id-2');
    expect(content[2].tool_use_id).toBe('tool-id-3');
  });

  test('addToolResults should handle empty array', () => {
    const client = new LLMClient('test-key', undefined, 'model');

    client.addToolResults([]);

    const history = client.getHistory();
    expect(history.length).toBe(0); // No message added
  });

  test('getHistory should return copy of history', () => {
    const client = new LLMClient('test-key', undefined, 'model');

    client.addToolResult('id-1', 'result');

    const history1 = client.getHistory();
    const history2 = client.getHistory();

    expect(history1).toEqual(history2);
    expect(history1).not.toBe(history2); // Should be different arrays (copy)
  });
});

describe('createLLMClient', () => {
  test('should create LLMClient from config', () => {
    const config = new SynapseConfig();
    config.apiKey = 'test-key';
    config.model = 'test-model';

    const client = createLLMClient(config);

    expect(client).toBeDefined();
    expect(client instanceof LLMClient).toBe(true);
  });
});
