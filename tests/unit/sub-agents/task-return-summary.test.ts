import { describe, expect, it } from 'bun:test';
import { countTokens } from '../../../src/shared/token-counter.ts';
import { summarizeTaskResult } from '../../../src/core/sub-agents/task-return-summary.ts';

describe('Task return summary', () => {
  it('should always summarize successful task result into a single sentence', async () => {
    const raw = '第一段原始结果，包含较多细节。\n第二段继续展开上下文。';
    const result = await summarizeTaskResult(raw, {
      isError: false,
      llmSummarizer: async () => '这是压缩后的单句摘要。这里是第二句，应被丢弃。',
    });

    expect(result.summary).toBe('这是压缩后的单句摘要。');
    expect(result.summary).not.toBe(raw);
    expect(result.metrics.fallbackUsed).toBe('none');
  });

  it('should summarize failed task result and avoid returning full multiline error', async () => {
    const raw = 'Error: request timeout\nat service.ts:10\nat main.ts:5';
    const result = await summarizeTaskResult(raw, {
      isError: true,
      llmSummarizer: async () => '任务失败：请求超时，请稍后重试。详细栈信息省略。',
    });

    expect(result.summary).toBe('任务失败：请求超时，请稍后重试。');
    expect(result.summary).not.toContain('\n');
    expect(result.summary).not.toContain('service.ts');
    expect(countTokens(result.summary)).toBeLessThanOrEqual(4096);
  });

  it('should enforce hard token limit with truncation and ellipsis', async () => {
    const longSummary = `摘要${'很长内容'.repeat(200)}。`;
    const result = await summarizeTaskResult('raw', {
      llmSummarizer: async () => longSummary,
      maxTokens: 128,
    });

    expect(result.metrics.truncated).toBe(true);
    expect(countTokens(result.summary)).toBeLessThanOrEqual(128);
    expect(result.summary.endsWith('…')).toBe(true);
  });

  it('should fallback to local summary when llm summary fails', async () => {
    const raw = '本地第一句应该被保留。第二句不应该进入返回值。';
    const result = await summarizeTaskResult(raw, {
      llmSummarizer: async () => {
        throw new Error('LLM timeout');
      },
    });

    expect(result.summary).toBe('本地第一句应该被保留。');
    expect(result.metrics.fallbackUsed).toBe('local');
    expect(countTokens(result.summary)).toBeLessThanOrEqual(4096);
  });

  it('should fallback to fixed final message when local summary also fails', async () => {
    const result = await summarizeTaskResult('   ', {
      llmSummarizer: async () => {
        throw new Error('LLM unavailable');
      },
      maxTokens: 64,
    });

    expect(result.metrics.fallbackUsed).toBe('final');
    expect(result.summary.startsWith('[Task摘要失败] 原因: ')).toBe(true);
    expect(countTokens(result.summary)).toBeLessThanOrEqual(64);
  });
});
