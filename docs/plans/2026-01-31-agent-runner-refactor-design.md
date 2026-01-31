# Agent Runner 重构设计

## 概述

参考 kosong 项目的架构设计，重构 `agent-runner.ts`，实现三层架构：`generate()` + `step()` + `AgentRunner`。

## 参考项目

- kosong `_generate.py` - generate() 函数设计
- kosong `__init__.py` - step() 函数和 StepResult 设计
- kosong `message.py` - Message 类型定义

## 整体架构

```
┌─────────────────────────────────────────┐
│            AgentRunner.run()            │  ← 循环调用 step() 直到完成
│         (状态管理 + 循环控制)            │
├─────────────────────────────────────────┤
│               step()                    │  ← 一次生成 + 工具执行
│         (单轮对话协调)                   │
├─────────────────────────────────────────┤
│             generate()                  │  ← 单次 LLM 调用
│      (流式处理 + 消息拼包)               │
├─────────────────────────────────────────┤
│          AnthropicClient                │  ← 现有的 LLM 客户端
└─────────────────────────────────────────┘
```

## 文件结构变更

```
src/agent/
├── message.ts              # 新增：独立 Message 类型定义
├── generate.ts             # 新增：generate() 函数
├── step.ts                 # 新增：step() 函数
├── agent-runner.ts         # 重构：简化为循环调用 step()
├── anthropic-client.ts     # 保留
├── anthropic-streamed-message.ts  # 保留
├── anthropic-types.ts      # 保留
├── llm-client.ts           # 删除
├── context-manager.ts      # 删除
└── ...
```

## 第一部分：Message 类型定义 (`message.ts`)

### 核心类型

```typescript
// 角色类型
type Role = 'system' | 'user' | 'assistant' | 'tool';

// 内容部分基础接口
interface ContentPart {
  type: string;
}

// 具体内容类型
interface TextPart extends ContentPart {
  type: 'text';
  text: string;
}

interface ThinkPart extends ContentPart {
  type: 'think';
  think: string;
  encrypted?: string;  // signature
}

interface ImageUrlPart extends ContentPart {
  type: 'image_url';
  imageUrl: { url: string; id?: string };
}

// 工具调用
interface ToolCall {
  id: string;
  name: string;
  arguments: string;  // JSON 字符串，支持流式拼接
}

// 消息
interface Message {
  role: Role;
  content: ContentPart[];
  toolCalls?: ToolCall[];
  toolCallId?: string;  // 工具响应时使用
}
```

### 辅助函数

```typescript
// 创建简单文本消息
function createTextMessage(role: Role, text: string): Message

// 从消息中提取文本
function extractText(message: Message): string

// Message 转换为 Anthropic.MessageParam
function toAnthropicMessage(message: Message): Anthropic.MessageParam

// 合并流式片段（返回是否成功合并）
function mergePart(target: StreamedMessagePart, source: StreamedMessagePart): boolean

// 将完成的片段追加到消息
function appendToMessage(message: Message, part: StreamedMessagePart): void
```

## 第二部分：generate() 函数 (`generate.ts`)

### 函数签名

```typescript
interface GenerateResult {
  id: string | null;
  message: Message;
  usage: TokenUsage | null;
}

type OnMessagePart = (part: StreamedMessagePart) => void | Promise<void>;
type OnToolCall = (toolCall: ToolCall) => void | Promise<void>;

async function generate(
  client: AnthropicClient,
  systemPrompt: string,
  tools: Anthropic.Tool[],
  history: readonly Message[],
  options?: {
    onMessagePart?: OnMessagePart;
    onToolCall?: OnToolCall;
  }
): Promise<GenerateResult>
```

### 核心逻辑

```typescript
async function generate(...) {
  // 1. 转换 Message[] → Anthropic.MessageParam[]
  const anthropicMessages = history.map(toAnthropicMessage);

  // 2. 调用 AnthropicClient.generate()
  const stream = await client.generate(systemPrompt, anthropicMessages, tools);

  // 3. 流式拼包（参考 kosong 的 pending_part 模式）
  const message: Message = { role: 'assistant', content: [] };
  let pendingPart: StreamedMessagePart | null = null;

  for await (const part of stream) {
    // 回调原始片段
    if (onMessagePart) await onMessagePart(part);

    // 尝试合并到 pendingPart
    if (pendingPart === null) {
      pendingPart = part;
    } else if (!mergePart(pendingPart, part)) {
      // 无法合并，将 pendingPart 写入 message
      appendToMessage(message, pendingPart);
      if (isToolCall(pendingPart) && onToolCall) {
        await onToolCall(toToolCall(pendingPart));
      }
      pendingPart = part;
    }
  }

  // 4. 处理最后的 pendingPart
  if (pendingPart) {
    appendToMessage(message, pendingPart);
    if (isToolCall(pendingPart) && onToolCall) {
      await onToolCall(toToolCall(pendingPart));
    }
  }

  // 5. 空响应检查
  if (!message.content.length && !message.toolCalls?.length) {
    throw new APIEmptyResponseError('API returned an empty response');
  }

  // 6. 返回结果
  return { id: stream.id, message, usage: stream.usage };
}
```

## 第三部分：step() 函数 (`step.ts`)

### 函数签名

