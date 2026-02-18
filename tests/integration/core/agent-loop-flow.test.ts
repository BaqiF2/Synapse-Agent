/**
 * Agent Core 集成测试 — 验证 EventStream + 消息系统的端到端流程。
 * 测试目标: EventStream 事件流与消息转换的协作，模拟完整的 Agent Loop 流程。
 */

import { describe, expect, it } from 'bun:test';
import { createEventStream } from '../../../src/core/event-stream.ts';
import { convertToLlm } from '../../../src/core/messages.ts';
import type { AgentEvent, AgentResult } from '../../../src/core/types.ts';
import type { DomainMessage } from '../../../src/core/messages.ts';

describe('Agent Core Integration', () => {
  it('should simulate a complete agent turn with EventStream and messages', async () => {
    const { stream, emit, complete } = createEventStream();

    // 模拟 Agent Loop 过程
    const agentProcess = async () => {
      // 1. Agent 开始
      emit({
        type: 'agent_start',
        sessionId: 'integration-test-001',
        config: { maxIterations: 10, maxConsecutiveFailures: 3 },
      });

      // 2. 第一轮迭代
      emit({ type: 'turn_start', turnIndex: 0 });
      emit({ type: 'message_start', role: 'assistant' });
      emit({ type: 'message_delta', contentDelta: 'I will read the file.' });
      emit({ type: 'message_end', stopReason: 'tool_use' });

      // 3. 工具调用
      emit({
        type: 'tool_start',
        toolName: 'read',
        toolId: 'tool-001',
        input: { path: '/tmp/test.txt' },
      });
      emit({
        type: 'tool_end',
        toolName: 'read',
        toolId: 'tool-001',
        output: 'file contents here',
        isError: false,
        duration: 15,
      });

      // 4. Token 使用统计
      emit({
        type: 'usage',
        inputTokens: 500,
        outputTokens: 100,
      });

      emit({ type: 'turn_end', turnIndex: 0, hasToolCalls: true });

      // 5. 第二轮迭代（最终回复）
      emit({ type: 'turn_start', turnIndex: 1 });
      emit({ type: 'message_start', role: 'assistant' });
      emit({ type: 'message_delta', contentDelta: 'The file contains: file contents here' });
      emit({ type: 'message_end', stopReason: 'end_turn' });
      emit({ type: 'turn_end', turnIndex: 1, hasToolCalls: false });

      // 6. Agent 结束
      const result: AgentResult = {
        response: 'The file contains: file contents here',
        turnCount: 2,
        stopReason: 'end_turn',
      };
      emit({
        type: 'agent_end',
        result,
        usage: { inputTokens: 1000, outputTokens: 200 },
      });
      complete(result);
    };

    // 启动 Agent 过程
    agentProcess();

    // 消费者侧：收集事件
    const events: AgentEvent[] = [];
    for await (const event of stream) {
      events.push(event);
    }

    // 验证事件序列完整性
    expect(events[0]!.type).toBe('agent_start');
    expect(events[events.length - 1]!.type).toBe('agent_end');

    // 验证工具调用事件
    const toolStart = events.find((e) => e.type === 'tool_start');
    expect(toolStart).toBeDefined();
    if (toolStart?.type === 'tool_start') {
      expect(toolStart.toolName).toBe('read');
    }

    // 验证最终结果
    const finalResult = await stream.result;
    expect(finalResult.response).toContain('file contents here');
    expect(finalResult.turnCount).toBe(2);
  });

  it('should correctly convert domain messages built from EventStream events', () => {
    // 模拟根据 EventStream 事件构建的领域消息
    const domainMessages: DomainMessage[] = [
      {
        id: 'msg-1',
        role: 'user',
        content: [{ type: 'text', text: 'Read /tmp/test.txt' }],
        timestamp: Date.now(),
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content: [
          { type: 'text', text: 'I will read the file.' },
          {
            type: 'tool_use',
            toolName: 'read',
            toolId: 'tool-001',
            input: { path: '/tmp/test.txt' },
          },
        ],
        timestamp: Date.now(),
      },
      {
        id: 'msg-3',
        role: 'tool_result',
        content: [{
          type: 'tool_result',
          toolId: 'tool-001',
          output: 'file contents',
          isError: false,
        }],
        timestamp: Date.now(),
      },
      {
        id: 'msg-4',
        role: 'assistant',
        content: [{ type: 'text', text: 'The file contains: file contents' }],
        timestamp: Date.now(),
        metadata: { turnIndex: 1 },
      },
    ];

    // 转换为 LLM 消息
    const llmMessages = convertToLlm(domainMessages);

    // 验证转换结果
    expect(llmMessages).toHaveLength(4);
    expect(llmMessages[0]!.role).toBe('user');
    expect(llmMessages[1]!.role).toBe('assistant');
    expect(llmMessages[2]!.role).toBe('user'); // tool_result → user
    expect(llmMessages[3]!.role).toBe('assistant');

    // 验证 tool_use 转换
    const toolUseBlock = llmMessages[1]!.content[1];
    expect(toolUseBlock).toEqual({
      type: 'tool_use',
      id: 'tool-001',
      name: 'read',
      input: { path: '/tmp/test.txt' },
    });

    // 验证 metadata 被丢弃
    expect('metadata' in llmMessages[3]!).toBe(false);
  });
});
