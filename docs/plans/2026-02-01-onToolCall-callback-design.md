# onToolCall 回调暴露设计

## 背景

当前工具调用和结果没有输出到终端，原因是 `onToolCall` 回调没有暴露给外部使用：
- `TerminalRenderer.renderToolStart()` 存在但从未被调用
- `TerminalRenderer.renderToolEnd()` 被 `onToolResult` 调用
- 工具调用开始时没有任何输出

## 目标

暴露 `onToolCall` 回调，在工具开始执行前触发，使工具调用时能输出到终端。

## 设计

### 1. 类型定义

**`src/agent/step.ts`**

```typescript
// 新增类型
export type OnToolCall = (toolCall: ToolCall) => void;

// 修改 StepOptions
export interface StepOptions {
  onMessagePart?: OnMessagePart;
  onToolCall?: OnToolCall;      // 新增
  onToolResult?: OnToolResult;
}
```

**`src/agent/agent-runner.ts`**

```typescript
export interface AgentRunnerOptions {
  // ... 现有字段
  onToolCall?: OnToolCall;    // 新增
  onToolResult?: OnToolResult;
}
```

### 2. 回调调用逻辑

**`src/agent/step.ts` - handleToolCall 函数**

```typescript
const handleToolCall = async (toolCall: ToolCall) => {
  logger.debug('Tool call received', { id: toolCall.id, name: toolCall.name });
  toolCalls.push(toolCall);

  // 新增：触发外部回调（工具执行前）
  if (onToolCall) {
    try {
      onToolCall(toolCall);
    } catch (error) {
      logger.warn('onToolCall callback failed', { error });
    }
  }

  // 原有逻辑继续...
};
```

**`src/agent/agent-runner.ts`**

```typescript
// 构造函数中保存
this.onToolCall = options.onToolCall;

// run() 方法中传递给 step()
const result = await step(..., {
  onMessagePart: this.onMessagePart,
  onToolCall: this.onToolCall,      // 新增
  onToolResult: this.onToolResult,
});
```

### 3. REPL 配置

**`src/cli/repl.ts` - initializeAgent 函数**

```typescript
return new AgentRunner({
  // ...
  onToolCall: (toolCall) => {
    terminalRenderer.renderToolStart({
      id: toolCall.id,
      command: toolCall.name === 'Bash'
        ? JSON.parse(toolCall.arguments).command
        : toolCall.name,
      depth: 0,
    });
  },
  // ...
});
```

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/agent/step.ts` | 新增类型，接口添加字段，调用回调 |
| `src/agent/agent-runner.ts` | 接口添加字段，构造函数保存，传递给 step() |
| `src/cli/repl.ts` | 配置 onToolCall 调用 renderToolStart() |

## 预计改动

约 20 行代码
