# P1 核心工具能力 E2E BDD（part07）

## 范围
- `CallableToolset` 的工具分发与错误分类
- 参数解析失败时的可诊断错误输出
- `cancel` 能力在工具调用链中的透传
- Bash 包装器与文件工具解析边界

## Feature: CallableToolset 工具分发

### Scenario: `tools` 应暴露底层工具定义数组
**Given** 使用单个 `CallableTool` 初始化 `CallableToolset`  
**When** 读取 `toolset.tools`  
**Then** 返回值应包含该工具的 `toolDefinition`  
**And** 名称与 schema 信息应可用于模型 tool schema 注入

### Scenario: 已知工具调用应解析 JSON 参数并执行 handler
**Given** `ToolCall(name=Bash, arguments='{"command":"ls"}')`  
**When** 执行 `toolset.handle(toolCall)`  
**Then** handler 应收到对象参数 `{ command: "ls" }`  
**And** 返回结果应关联原始 `toolCallId`

### Scenario: 未知工具调用应返回可修复错误而非抛异常
**Given** `ToolCall(name=Unknown, arguments='{}')`  
**When** 调用 `toolset.handle`  
**Then** 返回值应为 `isError=true`  
**And** 错误消息应包含 `Unknown tool` 与 `CORRECTION` 提示

## Feature: 参数错误分类

### Scenario: `arguments` 非法 JSON 时应归类为 `invalid_usage`
**Given** 工具调用参数字符串为损坏 JSON  
**When** 执行 `toolset.handle`  
**Then** 返回值应为 `isError=true`  
**And** `extras.failureCategory` 应为 `invalid_usage`

### Scenario: 参数 JSON 解析失败时不应调用底层 handler
**Given** 工具调用参数 JSON 无法解析  
**When** 调用 `toolset.handle`  
**Then** 应直接返回参数错误  
**And** 工具 handler 调用次数应保持为 `0`

### Scenario: 参数错误消息应包含 `Invalid parameters` 关键字
**Given** 工具调用参数不合法  
**When** handler 返回错误结果  
**Then** 错误消息应包含 `Invalid parameters`  
**And** 消息应可直接用于模型自修复下一轮调用

## Feature: Cancel 透传

### Scenario: 工具 Promise 携带 `cancel` 时应透传给 `toolset.handle` 返回值
**Given** 底层工具返回含 `cancel()` 的 Promise  
**When** 调用 `toolset.handle(toolCall)` 并触发 `resultPromise.cancel()`  
**Then** 底层 Promise 的 `cancel()` 应被调用  
**And** 不应丢失原始 `toolCallId` 上下文

### Scenario: 取消调用不应污染后续正常工具执行
**Given** 前一次工具调用已执行 `cancel()`  
**When** 紧接着执行下一次独立工具调用  
**Then** 下一次调用应可正常完成  
**And** 不应继承前一次中断状态

## Feature: Bash 包装器与文件工具边界

### Scenario: `bash    --help`（含多空格）应识别为帮助模式
**Given** 用户输入命令为 `bash    --help`  
**When** 进入 Bash 包装器解析  
**Then** 应输出帮助文本  
**And** 不应执行子命令

### Scenario: `read` 同时带 `--offset` 与 `--limit` 时应返回稳定窗口
**Given** 文本文件有多行内容  
**When** 执行 `read <file> --offset 2 --limit 3`  
**Then** 输出应仅包含从第 3 行起的 3 行  
**And** 行号应与窗口范围一致

### Scenario: `edit` 默认仅替换首个匹配且保留其余匹配
**Given** 文件中同一旧字符串出现 3 次  
**When** 执行不带 `--all` 的 `edit`  
**Then** 仅第 1 处应被替换  
**And** 其余 2 处应保持原值

### Scenario: `edit` 旧字符串不存在时应失败且文件内容不变
**Given** 目标文件不包含 `old_string`  
**When** 执行 `edit <file> old_string new_string`  
**Then** 命令应返回失败并提示未匹配  
**And** 文件内容应与执行前完全一致

## 备注
- 本分片聚焦“工具调用契约一致性”：参数错误分类、取消透传、与包装器解析稳定性。  
- 文件行数需保持小于等于 1000；后续超限请创建 `02-p1-core-tools-part08.md`。
