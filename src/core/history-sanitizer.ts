/**
 * History Sanitizer
 *
 * 功能：清理对话历史中不完整或格式错误的工具调用消息，
 * 确保历史记录符合 Anthropic API 的工具调用协议要求。
 *
 * 核心导出：
 * - sanitizeToolProtocolHistory(): 清理不完整/格式错误的工具调用历史
 */

import type { Message } from '../providers/message.ts';

/**
 * 检查 JSON 字符串是否为合法的对象
 */
function isObjectJsonString(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return Boolean(parsed) && typeof parsed === 'object' && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

/**
 * 检查 assistant 消息中的工具调用参数是否格式错误
 */
function hasMalformedToolArguments(message: Message): boolean {
  if (message.role !== 'assistant') {
    return false;
  }

  const toolCalls = message.toolCalls ?? [];
  if (toolCalls.length === 0) {
    return false;
  }

  return toolCalls.some((toolCall) => !isObjectJsonString(toolCall.arguments));
}

/**
 * 清理对话历史中不完整或格式错误的工具调用序列
 *
 * 处理以下异常情况：
 * - 格式错误的工具调用参数（无法安全回放给 Anthropic API）
 * - 工具调用与工具结果不匹配（数量不一致或 ID 不匹配）
 * - 孤立的 tool 消息（缺少对应的 assistant 工具调用）
 */
export function sanitizeToolProtocolHistory(messages: readonly Message[]): { sanitized: Message[]; changed: boolean } {
  const sanitized: Message[] = [];
  let changed = false;
  let index = 0;

  while (index < messages.length) {
    const message = messages[index];
    if (!message) {
      break;
    }

    if (message.role === 'assistant' && (message.toolCalls?.length ?? 0) > 0) {
      // 格式错误的工具参数无法安全回放
      if (hasMalformedToolArguments(message)) {
        changed = true;
        index += 1;
        while (index < messages.length && messages[index]?.role === 'tool') {
          changed = true;
          index += 1;
        }
        continue;
      }

      const expectedToolCallIds = new Set((message.toolCalls ?? []).map((call) => call.id));
      const matchedToolCallIds = new Set<string>();
      const toolMessages: Message[] = [];

      let cursor = index + 1;
      let invalidSequence = false;
      while (cursor < messages.length) {
        const next = messages[cursor];
        if (!next || next.role !== 'tool') {
          break;
        }

        const toolCallId = next.toolCallId;
        if (!toolCallId || !expectedToolCallIds.has(toolCallId) || matchedToolCallIds.has(toolCallId)) {
          invalidSequence = true;
          break;
        }

        matchedToolCallIds.add(toolCallId);
        toolMessages.push(next);
        cursor += 1;

        if (matchedToolCallIds.size === expectedToolCallIds.size) {
          break;
        }
      }

      if (!invalidSequence && matchedToolCallIds.size === expectedToolCallIds.size) {
        sanitized.push(message, ...toolMessages);
        index += 1 + toolMessages.length;
        continue;
      }

      changed = true;
      index += 1;

      // 跳过与此悬空工具调用关联的孤立 tool 消息
      while (index < messages.length && messages[index]?.role === 'tool') {
        changed = true;
        index += 1;
      }
      continue;
    }

    if (message.role === 'tool') {
      changed = true;
      index += 1;
      continue;
    }

    sanitized.push(message);
    index += 1;
  }

  return { sanitized, changed };
}
