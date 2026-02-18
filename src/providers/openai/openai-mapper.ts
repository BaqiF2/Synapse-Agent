/**
 * OpenAI SDK 格式转换器 — 将统一 LLMProvider 格式与 OpenAI Chat Completions API 格式互转。
 *
 * 核心导出:
 * - toOpenAIParams: 将 GenerateParams 转换为 OpenAI SDK 请求参数
 * - mapOpenAIStreamChunk: 将 OpenAI 流式 chunk 转换为统一 LLMStreamChunk
 * - toOpenAIMessages: 将统一消息格式转换为 OpenAI 消息格式
 * - toOpenAITools: 将统一工具定义转换为 OpenAI 工具格式
 */

import type {
  GenerateParams,
  LLMProviderMessage,
  LLMToolDefinition,
} from '../types.ts';

/** 默认最大生成 token 数 */
const DEFAULT_MAX_TOKENS = parseInt(process.env.SYNAPSE_OPENAI_MAX_TOKENS || '4096', 10);

/** OpenAI 消息格式（简化类型） */
interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

/** OpenAI 工具格式 */
interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** 将 GenerateParams 转换为 OpenAI chat.completions.create 参数 */
export function toOpenAIParams(
  model: string,
  params: GenerateParams,
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    model,
    max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
    stream: true,
    stream_options: { include_usage: true },
  };

  // 构建消息列表（system 消息放在最前面）
  const messages: OpenAIMessage[] = [];
  if (params.systemPrompt) {
    messages.push({ role: 'system', content: params.systemPrompt });
  }
  messages.push(...toOpenAIMessages(params.messages));
  result.messages = messages;

  // 工具
  if (params.tools && params.tools.length > 0) {
    result.tools = toOpenAITools(params.tools);
  }

  // 温度
  if (params.temperature !== undefined) {
    result.temperature = params.temperature;
  }

  // OpenAI 不支持 thinking 参数，直接忽略

  return result;
}

/** 将统一消息格式转换为 OpenAI 消息格式 */
export function toOpenAIMessages(
  messages: LLMProviderMessage[],
): OpenAIMessage[] {
  const result: OpenAIMessage[] = [];

  for (const msg of messages) {
    // 检查是否包含 tool_result，需要拆分为单独的 tool 消息
    const toolResults = msg.content.filter((b) => b.type === 'tool_result');
    const otherBlocks = msg.content.filter((b) => b.type !== 'tool_result');

    if (msg.role === 'assistant') {
      const openAIMsg: OpenAIMessage = { role: 'assistant' };

      // 提取文本内容
      const textBlocks = otherBlocks.filter((b) => b.type === 'text');
      if (textBlocks.length > 0) {
        openAIMsg.content = textBlocks
          .map((b) => (b as { type: 'text'; text: string }).text)
          .join('');
      }

      // 提取工具调用
      const toolUseBlocks = otherBlocks.filter((b) => b.type === 'tool_use');
      if (toolUseBlocks.length > 0) {
        openAIMsg.tool_calls = toolUseBlocks.map((b) => {
          const toolUse = b as { type: 'tool_use'; id: string; name: string; input: unknown };
          return {
            id: toolUse.id,
            type: 'function' as const,
            function: {
              name: toolUse.name,
              arguments: JSON.stringify(toolUse.input),
            },
          };
        });
      }

      result.push(openAIMsg);
    } else if (msg.role === 'user') {
      // 如果包含 tool_result，每个 tool_result 作为独立的 tool 消息
      for (const tr of toolResults) {
        const toolResult = tr as { type: 'tool_result'; tool_use_id: string; content: string };
        result.push({
          role: 'tool',
          content: toolResult.content,
          tool_call_id: toolResult.tool_use_id,
        });
      }

      // 普通文本内容
      const textBlocks = otherBlocks.filter((b) => b.type === 'text');
      if (textBlocks.length > 0) {
        result.push({
          role: 'user',
          content: textBlocks
            .map((b) => (b as { type: 'text'; text: string }).text)
            .join(''),
        });
      }
    }
  }

  return result;
}

/** 将统一工具定义转换为 OpenAI 工具格式 */
export function toOpenAITools(
  tools: LLMToolDefinition[],
): OpenAITool[] {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}

/** 将 OpenAI 停止原因映射到统一格式 */
export function mapOpenAIFinishReason(
  reason: string | null | undefined,
): 'end_turn' | 'tool_use' | 'max_tokens' {
  switch (reason) {
    case 'tool_calls':
      return 'tool_use';
    case 'length':
      return 'max_tokens';
    default:
      return 'end_turn';
  }
}
