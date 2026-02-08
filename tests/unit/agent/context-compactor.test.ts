import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AnthropicClient } from '../../../src/providers/anthropic/anthropic-client.ts';
import type { Message } from '../../../src/providers/message.ts';
import { createTextMessage } from '../../../src/providers/message.ts';
import { OffloadStorage } from '../../../src/agent/offload-storage.ts';
import { ContextCompactor } from '../../../src/agent/context-compactor.ts';

function createMockClient(): AnthropicClient {
  return {
    modelName: 'claude-sonnet-4-20250514',
    generate: mock(() => {
      throw new Error('not implemented in this test');
    }),
  } as unknown as AnthropicClient;
}

function createCompactor(
  testDir: string,
  options?: { client?: AnthropicClient; retryCount?: number; targetTokens?: number }
): ContextCompactor {
  const storage = new OffloadStorage(testDir);
  return new ContextCompactor(storage, options?.client ?? createMockClient(), {
    targetTokens: options?.targetTokens ?? 8000,
    preserveCount: 5,
    retryCount: options?.retryCount ?? 3,
  });
}

function createMessages(count: number): Message[] {
  return Array.from({ length: count }, (_, index) =>
    createTextMessage(index % 2 === 0 ? 'user' : 'assistant', `message-${index + 1}`)
  );
}

function createToolMessage(text: string, toolCallId: string): Message {
  return {
    role: 'tool',
    toolCallId,
    content: [{ type: 'text', text }],
  };
}

function createSummaryStream(text: string): {
  id: string;
  usage: { inputOther: number; output: number; inputCacheRead: number; inputCacheCreation: number };
  [Symbol.asyncIterator](): AsyncGenerator<{ type: 'text'; text: string }, void, unknown>;
} {
  return {
    id: 'summary-msg',
    usage: { inputOther: 100, output: 50, inputCacheRead: 0, inputCacheCreation: 0 },
    async *[Symbol.asyncIterator]() {
      yield { type: 'text', text };
    },
  };
}

