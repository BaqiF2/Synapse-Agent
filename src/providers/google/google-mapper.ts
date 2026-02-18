/**
 * Google GenAI SDK 格式转换器 — 将统一 LLMProvider 格式与 Google GenAI API 格式互转。
 *
 * 核心导出:
 * - toGoogleParams: 将 GenerateParams 转换为 Google GenAI SDK 请求参数
 * - toGoogleContents: 将统一消息格式转换为 Google GenAI 消息格式
 * - toGoogleTools: 将统一工具定义转换为 Google GenAI 工具格式
 * - mapGoogleFinishReason: 将 Google 停止原因映射到统一格式
 */

import type {
  GenerateParams,
  LLMProviderMessage,
  LLMProviderContentBlock,
  LLMToolDefinition,
} from '../types.ts';

/** Google Content 格式 */
interface GoogleContent {
  role: 'user' | 'model';
  parts: GooglePart[];
}

/** Google Part 类型 */
type GooglePart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

/** Google 工具声明 */
interface GoogleFunctionDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** 将 GenerateParams 转换为 Google GenAI generateContentStream 参数 */
export function toGoogleParams(
  params: GenerateParams,
): { contents: GoogleContent[]; config: Record<string, unknown> } {
  const contents = toGoogleContents(params.messages);

  const config: Record<string, unknown> = {};

  // 系统指令
  if (params.systemPrompt) {
    config.systemInstruction = params.systemPrompt;
  }

  // 最大 token
  if (params.maxTokens !== undefined) {
    config.maxOutputTokens = params.maxTokens;
  }

  // 温度
  if (params.temperature !== undefined) {
    config.temperature = params.temperature;
  }

  // 工具
  if (params.tools && params.tools.length > 0) {
    config.tools = toGoogleTools(params.tools);
  }

  // 思考模式：Google GenAI 支持 thinkingConfig
  if (params.thinking) {
    config.thinkingConfig = {
      thinkingBudget: getThinkingBudget(params.thinking.effort),
    };
  }

  return { contents, config };
}

/** 将统一消息格式转换为 Google GenAI Contents 格式 */
export function toGoogleContents(
  messages: LLMProviderMessage[],
): GoogleContent[] {
  return messages.map((msg) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: msg.content.map(toGooglePart).filter((p): p is GooglePart => p !== null),
  }));
}

/** 将统一内容块转换为 Google Part */
function toGooglePart(block: LLMProviderContentBlock): GooglePart | null {
  switch (block.type) {
    case 'text':
      return { text: block.text };
    case 'thinking':
      // Google 模型的 thinking 由模型自动处理，用户消息中的 thinking 转为文本
      return { text: block.content };
    case 'tool_use':
      return {
        functionCall: {
          name: block.name,
          args: (block.input ?? {}) as Record<string, unknown>,
        },
      };
    case 'tool_result':
      return {
        functionResponse: {
          name: block.tool_use_id,
          response: { result: block.content },
        },
      };
  }
}

/** 将统一工具定义转换为 Google GenAI 工具格式 */
export function toGoogleTools(
  tools: LLMToolDefinition[],
): Array<{ functionDeclarations: GoogleFunctionDeclaration[] }> {
  return [
    {
      functionDeclarations: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      })),
    },
  ];
}

/** 思考模式 effort 到 budget 的映射 */
const THINKING_BUDGET: Record<string, number> = {
  low: 1024,
  medium: 4096,
  high: 32000,
};

/** 获取思考预算 */
function getThinkingBudget(effort: string): number {
  return THINKING_BUDGET[effort] ?? THINKING_BUDGET.medium!;
}

/** 将 Google 停止原因映射到统一格式 */
export function mapGoogleFinishReason(
  reason: string | undefined,
): 'end_turn' | 'tool_use' | 'max_tokens' {
  switch (reason) {
    case 'STOP':
      return 'end_turn';
    case 'MAX_TOKENS':
      return 'max_tokens';
    default:
      return 'end_turn';
  }
}
