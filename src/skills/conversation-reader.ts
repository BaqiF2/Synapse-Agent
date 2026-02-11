/**
 * 文件功能说明：
 * - 该文件位于 `src/skills/conversation-reader.ts`，主要负责 conversation、reader 相关实现。
 * - 模块归属 skills 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `ConversationReader`
 * - `ToolCall`
 * - `ToolResult`
 * - `ConversationTurn`
 * - `ConversationSummary`
 *
 * 作用说明：
 * - `ConversationReader`：封装该领域的核心流程与状态管理。
 * - `ToolCall`：定义模块交互的数据结构契约。
 * - `ToolResult`：定义模块交互的数据结构契约。
 * - `ConversationTurn`：定义模块交互的数据结构契约。
 * - `ConversationSummary`：定义模块交互的数据结构契约。
 */

import * as fs from 'node:fs';
import { createLogger } from '../utils/logger.ts';
import { parseEnvInt } from '../utils/env.ts';

const logger = createLogger('conversation-reader');

/**
 * Estimated characters per token (rough approximation)
 */
const CHARS_PER_TOKEN = parseEnvInt(process.env.SYNAPSE_CHARS_PER_TOKEN, 4);

/**
 * Tool result summary character limit
 * 用于 compact() 时截断工具结果内容
 */
const DEFAULT_TOOL_RESULT_SUMMARY_LIMIT = 200;
const TOOL_RESULT_SUMMARY_LIMIT = parseEnvInt(
  process.env.SYNAPSE_TOOL_RESULT_SUMMARY_LIMIT,
  DEFAULT_TOOL_RESULT_SUMMARY_LIMIT
);

/**
 * Tool call information
 */
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Tool result information
 */
export interface ToolResult {
  toolUseId: string;
  content: string;
}

/**
 * Parsed conversation turn
 */
export interface ConversationTurn {
  id: string;
  timestamp: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  rawContent?: unknown;
}

/**
 * Conversation summary statistics
 */
export interface ConversationSummary {
  totalTurns: number;
  userTurns: number;
  assistantTurns: number;
  toolCalls: number;
  uniqueTools: string[];
  estimatedTokens: number;
}

/**
 * ConversationReader - Reads and parses conversation history
 *
 * Usage:
 * ```typescript
 * const reader = new ConversationReader();
 * const turns = reader.read('/path/to/session.jsonl');
 * const summary = reader.summarize(turns);
 * ```
 */
