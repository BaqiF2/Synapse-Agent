# P0 核心运行链路 E2E BDD（part07）

## 范围
- `generate()` 流式消息的组装与回调语义
- 工具调用参数增量拼装（`tool_call_delta`）
- 使用量与取消信号透传链路
- System Prompt 结构稳定性

## Feature: 流式生成组装

### Scenario: 连续文本分片应合并为单一 assistant 文本块
**Given** provider 连续返回两段 `text` 分片 `"Hello"` 与 `" world"`  
**When** 执行一次 `generate()`  
**Then** 最终 assistant `content` 应只包含 1 个 text block  
**And** 该文本值应为 `Hello world`

### Scenario: `onMessagePart` 回调应接收原始分片且不被后续合并污染
**Given** 注册 `onMessagePart` 收集流式分片  
**And** provider 返回两段可合并文本分片  
**When** `generate()` 完成  
**Then** 回调收集结果应保留 2 段原始分片  
**And** 第一段内容不应被改写为合并后的完整文本

### Scenario: 文本与工具调用混合流中应分别落入 `content` 与 `toolCalls`
**Given** provider 先返回 `text` 再返回 `tool_call` 分片  
**When** 执行 `generate()`  
**Then** assistant `content` 应仅包含文本块  
**And** assistant `toolCalls` 应包含对应工具调用项

## Feature: 工具调用增量拼装

### Scenario: `tool_call_delta` 参数增量应拼装到同一工具调用
**Given** provider 先返回 `tool_call(id=call1,name=Bash,input={})`  
**And** 随后返回 `tool_call_delta(argumentsDelta='{"command":"ls"}')`  
**When** `generate()` 完成  
**Then** `toolCalls[0].arguments` 应为 `{"command":"ls"}`  
**And** 不应生成额外重复 tool call

### Scenario: 完整工具调用应触发 `onToolCall` 回调
**Given** 注册 `onToolCall` 回调  
**And** provider 返回一个完整 `tool_call` 事件  
**When** 执行 `generate()`  
**Then** `onToolCall` 应被调用 1 次  
**And** 回调中应包含对应 `id/name`

### Scenario: 无工具调用时不应触发 `onToolCall`
**Given** 注册 `onToolCall` 回调  
**And** provider 仅返回普通文本分片  
**When** 执行 `generate()`  
**Then** `onToolCall` 调用次数应为 `0`  
**And** 返回消息应保持纯文本 assistant 响应

## Feature: 信号与 usage 透传

### Scenario: 外部 `AbortSignal` 应透传到底层 `client.generate`
**Given** 调用方传入 `AbortController.signal`  
**When** 执行 `generate()`  
**Then** 底层 `client.generate` 的 options 中应携带该 `signal`  
**And** 信号对象引用应与调用方传入对象一致

### Scenario: 生成完成后应触发 `onUsage(usage, model)`
**Given** 注册 `onUsage` 回调  
**And** provider 返回完整 usage 与模型名  
**When** `generate()` 正常结束  
**Then** `onUsage` 应被调用 1 次  
**And** 回调中的 usage 数值与 model 应与 provider 返回一致

## Feature: System Prompt 结构稳定性

### Scenario: System Prompt 应包含 4 个核心段落且顺序固定
**Given** 使用默认参数构建 system prompt  
**When** 调用 `buildSystemPrompt()`  
**Then** 文本中应包含 `# Role -> # Command System -> # Skill System -> # Core Principles`  
**And** 段落顺序不得颠倒

### Scenario: System Prompt 不应再包含已废弃段落
**Given** 构建默认 system prompt  
**When** 读取 prompt 文本  
**Then** 不应包含 `Three-Layer Bash Architecture`  
**And** 不应包含 `Execution Principles`

### Scenario: 传入 `cwd` 时应附加当前工作目录段落
**Given** 调用 `buildSystemPrompt({ cwd: '/tmp/test-dir' })`  
**When** 构建完成  
**Then** prompt 中应包含 `# Current Working Directory`  
**And** 应包含路径 ``/tmp/test-dir``

### Scenario: Command System 中应保留 path-parallel 与交付前清理约束
**Given** 构建默认 system prompt  
**When** 检查 Command System 规则文本  
**Then** 应包含 `task:explore` 的路径并行规则提示  
**And** 应包含交付前清理临时测试/调试文件的要求

## 备注
- 本分片聚焦“单轮生成质量”与“系统提示契约稳定性”，用于兜住用户最常见的生成回归问题。  
- 文件行数需保持小于等于 1000；后续超限请创建 `01-p0-core-runtime-part08.md`。
