/**
 * 两层消息系统 — 领域消息层 + LLM 消息层 + 显式转换。
 * 领域消息是 Agent 的完整历史记录，LLM 消息仅包含 LLM API 能理解的内容。
 *
 * 核心导出:
 * - DomainMessage / DomainContentBlock: 领域消息类型
 * - LLMMessage / LLMContentBlock: LLM 消息类型
 * - createDomainMessage: 领域消息工厂函数，自动生成 id/timestamp 并冻结消息
 * - convertToLlm: 领域消息到 LLM 消息的转换函数
 * - ConvertOptions: 转换选项
 * - CreateDomainMessageInput: createDomainMessage 的输入参数类型
 */

import { createLogger } from '../common/index.ts';

// 模块级日志实例，避免在 core/ 中使用 console 直接输出
const logger = createLogger({ name: 'core:messages' });

// ========== 领域消息层 ==========

/** 领域消息内容块联合类型 */
export type DomainContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; content: string }
  | { type: 'tool_use'; toolName: string; toolId: string; input: unknown }
  | { type: 'tool_result'; toolId: string; output: string; isError: boolean }
  | { type: 'skill_search'; query: string; results: unknown[] }
  | { type: 'context_summary'; summary: string; compactedCount: number };

/** 领域消息 */
export interface DomainMessage {
  /** 唯一标识 */
  readonly id: string;
  /** 消息角色 */
  readonly role: 'user' | 'assistant' | 'system' | 'tool_result';
  /** 内容块列表 */
  readonly content: readonly DomainContentBlock[];
  /** 创建时间戳 */
  readonly timestamp: number;
  /** 扩展元数据 */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** createDomainMessage 的输入参数 */
export interface CreateDomainMessageInput {
  role: DomainMessage['role'];
  content: DomainContentBlock[];
  metadata?: Record<string, unknown>;
}

/** 消息 ID 计数器，确保唯一性 */
let messageIdCounter = 0;

/**
 * 创建不可变的领域消息。
 * 自动生成唯一 id 和 timestamp，返回冻结的对象。
 */
export function createDomainMessage(input: CreateDomainMessageInput): DomainMessage {
  messageIdCounter += 1;
  const msg: DomainMessage = {
    id: `dmsg-${Date.now()}-${messageIdCounter}`,
    role: input.role,
    content: Object.freeze([...input.content]),
    timestamp: Date.now(),
    ...(input.metadata !== undefined ? { metadata: Object.freeze({ ...input.metadata }) } : {}),
  };
  return Object.freeze(msg);
}

// ========== LLM 消息层 ==========

/** LLM 消息内容块联合类型 */
export type LLMContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; content: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

/** LLM 消息 */
export interface LLMMessage {
  role: 'user' | 'assistant';
  content: LLMContentBlock[];
}

// ========== 转换函数 ==========

/** 转换选项 */
export interface ConvertOptions {
  /** 过滤掉这些类型 */
  filterTypes?: DomainContentBlock['type'][];
  /** 最大消息数 */
  maxMessages?: number;
  /** 是否保留元数据（LLM 消息中不支持，默认 false） */
  includeMetadata?: boolean;
}

/**
 * 将领域消息转换为 LLM 消息。
 * 纯函数，无副作用。
 *
 * 转换规则:
 * - text / thinking / tool_use / tool_result 类型直接映射
 * - skill_search 转换为 text 摘要
 * - context_summary 转换为 text
 * - system 角色的消息被过滤（系统提示词单独传递）
 * - metadata 字段在转换时丢弃
 */
export function convertToLlm(
  messages: DomainMessage[],
  options?: ConvertOptions,
): LLMMessage[] {
  const filterTypes = new Set(options?.filterTypes ?? []);
  let filtered = messages;

  // 过滤 system 角色消息
  filtered = filtered.filter((msg) => msg.role !== 'system');

  // 应用 maxMessages 限制
  if (options?.maxMessages && filtered.length > options.maxMessages) {
    filtered = filtered.slice(-options.maxMessages);
  }

  const result: LLMMessage[] = [];

  for (const msg of filtered) {
    const llmRole: 'user' | 'assistant' =
      msg.role === 'tool_result' ? 'user' : msg.role === 'user' ? 'user' : 'assistant';

    const llmContent: LLMContentBlock[] = [];

    for (const block of msg.content) {
      // 跳过被过滤的类型
      if (filterTypes.has(block.type)) continue;

      switch (block.type) {
        case 'text':
          llmContent.push({ type: 'text', text: block.text });
          break;

        case 'thinking':
          llmContent.push({ type: 'thinking', content: block.content });
          break;

        case 'tool_use':
          llmContent.push({
            type: 'tool_use',
            id: block.toolId,
            name: block.toolName,
            input: block.input,
          });
          break;

        case 'tool_result':
          llmContent.push({
            type: 'tool_result',
            tool_use_id: block.toolId,
            content: block.output,
            is_error: block.isError || undefined,
          });
          break;

        case 'skill_search':
          // 领域专属类型转换为文本摘要
          llmContent.push({
            type: 'text',
            text: `[Skill search: "${block.query}" found ${block.results.length} results]`,
          });
          break;

        case 'context_summary':
          // 上下文压缩摘要转换为文本
          llmContent.push({
            type: 'text',
            text: block.summary,
          });
          break;

        default: {
          // 未知类型：忽略并通过日志记录警告
          const unknownBlock = block as { type: string };
          logger.warn(`Unknown DomainContentBlock type ignored: ${unknownBlock.type}`);
          break;
        }
      }
    }

    // 跳过空内容的消息
    if (llmContent.length > 0) {
      result.push({ role: llmRole, content: llmContent });
    }
  }

  return result;
}
