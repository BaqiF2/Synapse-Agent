/**
 * Integration Tests - Agent Tool Routing
 *
 * 端到端集成测试：验证 AgentRunner → step → Toolset → BashTool → BashRouter → Handler 完整链路。
 * 覆盖 Agent 执行流程、工具路由、沙箱权限等核心路径的协同工作。
 */

import { describe, it, expect, mock, afterEach } from 'bun:test';
import { AgentRunner, type AgentRunnerOptions } from '../../../src/core/agent-runner.ts';
import { CallableToolset } from '../../../src/tools/toolset.ts';
import { ToolOk, ToolError, asCancelablePromise } from '../../../src/tools/callable-tool.ts';
import type { CallableTool, CancelablePromise, ToolReturnValue } from '../../../src/tools/callable-tool.ts';
import { createTextMessage } from '../../../src/providers/message.ts';
import type { AnthropicClient } from '../../../src/providers/anthropic/anthropic-client.ts';
import type { StreamedMessagePart } from '../../../src/providers/anthropic/anthropic-types.ts';
import { runAgentLoop } from '../../../src/core/agent-loop.ts';
import type { AgentLoopConfig } from '../../../src/core/agent-loop-config.ts';
import type { AgentTool, AgentEvent, LLMProviderLike } from '../../../src/core/types.ts';
import type { LLMResponse, LLMStream, LLMStreamChunk } from '../../../src/types/provider.ts';

const MockBashToolDef = {
  name: 'Bash',
  description: 'Mock bash tool',
  input_schema: { type: 'object' as const, properties: { command: { type: 'string' } }, required: ['command'] },
};

function createMockCallableTool(
  handler: (args: unknown) => Promise<ToolReturnValue> | CancelablePromise<ToolReturnValue>
): CallableTool<unknown> {
  return {
    name: 'Bash',
    description: 'Mock bash tool',
    paramsSchema: {} as any,
    toolDefinition: MockBashToolDef,
    call: (args: unknown) => asCancelablePromise(Promise.resolve(handler(args))),
  } as unknown as CallableTool<unknown>;
}

function createMockClient(responses: StreamedMessagePart[][]): AnthropicClient {
  let callIndex = 0;
  return {
    modelName: 'claude-sonnet-4-20250514',
    generate: mock(() => {
      const parts = responses[callIndex++] || [{ type: 'text', text: 'Default' }];
      return Promise.resolve({
        id: `msg_${callIndex}`,
        usage: { inputOther: 100, output: 50, inputCacheRead: 0, inputCacheCreation: 0 },
        async *[Symbol.asyncIterator]() {
          for (const part of parts) yield part;
        },
      });
    }),
  } as unknown as AnthropicClient;
}

// --- AgentRunner 端到端链路测试 ---

