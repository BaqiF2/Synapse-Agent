# 工具调用管道重构设计

## 目标

重构工具的入参和出参结构，引入类型化工具基类 `CallableTool<Params>` 和结构化返回值 `ToolReturnValue`，同时保持现有的单一 Bash 工具 + BashRouter 路由架构不变。

## 核心类型

### ToolReturnValue

```typescript
interface ToolReturnValue {
  isError: boolean;
  output: string;      // 给模型看的内容
  message: string;     // 给模型的解释性消息
  brief: string;       // 给用户的简短摘要
  extras?: Record<string, unknown>; // 调试/测试用
}
```

### ToolOk / ToolError

便捷构造：
- `ToolOk({ output, message?, brief? })` — isError=false
- `ToolError({ message, brief, output? })` — isError=true

### ToolResult

```typescript
interface ToolResult {
  toolCallId: string;
  returnValue: ToolReturnValue;
}
```

## CallableTool 基类

```typescript
abstract class CallableTool<Params> {
  abstract name: string;
  abstract description: string;
  abstract paramsSchema: ZodType<Params>;

  get toolDefinition(): Anthropic.Tool { ... }

  async call(arguments: unknown): Promise<ToolReturnValue> {
    const params = this.paramsSchema.parse(arguments);
    return this.__call__(params);
  }

  abstract __call__(params: Params): Promise<ToolReturnValue>;
}
```

## 文件变更清单

1. **新建** `src/agent/callable-tool.ts` — CallableTool 基类、ToolReturnValue、ToolOk、ToolError
2. **重构** `src/agent/message.ts` — ToolResult 改为 { toolCallId, returnValue }
3. **重构** `src/agent/toolset.ts` — Toolset 基于 CallableTool[]
4. **新建** `src/tools/bash-tool.ts` — BashTool 实现
5. **删除** `src/agent/tool-executor.ts` — 职责被取代
6. **重构** `src/agent/step.ts` — 适配新 ToolResult
7. **重构** `src/agent/agent-runner.ts` — 适配新 ToolResult
8. **重构** `src/agent/context-manager.ts` — formatResultsForLlm 适配

## 约束

- Bash 工具对 LLM 暴露的参数（command + restart）不变
- BashRouter 及下层 handler 不变
- ToolCall 接口不变
