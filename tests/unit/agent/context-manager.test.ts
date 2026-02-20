import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ContextManager } from '../../../src/core/context-manager.ts';
import { OffloadStorage } from '../../../src/core/offload-storage.ts';
import { type Message, createTextMessage } from '../../../src/providers/message.ts';

function createToolMessage(text: string): Message {
  return {
    role: 'tool',
    toolCallId: `tool-${Math.random().toString(36).slice(2, 8)}`,
    content: [{ type: 'text', text }],
  };
}

describe('ContextManager', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(
      os.tmpdir(),
      `synapse-context-manager-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    );
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('offloadIfNeeded 在 token 低于阈值时不执行卸载', () => {
    const storage = new OffloadStorage(testDir);
    const manager = new ContextManager(storage, {
      offloadThreshold: 150000,
      scanRatio: 0.5,
      minChars: 50,
    });
    const messages = [createTextMessage('user', 'small message')];

    const result = manager.offloadIfNeeded(messages);

    expect(result.offloadedCount).toBe(0);
    expect(result.messages).toEqual(messages);
    expect(result.stillExceedsThreshold).toBe(false);
  });

  it('offloadIfNeeded 在 token 达到阈值时执行卸载', () => {
    const storage = new OffloadStorage(testDir);
    const manager = new ContextManager(storage, {
      offloadThreshold: 1,
      scanRatio: 1,
      minChars: 50,
    });
    const messages = [
      createTextMessage('user', 'trigger'),
      createToolMessage('x'.repeat(200)),
    ];

    const result = manager.offloadIfNeeded(messages);
    const toolMessage = result.messages[1];

    expect(result.offloadedCount).toBeGreaterThan(0);
    expect(toolMessage?.role).toBe('tool');
    expect(toolMessage?.content[0]?.type).toBe('text');
    expect((toolMessage?.content[0] as { text: string }).text).toContain('Tool result is at: ');
  });

  it('performOffload 只扫描前 50% 的消息', () => {
    const storage = new OffloadStorage(testDir);
    const manager = new ContextManager(storage, {
      offloadThreshold: 1,
      scanRatio: 0.5,
      minChars: 50,
    });
    const messages: Message[] = [
      createTextMessage('user', 'm0'),
      createTextMessage('assistant', 'm1'),
      createToolMessage('a'.repeat(120)),
      createTextMessage('assistant', 'm3'),
      createTextMessage('user', 'm4'),
      createTextMessage('assistant', 'm5'),
      createToolMessage('b'.repeat(120)),
      createTextMessage('assistant', 'm7'),
      createTextMessage('user', 'm8'),
      createTextMessage('assistant', 'm9'),
    ];

    const result = manager.offloadIfNeeded(messages);
    const firstToolText = (result.messages[2]?.content[0] as { text: string }).text;
    const secondToolText = (result.messages[6]?.content[0] as { text: string }).text;

    expect(firstToolText).toContain('Tool result is at: ');
    expect(secondToolText).toBe('b'.repeat(120));
  });

  it('performOffload 跳过内容 <= 50 字符的 tool 消息', () => {
    const storage = new OffloadStorage(testDir);
    const manager = new ContextManager(storage, {
      offloadThreshold: 1,
      scanRatio: 1,
      minChars: 50,
    });
    const shortText = 'short';
    const messages = [createToolMessage(shortText)];

    const result = manager.offloadIfNeeded(messages);
    const content = (result.messages[0]?.content[0] as { text: string }).text;

    expect(result.offloadedCount).toBe(0);
    expect(content).toBe(shortText);
  });

  it('performOffload 跳过已卸载的消息', () => {
    const storage = new OffloadStorage(testDir);
    const manager = new ContextManager(storage, {
      offloadThreshold: 1,
      scanRatio: 1,
      minChars: 50,
    });
    const offloadedText = 'Tool result is at: /path/to/file.txt';
    const messages = [createToolMessage(offloadedText)];

    const result = manager.offloadIfNeeded(messages);
    const content = (result.messages[0]?.content[0] as { text: string }).text;

    expect(result.offloadedCount).toBe(0);
    expect(content).toBe(offloadedText);
  });

  it('performOffload 替换消息内容为路径引用', () => {
    const storage = new OffloadStorage(testDir);
    const manager = new ContextManager(storage, {
      offloadThreshold: 1,
      scanRatio: 1,
      minChars: 50,
    });
    const messages = [createToolMessage('x'.repeat(120))];

    const result = manager.offloadIfNeeded(messages);
    const content = (result.messages[0]?.content[0] as { text: string }).text;

    expect(content).toMatch(/^Tool result is at: .+/);
  });

  it('offloadIfNeeded 卸载后仍超阈值时设置标记', () => {
    const storage = new OffloadStorage(testDir);
    const manager = new ContextManager(storage, {
      offloadThreshold: 1,
      scanRatio: 1,
      minChars: 50,
    });
    const messages = [createTextMessage('user', 'x'.repeat(500))];

    const result = manager.offloadIfNeeded(messages);

    expect(result.stillExceedsThreshold).toBe(true);
  });
});
