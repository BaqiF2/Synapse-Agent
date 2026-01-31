# Anthropic Client 重构设计

## 概述

对标 kosong 项目的 `anthropic.py` 实现，重构 `llm-client.ts` 为 `anthropic-client.ts`，添加流式响应、Prompt Caching、Extended Thinking、Token 统计等功能。

## 文件结构

```
src/agent/
├── anthropic-types.ts              # 类型定义（TokenUsage, 错误类型, StreamedMessagePart）
├── anthropic-client.ts             # AnthropicClient 主客户端类
└── anthropic-streamed-message.ts   # AnthropicStreamedMessage 流式响应类
```

## 类型定义 (anthropic-types.ts)

### ThinkingEffort

```typescript
export type ThinkingEffort = 'off' | 'low' | 'medium' | 'high';
```

### TokenUsage

对标 kosong.TokenUsage：

```typescript
export interface TokenUsage {
  inputOther: number;        // Input tokens excluding cache
  output: number;            // Total output tokens
  inputCacheRead: number;    // Cached input tokens (read)
  inputCacheCreation: number; // Cache creation tokens
}

export function getTokenUsageTotal(usage: TokenUsage): number;
export function getTokenUsageInput(usage: TokenUsage): number;
```

### 错误类型

对标 kosong 错误层次：

```typescript
ChatProviderError          // 基类
├── APIConnectionError     // 连接失败
├── APITimeoutError        // 请求超时
├── APIStatusError         // 4xx/5xx 状态码（含 statusCode 字段）
└── APIEmptyResponseError  // 空响应
```

### StreamedMessagePart

```typescript
export type StreamedMessagePart =
  | TextPart           // { type: 'text'; text: string }
  | ThinkPart          // { type: 'thinking'; content: string; signature?: string }
  | ToolCallPart       // { type: 'tool_call'; id, name, input }
  | ToolCallDeltaPart; // { type: 'tool_call_delta'; argumentsDelta: string }
```

## AnthropicClient (anthropic-client.ts)

### 核心特性

1. **不可变配置模式**：`withThinking()` / `withGenerationKwargs()` 返回新实例
2. **默认启用流式**：`stream: true`
3. **Prompt Caching**：自动为 system prompt、最后一条消息、最后一个 tool 注入 `cache_control`

### 接口

```typescript
class AnthropicClient {
  static readonly name = 'anthropic';

  constructor(options?: { stream?: boolean });

  get modelName(): string;
  get thinkingEffort(): ThinkingEffort | null;

  withThinking(effort: ThinkingEffort): AnthropicClient;
  withGenerationKwargs(kwargs: Partial<GenerationKwargs>): AnthropicClient;

  generate(
    systemPrompt: string,
    messages: Anthropic.MessageParam[],
    tools: Anthropic.Tool[]
  ): Promise<AnthropicStreamedMessage>;
}
```

### GenerationKwargs

```typescript
interface GenerationKwargs {
  maxTokens: number;
  temperature?: number;
  topK?: number;
  topP?: number;
  thinking?: Anthropic.ThinkingConfigParam;
  toolChoice?: Anthropic.ToolChoiceParam;
}
```

### ThinkingEffort 映射

| Effort | budget_tokens |
|--------|---------------|
| off    | disabled      |
| low    | 1024          |
| medium | 4096          |
| high   | 32000         |

## AnthropicStreamedMessage (anthropic-streamed-message.ts)

### 核心特性

1. **统一接口**：流式/非流式都通过 `for await...of` 迭代
2. **Token 统计**：通过 `usage` 属性获取完整统计
3. **Thinking 支持**：处理 thinking/signature 事件

### 接口

```typescript
class AnthropicStreamedMessage {
  constructor(response: Anthropic.Message | Anthropic.MessageStream);

  get id(): string | null;
  get usage(): TokenUsage;

  [Symbol.asyncIterator](): AsyncIterator<StreamedMessagePart>;
}
```

### 事件处理

| Anthropic Event | 处理 |
|-----------------|------|
| message_start | 设置 id, 初始化 usage |
| content_block_start (text) | yield TextPart |
| content_block_start (thinking) | yield ThinkPart |
| content_block_start (tool_use) | yield ToolCallPart |
| content_block_delta (text_delta) | yield TextPart |
| content_block_delta (thinking_delta) | yield ThinkPart |
| content_block_delta (input_json_delta) | yield ToolCallDeltaPart |
| content_block_delta (signature_delta) | yield ThinkPart (with signature) |
| message_delta | 更新 usage |

## 调用方更新

```typescript
// 新用法
const client = new AnthropicClient();
const stream = await client.generate(systemPrompt, messages, tools);

for await (const part of stream) {
  if (part.type === 'text') console.log(part.text);
  if (part.type === 'tool_call') console.log(part.name, part.input);
}

console.log(stream.usage);

// 使用 thinking
const thinkingClient = client.withThinking('high');
```

## 实现步骤

1. 创建 `anthropic-types.ts`：类型定义和错误类
2. 创建 `anthropic-streamed-message.ts`：流式响应处理类
3. 创建 `anthropic-client.ts`：AnthropicClient 主类（删除旧 `llm-client.ts`）
4. 更新 `agent-runner.ts`：适配新接口
