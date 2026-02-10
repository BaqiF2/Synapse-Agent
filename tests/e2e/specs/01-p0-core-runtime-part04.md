# P0 核心运行链路 E2E BDD（part04）

## 范围
- Agent Step 的工具调度与并行批次策略
- 执行中断后的恢复路径
- Todo 未完成时的继续执行约束
- 技能搜索前置指令注入策略
- 会话持久化与非持久化分支

## Feature: Agent Step 工具调度

### Scenario: 连续 `task:*` 工具调用应并行执行
**Given** 同一轮模型输出连续 3 个 `Bash(command="task:...")` 工具调用  
**When** 执行该轮 `toolResults()`  
**Then** 3 个 task 调用应进入同一并行批次  
**And** 成功结果应全部写入 tool 消息历史

### Scenario: `task:explore` 与 `task:general` 混合调用仍可并行
**Given** 同一批次中同时包含 `task:explore` 与 `task:general`  
**When** Agent 执行这一批工具调用  
**Then** 二者应按 task 批次并行执行  
**And** 不应因 task 类型不同而串行化

### Scenario: 混合调用按分组顺序执行 `read -> task批次 -> write`
**Given** 同一轮工具调用顺序为 `read`、`task:*`、`task:*`、`write`  
**When** 执行工具结果收集  
**Then** `read` 必须先完成  
**And** task 批次完成后才执行 `write`

### Scenario: 默认并行上限为 5
**Given** 未设置 `SYNAPSE_MAX_PARALLEL_TASKS`  
**And** 同批次存在 7 个 `task:*` 调用  
**When** 执行该批次  
**Then** 任一时刻并行执行数量不应超过 `5`  
**And** 超出部分应排队到下一子批次

### Scenario: `SYNAPSE_MAX_PARALLEL_TASKS` 可覆盖默认并行上限
**Given** 环境变量 `SYNAPSE_MAX_PARALLEL_TASKS=3`  
**And** 同批次存在 5 个 `task:*` 调用  
**When** 执行该批次  
**Then** 最大并行数应为 `3`  
**And** 执行结果数量仍应与调用数量一致

### Scenario: 并行批次中单个 task 超时不应阻塞其它 task 结果
**Given** task 批次中有 1 个慢任务与 2 个快任务  
**When** 慢任务最终超时失败  
**Then** 快任务应先产出成功结果  
**And** 失败任务仅影响自身 tool result

## Feature: 中断与恢复

### Scenario: 工具结果阶段被 Abort 时不得持久化悬空 toolCalls
**Given** 当前轮 assistant 已产出 toolCalls 且 tool result 尚未全部返回  
**When** 外部 `AbortSignal` 在 `toolResults()` 阶段触发中断  
**Then** 本轮悬空 assistant toolCalls 不应被落盘  
**And** 历史应仅保留已确认的消息

### Scenario: 中断时应向正在执行的工具传播 cancel
**Given** 某工具返回 `CancelablePromise`  
**When** 本轮执行被 Abort 终止  
**Then** 该工具 promise 的 `cancel()` 应被调用  
**And** 返回错误应为中断语义（AbortError）

### Scenario: 中断后下一轮执行可恢复且不受脏历史影响
**Given** 上一轮在工具执行中被中断  
**When** 用户再次发起新输入  
**Then** 新一轮应可正常完成  
**And** 历史中不应存在悬空 assistant toolCalls

## Feature: Todo 未完成任务约束

### Scenario: 模型尝试结束但 Todo 仍未完成时应强制继续
**Given** 当前轮无工具调用  
**And** `todoStore` 中仍有 `pending/in_progress` 项  
**When** Agent 准备结束本轮  
**Then** 应自动追加 `[System Reminder]` 用户消息  
**And** 循环继续执行下一轮而非直接结束

### Scenario: Todo 全部完成时可正常结束
**Given** 当前轮无工具调用  
**And** `todoStore` 中所有项状态均为 `completed`  
**When** Agent 准备结束本轮  
**Then** 应直接返回 assistant 最终文本  
**And** 不应追加继续执行提醒

## Feature: 技能搜索前置指令

### Scenario: 默认开启时应在用户消息前注入英文技能搜索指令
**Given** `enableSkillSearchInstruction=true`（默认）  
**When** 执行 `runner.run("<user-request>")`  
**Then** 首条 user 消息应包含 `Skill Search Priority` 指令块  
**And** 指令块后应保留 `Original user request` 原始请求正文

### Scenario: 显式关闭后应保留原始用户输入
**Given** `enableSkillSearchInstruction=false`  
**When** 执行 `runner.run("保持原始输入")`  
**Then** 首条 user 消息文本应等于原输入  
**And** 不应包含技能搜索指令内容

## Feature: 会话持久化分支

### Scenario: 未提供会话选项时不创建持久会话
**Given** 创建 `AgentRunner` 时未设置 `session/sessionId/sessionsDir`  
**When** 完成一次 `run`  
**Then** `getSessionId()` 应返回 `null`  
**And** `getSessionUsage()` 应返回 `null`

### Scenario: 提供 `sessionsDir` 时首次运行自动建会话并持久化历史
**Given** 使用 `sessionsDir=<TEST_DIR>` 创建 `AgentRunner`  
**When** 执行一次 `run("Hi")`  
**Then** 应自动创建 `session-*` 会话  
**And** 会话 history 中应持久化 `user + assistant` 两条消息

### Scenario: 子代理 usage 回传应累计到主会话统计
**Given** 主会话已完成至少 1 轮并存在 usage  
**When** 调用 `recordUsage(subAgentUsage, model)`  
**Then** `getSessionUsage()` 的 total 字段应累加  
**And** `rounds` 数量应增加

## 备注
- 本分片补充“用户真实交互中最容易踩到的执行顺序与恢复路径”场景。  
- 文件行数需保持小于等于 1000；后续超限请创建 `01-p0-core-runtime-part05.md`。
