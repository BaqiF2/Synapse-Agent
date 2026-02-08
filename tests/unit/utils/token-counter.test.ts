import { describe, expect, it } from 'bun:test';
import { getEncoding } from 'js-tiktoken';
import { createTextMessage, type Message } from '../../../src/providers/message.ts';
import {
  countMessageTokens,
  countTokens,
  setTokenCounterForTesting,
} from '../../../src/utils/token-counter.ts';

describe('token-counter', () => {
  it('countTokens 计算单个字符串 token 数量', () => {
    const encoding = getEncoding('cl100k_base');
    const input = 'Hello, world!';
    const expected = encoding.encode(input).length;

    expect(countTokens(input)).toBe(expected);
    expect(countTokens(input)).toBeGreaterThan(0);
  });

  it('countMessageTokens 计算消息数组 token 总数', () => {
    const messages: Message[] = [
      createTextMessage('user', 'hello user'),
      createTextMessage('assistant', 'hello assistant'),
      {
        role: 'tool',
        toolCallId: 'call-1',
        content: [{ type: 'text', text: 'tool output content' }],
      },
    ];

    const expected = messages.reduce((total, message) => {
      return total + countTokens(JSON.stringify(message));
    }, 0);

    expect(countMessageTokens(messages)).toBe(expected);
  });

  it('countMessageTokens 处理空数组', () => {
    expect(countMessageTokens([])).toBe(0);
  });

  it('Token 计算异常时降级到字符估算', () => {
    const restore = setTokenCounterForTesting({
      countTokensImpl: () => {
        throw new Error('mock encode failure');
      },
    });

    try {
      expect(countTokens('test string')).toBe(Math.ceil('test string'.length / 4));
    } finally {
      restore();
    }
  });
});
