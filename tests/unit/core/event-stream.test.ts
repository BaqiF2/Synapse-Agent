/**
 * EventStream 单元测试 — 验证异步事件流的核心行为。
 * 测试目标: EventStream 类的事件发射、异步迭代、完成/错误处理、AbortSignal 中止、
 *          事件类型结构验证（tool/thinking/error/context_management）以及 UI 解耦。
 */

import { describe, expect, it } from 'bun:test';
import { EventStream, createEventStream } from '../../../src/core/event-stream.ts';
import type {
  AgentEvent,
  AgentResult,
  AgentStartEvent,
  AgentEndEvent,
  ToolStartEvent,
  ToolEndEvent,
  ThinkingEvent,
  ErrorEvent,
  ContextManagementEvent,
} from '../../../src/core/types.ts';

describe('EventStream', () => {
  it('should iterate over emitted events in order', async () => {
    const { stream, emit, complete } = createEventStream();

    const events: AgentEvent[] = [
      { type: 'agent_start', sessionId: 'test-001', config: { maxIterations: 10, maxConsecutiveFailures: 3 } },
      { type: 'turn_start', turnIndex: 0 },
      { type: 'message_start', role: 'assistant' },
      { type: 'message_delta', contentDelta: 'Hello' },
      { type: 'message_end', stopReason: 'end_turn' },
      { type: 'turn_end', turnIndex: 0, hasToolCalls: false },
    ];

    const result: AgentResult = {
      response: 'Hello',
      turnCount: 1,
      stopReason: 'end_turn',
    };

    // 异步发射事件
    setTimeout(() => {
      for (const event of events) {
        emit(event);
      }
      complete(result);
    }, 0);

    // 消费事件
    const collected: AgentEvent[] = [];
    for await (const event of stream) {
      collected.push(event);
    }

    expect(collected).toHaveLength(events.length);
    expect(collected[0]!.type).toBe('agent_start');
    expect(collected[5]!.type).toBe('turn_end');
  });

  it('should resolve .result with the final AgentResult', async () => {
    const { stream, complete } = createEventStream();

    const expected: AgentResult = {
      response: 'Test result',
      turnCount: 2,
      stopReason: 'end_turn',
    };

    complete(expected);

    const actual = await stream.result;
    expect(actual).toEqual(expected);
  });

  it('should reject .result when error is called', async () => {
    const { stream, error } = createEventStream();

    const expectedError = new Error('Test error');
    error(expectedError);

    await expect(stream.result).rejects.toThrow('Test error');
  });

  it('should stop iteration after complete is called', async () => {
    const { stream, emit, complete } = createEventStream();

    emit({ type: 'turn_start', turnIndex: 0 });
    complete({ response: '', turnCount: 0, stopReason: 'end_turn' });
    // 完成后再发射的事件应被忽略
    emit({ type: 'turn_start', turnIndex: 1 });

    const collected: AgentEvent[] = [];
    for await (const event of stream) {
      collected.push(event);
    }

    expect(collected).toHaveLength(1);
    expect(collected[0]!.type).toBe('turn_start');
  });

  it('should handle events emitted before iteration starts', async () => {
    const { stream, emit, complete } = createEventStream();

    // 先发射事件再开始消费
    emit({ type: 'agent_start', sessionId: 's1', config: { maxIterations: 5, maxConsecutiveFailures: 3 } });
    emit({ type: 'turn_start', turnIndex: 0 });
    complete({ response: 'done', turnCount: 1, stopReason: 'end_turn' });

    const collected: AgentEvent[] = [];
    for await (const event of stream) {
      collected.push(event);
    }

    expect(collected).toHaveLength(2);
  });

  it('should be created via EventStream constructor directly', () => {
    const stream = new EventStream();
    expect(stream).toBeInstanceOf(EventStream);
    expect(stream.result).toBeInstanceOf(Promise);
  });

  // ========== BDD: Agent 运行产生完整事件序列 ==========

  it('should produce complete event sequence: agent_start → turn_start → message_start → message_delta → message_end → turn_end → agent_end', async () => {
    const { stream, emit, complete } = createEventStream();

    const finalResult: AgentResult = {
      response: 'Hello',
      turnCount: 1,
      stopReason: 'end_turn',
    };

    // 模拟 Agent Loop 产生完整事件序列
    setTimeout(() => {
      emit({ type: 'agent_start', sessionId: 'seq-001', config: { maxIterations: 10, maxConsecutiveFailures: 3 } });
      emit({ type: 'turn_start', turnIndex: 0 });
      emit({ type: 'message_start', role: 'assistant' });
      emit({ type: 'message_delta', contentDelta: 'Hello' });
      emit({ type: 'message_end', stopReason: 'end_turn' });
      emit({ type: 'turn_end', turnIndex: 0, hasToolCalls: false });
      emit({ type: 'agent_end', result: finalResult, usage: { inputTokens: 100, outputTokens: 50 } });
      complete(finalResult);
    }, 0);

    const collected: AgentEvent[] = [];
    for await (const event of stream) {
      collected.push(event);
    }

    // 验证完整事件序列顺序
    const expectedTypes: AgentEvent['type'][] = [
      'agent_start', 'turn_start', 'message_start',
      'message_delta', 'message_end', 'turn_end', 'agent_end',
    ];
    expect(collected.map((e) => e.type)).toEqual(expectedTypes);

    // 验证 agent_start 事件包含 sessionId 和 config
    const agentStart = collected[0] as AgentStartEvent;
    expect(agentStart.sessionId).toBe('seq-001');
    expect(agentStart.config.maxIterations).toBe(10);
    expect(agentStart.config.maxConsecutiveFailures).toBe(3);

    // 验证 agent_end 事件包含 result 和 usage
    const agentEnd = collected[6] as AgentEndEvent;
    expect(agentEnd.result).toEqual(finalResult);
    expect(agentEnd.usage.inputTokens).toBe(100);
    expect(agentEnd.usage.outputTokens).toBe(50);

    // 验证 EventStream.result 返回最终文本响应
    const result = await stream.result;
    expect(result.response).toBe('Hello');
  });

  // ========== BDD: 工具调用产生 tool_start 和 tool_end 事件 ==========

  it('should emit tool_start and tool_end events with correct structure during tool calls', async () => {
    const { stream, emit, complete } = createEventStream();

    setTimeout(() => {
      // 第一轮: LLM 请求工具调用
      emit({ type: 'agent_start', sessionId: 'tool-001', config: { maxIterations: 10, maxConsecutiveFailures: 3 } });
      emit({ type: 'turn_start', turnIndex: 0 });
      emit({ type: 'message_start', role: 'assistant' });
      emit({ type: 'message_end', stopReason: 'tool_use' });

      // 工具执行
      emit({
        type: 'tool_start',
        toolName: 'test_tool',
        toolId: 'tool-call-001',
        input: { arg: 'value' },
      });
      emit({
        type: 'tool_end',
        toolName: 'test_tool',
        toolId: 'tool-call-001',
        output: 'tool output',
        isError: false,
        duration: 42,
      });

      emit({ type: 'turn_end', turnIndex: 0, hasToolCalls: true });

      // 第二轮: LLM 返回文本响应
      emit({ type: 'turn_start', turnIndex: 1 });
      emit({ type: 'message_start', role: 'assistant' });
      emit({ type: 'message_delta', contentDelta: 'Done' });
      emit({ type: 'message_end', stopReason: 'end_turn' });
      emit({ type: 'turn_end', turnIndex: 1, hasToolCalls: false });

      complete({ response: 'Done', turnCount: 2, stopReason: 'end_turn' });
    }, 0);

    const collected: AgentEvent[] = [];
    for await (const event of stream) {
      collected.push(event);
    }

    // 验证 tool_start 和 tool_end 在两次 turn 之间产生
    const toolStartIdx = collected.findIndex((e) => e.type === 'tool_start');
    const toolEndIdx = collected.findIndex((e) => e.type === 'tool_end');
    expect(toolStartIdx).toBeGreaterThan(-1);
    expect(toolEndIdx).toBeGreaterThan(toolStartIdx);

    // 验证 tool_start 事件结构
    const toolStart = collected[toolStartIdx] as ToolStartEvent;
    expect(toolStart.toolName).toBe('test_tool');
    expect(toolStart.toolId).toBe('tool-call-001');
    expect(toolStart.input).toEqual({ arg: 'value' });

    // 验证 tool_end 事件结构
    const toolEnd = collected[toolEndIdx] as ToolEndEvent;
    expect(toolEnd.toolName).toBe('test_tool');
    expect(toolEnd.toolId).toBe('tool-call-001');
    expect(toolEnd.output).toBe('tool output');
    expect(toolEnd.isError).toBe(false);
    expect(toolEnd.duration).toBeGreaterThan(0);
  });

  // ========== BDD: EventStream 支持 AbortSignal 中止 ==========

  it('should terminate iteration and emit error event when AbortSignal is triggered', async () => {
    const abortController = new AbortController();
    const { stream, emit } = createEventStream({ signal: abortController.signal });

    // 发射一些事件后中止
    emit({ type: 'agent_start', sessionId: 'abort-001', config: { maxIterations: 10, maxConsecutiveFailures: 3 } });
    emit({ type: 'turn_start', turnIndex: 0 });

    // 在下一个 tick 中止
    setTimeout(() => {
      abortController.abort();
    }, 10);

    const collected: AgentEvent[] = [];
    for await (const event of stream) {
      collected.push(event);
    }

    // 验证迭代正常终止
    expect(collected.length).toBeGreaterThanOrEqual(2);

    // 验证产生了 error 事件，类型为 abort
    const errorEvent = collected.find((e) => e.type === 'error') as ErrorEvent | undefined;
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.error.message).toContain('abort');

    // 验证 EventStream.result 返回中止结果
    await expect(stream.result).rejects.toThrow();
  });

  it('should handle already-aborted signal immediately', async () => {
    const abortController = new AbortController();
    abortController.abort();

    const { stream } = createEventStream({ signal: abortController.signal });

    const collected: AgentEvent[] = [];
    for await (const event of stream) {
      collected.push(event);
    }

    // 应该立即产生 error 事件并终止
    const errorEvent = collected.find((e) => e.type === 'error') as ErrorEvent | undefined;
    expect(errorEvent).toBeDefined();

    await expect(stream.result).rejects.toThrow();
  });

  // ========== BDD: LLM 错误产生可恢复 error 事件 ==========

  it('should emit recoverable error event for LLM errors', async () => {
    const { stream, emit, complete } = createEventStream();

    setTimeout(() => {
      emit({ type: 'agent_start', sessionId: 'err-001', config: { maxIterations: 10, maxConsecutiveFailures: 3 } });
      emit({ type: 'turn_start', turnIndex: 0 });

      // LLM 调用失败产生可恢复 error 事件
      emit({
        type: 'error',
        error: new Error('API rate limit exceeded'),
        recoverable: true,
      });

      emit({ type: 'turn_end', turnIndex: 0, hasToolCalls: false });
      complete({ response: '', turnCount: 1, stopReason: 'error' });
    }, 0);

    const collected: AgentEvent[] = [];
    for await (const event of stream) {
      collected.push(event);
    }

    // 验证 error 事件
    const errorEvent = collected.find((e) => e.type === 'error') as ErrorEvent | undefined;
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.recoverable).toBe(true);
    expect(errorEvent!.error.message).toBe('API rate limit exceeded');
  });

  // ========== BDD: 连续工具失败触发不可恢复错误 ==========

  it('should emit unrecoverable error event after consecutive tool failures exceed threshold', async () => {
    const { stream, emit, complete } = createEventStream();
    const MAX_FAILURES = 3;

    setTimeout(() => {
      emit({
        type: 'agent_start',
        sessionId: 'fail-001',
        config: { maxIterations: 10, maxConsecutiveFailures: MAX_FAILURES },
      });

      // 模拟 3 次连续工具失败
      for (let i = 0; i < MAX_FAILURES; i++) {
        emit({ type: 'turn_start', turnIndex: i });
        emit({
          type: 'tool_start',
          toolName: 'failing_tool',
          toolId: `tool-${i}`,
          input: {},
        });
        emit({
          type: 'tool_end',
          toolName: 'failing_tool',
          toolId: `tool-${i}`,
          output: 'Tool execution failed',
          isError: true,
          duration: 5,
        });
        emit({ type: 'turn_end', turnIndex: i, hasToolCalls: true });
      }

      // 第 3 次失败后产生不可恢复 error 事件
      emit({
        type: 'error',
        error: new Error('Max consecutive tool failures exceeded'),
        recoverable: false,
      });

      // agent_end 包含失败原因
      const failResult: AgentResult = {
        response: '',
        turnCount: MAX_FAILURES,
        stopReason: 'error',
      };
      emit({
        type: 'agent_end',
        result: failResult,
        usage: { inputTokens: 0, outputTokens: 0 },
      });
      complete(failResult);
    }, 0);

    const collected: AgentEvent[] = [];
    for await (const event of stream) {
      collected.push(event);
    }

    // 验证不可恢复 error 事件
    const errorEvent = collected.find((e) => e.type === 'error') as ErrorEvent | undefined;
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.recoverable).toBe(false);

    // 验证 agent_end 包含失败原因
    const agentEnd = collected.find((e) => e.type === 'agent_end') as AgentEndEvent | undefined;
    expect(agentEnd).toBeDefined();
    expect(agentEnd!.result.stopReason).toBe('error');

    // 验证最终结果
    const result = await stream.result;
    expect(result.stopReason).toBe('error');
  });

  // ========== BDD: 上下文管理触发 context_management 事件 ==========

  it('should emit context_management event with action and details', async () => {
    const { stream, emit, complete } = createEventStream();

    setTimeout(() => {
      emit({ type: 'agent_start', sessionId: 'ctx-001', config: { maxIterations: 10, maxConsecutiveFailures: 3 } });
      emit({ type: 'turn_start', turnIndex: 0 });

      // 上下文管理事件
      emit({
        type: 'context_management',
        action: 'compact',
        details: 'Conversation history compacted from 15000 to 8000 tokens',
      });

      emit({ type: 'message_start', role: 'assistant' });
      emit({ type: 'message_delta', contentDelta: 'Continued response' });
      emit({ type: 'message_end', stopReason: 'end_turn' });
      emit({ type: 'turn_end', turnIndex: 0, hasToolCalls: false });

      complete({ response: 'Continued response', turnCount: 1, stopReason: 'end_turn' });
    }, 0);

    const collected: AgentEvent[] = [];
    for await (const event of stream) {
      collected.push(event);
    }

    // 验证 context_management 事件
    const ctxEvent = collected.find((e) => e.type === 'context_management') as ContextManagementEvent | undefined;
    expect(ctxEvent).toBeDefined();
    expect(ctxEvent!.action).toBe('compact');
    expect(ctxEvent!.details).toContain('compacted');
  });

  it('should emit context_management event with offload action', async () => {
    const { stream, emit, complete } = createEventStream();

    emit({
      type: 'context_management',
      action: 'offload',
      details: 'Offloaded 5 old turns to summary',
    });
    complete({ response: '', turnCount: 0, stopReason: 'end_turn' });

    const collected: AgentEvent[] = [];
    for await (const event of stream) {
      collected.push(event);
    }

    const ctxEvent = collected.find((e) => e.type === 'context_management') as ContextManagementEvent | undefined;
    expect(ctxEvent).toBeDefined();
    expect(ctxEvent!.action).toBe('offload');
  });

  // ========== BDD: thinking 事件在扩展思考模式下产生 ==========

  it('should emit thinking event with content in extended thinking mode', async () => {
    const { stream, emit, complete } = createEventStream();

    setTimeout(() => {
      emit({ type: 'agent_start', sessionId: 'think-001', config: { maxIterations: 10, maxConsecutiveFailures: 3 } });
      emit({ type: 'turn_start', turnIndex: 0 });

      // 扩展思考事件
      emit({
        type: 'thinking',
        content: 'Let me analyze this step by step...',
      });

      emit({ type: 'message_start', role: 'assistant' });
      emit({ type: 'message_delta', contentDelta: 'The answer is 42.' });
      emit({ type: 'message_end', stopReason: 'end_turn' });
      emit({ type: 'turn_end', turnIndex: 0, hasToolCalls: false });

      complete({ response: 'The answer is 42.', turnCount: 1, stopReason: 'end_turn' });
    }, 0);

    const collected: AgentEvent[] = [];
    for await (const event of stream) {
      collected.push(event);
    }

    // 验证 thinking 事件
    const thinkingEvent = collected.find((e) => e.type === 'thinking') as ThinkingEvent | undefined;
    expect(thinkingEvent).toBeDefined();
    expect(thinkingEvent!.content).toBe('Let me analyze this step by step...');
  });

  // ========== BDD: Agent Loop 不持有 UI 引用 ==========

  it('should not reference cli/ modules or UI components from core/ source files', async () => {
    // 静态分析: 扫描 core/ 目录下所有源文件的 import 语句
    const { readdir } = await import('node:fs/promises');
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');

    const coreDir = join(process.cwd(), 'src', 'core');
    const files = await readdir(coreDir);
    const tsFiles = files.filter((f: string) => f.endsWith('.ts'));

    for (const file of tsFiles) {
      const content = await readFile(join(coreDir, file), 'utf-8');
      const lines = content.split('\n');

      for (const line of lines) {
        // 不存在对 cli/ 模块的引用
        expect(line).not.toMatch(/from\s+['"].*\/cli\//);
        // 不存在对 TerminalRenderer 等 UI 组件的引用
        expect(line).not.toMatch(/TerminalRenderer/);
        // 不存在 console.log 等直接输出语句
        expect(line).not.toMatch(/^\s*console\.(log|warn|error|info)\(/);
      }
    }
  });
});