export class ConversationReader {
  /**
   * Read all turns from a conversation file
   *
   * @param filePath - Path to JSONL conversation file
   * @returns Array of conversation turns
   */
  read(filePath: string): ConversationTurn[] {
    if (!fs.existsSync(filePath)) {
      logger.warn('Conversation file not found', { path: filePath });
      return [];
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    return lines.map(line => this.parseLine(line)).filter((t): t is ConversationTurn => t !== null);
  }

  /**
   * Read turns with character limit (reads from end)
   *
   * @param filePath - Path to JSONL conversation file
   * @param maxChars - Maximum characters to include (counted from end)
   * @returns Array of conversation turns (truncated)
   */
  readTruncated(filePath: string, maxChars: number): ConversationTurn[] {
    if (!fs.existsSync(filePath)) {
      logger.warn('Conversation file not found', { path: filePath });
      return [];
    }

    if (maxChars <= 0) {
      return [];
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    if (!content.trim()) {
      return [];
    }

    let truncated = content;
    if (content.length > maxChars) {
      const startIndex = content.length - maxChars;
      truncated = content.slice(startIndex);
      if (startIndex > 0 && content[startIndex - 1] !== '\n') {
        const firstNewline = truncated.indexOf('\n');
        if (firstNewline !== -1) {
          truncated = truncated.slice(firstNewline + 1);
        }
      }
    }

    const lines = truncated.split('\n').filter(line => line.trim());
    return lines.map(line => this.parseLine(line)).filter((t): t is ConversationTurn => t !== null);
  }

  /**
   * Parse a single JSONL line into a conversation turn
   * @param line 输入参数。
   */
  private parseLine(line: string): ConversationTurn | null {
    try {
      const data = JSON.parse(line) as {
        id?: string;
        timestamp?: string;
        role?: string;
        content?: unknown;
      };

      if (!data.role || (data.role !== 'user' && data.role !== 'assistant')) {
        return null;
      }

      const turn: ConversationTurn = {
        id: data.id || `turn-${Date.now()}`,
        timestamp: data.timestamp || new Date().toISOString(),
        role: data.role,
        content: '',
        rawContent: data.content,
      };

      // Parse content
      if (typeof data.content === 'string') {
        turn.content = data.content;
      } else if (Array.isArray(data.content)) {
        turn.toolCalls = [];
        turn.toolResults = [];
        const textParts: string[] = [];

        for (const block of data.content) {
          if (typeof block !== 'object' || block === null) continue;

          const typedBlock = block as { type?: string; text?: string; id?: string; name?: string; input?: Record<string, unknown>; tool_use_id?: string; content?: string };

          if (typedBlock.type === 'text' && typedBlock.text) {
            textParts.push(typedBlock.text);
          } else if (typedBlock.type === 'tool_use' && typedBlock.id && typedBlock.name) {
            turn.toolCalls.push({
              id: typedBlock.id,
              name: typedBlock.name,
              input: typedBlock.input || {},
            });
          } else if (typedBlock.type === 'tool_result' && typedBlock.tool_use_id) {
            turn.toolResults.push({
              toolUseId: typedBlock.tool_use_id,
              content: typeof typedBlock.content === 'string' ? typedBlock.content : JSON.stringify(typedBlock.content),
            });
          }
        }

        turn.content = textParts.join('\n');
      }

      return turn;
    } catch (error) {
      logger.warn('Failed to parse conversation line', { error });
      return null;
    }
  }

  /**
   * Extract tool call sequence from turns
   *
   * @param turns - Array of conversation turns
   * @returns Array of tool names in order
   */
  extractToolSequence(turns: ConversationTurn[]): string[] {
    return turns.flatMap((turn) => turn.toolCalls?.map((call) => call.name) ?? []);
  }

  /**
   * Generate summary statistics for conversation
   *
   * @param turns - Array of conversation turns
   * @returns Summary statistics
   */
  summarize(turns: ConversationTurn[]): ConversationSummary {
    const userTurns = turns.filter((t) => t.role === 'user').length;
    const toolSet = new Set<string>();
    let toolCalls = 0;
    let estimatedTokens = 0;

    for (const turn of turns) {
      if (turn.toolCalls) {
        toolCalls += turn.toolCalls.length;
        turn.toolCalls.forEach((call) => toolSet.add(call.name));
      }

      estimatedTokens += Math.ceil(
        JSON.stringify(turn.rawContent || turn.content).length / CHARS_PER_TOKEN
      );
    }

    return {
      totalTurns: turns.length,
      userTurns,
      assistantTurns: turns.length - userTurns,
      toolCalls,
      uniqueTools: Array.from(toolSet),
      estimatedTokens,
    };
  }

  /**
   * Compact conversation turns into a concise text format
   *
   * 将会话轮次压缩为简洁的文本格式，用于技能增强分析。
   *
   * 格式规则：
   * - User message: `[User] {full content}`
   * - Assistant text: `[Assistant] {full content}`
   * - Tool call: `[Tool] {tool name}`
   * - Tool result: `[Result] {first N chars}...`
   *
   * @param turns - Array of conversation turns
   * @param maxChars - Optional maximum total characters (0 = unlimited)
   * @returns Compacted conversation string
   */
  compact(turns: ConversationTurn[], maxChars: number = 0): string {
    if (turns.length === 0) {
      return '';
    }

    const parts: string[] = [];

    for (const turn of turns) {
      // 处理 user 消息
      if (turn.role === 'user') {
        // 检查是否有 tool_result
        if (turn.toolResults && turn.toolResults.length > 0) {
          for (const result of turn.toolResults) {
            const truncatedContent = this.truncateToolResult(result.content);
            parts.push(`[Result] ${truncatedContent}`);
          }
        } else {
          parts.push(`[User] ${turn.content}`);
        }
      }

      // 处理 assistant 消息
      if (turn.role === 'assistant') {
        // 先处理文本内容
        if (turn.content) {
          parts.push(`[Assistant] ${turn.content}`);
        }

        // 处理 tool calls
        if (turn.toolCalls && turn.toolCalls.length > 0) {
          for (const call of turn.toolCalls) {
            parts.push(`[Tool] ${call.name}`);
          }
        }
      }
    }

    let result = parts.join('\n\n');

    // 如果设置了 maxChars 且超过限制，从尾部截断
    if (maxChars > 0 && result.length > maxChars) {
      result = result.slice(result.length - maxChars);
      // 确保不截断单词，找到下一个换行符
      const firstNewline = result.indexOf('\n');
      if (firstNewline !== -1 && firstNewline < result.length - 1) {
        result = result.slice(firstNewline + 1);
      }
    }

    return result;
  }

  /**
   * Truncate tool result content to configured limit
   *
   * 如果内容包含换行符，优先在换行处截断以保持可读性
   *
   * @param content - Tool result content
   * @returns Truncated content with ellipsis if needed
   */
  private truncateToolResult(content: string): string {
    const limit = TOOL_RESULT_SUMMARY_LIMIT;
    const ellipsis = '...';
    const ellipsisLen = ellipsis.length;

    if (content.length <= limit) {
      return content;
    }

    // 尝试在换行符处截断，保持行完整性
    if (content.includes('\n')) {
      const lines = content.split('\n');
      const result: string[] = [];
      let usedLength = 0;

      for (const line of lines) {
        const separatorLen = result.length > 0 ? 1 : 0; // '\n'
        const neededLength = separatorLen + line.length;

        // 预留省略号 + 换行符空间
        if (usedLength + neededLength + ellipsisLen + 1 > limit) {
          break;
        }

        result.push(line);
        usedLength += neededLength;
      }

      // 至少收集到一行且有未显示的行
      if (result.length > 0 && result.length < lines.length) {
        return result.join('\n') + '\n' + ellipsis;
      }
    }

    // fallback：直接字符截断，确保总长度不超限
    return content.slice(0, limit - ellipsisLen) + ellipsis;
  }
}

// Default export
export default ConversationReader;
