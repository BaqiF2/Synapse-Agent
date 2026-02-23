/**
 * Task 摘要解析与格式化工具。
 *
 * 用于识别受支持的 task:* 命令并提取终端摘要所需的最小信息。
 */

export type TaskSummaryType = 'skill:search' | 'skill:enhance' | 'explore' | 'general';

export interface ParsedTaskSummaryCommand {
  taskType: TaskSummaryType;
  description: string;
}

const TASK_PREFIX = 'task:';
const DEFAULT_TASK_DESCRIPTION = 'Unnamed task';
const DEFAULT_ERROR_SUMMARY = 'Unknown error';
const TASK_TYPE_SET = new Set<TaskSummaryType>([
  'skill:search',
  'skill:enhance',
  'explore',
  'general',
]);

/**
 * 解析 task:* 命令为摘要元数据。
 *
 * 仅接受以下类型：
 * - task:skill:search
 * - task:skill:enhance
 * - task:explore
 * - task:general
 */
export function parseTaskSummaryCommand(command: string): ParsedTaskSummaryCommand | null {
  const trimmed = command.trim();
  if (!trimmed.startsWith(TASK_PREFIX)) {
    return null;
  }

  let args: string[];
  try {
    args = parseCommandArgs(trimmed);
  } catch {
    return null;
  }

  const commandPart = args[0];
  if (!commandPart?.startsWith(TASK_PREFIX)) {
    return null;
  }

  const rawType = commandPart.slice(TASK_PREFIX.length) as TaskSummaryType;
  if (!TASK_TYPE_SET.has(rawType)) {
    return null;
  }

  const description = readDescriptionArg(args) ?? DEFAULT_TASK_DESCRIPTION;
  return {
    taskType: rawType,
    description,
  };
}

/**
 * 将错误输出压缩为单行短摘要，避免终端刷屏。
 */
export function summarizeTaskError(
  output?: string,
  message?: string,
  maxLength: number = 120,
): string {
  const candidate = firstMeaningfulLine(message) ?? firstMeaningfulLine(output);
  if (!candidate) {
    return DEFAULT_ERROR_SUMMARY;
  }

  const singleLine = candidate.replace(/\s+/g, ' ').trim();
  if (!singleLine) {
    return DEFAULT_ERROR_SUMMARY;
  }

  if (singleLine.length <= maxLength) {
    return singleLine;
  }
  if (maxLength <= 3) {
    return singleLine.slice(0, maxLength);
  }
  return `${singleLine.slice(0, maxLength - 3)}...`;
}

function readDescriptionArg(args: string[]): string | null {
  for (let i = 1; i < args.length; i++) {
    const token = args[i];
    if (token === '--description' || token === '-d') {
      const value = args[i + 1];
      if (value && value.trim()) {
        return value.trim();
      }
      return null;
    }
  }
  return null;
}

function firstMeaningfulLine(text?: string): string | null {
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === '[stderr]') {
      continue;
    }
    return trimmed;
  }
  return null;
}

/**
 * 轻量命令分词器（支持单/双引号与基础转义）。
 */
function parseCommandArgs(command: string): string[] {
  const args: string[] = [];
  let current = '';
  let inQuote: '"' | "'" | null = null;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (!ch) continue;

    if (inQuote) {
      if (ch === inQuote) {
        inQuote = null;
        continue;
      }

      if (ch === '\\' && i + 1 < command.length) {
        const next = command[i + 1];
        if (next === inQuote || next === '\\') {
          current += next;
          i++;
          continue;
        }
      }

      current += ch;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inQuote = ch;
      continue;
    }

    if (ch === ' ' || ch === '\t') {
      if (current) {
        args.push(current);
        current = '';
      }
      continue;
    }

    current += ch;
  }

  if (inQuote) {
    throw new Error('Unclosed quote in command');
  }

  if (current) {
    args.push(current);
  }

  return args;
}