describe('Integration: AgentRunner end-to-end flow', () => {
  it('should complete full loop: user message → LLM → tool call → tool result → LLM → text response', async () => {
    const client = createMockClient([
      [
        { type: 'text', text: 'Let me check' },
        { type: 'tool_call', id: 'c1', name: 'Bash', input: { command: 'ls -la' } },
      ],
      [{ type: 'text', text: 'Here are the files.' }],
    ]);

    const toolCalls: string[] = [];
    const toolHandler = mock((args: unknown) => {
      const parsed = args as { command?: string };
      toolCalls.push(parsed.command ?? '');
      return Promise.resolve(ToolOk({ output: 'file1.txt  file2.txt' }));
    });
    const toolset = new CallableToolset([createMockCallableTool(toolHandler)]);

    const runner = new AgentRunner({
      client,
      systemPrompt: 'You are a helpful assistant.',
      toolset,
      enableStopHooks: false,
    });

    const response = await runner.run('Show me the files');

    // 验证完整链路
    expect(response).toBe('Here are the files.');
    expect(toolCalls).toEqual(['ls -la']);

    // 验证历史记录完整性
    const history = runner.getHistory();
    expect(history.length).toBe(4); // user, assistant(tool_call), tool_result, assistant(text)
    expect(history[0]?.role).toBe('user');
    expect(history[1]?.role).toBe('assistant');
    expect(history[2]?.role).toBe('tool');
    expect(history[3]?.role).toBe('assistant');
  });

  it('should handle multi-turn conversation with multiple tool calls', async () => {
    const client = createMockClient([
      // 第一轮：两个工具调用
      [
        { type: 'tool_call', id: 'c1', name: 'Bash', input: { command: 'read ./src/index.ts' } },
        { type: 'tool_call', id: 'c2', name: 'Bash', input: { command: 'read ./package.json' } },
      ],
      // 第二轮：文本响应
      [{ type: 'text', text: 'I analyzed both files.' }],
    ]);

    let callCount = 0;
    const toolHandler = mock(() => {
      callCount++;
      return Promise.resolve(ToolOk({ output: `content-${callCount}` }));
    });
    const toolset = new CallableToolset([createMockCallableTool(toolHandler)]);

    const runner = new AgentRunner({
      client,
      systemPrompt: 'Test',
      toolset,
      enableStopHooks: false,
    });

    const response = await runner.run('Analyze the project');

    expect(response).toBe('I analyzed both files.');
    expect(callCount).toBe(2);

    // 验证历史包含所有消息
    const history = runner.getHistory();
    expect(history.filter((m) => m.role === 'tool')).toHaveLength(2);
  });

  it('should recover from tool failure and continue', async () => {
    const client = createMockClient([
      // 第一轮：工具调用失败
      [{ type: 'tool_call', id: 'c1', name: 'Bash', input: { command: 'cat /nonexistent' } }],
      // 第二轮：LLM 尝试修正
      [{ type: 'tool_call', id: 'c2', name: 'Bash', input: { command: 'cat ./README.md' } }],
      // 第三轮：成功返回
      [{ type: 'text', text: 'Found the file content.' }],
    ]);

    let callCount = 0;
    const toolHandler = mock(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(ToolError({
          message: 'File not found: /nonexistent',
          output: '[stderr]\nFile not found: /nonexistent',
          extras: { failureCategory: 'execution_error' },
        }));
      }
      return Promise.resolve(ToolOk({ output: '# README\nProject docs' }));
    });
    const toolset = new CallableToolset([createMockCallableTool(toolHandler)]);

    const runner = new AgentRunner({
      client,
      systemPrompt: 'Test',
      toolset,
      enableStopHooks: false,
    });

    const response = await runner.run('Read the README');

    // 应该正常完成而不是因为失败停止
    expect(response).toBe('Found the file content.');
    expect(callCount).toBe(2);
  });

  it('should maintain conversation context across multiple run() calls', async () => {
    const client = createMockClient([
      [{ type: 'text', text: 'First response' }],
      [{ type: 'text', text: 'Second response, I remember the first.' }],
      [{ type: 'text', text: 'Third response.' }],
    ]);
    const toolset = new CallableToolset([createMockCallableTool(() =>
      Promise.resolve(ToolOk({ output: '' }))
    )]);

    const runner = new AgentRunner({
      client,
      systemPrompt: 'Test',
      toolset,
      enableStopHooks: false,
    });

    await runner.run('First message');
    await runner.run('Second message');
    const response = await runner.run('Third message');

    expect(response).toBe('Third response.');

    // 验证所有消息都在历史中
    const history = runner.getHistory();
    expect(history.filter((m) => m.role === 'user')).toHaveLength(3);
    expect(history.filter((m) => m.role === 'assistant')).toHaveLength(3);
  });

  it('should abort gracefully when signal is triggered during tool execution', async () => {
    const client = createMockClient([
      [{ type: 'tool_call', id: 'c1', name: 'Bash', input: { command: 'sleep 100' } }],
      [{ type: 'text', text: 'Recovered' }],
    ]);
    const cancel = mock(() => {});
    const pendingTool = new Promise(() => {}) as Promise<any> & { cancel: () => void };
    pendingTool.cancel = cancel;
    const toolset = {
      tools: [MockBashToolDef],
      handle: mock(() => pendingTool as CancelablePromise<any>),
    };

    const runner = new AgentRunner({
      client,
      systemPrompt: 'Test',
      toolset,
      enableStopHooks: false,
    });

    const controller = new AbortController();
    const runPromise = runner.run('Long running task', { signal: controller.signal });
    setTimeout(() => controller.abort(), 10);

    await expect(runPromise).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancel).toHaveBeenCalled();
  });
});

// --- core/agent-loop 集成测试 ---

