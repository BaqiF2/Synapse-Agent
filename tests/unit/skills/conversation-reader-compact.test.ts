/**
 * ConversationReader.compact() Tests
 *
 * 测试 compact() 方法的消息类型处理和边界情况。
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ConversationReader, type ConversationTurn } from '../../../src/skills/generator/conversation-reader.ts';

describe('ConversationReader.compact() - 消息类型处理', () => {
  it('User 消息格式化', () => {
    const reader = new ConversationReader();
    const turns: ConversationTurn[] = [
      {
        id: 'msg-1',
        timestamp: '2025-01-01T00:00:00Z',
        role: 'user',
        content: 'Hello world',
      },
    ];

    const result = reader.compact(turns);

    expect(result).toBe('[User] Hello world');
  });

  it('Assistant 文本消息格式化', () => {
    const reader = new ConversationReader();
    const turns: ConversationTurn[] = [
      {
        id: 'msg-1',
        timestamp: '2025-01-01T00:00:00Z',
        role: 'assistant',
        content: 'I will help you.',
      },
    ];

    const result = reader.compact(turns);

    expect(result).toBe('[Assistant] I will help you.');
  });

  it('Tool call 格式化', () => {
    const reader = new ConversationReader();
    const turns: ConversationTurn[] = [
      {
        id: 'msg-1',
        timestamp: '2025-01-01T00:00:00Z',
        role: 'assistant',
        content: '',
        toolCalls: [
          { id: 'call-1', name: 'read', input: { path: '/tmp/test.txt' } },
        ],
      },
    ];

    const result = reader.compact(turns);

    expect(result).toBe('[Tool] read');
  });

  it('Tool result 截断格式化', () => {
    const reader = new ConversationReader();
    // 创建超过默认 200 字符的内容
    const longContent = 'a'.repeat(250);
    const turns: ConversationTurn[] = [
      {
        id: 'msg-1',
        timestamp: '2025-01-01T00:00:00Z',
        role: 'user',
        content: '',
        toolResults: [
          { toolUseId: 'call-1', content: longContent },
        ],
      },
    ];

    const result = reader.compact(turns);

    // 默认 SYNAPSE_TOOL_RESULT_SUMMARY_LIMIT=200，预留 3 字符给省略号
    // 所以实际内容是 200 - 3 = 197 个字符
    expect(result).toBe(`[Result] ${'a'.repeat(197)}...`);
  });

  it('短的 Tool result 不截断', () => {
    const reader = new ConversationReader();
    const shortContent = 'short content';
    const turns: ConversationTurn[] = [
      {
        id: 'msg-1',
        timestamp: '2025-01-01T00:00:00Z',
        role: 'user',
        content: '',
        toolResults: [
          { toolUseId: 'call-1', content: shortContent },
        ],
      },
    ];

    const result = reader.compact(turns);

    expect(result).toBe('[Result] short content');
  });

  it('混合消息正确格式化', () => {
    const reader = new ConversationReader();
    const turns: ConversationTurn[] = [
      {
        id: 'msg-1',
        timestamp: '2025-01-01T00:00:00Z',
        role: 'user',
        content: 'Help me refactor',
      },
      {
        id: 'msg-2',
        timestamp: '2025-01-01T00:00:01Z',
        role: 'assistant',
        content: 'Let me read the file',
        toolCalls: [
          { id: 'call-1', name: 'read', input: {} },
        ],
      },
      {
        id: 'msg-3',
        timestamp: '2025-01-01T00:00:02Z',
        role: 'user',
        content: '',
        toolResults: [
          { toolUseId: 'call-1', content: 'file content here' },
        ],
      },
      {
        id: 'msg-4',
        timestamp: '2025-01-01T00:00:03Z',
        role: 'assistant',
        content: 'Done!',
      },
    ];

    const result = reader.compact(turns);

    const expected = [
      '[User] Help me refactor',
      '[Assistant] Let me read the file',
      '[Tool] read',
      '[Result] file content here',
      '[Assistant] Done!',
    ].join('\n\n');

    expect(result).toBe(expected);
  });
});

describe('ConversationReader.compact() - 边界情况', () => {
  it('空会话返回空字符串', () => {
    const reader = new ConversationReader();

    const result = reader.compact([]);

    expect(result).toBe('');
  });

  it('超长单条消息截断', () => {
    const reader = new ConversationReader();
    // 创建超过 100 字符的消息
    const longMessage = 'a'.repeat(200);
    const turns: ConversationTurn[] = [
      {
        id: 'msg-1',
        timestamp: '2025-01-01T00:00:00Z',
        role: 'user',
        content: longMessage,
      },
    ];

    const result = reader.compact(turns, 100);

    // 结果应该不超过 100 字符
    expect(result.length).toBeLessThanOrEqual(100);
  });

  it('maxChars 为 0 时不截断', () => {
    const reader = new ConversationReader();
    const turns: ConversationTurn[] = [
      {
        id: 'msg-1',
        timestamp: '2025-01-01T00:00:00Z',
        role: 'user',
        content: 'Hello world',
      },
    ];

    const result = reader.compact(turns, 0);

    expect(result).toBe('[User] Hello world');
  });

  it('多条消息超过 maxChars 时截断', () => {
    const reader = new ConversationReader();
    const turns: ConversationTurn[] = [
      {
        id: 'msg-1',
        timestamp: '2025-01-01T00:00:00Z',
        role: 'user',
        content: 'First message that is quite long',
      },
      {
        id: 'msg-2',
        timestamp: '2025-01-01T00:00:01Z',
        role: 'assistant',
        content: 'Second message',
      },
    ];

    const result = reader.compact(turns, 30);

    // 结果应该不超过 30 字符，且从末尾保留
    expect(result.length).toBeLessThanOrEqual(30);
  });
});

describe('ConversationReader.compact() - 环境变量配置', () => {
  // 注意：环境变量在模块加载时读取，需要在测试前设置
  // 这里主要测试默认行为

  it('默认 SYNAPSE_TOOL_RESULT_SUMMARY_LIMIT 为 200', () => {
    const reader = new ConversationReader();
    // 创建正好 200 字符的内容
    const content = 'x'.repeat(200);
    const turns: ConversationTurn[] = [
      {
        id: 'msg-1',
        timestamp: '2025-01-01T00:00:00Z',
        role: 'user',
        content: '',
        toolResults: [
          { toolUseId: 'call-1', content },
        ],
      },
    ];

    const result = reader.compact(turns);

    // 200 字符正好不截断
    expect(result).toBe(`[Result] ${content}`);
    expect(result).not.toContain('...');
  });

  it('超过默认 200 字符时截断', () => {
    const reader = new ConversationReader();
    // 201 字符
    const content = 'y'.repeat(201);
    const turns: ConversationTurn[] = [
      {
        id: 'msg-1',
        timestamp: '2025-01-01T00:00:00Z',
        role: 'user',
        content: '',
        toolResults: [
          { toolUseId: 'call-1', content },
        ],
      },
    ];

    const result = reader.compact(turns);

    // 201 字符超过限制，截断为 197 字符 + "..."（总长度 200）
    expect(result).toBe(`[Result] ${'y'.repeat(197)}...`);
  });
});
