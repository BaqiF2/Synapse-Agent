/**
 * 文件功能说明：
 * - 该文件位于 `src/providers/message.ts`，主要负责 消息 相关实现。
 * - 模块归属 Provider 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `createTextMessage`
 * - `extractText`
 * - `toolResultToMessage`
 * - `isToolCallPart`
 * - `mergePart`
 * - `toMergeablePart`
 * - `appendToMessage`
 *
 * 作用说明：
 * - `createTextMessage`：用于创建并返回新对象/实例。
 * - `extractText`：用于从输入中提取目标信息。
 * - `toolResultToMessage`：用于进行类型或结构转换。
 * - `isToolCallPart`：用于条件判断并返回布尔结果。
 * - `mergePart`：用于合并多个输入结果。
 * - `toMergeablePart`：用于进行类型或结构转换。
 * - `appendToMessage`：用于向现有结构追加内容。
 */

// 从共享类型层 re-export 所有类型
export type {
  Role,
  TextPart,
  ThinkingPart,
  ImageUrlPart,
  ContentPart,
  ToolCall,
  ToolResult,
  Message,
  MergeableToolCallPart,
  MergeablePart,
} from '../types/message.ts';

import type {
  Role,
  TextPart,
  Message,
  ToolResult,
  MergeablePart,
  MergeableToolCallPart,
  StreamedMessagePart,
} from '../types/message.ts';

import { createLogger } from '../utils/logger.ts';

const logger = createLogger('message');

/**
 * Create a simple text message
 * @param role 输入参数。
 * @param text 输入参数。
 */
export function createTextMessage(role: Role, text: string): Message {
  return {
    role,
    content: [{ type: 'text', text }],
  };
}

/**
 * Extract all text from a message
 * @param message 消息内容。
 * @param separator 输入参数。
 */
export function extractText(message: Message, separator: string = ''): string {
  return message.content
    .filter((part): part is TextPart => part.type === 'text')
    .map((part) => part.text)
    .join(separator);
}

/**
 * Convert ToolResult to Message
 * @param result 输入参数。
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

// ===== Stream Merging Functions =====

/**
 * Check if a part is a tool call
 * @param part 输入参数。
 */
export function isToolCallPart(part: MergeablePart): part is MergeableToolCallPart {
  return part.type === 'tool_call';
}

/**
 * Merge source part into target part in place.
 * Returns true if merge was successful, false otherwise.
 * @param target 输入参数。
 * @param source 输入参数。
 */
export function mergePart(target: MergeablePart, source: MergeablePart): boolean {
  // Text + Text
  if (target.type === 'text' && source.type === 'text') {
    target.text += source.text;
    return true;
  }

  // Thinking + Thinking
  if (target.type === 'thinking' && source.type === 'thinking') {
    if (target.signature) return false;
    target.content += source.content;
    if (source.signature) target.signature = source.signature;
    return true;
  }

  // ToolCall + ToolCallDelta
  if (target.type === 'tool_call' && source.type === 'tool_call_delta') {
    const toolCallTarget = target as MergeableToolCallPart;
    const beforeJson = toolCallTarget._argumentsJson;
    // 关键调试点：记录合并前后的状态
    logger.trace('Merging tool_call_delta', {
      toolId: toolCallTarget.id,
      toolName: toolCallTarget.name,
      beforeArgumentsJson: beforeJson,
      argumentsDelta: source.argumentsDelta,
      argumentsDeltaType: typeof source.argumentsDelta,
    });
    toolCallTarget._argumentsJson += source.argumentsDelta;
    logger.trace('After merge tool_call_delta', {
      toolId: toolCallTarget.id,
      afterArgumentsJson: toolCallTarget._argumentsJson,
    });
    return true;
  }

  return false;
}

/**
 * Convert StreamedMessagePart to MergeablePart
 * @param part 输入参数。
 */
export function toMergeablePart(part: StreamedMessagePart): MergeablePart {
  if (part.type === 'tool_call') {
    const hasInput = Object.keys(part.input).length > 0;
    const argumentsJson = hasInput ? JSON.stringify(part.input) : '';
    // 关键调试点：记录 tool_call 转换
    logger.trace('Converting tool_call to MergeablePart', {
      toolId: part.id,
      toolName: part.name,
      hasInput,
      inputKeys: Object.keys(part.input),
      initialArgumentsJson: argumentsJson,
    });
    return {
      ...part,
      _argumentsJson: argumentsJson,
    } as MergeableToolCallPart;
  }
  return part as MergeablePart;
}

/**
 * Append a completed part to a message
 * @param message 消息内容。
 * @param part 输入参数。
 */
export function appendToMessage(message: Message, part: MergeablePart): void {
  if (part.type === 'text') {
    message.content.push({ type: 'text', text: part.text });
    return;
  }

  if (part.type === 'thinking') {
    message.content.push({ type: 'thinking', content: part.content, signature: part.signature });
    return;
  }

  if (part.type === 'tool_call') {
    if (!message.toolCalls) message.toolCalls = [];
    const toolCallPart = part as MergeableToolCallPart;
    const finalArguments = toolCallPart._argumentsJson || '{}';
    // 关键调试点：记录最终的工具调用参数
    logger.trace('Appending tool_call to message', {
      toolId: toolCallPart.id,
      toolName: toolCallPart.name,
      rawArgumentsJson: toolCallPart._argumentsJson,
      finalArguments,
      argumentsLength: finalArguments.length,
    });
    message.toolCalls.push({
      id: toolCallPart.id,
      name: toolCallPart.name,
      arguments: finalArguments,
    });
    return;
  }

  // Ignore orphaned tool_call_delta
}
