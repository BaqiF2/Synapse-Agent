/**
 * MessageValidator — 消息入口预验证机制。
 * 在 assistant message 追加到历史记录前进行验证，替代后期全量重写的 History Sanitization。
 * 纯函数式设计，不持有 messages 引用，不修改已有历史。
 *
 * 核心导出:
 * - MessageValidator: 消息验证器类，验证 tool_use 参数格式和 ID 唯一性
 * - MessageValidationResult: validate() 方法的返回值
 * - MessageValidationError: 单个验证错误描述
 */

import type { LLMProviderContentBlock } from './types.ts';

/** 单个验证错误描述 */
export interface MessageValidationError {
  /** 关联的 tool_use_id */
  toolUseId: string;
  /** 错误描述信息 */
  message: string;
}

/** validate() 方法的返回值 */
export interface MessageValidationResult {
  /** 验证是否通过 */
  valid: boolean;
  /** 验证错误列表（仅在 valid=false 时有值） */
  errors?: MessageValidationError[];
}

/**
 * 消息入口预验证器。
 *
 * 验证规则：
 * 1. tool_use 的 input 必须是有效的对象类型（非字符串、非 null）
 * 2. 同一轮中 tool_use_id 不能重复
 * 3. 验证失败不修改历史，返回错误信息供外部构造 tool_result error
 */
export class MessageValidator {
  /**
   * 验证 assistant message 的内容块列表。
   * 纯函数，不修改任何外部状态。
   *
   * @param blocks - assistant 响应的内容块列表
   * @returns 验证结果，包含是否通过及错误详情
   */
  validate(blocks: LLMProviderContentBlock[]): MessageValidationResult {
    const errors: MessageValidationError[] = [];
    const seenIds = new Set<string>();

    for (const block of blocks) {
      if (block.type !== 'tool_use') {
        continue;
      }

      const toolUseBlock = block as { type: 'tool_use'; id: string; name: string; input: unknown };

      // 规则 1: input 必须是有效的对象类型
      if (!isValidToolInput(toolUseBlock.input)) {
        errors.push({
          toolUseId: toolUseBlock.id,
          message: `Invalid tool call format: input must be a valid object, got ${typeof toolUseBlock.input}`,
        });
      }

      // 规则 2: tool_use_id 不能重复
      if (seenIds.has(toolUseBlock.id)) {
        errors.push({
          toolUseId: toolUseBlock.id,
          message: `Duplicate tool_use_id detected: '${toolUseBlock.id}'`,
        });
      }
      seenIds.add(toolUseBlock.id);
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return { valid: true };
  }
}

/**
 * 检查 tool_use 的 input 是否为有效的对象类型。
 * 有效 input 必须是非 null 的 object（通常是 Record<string, unknown>）。
 * 字符串类型的 input（如 '{invalid json}'）视为无效。
 */
function isValidToolInput(input: unknown): boolean {
  // input 必须是非 null 的对象
  if (input === null || input === undefined) {
    return false;
  }
  if (typeof input !== 'object') {
    return false;
  }
  // 数组也是有效的 object（某些工具可能接受数组参数）
  return true;
}
