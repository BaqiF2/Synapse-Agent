/**
 * 消息系统 单元测试 — 验证 createDomainMessage 工厂函数与 convertToLlm 纯函数的完整行为。
 * 测试目标: 领域消息创建与不可变性、领域消息到 LLM 消息的正确转换、类型过滤、声明合并扩展、边界条件。
 */

import { describe, expect, it } from 'bun:test';
import { convertToLlm, createDomainMessage } from '../../../src/core/messages.ts';
import type { DomainMessage, DomainContentBlock } from '../../../src/core/messages.ts';

describe('convertToLlm', () => {
  it('should convert text messages correctly', () => {
    const messages: DomainMessage[] = [
      {
        id: 'msg-1',
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
        timestamp: Date.now(),
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hi there!' }],
        timestamp: Date.now(),
      },
    ];

    const result = convertToLlm(messages);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      role: 'user',
      content: [{ type: 'text', text: 'Hello' }],
    });
    expect(result[1]).toEqual({
      role: 'assistant',
      content: [{ type: 'text', text: 'Hi there!' }],
    });
  });

  it('should convert tool_use and tool_result correctly', () => {
    const messages: DomainMessage[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: [{
          type: 'tool_use',
          toolName: 'read',
          toolId: 'tool-1',
          input: { path: '/tmp/test.txt' },
        }],
        timestamp: Date.now(),
      },
      {
        id: 'msg-2',
        role: 'tool_result',
        content: [{
          type: 'tool_result',
          toolId: 'tool-1',
          output: 'file contents',
          isError: false,
        }],
        timestamp: Date.now(),
      },
    ];

    const result = convertToLlm(messages);

    expect(result).toHaveLength(2);
    expect(result[0]!.role).toBe('assistant');
    expect(result[0]!.content[0]).toEqual({
      type: 'tool_use',
      id: 'tool-1',
      name: 'read',
      input: { path: '/tmp/test.txt' },
    });
    // tool_result 角色映射为 user
    expect(result[1]!.role).toBe('user');
    expect(result[1]!.content[0]).toEqual({
      type: 'tool_result',
      tool_use_id: 'tool-1',
      content: 'file contents',
      is_error: undefined,
    });
  });

  it('should filter system role messages', () => {
    const messages: DomainMessage[] = [
      {
        id: 'msg-0',
        role: 'system',
        content: [{ type: 'text', text: 'System prompt' }],
        timestamp: Date.now(),
      },
      {
        id: 'msg-1',
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
        timestamp: Date.now(),
      },
    ];

    const result = convertToLlm(messages);

    expect(result).toHaveLength(1);
    expect(result[0]!.role).toBe('user');
  });

  it('should convert skill_search to text summary', () => {
    const messages: DomainMessage[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: [{
          type: 'skill_search',
          query: 'file editing',
          results: [{ name: 'edit-skill' }, { name: 'write-skill' }],
        }],
        timestamp: Date.now(),
      },
    ];

    const result = convertToLlm(messages);

    expect(result).toHaveLength(1);
    expect(result[0]!.content[0]).toEqual({
      type: 'text',
      text: '[Skill search: "file editing" found 2 results]',
    });
  });

  it('should convert context_summary to text', () => {
    const messages: DomainMessage[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: [{
          type: 'context_summary',
          summary: 'Previous conversation about coding...',
          compactedCount: 10,
        }],
        timestamp: Date.now(),
      },
    ];

    const result = convertToLlm(messages);

    expect(result).toHaveLength(1);
    expect(result[0]!.content[0]).toEqual({
      type: 'text',
      text: 'Previous conversation about coding...',
    });
  });

  it('should return empty array for empty input', () => {
    const result = convertToLlm([]);
    expect(result).toEqual([]);
  });

  it('should respect maxMessages option', () => {
    const messages: DomainMessage[] = Array.from({ length: 10 }, (_, i) => ({
      id: `msg-${i}`,
      role: 'user' as const,
      content: [{ type: 'text' as const, text: `Message ${i}` }],
      timestamp: Date.now(),
    }));

    const result = convertToLlm(messages, { maxMessages: 3 });

    expect(result).toHaveLength(3);
    // 应取最后 3 条
    expect(result[0]!.content[0]).toEqual({ type: 'text', text: 'Message 7' });
  });

  it('should respect filterTypes option', () => {
    const messages: DomainMessage[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: [
          { type: 'thinking', content: 'Let me think...' },
          { type: 'text', text: 'Here is the answer' },
        ],
        timestamp: Date.now(),
      },
    ];

    const result = convertToLlm(messages, { filterTypes: ['thinking'] });

    expect(result).toHaveLength(1);
    expect(result[0]!.content).toHaveLength(1);
    expect(result[0]!.content[0]!.type).toBe('text');
  });

  it('should drop metadata from domain messages', () => {
    const messages: DomainMessage[] = [
      {
        id: 'msg-1',
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
        timestamp: Date.now(),
        metadata: { source: 'cli', sessionId: 'abc' },
      },
    ];

    const result = convertToLlm(messages);

    expect(result).toHaveLength(1);
    // LLMMessage 不包含 metadata 字段
    expect('metadata' in result[0]!).toBe(false);
  });

  it('should skip empty content messages', () => {
    const messages: DomainMessage[] = [
      {
        id: 'msg-1',
        role: 'user',
        content: [],
        timestamp: Date.now(),
      },
    ];

    const result = convertToLlm(messages);
    expect(result).toHaveLength(0);
  });

  it('should ignore unknown ContentBlock types and log warning', () => {
    // 由于实现使用 pino logger.warn，这里通过验证行为来间接确认
    // 未知类型被忽略不会导致异常，且不影响其他 block 的转换
    const messages: DomainMessage[] = [
      {
        id: 'msg-1',
        role: 'user',
        content: [
          // 未知类型通过 as 强制传入
          { type: 'custom_unknown', data: 42 } as unknown as DomainContentBlock,
          { type: 'text', text: 'Hello' },
        ],
        timestamp: Date.now(),
      },
    ];

    // 不应抛出异常
    const result = convertToLlm(messages);

    // 未知类型被忽略，text 正常转换
    expect(result).toHaveLength(1);
    expect(result[0]!.content).toHaveLength(1);
    expect(result[0]!.content[0]!.type).toBe('text');
  });

  it('should be a pure function — no mutation of input', () => {
    const messages: DomainMessage[] = [
      {
        id: 'msg-1',
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
        timestamp: 1000,
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content: [{ type: 'text', text: 'World' }],
        timestamp: 2000,
      },
    ];

    // 深拷贝原始输入用于对比
    const snapshot = JSON.parse(JSON.stringify(messages));

    const result1 = convertToLlm(messages);
    const result2 = convertToLlm(messages);

    // 两次调用结果深度相等
    expect(result1).toEqual(result2);
    // 原始输入未被修改
    expect(messages).toEqual(snapshot);
  });
});