describe('ContextCompactor', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-context-compactor-'));
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('splitMessages', () => {
    it('正常分割 - 保留最后 5 条消息', () => {
      const compactor = createCompactor(testDir);
      const messages = createMessages(10);

      const result = (compactor as any).splitMessages(messages) as {
        toCompress: Message[];
        toPreserve: Message[];
      };

      expect(result.toCompress).toHaveLength(5);
      expect(result.toPreserve).toHaveLength(5);
      expect(result.toCompress[0]?.content[0]).toEqual({ type: 'text', text: 'message-1' });
      expect(result.toCompress[4]?.content[0]).toEqual({ type: 'text', text: 'message-5' });
      expect(result.toPreserve[0]?.content[0]).toEqual({ type: 'text', text: 'message-6' });
      expect(result.toPreserve[4]?.content[0]).toEqual({ type: 'text', text: 'message-10' });
    });

    it('边界情况 - 消息数量等于 5', () => {
      const compactor = createCompactor(testDir);
      const messages = createMessages(5);

      const result = (compactor as any).splitMessages(messages) as {
        toCompress: Message[];
        toPreserve: Message[];
      };

      expect(result.toCompress).toEqual([]);
      expect(result.toPreserve).toHaveLength(5);
    });

    it('边界情况 - 消息数量小于 5', () => {
      const compactor = createCompactor(testDir);
      const messages = createMessages(3);

      const result = (compactor as any).splitMessages(messages) as {
        toCompress: Message[];
        toPreserve: Message[];
      };

      expect(result.toCompress).toEqual([]);
      expect(result.toPreserve).toHaveLength(3);
    });
  });

  describe('buildCompressedHistory', () => {
    it('正确构建压缩历史 - 摘要消息在前', () => {
      const compactor = createCompactor(testDir);
      const summary = 'Summary content';
      const preserved = createMessages(3);

      const result = (compactor as any).buildCompressedHistory(summary, preserved) as Message[];

      expect(result).toHaveLength(4);
      expect(result[0]?.role).toBe('user');
      expect(result[0]?.content[0]).toEqual({
        type: 'text',
        text: '[Compressed History]\n\nSummary content',
      });
      expect(result.slice(1)).toEqual(preserved);
    });

    it('压缩历史消息格式正确', () => {
      const compactor = createCompactor(testDir);
      const summary = '## Technical Context\nTest content';

      const result = (compactor as any).buildCompressedHistory(summary, []) as Message[];

      expect(result).toHaveLength(1);
      expect(result[0]?.content[0]).toEqual({
        type: 'text',
        text: '[Compressed History]\n\n## Technical Context\nTest content',
      });
    });
  });

  describe('restoreOffloadedContent', () => {
    it('正常还原 - 检测并替换卸载引用', async () => {
      const compactor = createCompactor(testDir);
      const offloadDir = path.join(testDir, 'offloaded');
      fs.mkdirSync(offloadDir, { recursive: true });
      const filePath = path.join(offloadDir, 'abc.txt');
      fs.writeFileSync(filePath, 'Original content', 'utf-8');

      const message = {
        role: 'tool',
        toolCallId: 'tool-1',
        content: [{ type: 'text', text: `Tool result is at: ${filePath}` }],
      } as Message;

      const result = await (compactor as any).restoreOffloadedContent([message]) as Message[];

      expect(result[0]?.content[0]).toEqual({ type: 'text', text: 'Original content' });
    });

    it('无卸载引用 - 保持原内容', async () => {
      const compactor = createCompactor(testDir);
      const message = {
        role: 'tool',
        toolCallId: 'tool-1',
        content: [{ type: 'text', text: 'Normal tool result content' }],
      } as Message;

      const result = await (compactor as any).restoreOffloadedContent([message]) as Message[];

      expect(result[0]).toEqual(message);
    });

    it('非 tool 消息包含卸载引用时不还原内容', async () => {
      const compactor = createCompactor(testDir);
      const offloadDir = path.join(testDir, 'offloaded');
      fs.mkdirSync(offloadDir, { recursive: true });
      const filePath = path.join(offloadDir, 'abc.txt');
      fs.writeFileSync(filePath, 'Sensitive content', 'utf-8');

      const message = createTextMessage('user', `Tool result is at: ${filePath}`);

      const result = await (compactor as any).restoreOffloadedContent([message]) as Message[];

      expect(result[0]).toEqual(message);
    });

    it('tool 消息引用卸载目录外文件时不读取', async () => {
      const compactor = createCompactor(testDir);
      const outsidePath = path.join(testDir, 'outside.txt');
      fs.writeFileSync(outsidePath, 'outside content', 'utf-8');

      const message = {
        role: 'tool',
        toolCallId: 'tool-1',
        content: [{ type: 'text', text: `Tool result is at: ${outsidePath}` }],
      } as Message;

      const result = await (compactor as any).restoreOffloadedContent([message]) as Message[];

      expect(result[0]).toEqual(message);
    });

    it('文件读取失败 - 使用占位符', async () => {
      const compactor = createCompactor(testDir);
      const filePath = path.join(testDir, 'offloaded', 'missing.txt');
      const message = {
        role: 'tool',
        toolCallId: 'tool-1',
        content: [{ type: 'text', text: `Tool result is at: ${filePath}` }],
      } as Message;

      const result = await (compactor as any).restoreOffloadedContent([message]) as Message[];

      expect(result[0]?.content[0]).toEqual({
        type: 'text',
        text: `[Content unavailable: ${filePath}]`,
      });
    });
  });

  describe('generateSummary', () => {
    it('正常生成总结', async () => {
      const client = {
        modelName: 'claude-sonnet-4-20250514',
        generate: mock(() =>
          Promise.resolve({
            id: 'msg-1',
            usage: { inputOther: 100, output: 50, inputCacheRead: 0, inputCacheCreation: 0 },
            async *[Symbol.asyncIterator]() {
              yield { type: 'text', text: '## Technical Context\nTest summary' };
            },
          })
        ),
      } as unknown as AnthropicClient;
      const compactor = createCompactor(testDir, { client });
      const messages = createMessages(10);

      const summary = await (compactor as any).generateSummary(messages) as string;

      expect(summary).toBe('## Technical Context\nTest summary');
      expect(client.generate).toHaveBeenCalledTimes(1);
    });

    it('重试机制 - 首次失败后重试成功', async () => {
      let attempts = 0;
      const client = {
        modelName: 'claude-sonnet-4-20250514',
        generate: mock(() => {
          attempts += 1;
          if (attempts === 1) {
            throw new Error('first call failed');
          }
          return Promise.resolve({
            id: 'msg-2',
            usage: { inputOther: 100, output: 50, inputCacheRead: 0, inputCacheCreation: 0 },
            async *[Symbol.asyncIterator]() {
              yield { type: 'text', text: 'Summary' };
            },
          });
        }),
      } as unknown as AnthropicClient;
      const compactor = createCompactor(testDir, { client, retryCount: 3 });
      const messages = createMessages(10);

      const summary = await (compactor as any).generateSummary(messages) as string;

      expect(summary).toBe('Summary');
      expect(client.generate).toHaveBeenCalledTimes(2);
    });

    it('重试耗尽 - 抛出异常', async () => {
      const client = {
        modelName: 'claude-sonnet-4-20250514',
        generate: mock(() => {
          throw new Error('always fail');
        }),
      } as unknown as AnthropicClient;
      const compactor = createCompactor(testDir, { client, retryCount: 3 });
      const messages = createMessages(10);

      await expect((compactor as any).generateSummary(messages)).rejects.toThrow('always fail');
      expect(client.generate).toHaveBeenCalledTimes(3);
    });
  });

  describe('cleanupOffloadedFiles', () => {
    it('正常清理 - 删除所有卸载文件', async () => {
      const compactor = createCompactor(testDir);
      const offloadDir = path.join(testDir, 'offloaded');
      fs.mkdirSync(offloadDir, { recursive: true });
      fs.writeFileSync(path.join(offloadDir, 'a.txt'), 'a', 'utf-8');
      fs.writeFileSync(path.join(offloadDir, 'b.txt'), 'b', 'utf-8');
      fs.writeFileSync(path.join(offloadDir, 'c.txt'), 'c', 'utf-8');

      const deleted = await (compactor as any).cleanupOffloadedFiles() as string[];

      expect(deleted).toHaveLength(3);
      expect(fs.readdirSync(offloadDir)).toEqual([]);
    });

    it('删除失败 - 记录警告但不影响结果', async () => {
      const compactor = createCompactor(testDir);
      const offloadDir = path.join(testDir, 'offloaded');
      fs.mkdirSync(offloadDir, { recursive: true });
      const fileA = path.join(offloadDir, 'a.txt');
      const fileB = path.join(offloadDir, 'b.txt');
      const fileC = path.join(offloadDir, 'c.txt');
      fs.writeFileSync(fileA, 'a', 'utf-8');
      fs.writeFileSync(fileB, 'b', 'utf-8');
      fs.writeFileSync(fileC, 'c', 'utf-8');

      const originalUnlink = fs.unlinkSync.bind(fs);
      const unlinkSpy = spyOn(fs, 'unlinkSync').mockImplementation((filePath: fs.PathLike) => {
        if (String(filePath).endsWith('b.txt')) {
          throw new Error('delete failed');
        }
        originalUnlink(filePath);
      });

      try {
        const deleted = await (compactor as any).cleanupOffloadedFiles() as string[];
        expect(deleted).toHaveLength(2);
        expect(fs.existsSync(fileB)).toBe(true);
      } finally {
        unlinkSpy.mockRestore();
      }
    });
  });

  describe('compact', () => {
    it('完整压缩流程返回正确结果', async () => {
      const client = {
        modelName: 'claude-sonnet-4-20250514',
        withGenerationKwargs: mock(() => client),
        generate: mock(() =>
          Promise.resolve(createSummaryStream('## Technical Context\nCompacted summary'))
        ),
      } as unknown as AnthropicClient;
      const compactor = createCompactor(testDir, { client });
      const offloadDir = path.join(testDir, 'offloaded');
      fs.mkdirSync(offloadDir, { recursive: true });

      const messages: Message[] = [];
      for (let index = 0; index < 15; index++) {
        if (index < 5) {
          const filePath = path.join(offloadDir, `offloaded-${index}.txt`);
          fs.writeFileSync(filePath, `Restored content ${index}`, 'utf-8');
          messages.push(createToolMessage(`Tool result is at: ${filePath}`, `tool-${index}`));
          continue;
        }
        messages.push(createTextMessage(index % 2 === 0 ? 'user' : 'assistant', `long-message-${index}-${'x'.repeat(1000)}`));
      }
      messages.push(...createMessages(5));

      const result = await compactor.compact(messages);

      expect(result.success).toBe(true);
      expect(result.messages).toHaveLength(6);
      expect(result.messages[0]?.role).toBe('user');
      expect((result.messages[0]?.content[0] as { text: string }).text.startsWith('[Compressed History]\n\n')).toBe(true);
      expect(result.preservedCount).toBe(5);
      expect(result.deletedFiles).toHaveLength(5);
      expect(result.previousTokens).toBeGreaterThan(result.currentTokens);
      expect(result.freedTokens).toBe(result.previousTokens - result.currentTokens);
    });

    it('历史消息 ≤ 5 条时跳过压缩', async () => {
      const client = {
        modelName: 'claude-sonnet-4-20250514',
        generate: mock(() => Promise.resolve(createSummaryStream('unused'))),
      } as unknown as AnthropicClient;
      const compactor = createCompactor(testDir, { client });
      const messages = createMessages(3);

      const result = await compactor.compact(messages);

      expect(result.success).toBe(true);
      expect(result.freedTokens).toBe(0);
      expect(result.messages).toEqual(messages);
      expect(client.generate).not.toHaveBeenCalled();
    });

    it('无卸载文件时正常压缩', async () => {
      const client = {
        modelName: 'claude-sonnet-4-20250514',
        withGenerationKwargs: mock(() => client),
        generate: mock(() =>
          Promise.resolve(createSummaryStream('## Technical Context\nNo offloaded file case'))
        ),
      } as unknown as AnthropicClient;
      const compactor = createCompactor(testDir, { client });
      const messages = createMessages(10);

      const result = await compactor.compact(messages);

      expect(result.success).toBe(true);
      expect(result.deletedFiles).toEqual([]);
      expect(result.messages).toHaveLength(6);
    });

    it('保留消息中的卸载引用不还原', async () => {
      const offloadDir = path.join(testDir, 'offloaded');
      fs.mkdirSync(offloadDir, { recursive: true });
      const preservedFilePath = path.join(offloadDir, 'preserved.txt');
      fs.writeFileSync(preservedFilePath, 'Preserved offloaded content', 'utf-8');
      const client = {
        modelName: 'claude-sonnet-4-20250514',
        withGenerationKwargs: mock(() => client),
        generate: mock(() =>
          Promise.resolve(createSummaryStream('## Technical Context\nPreserved reference should remain'))
        ),
      } as unknown as AnthropicClient;
      const compactor = createCompactor(testDir, { client });
      const messages = createMessages(10);
      messages[7] = createToolMessage(`Tool result is at: ${preservedFilePath}`, 'tool-preserved');

      const result = await compactor.compact(messages);

      const preservedReference = result.messages.find((message) => {
        const part = message.content[0];
        return part?.type === 'text' && part.text === `Tool result is at: ${preservedFilePath}`;
      });
      expect(preservedReference).toBeDefined();
      expect(fs.existsSync(preservedFilePath)).toBe(true);
      expect(result.deletedFiles).not.toContain(preservedFilePath);
    });

    it('LLM 调用失败后回退', async () => {
      const client = {
        modelName: 'claude-sonnet-4-20250514',
        withGenerationKwargs: mock(() => client),
        generate: mock(() => {
          throw new Error('llm unavailable');
        }),
      } as unknown as AnthropicClient;
      const compactor = createCompactor(testDir, { client, retryCount: 3 });
      const messages = createMessages(10);

      const result = await compactor.compact(messages);

      expect(result.success).toBe(false);
      expect(result.messages).toEqual(messages);
      expect(result.freedTokens).toBe(0);
    });

    it('压缩模型未配置时使用当前模型', async () => {
      const client = {
        modelName: 'claude-sonnet-4-20250514',
        withModel: mock(() => {
          throw new Error('should not switch model');
        }),
        withGenerationKwargs: mock(() => client),
        generate: mock(() =>
          Promise.resolve(createSummaryStream('## Technical Context\nUse current model'))
        ),
      } as unknown as AnthropicClient;
      const compactor = createCompactor(testDir, { client });
      const messages = createMessages(10);

      const result = await compactor.compact(messages);

      expect(result.success).toBe(true);
      expect((client as unknown as { withModel: ReturnType<typeof mock> }).withModel).not.toHaveBeenCalled();
    });
  });
});