describe('Integration: core/agent-loop complete flow', () => {
  function createMockProvider(responses: LLMResponse[]): LLMProviderLike {
    let callIndex = 0;
    return {
      name: 'mock-provider',
      model: 'mock-model',
      generate: (_params) => {
        const response = responses[callIndex++] ?? {
          content: [{ type: 'text' as const, text: 'default' }],
          stopReason: 'end_turn' as const,
          usage: { inputTokens: 10, outputTokens: 5 },
        };
        const chunks: LLMStreamChunk[] = [];
        // 将 content 转换为 stream chunks
        for (const block of response.content) {
          if (block.type === 'text') {
            chunks.push({ type: 'text_delta', text: block.text });
          }
        }
        chunks.push({ type: 'usage', inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens });

        let resultResolve!: (value: LLMResponse) => void;
        const resultPromise = new Promise<LLMResponse>((resolve) => { resultResolve = resolve; });

        const stream: LLMStream = {
          async *[Symbol.asyncIterator]() {
            for (const chunk of chunks) yield chunk;
            resultResolve(response);
          },
          result: resultPromise,
        };
        return stream;
      },
    };
  }

  it('should emit correct event sequence for simple text response', async () => {
    const provider = createMockProvider([
      {
        content: [{ type: 'text', text: 'Hello from agent' }],
        stopReason: 'end_turn',
        usage: { inputTokens: 100, outputTokens: 50 },
      },
    ]);

    const config: AgentLoopConfig = {
      systemPrompt: 'You are a test agent.',
      tools: [],
      maxIterations: 10,
      provider,
      failureDetection: {
        strategy: 'sliding-window',
        windowSize: 5,
        failureThreshold: 3,
      },
    };

    const eventStream = runAgentLoop(config, [{ type: 'text', text: 'Hi' }]);
    const events: AgentEvent[] = [];

    for await (const event of eventStream) {
      events.push(event);
    }

    const result = await eventStream.result;

    expect(result.response).toBe('Hello from agent');
    expect(result.stopReason).toBe('end_turn');
    expect(result.turnCount).toBe(1);

    // 验证事件序列
    const eventTypes = events.map((e) => e.type);
    expect(eventTypes).toContain('agent_start');
    expect(eventTypes).toContain('turn_start');
    expect(eventTypes).toContain('message_start');
    expect(eventTypes).toContain('message_delta');
    expect(eventTypes).toContain('message_end');
    expect(eventTypes).toContain('usage');
    expect(eventTypes).toContain('turn_end');
    expect(eventTypes).toContain('agent_end');
  });

  it('should execute tools and loop until text response', async () => {
    const echoTool: AgentTool = {
      name: 'echo',
      description: 'Echoes the input',
      inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
      execute: async (input: unknown) => {
        const parsed = input as { text?: string };
        return { output: `echo: ${parsed.text ?? ''}`, isError: false };
      },
    };

    const provider = createMockProvider([
      // 第一轮：工具调用
      {
        content: [
          { type: 'text', text: 'Let me echo that' },
          { type: 'tool_use', id: 'tool-1', name: 'echo', input: { text: 'hello' } },
        ],
        stopReason: 'tool_use',
        usage: { inputTokens: 100, outputTokens: 50 },
      },
      // 第二轮：文本响应
      {
        content: [{ type: 'text', text: 'The echo returned: hello' }],
        stopReason: 'end_turn',
        usage: { inputTokens: 150, outputTokens: 30 },
      },
    ]);

    const config: AgentLoopConfig = {
      systemPrompt: 'Test',
      tools: [echoTool],
      maxIterations: 10,
      provider,
      failureDetection: {
        strategy: 'sliding-window',
        windowSize: 5,
        failureThreshold: 3,
      },
    };

    const eventStream = runAgentLoop(config, [{ type: 'text', text: 'Echo hello' }]);
    const events: AgentEvent[] = [];
    for await (const event of eventStream) {
      events.push(event);
    }

    const result = await eventStream.result;

    expect(result.response).toBe('The echo returned: hello');
    expect(result.turnCount).toBe(2);

    // 验证工具事件存在
    const toolStartEvents = events.filter((e) => e.type === 'tool_start');
    const toolEndEvents = events.filter((e) => e.type === 'tool_end');
    expect(toolStartEvents).toHaveLength(1);
    expect(toolEndEvents).toHaveLength(1);

    const toolEnd = toolEndEvents[0] as Extract<AgentEvent, { type: 'tool_end' }>;
    expect(toolEnd.output).toBe('echo: hello');
    expect(toolEnd.isError).toBe(false);
  });

  it('should stop at max iterations', async () => {
    const provider = createMockProvider([
      // 每轮都返回工具调用，永不结束
      {
        content: [{ type: 'tool_use', id: 't-1', name: 'noop', input: {} }],
        stopReason: 'tool_use',
        usage: { inputTokens: 10, outputTokens: 5 },
      },
      {
        content: [{ type: 'tool_use', id: 't-2', name: 'noop', input: {} }],
        stopReason: 'tool_use',
        usage: { inputTokens: 10, outputTokens: 5 },
      },
      {
        content: [{ type: 'tool_use', id: 't-3', name: 'noop', input: {} }],
        stopReason: 'tool_use',
        usage: { inputTokens: 10, outputTokens: 5 },
      },
    ]);

    const noopTool: AgentTool = {
      name: 'noop',
      description: 'Does nothing',
      inputSchema: { type: 'object' },
      execute: async () => ({ output: 'ok', isError: false }),
    };

    const config: AgentLoopConfig = {
      systemPrompt: 'Test',
      tools: [noopTool],
      maxIterations: 2,
      provider,
      failureDetection: {
        strategy: 'sliding-window',
        windowSize: 5,
        failureThreshold: 3,
      },
    };

    const eventStream = runAgentLoop(config, [{ type: 'text', text: 'Do something' }]);
    for await (const _event of eventStream) {
      // consume
    }
    const result = await eventStream.result;

    expect(result.stopReason).toBe('max_iterations');
    expect(result.turnCount).toBe(2);
  });

  it('should handle abort signal during execution', async () => {
    const provider = createMockProvider([
      {
        content: [{ type: 'text', text: 'Processing...' }],
        stopReason: 'end_turn',
        usage: { inputTokens: 10, outputTokens: 5 },
      },
    ]);

    const controller = new AbortController();
    controller.abort(); // 立即中止

    const config: AgentLoopConfig = {
      systemPrompt: 'Test',
      tools: [],
      maxIterations: 10,
      provider,
      failureDetection: {
        strategy: 'sliding-window',
        windowSize: 5,
        failureThreshold: 3,
      },
      abortSignal: controller.signal,
    };

    const eventStream = runAgentLoop(config, [{ type: 'text', text: 'Hi' }]);
    const events: AgentEvent[] = [];
    for await (const event of eventStream) {
      events.push(event);
    }

    const result = await eventStream.result;
    expect(result.stopReason).toBe('aborted');
  });

  it('should handle tool execution failure gracefully', async () => {
    const failingTool: AgentTool = {
      name: 'failing',
      description: 'Always fails',
      inputSchema: { type: 'object' },
      execute: async () => {
        throw new Error('Tool crashed');
      },
    };

    const provider = createMockProvider([
      {
        content: [{ type: 'tool_use', id: 't-1', name: 'failing', input: {} }],
        stopReason: 'tool_use',
        usage: { inputTokens: 10, outputTokens: 5 },
      },
      {
        content: [{ type: 'text', text: 'The tool failed.' }],
        stopReason: 'end_turn',
        usage: { inputTokens: 20, outputTokens: 10 },
      },
    ]);

    const config: AgentLoopConfig = {
      systemPrompt: 'Test',
      tools: [failingTool],
      maxIterations: 10,
      provider,
      failureDetection: {
        strategy: 'sliding-window',
        windowSize: 5,
        failureThreshold: 3,
      },
    };

    const eventStream = runAgentLoop(config, [{ type: 'text', text: 'Use tool' }]);
    const events: AgentEvent[] = [];
    for await (const event of eventStream) {
      events.push(event);
    }

    const result = await eventStream.result;
    expect(result.response).toBe('The tool failed.');

    // 验证工具异常被捕获并返回 isError
    const toolEnd = events.find((e) => e.type === 'tool_end') as Extract<AgentEvent, { type: 'tool_end' }>;
    expect(toolEnd).toBeDefined();
    expect(toolEnd.isError).toBe(true);
    expect(toolEnd.output).toContain('Tool execution failed');
  });

  it('should handle unknown tool name gracefully', async () => {
    const provider = createMockProvider([
      {
        content: [{ type: 'tool_use', id: 't-1', name: 'nonexistent', input: {} }],
        stopReason: 'tool_use',
        usage: { inputTokens: 10, outputTokens: 5 },
      },
      {
        content: [{ type: 'text', text: 'Tool not found, done.' }],
        stopReason: 'end_turn',
        usage: { inputTokens: 20, outputTokens: 10 },
      },
    ]);

    const config: AgentLoopConfig = {
      systemPrompt: 'Test',
      tools: [],
      maxIterations: 10,
      provider,
      failureDetection: {
        strategy: 'sliding-window',
        windowSize: 5,
        failureThreshold: 3,
      },
    };

    const eventStream = runAgentLoop(config, [{ type: 'text', text: 'Use unknown tool' }]);
    const events: AgentEvent[] = [];
    for await (const event of eventStream) {
      events.push(event);
    }

    const result = await eventStream.result;
    expect(result.response).toBe('Tool not found, done.');

    const toolEnd = events.find((e) => e.type === 'tool_end') as Extract<AgentEvent, { type: 'tool_end' }>;
    expect(toolEnd).toBeDefined();
    expect(toolEnd.isError).toBe(true);
    expect(toolEnd.output).toContain('Tool not found');
  });
});