```typescript
interface StepResult {
  id: string | null;
  message: Message;
  usage: TokenUsage | null;
  toolCalls: ToolCall[];

  /** 异步获取所有工具执行结果 */
  toolResults(): Promise<ToolResult[]>;
}

interface ToolResult {
  toolCallId: string;
  output: string;
  isError: boolean;
}

async function step(
  client: AnthropicClient,
  systemPrompt: string,
  toolset: Toolset,
  history: readonly Message[],
  options?: {
    onMessagePart?: OnMessagePart;
    onToolResult?: (result: ToolResult) => void;
  }
): Promise<StepResult>
```

### Toolset 接口

```typescript
interface Toolset {
  /** 获取工具定义列表（供 LLM 使用） */
  tools: Anthropic.Tool[];

  /** 处理工具调用，返回 Promise */
  handle(toolCall: ToolCall): Promise<ToolResult>;
}
```

### 核心逻辑

```typescript
async function step(...) {
  const toolCalls: ToolCall[] = [];
  const toolResultPromises: Map<string, Promise<ToolResult>> = new Map();

  // 工具调用回调 - 立即开始执行
  const onToolCall = async (toolCall: ToolCall) => {
    toolCalls.push(toolCall);
    const promise = toolset.handle(toolCall);
    toolResultPromises.set(toolCall.id, promise);

    // 可选：执行完成后回调
    if (onToolResult) {
      promise.then(onToolResult).catch(() => {});
    }
  };

  // 调用 generate()
  const result = await generate(
    client, systemPrompt, toolset.tools, history,
    { onMessagePart, onToolCall }
  );

  return {
    id: result.id,
    message: result.message,
    usage: result.usage,
    toolCalls,

    async toolResults(): Promise<ToolResult[]> {
      const results: ToolResult[] = [];
      for (const toolCall of toolCalls) {
        const promise = toolResultPromises.get(toolCall.id);
        if (promise) {
          results.push(await promise);
        }
      }
      return results;
    },
  };
}
```

## 第四部分：AgentRunner 重构 (`agent-runner.ts`)

### 接口定义

```typescript
interface AgentRunnerOptions {
  client: AnthropicClient;
  systemPrompt: string;
  toolset: Toolset;
  maxIterations?: number;
  maxConsecutiveToolFailures?: number;

  // 回调
  onMessagePart?: OnMessagePart;
  onToolResult?: (result: ToolResult) => void;

  // auto-enhance
  isAutoEnhanceEnabled?: () => boolean;
  autoEnhancePrompt?: string;
}
```

### 核心实现

```typescript
class AgentRunner {
  private history: Message[] = [];

  constructor(private options: AgentRunnerOptions) {}

  async run(userMessage: string): Promise<string> {
    this.history.push(createTextMessage('user', userMessage));

    let iteration = 0;
    let finalResponse = '';
    let consecutiveFailures = 0;
    let autoEnhanceTriggered = false;

    while (iteration < maxIterations) {
      iteration++;

      // 调用 step()
      const result = await step(
        client, systemPrompt, toolset, this.history,
        { onMessagePart, onToolResult }
      );

      // 获取工具结果
      const toolResults = await result.toolResults();

      // 将助手消息 + 工具结果消息追加到历史
      this.history.push(result.message);
      for (const tr of toolResults) {
        this.history.push(toolResultToMessage(tr));
      }

      // 提取文本响应
      const text = extractText(result.message);
      if (text) finalResponse = text;

      // 无工具调用 → 结束或 auto-enhance
      if (!result.toolCalls.length) {
        if (!autoEnhanceTriggered && isAutoEnhanceEnabled?.()) {
          autoEnhanceTriggered = true;
          this.history.push(createTextMessage('user', enhancePrompt));
          continue;
        }
        break;
      }

      // 连续失败检测
      const hasFail = toolResults.some(r => r.isError);
      consecutiveFailures = hasFail ? consecutiveFailures + 1 : 0;
      if (consecutiveFailures >= maxConsecutiveToolFailures) break;
    }

    return finalResponse;
  }
}
```

## 删除内容

### 删除的接口/类型

- `AgentRunnerLlmClient` - 直接使用 `AnthropicClient`
- `AgentRunnerToolExecutor` - 替换为 `Toolset`
- `AgentRunnerStreamedMessage` - 不需要
- `OutputMode` / `onText` - 替换为 `onMessagePart`
- `depth` / `parentId` / `agentTag` - 暂时移除

### 删除的文件

- `llm-client.ts` - 被 `AnthropicClient` 替代
- `context-manager.ts` - 被 `Message[]` 替代

## 回调设计

采用 kosong 风格的回调：

| 回调 | 位置 | 说明 |
|------|------|------|
| `onMessagePart` | generate() | 每个原始流式片段 |
| `onToolCall` | generate() 内部 | 每个完整工具调用（触发执行） |
| `onToolResult` | step() | 工具执行完成 |

## 实施步骤

1. 创建 `message.ts` - 定义 Message 类型和辅助函数
2. 创建 `generate.ts` - 实现 generate() 函数
3. 创建 `step.ts` - 实现 step() 函数和 Toolset 接口
4. 重构 `agent-runner.ts` - 简化为调用 step() 的循环
5. 删除 `llm-client.ts`
6. 删除 `context-manager.ts`
7. 更新 `index.ts` 导出
8. 更新依赖此模块的代码
