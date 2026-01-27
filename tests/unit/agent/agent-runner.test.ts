/**
 * Agent Runner Tests
 *
 * Tests for the reusable Agent Loop implementation.
 */

import { describe, expect, it, beforeEach, mock } from 'bun:test';
import { AgentRunner, type AgentRunnerOptions } from '../../../src/agent/agent-runner.ts';
import { ContextManager } from '../../../src/agent/context-manager.ts';
import { BashToolSchema } from '../../../src/tools/bash-tool-schema.ts';

describe('AgentRunner', () => {
  let mockLlmClient: AgentRunnerOptions['llmClient'];
  let mockToolExecutor: AgentRunnerOptions['toolExecutor'];
  let contextManager: ContextManager;

  beforeEach(() => {
    mockLlmClient = {
      sendMessage: mock(() =>
        Promise.resolve({
          content: 'Test response',
          toolCalls: [],
          stopReason: 'end_turn',
        })
      ),
    };

    mockToolExecutor = {
      executeTools: mock(() => Promise.resolve([])),
      formatResultsForLlm: mock(() => []),
    };

    contextManager = new ContextManager();
  });

  describe('constructor', () => {
    it('should create AgentRunner with streaming mode', () => {
      const runner = new AgentRunner({
        llmClient: mockLlmClient,
        contextManager,
        toolExecutor: mockToolExecutor,
        systemPrompt: 'Test prompt',
        tools: [BashToolSchema],
        outputMode: 'streaming',
      });

      expect(runner).toBeDefined();
      expect(runner.getOutputMode()).toBe('streaming');
    });

    it('should create AgentRunner with silent mode', () => {
      const runner = new AgentRunner({
        llmClient: mockLlmClient,
        contextManager,
        toolExecutor: mockToolExecutor,
        systemPrompt: 'Test prompt',
        tools: [BashToolSchema],
        outputMode: 'silent',
      });

      expect(runner).toBeDefined();
      expect(runner.getOutputMode()).toBe('silent');
    });

    it('should expose getLlmClient and getToolExecutor', () => {
      const runner = new AgentRunner({
        llmClient: mockLlmClient,
        contextManager,
        toolExecutor: mockToolExecutor,
        systemPrompt: 'Test prompt',
        tools: [BashToolSchema],
        outputMode: 'silent',
      });

      expect(runner.getLlmClient()).toBe(mockLlmClient);
      expect(runner.getToolExecutor()).toBe(mockToolExecutor);
      expect(runner.getTools()).toEqual([BashToolSchema]);
    });
  });

  describe('run', () => {
    it('should process user message and return response (no tools)', async () => {
      const runner = new AgentRunner({
        llmClient: mockLlmClient,
        contextManager,
        toolExecutor: mockToolExecutor,
        systemPrompt: 'Test prompt',
        tools: [BashToolSchema],
        outputMode: 'silent',
      });

      const response = await runner.run('Hello');

      expect(response).toBe('Test response');
      expect(mockLlmClient.sendMessage).toHaveBeenCalled();
    });

    it('should execute tools when LLM returns tool calls', async () => {
      const toolCallLlmClient = {
        sendMessage: mock()
          .mockResolvedValueOnce({
            content: 'Let me run that',
            toolCalls: [{ id: 'call1', name: 'Bash', input: { command: 'echo hi' } }],
            stopReason: 'tool_use',
          })
          .mockResolvedValueOnce({
            content: 'Done!',
            toolCalls: [],
            stopReason: 'end_turn',
          }),
      };

      const toolExecutor = {
        executeTools: mock(() =>
          Promise.resolve([{ toolUseId: 'call1', success: true, output: 'hi', isError: false }])
        ),
        formatResultsForLlm: mock(() => [
          { type: 'tool_result' as const, tool_use_id: 'call1', content: 'hi', is_error: false },
        ]),
      };

      const runner = new AgentRunner({
        llmClient: toolCallLlmClient,
        contextManager,
        toolExecutor,
        systemPrompt: 'Test prompt',
        tools: [BashToolSchema],
        outputMode: 'silent',
      });

      const response = await runner.run('Run echo hi');

      expect(response).toBe('Done!');
      expect(toolExecutor.executeTools).toHaveBeenCalled();
    });

    it('should call onText callback in streaming mode', async () => {
      const textOutput: string[] = [];

      const runner = new AgentRunner({
        llmClient: mockLlmClient,
        contextManager,
        toolExecutor: mockToolExecutor,
        systemPrompt: 'Test prompt',
        tools: [BashToolSchema],
        outputMode: 'streaming',
        onText: (text) => textOutput.push(text),
      });

      await runner.run('Hello');

      expect(textOutput).toContain('Test response');
    });

    it('should not call onText callback in silent mode', async () => {
      const textOutput: string[] = [];

      const runner = new AgentRunner({
        llmClient: mockLlmClient,
        contextManager,
        toolExecutor: mockToolExecutor,
        systemPrompt: 'Test prompt',
        tools: [BashToolSchema],
        outputMode: 'silent',
        onText: (text) => textOutput.push(text),
      });

      await runner.run('Hello');

      expect(textOutput).toHaveLength(0);
    });
  });
});
