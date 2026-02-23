import { countTokens } from '../../shared/token-counter.ts';
import { isAbortError } from '../../shared/abort.ts';

export const DEFAULT_TASK_RESULT_MAX_TOKENS = 4096;
const ELLIPSIS = '…';
const DEFAULT_FINAL_REASON = '无法生成有效摘要';

export type TaskSummaryFallback = 'none' | 'local' | 'final';

export interface TaskSummaryMetrics {
  rawTokens: number;
  summaryTokens: number;
  truncated: boolean;
  fallbackUsed: TaskSummaryFallback;
}

export interface TaskSummaryResult {
  summary: string;
  metrics: TaskSummaryMetrics;
}

export interface SummarizeTaskResultOptions {
  isError?: boolean;
  maxTokens?: number;
  signal?: AbortSignal;
  llmSummarizer?: (rawResult: string, context: { isError: boolean; signal?: AbortSignal }) => Promise<string>;
}

export async function summarizeTaskResult(
  rawResult: string,
  options: SummarizeTaskResultOptions = {},
): Promise<TaskSummaryResult> {
  const normalizedRaw = normalizeWhitespace(rawResult);
  const maxTokens = sanitizeMaxTokens(options.maxTokens);
  const isError = options.isError ?? false;
  const rawTokens = countTokens(normalizedRaw);

  let fallbackUsed: TaskSummaryFallback = 'none';
  let fallbackReason = '';
  let candidate = '';

  if (options.llmSummarizer) {
    try {
      candidate = await options.llmSummarizer(normalizedRaw, { isError, signal: options.signal });
    } catch (error) {
      if (options.signal?.aborted || isAbortError(error)) {
        throw error;
      }
      fallbackReason = toShortReason(error);
      fallbackUsed = 'local';
    }
  } else {
    fallbackUsed = 'local';
  }

  candidate = keepSingleSentence(candidate);
  if (!candidate) {
    if (fallbackUsed === 'none') {
      fallbackUsed = 'local';
    }
    candidate = buildLocalSummary(normalizedRaw);
  }

  if (!candidate) {
    fallbackUsed = 'final';
    const reason = fallbackReason || deriveFinalReason(normalizedRaw);
    candidate = `[Task摘要失败] 原因: ${reason}`;
  }

  const bounded = enforceHardTokenLimit(candidate, maxTokens);
  return {
    summary: bounded.summary,
    metrics: {
      rawTokens,
      summaryTokens: countTokens(bounded.summary),
      truncated: bounded.truncated,
      fallbackUsed,
    },
  };
}

interface HardLimitResult {
  summary: string;
  truncated: boolean;
}

function enforceHardTokenLimit(summary: string, maxTokens: number): HardLimitResult {
  const normalized = normalizeWhitespace(summary);
  if (!normalized) {
    return { summary: '', truncated: false };
  }

  if (countTokens(normalized) <= maxTokens) {
    return { summary: normalized, truncated: false };
  }

  if (countTokens(ELLIPSIS) > maxTokens) {
    return { summary: '', truncated: true };
  }

  let left = 0;
  let right = normalized.length;
  while (left < right) {
    const middle = Math.ceil((left + right) / 2);
    const candidate = `${normalized.slice(0, middle).trimEnd()}${ELLIPSIS}`;
    if (countTokens(candidate) <= maxTokens) {
      left = middle;
    } else {
      right = middle - 1;
    }
  }

  const prefix = normalized.slice(0, left).trimEnd();
  const bounded = prefix ? `${prefix}${ELLIPSIS}` : ELLIPSIS;
  return { summary: bounded, truncated: true };
}

function buildLocalSummary(rawResult: string): string {
  if (!rawResult) {
    return '';
  }
  const noStderrHeader = rawResult.replace(/^\[stderr\]\s*/i, '').trim();
  if (!noStderrHeader) {
    return '';
  }
  return keepSingleSentence(noStderrHeader);
}

function keepSingleSentence(text: string): string {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return '';
  }

  const sentenceMatch = normalized.match(/^(.+?[。！？!?；;\.])/);
  if (sentenceMatch?.[1]) {
    return sentenceMatch[1].trim();
  }

  const lineMatch = normalized.match(/^([^\n\r]+)$/);
  if (lineMatch?.[1]) {
    return lineMatch[1].trim();
  }

  return normalized.trim();
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function deriveFinalReason(rawResult: string): string {
  if (!rawResult) {
    return DEFAULT_FINAL_REASON;
  }
  return DEFAULT_FINAL_REASON;
}

function toShortReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = normalizeWhitespace(message);
  if (!normalized) {
    return DEFAULT_FINAL_REASON;
  }
  const MAX_REASON_LENGTH = 48;
  if (normalized.length <= MAX_REASON_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_REASON_LENGTH - 1)}${ELLIPSIS}`;
}

function sanitizeMaxTokens(maxTokens?: number): number {
  if (typeof maxTokens !== 'number' || !Number.isFinite(maxTokens) || maxTokens < 1) {
    return DEFAULT_TASK_RESULT_MAX_TOKENS;
  }
  return Math.floor(maxTokens);
}
