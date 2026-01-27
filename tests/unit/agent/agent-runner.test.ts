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
});
