# P0 核心运行链路 E2E BDD（part02）

## 范围
- 启动降级与可用性保障
- REPL 输入处理关键分支
- `/resume` 会话恢复全链路
- 中断与退出交互

## Feature: 启动降级与可用性

### Scenario: Agent 初始化失败时自动降级为 echo 模式
**Given** LLM 客户端初始化失败（例如配置缺失或初始化异常）  
**When** 启动 `bun run chat`  
**Then** REPL 不应直接退出  
**And** 应输出 `Agent mode unavailable` 与 `Running in echo mode` 提示

### Scenario: MCP 初始化失败不阻断 REPL 启动
**Given** MCP 配置或连接异常导致 `initializeMcpTools()` 抛错  
**When** 启动 `bun run chat`  
**Then** 启动流程仍应继续  
**And** 输出应包含 `MCP tools unavailable` 警告

### Scenario: Skill 初始化失败不阻断 REPL 启动
**Given** Skill 初始化流程异常导致 `initializeSkillTools()` 抛错  
**When** 启动 `bun run chat`  
**Then** 启动流程仍应继续  
**And** 输出应包含 `Skill tools unavailable` 警告

### Scenario: 欢迎横幅应展示关键引导信息
**Given** REPL 成功启动  
**When** 显示欢迎信息  
**Then** 输出应包含 `/help`、`/exit`、`!<command>` 使用提示  
**And** 输出应包含当前 `Session` 标识

## Feature: REPL 输入处理

### Scenario: 空输入不会触发模型请求
**Given** 已进入 REPL 且当前未处理请求  
**When** 用户输入空行  
**Then** 应仅重新显示提示符  
**And** 不应触发 Agent 对话执行

### Scenario: `!` 前缀但无命令时提示用法
**Given** 已进入 REPL 且当前未处理请求  
**When** 用户输入 `!`  
**Then** 输出应包含 `Usage: !<command>`  
**And** 会话应继续可输入

### Scenario: 处理中收到普通输入会被忽略
**Given** `state.isProcessing=true` 且当前轮次仍在执行  
**When** 用户输入普通文本 `hello`  
**Then** 该输入不应进入新一轮处理  
**And** 当前轮次执行不应被打断

### Scenario: 处理中输入 `/exit` 会中断当前轮次并退出
**Given** `state.isProcessing=true` 且存在活动 turn  
**When** 用户输入 `/exit`  
**Then** 应先中断当前 turn（触发 abort）  
**And** 然后执行退出流程

## Feature: `/resume` 会话恢复

### Scenario: `/resume --latest` 跳过当前会话与空会话
**Given** 会话列表按更新时间降序，包含当前会话与 `messageCount=0` 会话  
**When** 输入 `/resume --latest`  
**Then** 应恢复“最近的上一条非空且非当前会话”  
**And** 回调收到该会话 ID

### Scenario: `/resume --latest` 在无历史会话时提示无可恢复
**Given** 过滤后可恢复会话列表为空  
**When** 输入 `/resume --latest`  
**Then** 输出应包含 `No previous sessions found.`

### Scenario: `/resume --last` 给出纠正提示
**Given** 已进入 REPL  
**When** 输入 `/resume --last`  
**Then** 输出应包含 `Invalid option: --last`  
**And** 提示应改用 `--latest`

### Scenario: `/resume` 列表模式可按序号恢复
**Given** 存在至少一条可恢复会话  
**When** 输入 `/resume` 并在交互问题中输入 `1`  
**Then** 应恢复列表第 1 条会话  
**And** 输出包含 `Resuming session`

### Scenario: `/resume` 列表模式按 Enter 取消
**Given** 存在可恢复会话且进入交互选择  
**When** 用户直接回车不输入内容  
**Then** 输出应包含 `Cancelled.`  
**And** 不应触发恢复回调

### Scenario: `/resume` 列表模式输入非法选择
**Given** 存在可恢复会话且进入交互选择  
**When** 输入不存在的序号或无匹配 ID  
**Then** 输出应包含 `Invalid selection`  
**And** 会话不应切换

### Scenario: `/resume <session-id-prefix>` 支持前缀匹配
**Given** 列表中存在会话 ID 以 `session-abc` 开头  
**When** 输入 `/resume session-abc`  
**Then** 应匹配并恢复该会话

### Scenario: `/resume <session-id>` 不存在时返回错误
**Given** 指定的会话 ID 不存在  
**When** 输入 `/resume session-not-found`  
**Then** 输出应包含 `Session not found`

### Scenario: `/resume <current-id>` 应直接重用当前会话
**Given** 输入的会话 ID 与当前会话相同  
**When** 执行 `/resume <current-id>`  
**Then** 应直接触发恢复回调  
**And** 不应额外调用 `Session.find`

### Scenario: 缺少 resume 回调上下文时给出不可用提示
**Given** 当前上下文未提供 `onResumeSession` 选项  
**When** 输入 `/resume`  
**Then** 输出应包含 `Resume not available in this context.`

## Feature: 中断与退出交互

### Scenario: 执行中按 `Ctrl+C` 会中断当前任务并回到提示符
**Given** `state.isProcessing=true` 且当前有活动任务  
**When** 触发 `handleSigint`  
**Then** 应调用 `interruptCurrentTurn()`  
**And** 状态应变为 `isProcessing=false`  
**And** 应重新显示提示符

### Scenario: 空闲时按 `Ctrl+C` 仅清空输入不退出
**Given** `state.isProcessing=false`  
**When** 触发 `handleSigint`  
**Then** 应调用 `clearCurrentInput()`  
**And** 不应调用 `interruptCurrentTurn()`  
**And** 应重新显示提示符

### Scenario: 输入 `/exit` 输出告别语并退出
**Given** 已进入 REPL  
**When** 输入 `/exit`  
**Then** 输出应包含 `Goodbye!`  
**And** Readline 应关闭

### Scenario: Readline close 事件会执行资源清理
**Given** 已进入 REPL 并初始化 SIGINT 监听  
**When** 触发 `rl.close` 事件  
**Then** 应执行 REPL shutdown 清理流程  
**And** 应移除 SIGINT 监听后退出进程

## 备注
- 本文件补充用户在真实交互中最常见的启动、恢复、中断路径。  
- 文件行数需保持小于等于 1000；后续超限请创建 `01-p0-core-runtime-part03.md`。
