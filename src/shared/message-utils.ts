/**
 * 消息工具函数 — 操作 Message 类型的纯函数。
 *
 * 从 providers/message.ts 提取到 shared/ 层，消除 core → providers 的依赖。
 *
 * 核心导出：
 * - createTextMessage: 创建简单文本消息
 * - extractText: 提取消息中的文本内容
 * - toolResultToMessage: 将 ToolResult 转换为 Message
 */

import type { Role, TextPart, Message, ToolResult } from '../types/message.ts';

/**
 * 创建简单文本消息
 */
export function createTextMessage(role: Role, text: string): Message {
  return {
    role,
    content: [{ type: 'text', text }],
  };
}

/**
 * 提取消息中的所有文本内容
 */
export function extractText(message: Message, separator: string = ''): string {
  return message.content
    .filter((part): part is TextPart => part.type === 'text')
    .map((part) => part.text)
    .join(separator);
}

/**
 * 将 ToolResult 转换为 Message
 */
export function toolResultToMessage(result: ToolResult): Message {
  const output = result.returnValue.output ?? '';
  const message = result.returnValue.message ?? '';
  const contentText = [output, message].filter((part) => part.length > 0).join('\n\n');

  return {
    role: 'tool',
    content: [{ type: 'text', text: contentText }],
    toolCallId: result.toolCallId,
  };
}
