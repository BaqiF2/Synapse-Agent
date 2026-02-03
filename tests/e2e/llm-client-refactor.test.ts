/**
 * LLM Client Refactor E2E Tests
 *
 * End-to-end tests for the refactored LLM client components:
 * - AnthropicClient: Configuration, immutable pattern, generate()
 * - AnthropicStreamedMessage: Stream handling, token usage tracking
 * - AgentRunner: Integration with new LLM client interface
 */

import { describe, expect, it, mock } from 'bun:test';
import { AnthropicClient } from '../../src/providers/anthropic/anthropic-client.ts';
import { AnthropicStreamedMessage } from '../../src/providers/anthropic/anthropic-streamed-message.ts';
import { AgentRunner } from '../../src/agent/agent-runner.ts';
import { CallableToolset } from '../../src/tools/toolset.ts';
import { ToolOk, type CallableTool, type ToolReturnValue } from '../../src/tools/callable-tool.ts';
import {
  type StreamedMessagePart,
  type TokenUsage,
  ChatProviderError,
  APIConnectionError,
  APITimeoutError,
  APIStatusError,
  APIEmptyResponseError,
  getTokenUsageInput,
  getTokenUsageTotal,
} from '../../src/providers/anthropic/anthropic-types.ts';
import { BashToolSchema } from '../../src/tools/bash-tool-schema.ts';

