# P0 核心运行链路 E2E BDD（part03）

## 范围
- CLI 入口命令的用户可见行为
- REPL 状态类命令（`/cost`、`/context`、`/model`、`/clear`）
- `/skill enhance` 用户操作流
- Hook 输出提取与展示

## Feature: CLI 入口行为

### Scenario: 根命令 `--help` 输出命令导航
**Given** 在项目根目录执行 CLI 入口  
**When** 运行 `bun run src/cli/index.ts --help`  
**Then** 输出应包含 `Usage`、`Options`、`Commands`  
**And** 命令名应为 `synapse`

### Scenario: 根命令 `--version` 输出版本号
**Given** 在项目根目录执行 CLI 入口  
**When** 运行 `bun run src/cli/index.ts --version`  
**Then** 输出应为当前项目版本字符串

### Scenario: `chat --help` 显示 REPL 子命令说明
**Given** 在项目根目录执行 CLI 入口  
**When** 运行 `bun run src/cli/index.ts chat --help`  
**Then** 输出应包含 `interactive REPL` 相关描述

## Feature: REPL 状态命令

### Scenario: `/clear` 清空当前会话历史
**Given** AgentRunner 已绑定会话且历史中已有消息  
**When** 输入 `/clear`  
**Then** 应调用 `agentRunner.clearSession()`  
**And** 输出应包含 `Conversation history cleared.`

### Scenario: `/cost` 在无 runner 上下文时提示不可用
**Given** 当前上下文 `agentRunner=null`  
**When** 输入 `/cost`  
**Then** 输出应包含 `Cost stats unavailable in this context.`

### Scenario: `/cost` 在无 active session 时提示
**Given** `agentRunner` 存在但 `getSessionUsage()` 返回空  
**When** 输入 `/cost`  
**Then** 输出应包含 `No active session.`

### Scenario: `/cost` 在有统计时输出 token/cache/cost 摘要
**Given** `getSessionUsage()` 返回有效会话统计  
**When** 输入 `/cost`  
**Then** 输出应包含 `Token:`、`Cache:`、`Cost:` 字段

### Scenario: `/context` 在无 runner 上下文时提示不可用
**Given** 当前上下文 `agentRunner=null`  
**When** 输入 `/context`  
**Then** 输出应包含 `Context stats unavailable in this context.`

### Scenario: `/context` 在无 active session 时提示
**Given** `agentRunner` 存在但 `getContextStats()` 返回空  
**When** 输入 `/context`  
**Then** 输出应包含 `No active session.`

### Scenario: `/context` 在有统计时显示进度条与关键指标
**Given** `getContextStats()` 返回 token、阈值、消息与工具调用统计  
**When** 输入 `/context`  
**Then** 输出应包含 `Current Tokens`、`Offload Threshold`、`Tool Calls`  
**And** 输出包含百分比与进度条样式

### Scenario: `/model` 在无 runner 上下文时提示不可用
**Given** 当前上下文 `agentRunner=null`  
**When** 输入 `/model`  
**Then** 输出应包含 `Model info unavailable in this context.`

### Scenario: `/model` 输出当前模型名称
**Given** `agentRunner.getModelName()` 可返回模型名  
**When** 输入 `/model`  
**Then** 输出应包含 `Current model:` 与模型标识

## Feature: `/skill enhance` 用户操作流

### Scenario: `/skill` 未知子命令返回可用命令提示
**Given** 已进入 REPL  
**When** 输入 `/skill unknown`  
**Then** 输出应包含 `Unknown skill command`  
**And** 提示可用命令 `/skill enhance ...`

### Scenario: `/skill enhance -h` 显示帮助说明
**Given** 已进入 REPL  
**When** 输入 `/skill enhance -h`  
**Then** 输出应包含 `Skill Enhance - Help` 与参数说明

### Scenario: `/skill enhance` 无参数显示当前状态
**Given** 已进入 REPL 且设置管理器可读取开关状态  
**When** 输入 `/skill enhance`  
**Then** 输出应包含 `Skill Auto-Enhance Status`  
**And** 显示 `Enabled` 或 `Disabled`

### Scenario: `/skill enhance --on` 持久化开启状态
**Given** `SettingsManager` 可写入配置  
**When** 输入 `/skill enhance --on`  
**Then** 应调用 `setAutoEnhance(true)`  
**And** 输出应包含 `Auto skill enhance enabled`

### Scenario: `/skill enhance --off` 持久化关闭状态
**Given** `SettingsManager` 可写入配置  
**When** 输入 `/skill enhance --off`  
**Then** 应调用 `setAutoEnhance(false)`  
**And** 输出应包含 `Auto skill enhance disabled`

### Scenario: `/skill enhance` 传未知参数返回错误
**Given** 已进入 REPL  
**When** 输入 `/skill enhance --conversation ~/.synapse/conversations/x.jsonl`  
**Then** 输出应包含 `Unknown command: /skill enhance ...`  
**And** 输出应引导 `Type /help for available commands.`

## Feature: Hook 输出提取与渲染

### Scenario: 响应包含 Stop Hook marker 时提取 marker 之后内容
**Given** Agent 响应文本中包含 `STOP_HOOK_MARKER`  
**When** 调用 `extractHookOutput(response)`  
**Then** 返回内容应为 marker 之后的 hook 文本

### Scenario: 响应无 marker 但有 bracket header 时回退提取最后一段
**Given** 响应包含多段 `[Name]` 样式块且无 marker  
**When** 调用 `extractHookOutput(response)`  
**Then** 返回应为最后一段 bracket block 开始的文本

### Scenario: 响应无 hook 内容时不输出附加块
**Given** 响应仅为普通助手文本  
**When** 调用 `extractHookOutput(response)`  
**Then** 返回应为 `null`  
**And** REPL 不应追加 cyan hook 输出段

## 备注
- 本文件继续补充“用户直接看到的 CLI/REPL 行为”，确保交互路径可验证。  
- 文件行数需保持小于等于 1000；后续超限请创建 `01-p0-core-runtime-part04.md`。
