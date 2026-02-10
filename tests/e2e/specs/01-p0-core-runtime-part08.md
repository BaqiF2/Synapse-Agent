# P0 核心运行链路 E2E BDD（part08）

## 范围
- AgentRunner 在并行 task 批次中的失败分支行为
- 多批次任务与非任务工具的分段执行顺序
- 连续失败计数策略中的例外分支
- 会话恢复前后上下文统计一致性

## Feature: 并行 task 批次失败分支

### Scenario: 并行批次中单个 task 失败时应保留其余成功结果
**Given** 同一批次 3 个 `task:*` 调用，其中 1 个返回 `ToolError`  
**When** Agent 收集该批次 `tool_result`  
**Then** 成功任务结果应全部写入历史  
**And** 失败任务仅在其对应 tool message 中体现错误

### Scenario: 并行批次全部失败时每个任务都应返回独立错误结果
**Given** 同一批次所有 `task:*` 调用均返回失败  
**When** 执行该批次  
**Then** 应生成与调用数一致的 tool messages  
**And** 每条错误应保留各自任务上下文而非合并成单条总错

### Scenario: 慢任务超时失败不应阻塞同批次快任务先完成
**Given** 并行批次中包含 1 个慢任务和 2 个快任务  
**When** 慢任务最终以 timeout 失败  
**Then** 快任务应先返回成功结果  
**And** Agent 不应等待慢任务后才输出快任务结果

## Feature: 分段执行顺序

### Scenario: 任务批次被非任务命令隔开时应按“批次-非任务-批次”顺序执行
**Given** 调用顺序为 `task-a`、`task-b`、`read`、`task-c`、`task-d`  
**When** Agent 执行工具分组调度  
**Then** 第一批 task 应先并行完成  
**And** `read` 完成后才启动第二批 task

### Scenario: 单个 task 调用应只产生一个对应 tool_result
**Given** assistant 本轮仅返回一个 `task:*` 工具调用  
**When** 执行 `run()`  
**Then** 历史中应新增 1 条 tool message  
**And** 该消息应绑定原始 toolCallId

### Scenario: 多轮 `run` 后历史应按“用户-助手”交替累积
**Given** 同一 Runner 连续执行两次普通对话调用  
**When** 第二次调用完成  
**Then** 历史长度应为 4（2 user + 2 assistant）  
**And** 先前轮次内容不应被覆盖

## Feature: 连续失败计数例外

### Scenario: 文件路径类执行错误不应累计到连续失败阈值
**Given** 连续出现两次 `read /missing` 的 `execution_error`  
**And** 后续一轮模型给出可恢复响应  
**When** 执行完整循环  
**Then** Runner 不应因“连续失败阈值”提前终止  
**And** 应允许后续轮次继续完成

### Scenario: 达到连续失败阈值后应返回终止说明并停止后续迭代
**Given** `maxConsecutiveToolFailures=2` 且连续两轮工具调用失败  
**When** 执行 `run()`  
**Then** 响应应包含 `Consecutive tool execution failures` 提示  
**And** 不应继续进入下一轮模型请求

## Feature: 会话恢复上下文一致性

### Scenario: 恢复会话后首次运行前 `getContextStats` 应反映已持久化历史
**Given** 会话文件中已存在历史消息  
**When** 用 `sessionId` 新建 Runner 且尚未执行新输入  
**Then** `getContextStats().messageCount` 应等于已持久化消息数  
**And** token 统计应与现有历史一致

### Scenario: 恢复会话后应清理悬空 toolCall 历史再继续新请求
**Given** 持久化历史中存在未闭合的 assistant `toolCalls`  
**When** Runner 恢复会话并执行新请求  
**Then** 新历史中不应保留悬空 toolCalls  
**And** 新一轮响应应可正常完成

### Scenario: tool 参数增量拼装失败时应清理该轮工具序列并继续下一轮
**Given** 本轮出现损坏的 `tool_call_delta` 参数串  
**When** Runner 进入下一轮执行  
**Then** 上一轮不应落盘任何 assistant toolCalls/tool messages  
**And** 后续轮次应可恢复正常响应

## 备注
- 本分片聚焦“并行失败与恢复稳态”，覆盖用户真实运行中最容易出现的任务批次异常链路。  
- 文件行数需保持小于等于 1000；后续超限请创建 `01-p0-core-runtime-part09.md`。