describe('E2E: LLM Client Refactor', () => {
  describe('AnthropicClient Configuration', () => {
    it('should create client instance', () => {
      // Note: This test requires ANTHROPIC_API_KEY or settings.json
      // In real E2E, this would connect to the actual API
      // For now, we verify the class exports and structure
      expect(AnthropicClient).toBeDefined();
      expect(AnthropicClient.name).toBe('anthropic');
    });

    it('should export correct static name', () => {
      expect(AnthropicClient.name).toBe('anthropic');
    });
  });

  describe('AnthropicStreamedMessage Structure', () => {
    it('should handle non-streaming response (Anthropic.Message mock)', async () => {
      // Create a mock Anthropic.Message-like response
      const mockMessage = {
        id: 'msg_test_nonstream',
        type: 'message' as const,
        role: 'assistant' as const,
        content: [
          { type: 'text' as const, text: 'Hello, world!' },
        ],
        model: 'claude-3-sonnet',
        stop_reason: 'end_turn' as const,
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 25,
          cache_creation_input_tokens: 10,
        },
      };

      const stream = new AnthropicStreamedMessage(mockMessage as never);
      const parts: StreamedMessagePart[] = [];

      for await (const part of stream) {
        parts.push(part);
      }

      expect(parts).toHaveLength(1);
      expect(parts[0]?.type).toBe('text');
      expect((parts[0] as { type: 'text'; text: string }).text).toBe('Hello, world!');
      expect(stream.id).toBe('msg_test_nonstream');
      expect(stream.usage.inputOther).toBe(100);
      expect(stream.usage.output).toBe(50);
      expect(stream.usage.inputCacheRead).toBe(25);
      expect(stream.usage.inputCacheCreation).toBe(10);
    });

    it('should handle streaming response (async iterable mock)', async () => {
      // Create a mock streaming response
      const mockEvents = [
        {
          type: 'message_start' as const,
          message: {
            id: 'msg_test_stream',
            type: 'message' as const,
            role: 'assistant' as const,
            content: [],
            model: 'claude-3-sonnet',
            usage: {
              input_tokens: 150,
              output_tokens: 0,
            },
          },
        },
        {
          type: 'content_block_start' as const,
          index: 0,
          content_block: {
            type: 'text' as const,
            text: '',
          },
        },
        {
          type: 'content_block_delta' as const,
          index: 0,
          delta: {
            type: 'text_delta' as const,
            text: 'Hello ',
          },
        },
        {
          type: 'content_block_delta' as const,
          index: 0,
          delta: {
            type: 'text_delta' as const,
            text: 'world!',
          },
        },
        {
          type: 'message_delta' as const,
          usage: {
            output_tokens: 75,
          },
        },
      ];

      // Create async iterable
      const mockStreamResponse = {
        async *[Symbol.asyncIterator]() {
          for (const event of mockEvents) {
            yield event;
          }
        },
      };

      const stream = new AnthropicStreamedMessage(mockStreamResponse as never);
      const parts: StreamedMessagePart[] = [];

      for await (const part of stream) {
        parts.push(part);
      }

      // Should have 2 text parts (the two deltas)
      expect(parts.length).toBeGreaterThanOrEqual(2);
      expect(parts.some(p => p.type === 'text')).toBe(true);
      expect(stream.id).toBe('msg_test_stream');
      expect(stream.usage.output).toBe(75);
    });

    it('should handle tool_use content blocks', async () => {
      const mockMessage = {
        id: 'msg_test_tool',
        type: 'message' as const,
        role: 'assistant' as const,
        content: [
          { type: 'text' as const, text: 'Let me run that command.' },
          {
            type: 'tool_use' as const,
            id: 'tool_123',
            name: 'Bash',
            input: { command: 'echo hello' },
          },
        ],
        model: 'claude-3-sonnet',
        stop_reason: 'tool_use' as const,
        usage: {
          input_tokens: 100,
          output_tokens: 60,
        },
      };

      const stream = new AnthropicStreamedMessage(mockMessage as never);
      const parts: StreamedMessagePart[] = [];

      for await (const part of stream) {
        parts.push(part);
      }

      expect(parts).toHaveLength(2);
      expect(parts[0]?.type).toBe('text');
      expect(parts[1]?.type).toBe('tool_call');

      const toolCall = parts[1] as { type: 'tool_call'; id: string; name: string; input: Record<string, unknown> };
      expect(toolCall.id).toBe('tool_123');
      expect(toolCall.name).toBe('Bash');
      expect(toolCall.input.command).toBe('echo hello');
    });

    it('should handle thinking content blocks', async () => {
      const mockMessage = {
        id: 'msg_test_thinking',
        type: 'message' as const,
        role: 'assistant' as const,
        content: [
          {
            type: 'thinking' as const,
            thinking: 'Let me analyze this carefully...',
            signature: 'sig_abc123',
          },
          { type: 'text' as const, text: 'Here is my analysis.' },
        ],
        model: 'claude-3-sonnet',
        stop_reason: 'end_turn' as const,
        usage: {
          input_tokens: 100,
          output_tokens: 80,
        },
      };

      const stream = new AnthropicStreamedMessage(mockMessage as never);
      const parts: StreamedMessagePart[] = [];

      for await (const part of stream) {
        parts.push(part);
      }

      expect(parts).toHaveLength(2);
      expect(parts[0]?.type).toBe('thinking');
      expect(parts[1]?.type).toBe('text');

      const thinkPart = parts[0] as { type: 'thinking'; content: string; signature?: string };
      expect(thinkPart.content).toBe('Let me analyze this carefully...');
      expect(thinkPart.signature).toBe('sig_abc123');
    });
  });

  describe('Error Classes', () => {
    it('should create ChatProviderError', () => {
      const error = new ChatProviderError('Test error');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ChatProviderError);
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('ChatProviderError');
    });

    it('should create APIConnectionError', () => {
      const error = new APIConnectionError('Connection failed');
      expect(error).toBeInstanceOf(ChatProviderError);
      expect(error).toBeInstanceOf(APIConnectionError);
      expect(error.message).toBe('Connection failed');
      expect(error.name).toBe('APIConnectionError');
    });

    it('should create APITimeoutError', () => {
      const error = new APITimeoutError('Request timed out');
      expect(error).toBeInstanceOf(ChatProviderError);
      expect(error).toBeInstanceOf(APITimeoutError);
      expect(error.message).toBe('Request timed out');
      expect(error.name).toBe('APITimeoutError');
    });

    it('should create APIStatusError with status code', () => {
      const error = new APIStatusError(429, 'Rate limited');
      expect(error).toBeInstanceOf(ChatProviderError);
      expect(error).toBeInstanceOf(APIStatusError);
      expect(error.message).toBe('Rate limited');
      expect(error.statusCode).toBe(429);
      expect(error.name).toBe('APIStatusError');
    });

    it('should create APIEmptyResponseError', () => {
      const error = new APIEmptyResponseError('Empty response');
      expect(error).toBeInstanceOf(ChatProviderError);
      expect(error).toBeInstanceOf(APIEmptyResponseError);
      expect(error.message).toBe('Empty response');
      expect(error.name).toBe('APIEmptyResponseError');
    });
  });

  describe('TokenUsage Helpers', () => {
    it('should calculate input tokens correctly', () => {
      const usage: TokenUsage = {
        inputOther: 100,
        output: 50,
        inputCacheRead: 25,
        inputCacheCreation: 10,
      };

      const input = getTokenUsageInput(usage);
      expect(input).toBe(135); // 100 + 25 + 10
    });

    it('should calculate total tokens correctly', () => {
      const usage: TokenUsage = {
        inputOther: 100,
        output: 50,
        inputCacheRead: 25,
        inputCacheCreation: 10,
      };

      const total = getTokenUsageTotal(usage);
      expect(total).toBe(185); // 100 + 50 + 25 + 10
    });
  });

  describe('AgentRunner integration (refactored)', () => {
    function createMockCallableTool(
      handler: (args: unknown) => Promise<ToolReturnValue>
    ): CallableTool<unknown> {
      return {
        name: 'Bash',
        description: 'Mock bash tool',
        paramsSchema: {} as any,
        toolDefinition: BashToolSchema,
        call: handler,
      } as unknown as CallableTool<unknown>;
    }

    function createMockClient(responses: StreamedMessagePart[][]): AnthropicClient {
      let callIndex = 0;
      return {
        generate: async () => {
          const parts = responses[callIndex++] || [{ type: 'text', text: 'Default' }];
          return {
            id: `msg_${callIndex}`,
            usage: { inputOther: 100, output: 50, inputCacheRead: 0, inputCacheCreation: 0 },
            async *[Symbol.asyncIterator]() {
              for (const part of parts) {
                yield part;
              }
            },
          };
        },
      } as unknown as AnthropicClient;
    }

    it('should return final text response', async () => {
      const client = createMockClient([[{ type: 'text', text: 'Hello!' }]]);
      const toolset = new CallableToolset([createMockCallableTool(() =>
        Promise.resolve(ToolOk({ output: '' }))
      )]);

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        enableStopHooks: false,
      });

      const response = await runner.run('Hi');
      expect(response).toBe('Hello!');
    });

    it('should stream parts via onMessagePart', async () => {
      const parts: StreamedMessagePart[] = [];
      const client = createMockClient([[{ type: 'text', text: 'Streamed' }]]);
      const toolset = new CallableToolset([createMockCallableTool(() =>
        Promise.resolve(ToolOk({ output: '' }))
      )]);

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        onMessagePart: (part) => {
          parts.push(part);
        },
        enableStopHooks: false,
      });

      await runner.run('Hi');
      expect(parts[0]?.type).toBe('text');
    });

    it('should execute tools and report results', async () => {
      const client = createMockClient([
        [{ type: 'tool_call', id: 'call1', name: 'Bash', input: { command: 'echo test' } }],
        [{ type: 'text', text: 'Done' }],
      ]);

      const toolHandler = mock(() => Promise.resolve(ToolOk({ output: 'test' })));
      const toolset = new CallableToolset([createMockCallableTool(toolHandler)]);
      const toolResults: any[] = [];

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        onToolResult: (result) => {
          toolResults.push(result);
        },
        enableStopHooks: false,
      });

      const response = await runner.run('Run');
      expect(response).toBe('Done');
      expect(toolHandler).toHaveBeenCalled();
      expect(toolResults[0]?.returnValue.output).toBe('test');
    });
  });
});
