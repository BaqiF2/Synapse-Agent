# P3 稳定性与体验保障 E2E BDD（part01）

## 范围
- 设置持久化与容错
- LLM 客户端流式/非流式兼容
- 错误类型与异常语义
- AgentRunner 与工具调用集成稳定性
- REPL 交互一致性

## Feature: 设置持久化

### Scenario: 设置在不同实例间保持一致
**Given** 已在 `<synapseDir>/settings.json` 写入默认配置  
**And** 使用 `SettingsManager` 实例 A 执行 `setAutoEnhance(true)`  
**When** 新建 `SettingsManager` 实例 B 并读取配置  
**Then** `isAutoEnhanceEnabled()` 应返回 `true`

### Scenario: 设置文件损坏时抛出明确异常
**Given** `<synapseDir>/settings.json` 内容是非法 JSON  
**When** 调用 `SettingsManager.get()`  
**Then** 应抛出异常  
**And** 异常应可定位到配置文件解析失败

### Scenario: 更新单个设置时不破坏其他配置
**Given** 已加载默认设置  
**When** 依次设置 `skillEnhance.maxEnhanceContextChars=100000` 与 `setAutoEnhance(true)`  
**Then** `get()` 返回中 `autoEnhance=true`  
**And** `maxEnhanceContextChars=100000`

## Feature: LLM 流式消息兼容性

### Scenario: 非流式消息可被统一迭代输出
**Given** 一个模拟的 Anthropic 非流式响应（含 text 内容块）  
**When** 使用 `AnthropicStreamedMessage` 进行异步迭代  
**Then** 应产出至少一个 `text` 类型消息片段  
**And** `id` 与 `usage` 字段应被正确映射

### Scenario: 流式事件可增量产出文本
**Given** 一个模拟的流式事件序列（包含 `message_start` 与多个 `content_block_delta`）  
**When** 使用 `AnthropicStreamedMessage` 进行异步迭代  
**Then** 应按 delta 产出多个 `text` 片段  
**And** 输出 token 统计应包含最终 `output` 值

### Scenario: `tool_use` 内容块可转为工具调用片段
**Given** 消息内容同时包含 `text` 与 `tool_use`   
**When** 通过 `AnthropicStreamedMessage` 迭代解析  
**Then** 输出中应包含 `tool_call` 类型片段  
**And** 片段中的 `name` 与 `input.command` 正确

### Scenario: `thinking` 内容块可保留推理文本
**Given** 消息内容包含 `thinking` 与普通 `text`  
**When** 通过 `AnthropicStreamedMessage` 迭代解析  
**Then** 应输出 `thinking` 类型片段  
**And** 应保留 `content` 与可选 `signature`

## Feature: 错误语义与诊断

### Scenario: API 连接异常类型可识别
**Given** 构造 `APIConnectionError('Connection failed')`  
**When** 捕获异常对象  
**Then** 应满足 `instanceof ChatProviderError`  
**And** `name` 应为 `APIConnectionError`

### Scenario: API 超时异常类型可识别
**Given** 构造 `APITimeoutError('Request timed out')`  
**When** 捕获异常对象  
**Then** 应满足 `instanceof ChatProviderError`  
**And** `name` 应为 `APITimeoutError`

### Scenario: API 状态码异常包含 statusCode
**Given** 构造 `APIStatusError(429, 'Rate limited')`  
**When** 捕获异常对象  
**Then** `statusCode` 应为 `429`  
**And** `name` 应为 `APIStatusError`

### Scenario: API 空响应异常类型可识别
**Given** 构造 `APIEmptyResponseError('Empty response')`  
**When** 捕获异常对象  
**Then** 应满足 `instanceof ChatProviderError`  
**And** `name` 应为 `APIEmptyResponseError`

### Scenario: Token 统计函数返回正确汇总
**Given** `usage={inputOther:100, output:50, inputCacheRead:25, inputCacheCreation:10}`  
**When** 分别调用 `getTokenUsageInput(usage)` 与 `getTokenUsageTotal(usage)`  
**Then** 输入 token 应为 `135`  
**And** 总 token 应为 `185`

## Feature: AgentRunner 集成稳定性

### Scenario: Runner 可返回最终文本响应
**Given** 一个返回单条 `text` 片段的 Mock Client  
**And** 一个可用的 `CallableToolset`  
**When** 调用 `runner.run('Hi')`  
**Then** 返回值应为模型最终文本内容

### Scenario: Runner 支持 onMessagePart 流式回调
**Given** 一个会产出 `text` 片段的 Mock Client  
**And** 已注册 `onMessagePart` 回调收集片段  
**When** 调用 `runner.run('Hi')`  
**Then** 回调数组应收到至少一个 `text` 类型片段

### Scenario: Runner 可执行工具并回传工具结果
**Given** Mock Client 首轮输出 `tool_call`，次轮输出最终文本  
**And** Mock Tool 返回 `ToolOk({ output: 'test' })`  
**When** 调用 `runner.run('Run')`  
**Then** 最终响应应为次轮文本  
**And** Tool handler 应被调用  
**And** `onToolResult` 收到的输出应包含 `test`

## Feature: REPL 体验一致性

### Scenario: 特殊命令大小写兼容
**Given** 已进入 REPL 会话  
**When** 输入 `/HELP`、`/Help`、`/hElP`  
**Then** 每条命令都应被识别并正确处理

### Scenario: 处理中的状态位可正确切换
**Given** 一个新的 `ReplState` 且 `isProcessing=false`  
**When** 设置为 `true` 后再恢复为 `false`  
**Then** 每个阶段的状态值都应符合预期

### Scenario: 认证失败时体验可诊断
**Given** 运行环境未配置有效 API Key  
**When** 发起首次需要模型调用的请求  
**Then** 应返回明确的鉴权失败提示  
**And** 不应出现无上下文的崩溃堆栈

### Scenario: 超时失败时体验可诊断
**Given** 上游模型请求超时（可通过 Mock 或超时配置触发）  
**When** 发起模型调用并触发超时  
**Then** 应返回 `APITimeoutError` 语义的错误信息  
**And** REPL 进程应保持可继续交互

## 备注
- 本文件聚焦 P3 稳定性、容错与用户体验保障。  
- 文件行数需保持小于等于 1000；如后续补充超限，新增 `04-p3-reliability-ux-part02.md`。