// ========== 场景 1: 创建领域消息 ==========

describe('createDomainMessage', () => {
  it('should create domain message with complete metadata', () => {
    const msg = createDomainMessage({
      role: 'user',
      content: [{ type: 'text', text: 'Hello' }],
    });

    // 包含唯一 id
    expect(typeof msg.id).toBe('string');
    expect(msg.id.length).toBeGreaterThan(0);

    // 包含 timestamp
    expect(typeof msg.timestamp).toBe('number');
    expect(msg.timestamp).toBeGreaterThan(0);

    // 包含 role 和 content
    expect(msg.role).toBe('user');
    expect(msg.content).toHaveLength(1);
    expect(msg.content[0]!.type).toBe('text');
  });

  it('should generate unique ids for each message', () => {
    const msg1 = createDomainMessage({
      role: 'user',
      content: [{ type: 'text', text: 'A' }],
    });
    const msg2 = createDomainMessage({
      role: 'user',
      content: [{ type: 'text', text: 'B' }],
    });

    expect(msg1.id).not.toBe(msg2.id);
  });

  it('should create frozen (immutable) messages', () => {
    const msg = createDomainMessage({
      role: 'user',
      content: [{ type: 'text', text: 'Hello' }],
    });

    // 消息本身不可变
    expect(Object.isFrozen(msg)).toBe(true);

    // 修改操作应该被忽略（strict mode 下会报错，但 frozen 对象赋值在非 strict 模式下静默失败）
    expect(() => {
      (msg as { role: string }).role = 'assistant';
    }).toThrow();
  });

  it('should accept optional metadata', () => {
    const msg = createDomainMessage({
      role: 'assistant',
      content: [{ type: 'text', text: 'Reply' }],
      metadata: { source: 'cli', model: 'claude-3' },
    });

    expect(msg.metadata).toEqual({ source: 'cli', model: 'claude-3' });
  });
});

// ========== 场景 10: 声明合并扩展 ==========

describe('declaration merging for ContentBlock extension', () => {
  it('should allow custom ContentBlock types via type assertion', () => {
    // 通过声明合并或联合扩展，自定义类型可以作为 DomainContentBlock 使用
    // 在运行时，自定义类型作为 block 存入 DomainMessage
    interface CustomEventBlock {
      type: 'custom_event';
      eventName: string;
      payload: Record<string, unknown>;
    }

    const customBlock: CustomEventBlock = {
      type: 'custom_event',
      eventName: 'user_action',
      payload: { action: 'click' },
    };

    const msg = createDomainMessage({
      role: 'user',
      content: [
        { type: 'text', text: 'Hello' },
        customBlock as unknown as DomainContentBlock,
      ],
    });

    // DomainMessage 正常存储自定义类型 block
    expect(msg.content).toHaveLength(2);
    expect((msg.content[1] as unknown as CustomEventBlock).type).toBe('custom_event');

    // convertToLlm 对自定义类型按未知类型处理（过滤掉）
    const llmMessages = convertToLlm([msg]);

    expect(llmMessages).toHaveLength(1);
    // 只保留 text block，custom_event 被过滤
    expect(llmMessages[0]!.content).toHaveLength(1);
    expect(llmMessages[0]!.content[0]!.type).toBe('text');
  });
});
