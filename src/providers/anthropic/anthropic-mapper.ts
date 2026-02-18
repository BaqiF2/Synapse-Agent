/**
 * Anthropic SDK 格式转换器 — 将统一 LLMProvider 格式与 Anthropic Messages API 格式互转。
 *
 * 核心导出:
 * - toAnthropicParams: 将 GenerateParams 转换为 Anthropic SDK 请求参数
 * - fromAnthropicResponse: 将 Anthropic SDK 响应转换为统一 LLMResponse
 * - mapAnthropicStreamEvent: 将 Anthropic 流式事件转换为统一 LLMStreamChunk
 * - toAnthropicTools: 将统一工具定义转换为 Anthropic 工具格式
 * - toAnthropicMessages: 将统一消息格式转换为 Anthropic 消息格式
 */

import type Anthropic from '@anthropic-ai/sdk';
import type {
  GenerateParams,
  LLMProviderMessage,
  LLMProviderContentBlock,
  LLMToolDefinition,
  LLMResponse,
  LLMResponseContentBlock,
  LLMStreamChunk,
} from '../types.ts';

/** 思考模式 effort 到 budget_tokens 的映射 */
const THINKING_BUDGET: Record<string, number> = {
  low: 1024,
  medium: 4096,
  high: 32000,
};

/** 默认最大生成 token 数 */
const DEFAULT_MAX_TOKENS = parseInt(process.env.SYNAPSE_ANTHROPIC_MAX_TOKENS || '4096', 10);

/** 将 GenerateParams 转换为 Anthropic messages.create 参数 */
export function toAnthropicParams(
  model: string,
  params: GenerateParams,
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    model,
    max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
    stream: true,
  };

  // 系统提示词
  if (params.systemPrompt) {
    result.system = params.systemPrompt;
  }

  // 消息
  result.messages = toAnthropicMessages(params.messages);

  // 工具
  if (params.tools && params.tools.length > 0) {
    result.tools = toAnthropicTools(params.tools);
  }

  // 温度
  if (params.temperature !== undefined) {
    result.temperature = params.temperature;
  }

  // 思考模式
  if (params.thinking) {
    const budget = THINKING_BUDGET[params.thinking.effort];
    if (budget !== undefined) {
      result.thinking = { type: 'enabled', budget_tokens: budget };
    }
  }

  return result;
}

/** 将统一消息格式转换为 Anthropic 消息格式 */
export function toAnthropicMessages(
  messages: LLMProviderMessage[],
): Anthropic.MessageParam[] {
  return messages.map((msg) => ({
    role: msg.role,
    content: msg.content.map(toAnthropicContentBlock),
  }));
}

/** 将统一内容块转换为 Anthropic 内容块 */
function toAnthropicContentBlock(
  block: LLMProviderContentBlock,
): Anthropic.ContentBlockParam {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: block.text };
    case 'thinking':
      // Anthropic SDK 需要 thinking 类型块带 signature，但在消息转换中我们简化处理
      return { type: 'text', text: block.content } as Anthropic.ContentBlockParam;
    case 'tool_use':
      return {
        type: 'tool_use',
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      };
    case 'tool_result':
      return {
        type: 'tool_result',
        tool_use_id: block.tool_use_id,
        content: block.content,
        is_error: block.is_error,
      } as Anthropic.ContentBlockParam;
  }
}

/** 将统一工具定义转换为 Anthropic 工具格式 */
export function toAnthropicTools(
  tools: LLMToolDefinition[],
): Anthropic.Tool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
  }));
}

/** 将 Anthropic 流式事件转换为统一流式 chunk */
export function mapAnthropicStreamEvent(
  event: Anthropic.RawMessageStreamEvent,
): LLMStreamChunk | null {
  switch (event.type) {
    case 'content_block_start': {
      const block = event.content_block;
      if (block.type === 'tool_use') {
        return { type: 'tool_use_start', id: block.id, name: block.name };
      }
      return null;
    }
    case 'content_block_delta': {
      const delta = event.delta;
      if (delta.type === 'text_delta') {
        return { type: 'text_delta', text: delta.text };
      }
      if (delta.type === 'thinking_delta') {
        return { type: 'thinking_delta', content: delta.thinking };
      }
      if (delta.type === 'input_json_delta') {
        return { type: 'tool_use_delta', id: '', input: delta.partial_json };
      }
      return null;
    }
    case 'message_delta': {
      // usage 在 message_delta 的 usage 中
      const usage = event.usage;
      if (usage) {
        return { type: 'usage', inputTokens: 0, outputTokens: usage.output_tokens };
      }
      return null;
    }
    case 'message_start': {
      const usage = event.message.usage;
      if (usage) {
        return { type: 'usage', inputTokens: usage.input_tokens, outputTokens: 0 };
      }
      return null;
    }
    default:
      return null;
  }
}

/** 将 Anthropic 完整响应转换为统一 LLMResponse */
export function fromAnthropicResponse(
  message: Anthropic.Message,
): LLMResponse {
  const content: LLMResponseContentBlock[] = message.content.map((block) => {
    if (block.type === 'text') {
      return { type: 'text' as const, text: block.text };
    }
    if (block.type === 'tool_use') {
      return {
        type: 'tool_use' as const,
        id: block.id,
        name: block.name,
        input: block.input,
      };
    }
    if (block.type === 'thinking') {
      return { type: 'thinking' as const, content: block.thinking };
    }
    // 兜底：不应走到这里
    return { type: 'text' as const, text: '' };
  });

  const stopReason = mapStopReason(message.stop_reason);

  return {
    content,
    stopReason,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    },
  };
}

/** 映射 Anthropic 停止原因到统一格式 */
function mapStopReason(
  reason: string | null,
): 'end_turn' | 'tool_use' | 'max_tokens' {
  switch (reason) {
    case 'tool_use':
      return 'tool_use';
    case 'max_tokens':
      return 'max_tokens';
    default:
      return 'end_turn';
  }
}
