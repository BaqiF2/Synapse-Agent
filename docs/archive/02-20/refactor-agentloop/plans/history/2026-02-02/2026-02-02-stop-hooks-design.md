# Stop Hooks 系统设计

## 概述

Stop Hooks 是在 Agent 完成响应时自动执行的回调函数系统。本设计为 Synapse Agent 添加生命周期钩子能力，当前阶段实现 Stop 事件的占位功能。

## 核心概念

- **触发时机**：Agent 完成响应时（`run()` 方法正常结束）
- **不触发情况**：用户手动中断（Ctrl+C 等）
- **执行顺序**：LIFO（后注册的先执行）
- **错误处理**：单个钩子失败记录日志，继续执行其他钩子
- **空钩子列表**：静默跳过，无任何输出
- **上下文传递**：提供完整的会话上下文

## 类型定义

### StopHookContext

钩子执行时接收的上下文信息：

```typescript
interface StopHookContext {
  /** 会话 ID */
  sessionId: string | null
  /** 当前工作目录 */
  cwd: string
  /** 完整的消息历史 */
  messages: readonly Message[]
  /** 最终的响应文本 */
  finalResponse: string
  /** 本次响应中的工具调用记录 */
  toolCalls: ToolCallRecord[]
  /** Agent 是否因达到最大迭代次数而停止 */
  reachedMaxIterations: boolean
}
```

### ToolCallRecord

工具调用记录：

```typescript
interface ToolCallRecord {
  toolName: string
  input: unknown
  output: unknown
  success: boolean
}
```

### HookResult

钩子执行结果：

```typescript
interface HookResult {
  /** 可选的日志消息 */
  message?: string
  /** 可选的附加数据 */
  data?: Record<string, unknown>
}
```

### StopHook

钩子函数类型：

```typescript
type StopHook = (context: StopHookContext) => HookResult | Promise<HookResult> | void | Promise<void>
```

## AgentRunner 集成

### 配置选项

在 `AgentRunnerOptions` 中添加 `stopHooks` 配置：

```typescript
interface AgentRunnerOptions {
  // ... 现有选项

  /** Stop 钩子列表，执行顺序为 LIFO */
  stopHooks?: StopHook[]
}
```

### 执行逻辑

```typescript
class AgentRunner {
  private stopHooks: StopHook[]

  constructor(options: AgentRunnerOptions) {
    this.stopHooks = options.stopHooks ?? []
  }

  async run(userMessage: string): Promise<string> {
    // ... Agent Loop 逻辑

    // 正常完成时（非用户中断），执行 Stop 钩子
    if (!wasInterrupted) {
      await this.executeStopHooks(context)
    }

    return finalResponse
  }

  private async executeStopHooks(context: StopHookContext): Promise<void> {
    // 空列表静默跳过
    if (this.stopHooks.length === 0) {
      return
    }

    // LIFO 顺序：从后向前执行
    for (let i = this.stopHooks.length - 1; i >= 0; i--) {
      try {
        const result = await this.stopHooks[i](context)
        if (result?.message) {
          console.log(`[StopHook] ${result.message}`)
        }
      } catch (error) {
        console.error(`Stop hook execution failed: ${error}`)
        // 继续执行下一个钩子
      }
    }
  }
}
```

## 使用示例

```typescript
const runner = new AgentRunner({
  provider,
  systemPrompt,
  tools,
  stopHooks: [
    // 先注册的后执行
    (ctx) => ({ message: 'Hook 1: First registered, last executed' }),
    (ctx) => ({ message: 'Hook 2: Second registered, second executed' }),
    (ctx) => ({ message: 'Hook 3: Last registered, first executed' }),
  ]
})

// 执行后输出顺序：
// [StopHook] Hook 3: Last registered, first executed
// [StopHook] Hook 2: Second registered, second executed
// [StopHook] Hook 1: First registered, last executed
```

## 文件组织

```
src/
├── hooks/
│   ├── index.ts             # 导出所有 hooks 相关模块
│   └── types.ts             # 类型定义
├── agent/
│   ├── agent-runner.ts      # 修改：集成 stopHooks 执行逻辑
│   └── ...
└── ...
```

### 修改文件

- `src/agent/agent-runner.ts` - 添加 stopHooks 选项和执行逻辑

### 新增文件

- `src/hooks/types.ts` - 类型定义
- `src/hooks/index.ts` - 模块导出

## 设计决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 注册方式 | 构造 options 传入 | 简单直接，符合现有模式 |
| 执行方式 | 同步顺序执行 | 便于调试，执行顺序可预测 |
| 执行顺序 | LIFO | 后注册的先执行，类似栈的行为 |
| 错误处理 | 记录日志继续执行 | 单个钩子失败不影响其他钩子 |
| 空列表处理 | 静默跳过 | 无额外输出，保持简洁 |
| 上下文信息 | 完整上下文 | 提供最大灵活性 |

## 后续扩展

本设计为后续添加其他生命周期钩子预留了扩展空间：

- `PreToolUse` - 工具调用前
- `PostToolUse` - 工具调用后
- `SessionStart` - 会话开始
- `SessionEnd` - 会话结束

这些钩子可复用相同的模式和文件组织结构。
