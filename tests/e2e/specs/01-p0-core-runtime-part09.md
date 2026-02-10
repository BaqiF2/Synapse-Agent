# P0 核心运行链路 E2E BDD（part09）

## 范围
- StopHookRegistry 在 Agent 收敛阶段的触发契约
- StopHook 执行顺序与错误隔离
- StopHook 上下文字段完整性
- 上下文卸载后仍超阈值时的告警行为

## Feature: StopHook 触发契约

### Scenario: 无工具调用的正常收敛应触发一次 StopHook
**Given** 本轮模型仅返回文本响应且无工具调用  
**When** Agent 完成 `run()`  
**Then** StopHookRegistry 应被触发 1 次  
**And** Hook 回调应收到完整上下文对象

### Scenario: 含工具调用的多轮收敛在最终完成时也应触发 StopHook
**Given** 首轮产生工具调用且后续轮次收敛为最终文本  
**When** Agent 循环结束  
**Then** StopHookRegistry 应在最终结束时触发  
**And** 不应在中间工具轮次重复触发

### Scenario: 触发连续工具失败/迭代上限终止时不应执行 StopHook
**Given** 本轮因保护机制提前终止（非正常完成）  
**When** Agent 返回终止说明  
**Then** StopHookRegistry 不应执行  
**And** 最终响应不应拼接 Hook 输出

## Feature: StopHook 执行顺序与隔离

### Scenario: 多个 Hook 注册后应按 LIFO 顺序执行
**Given** 已注册 `hook-first`、`hook-second`、`hook-third`  
**When** 调用 `executeAll(context)`  
**Then** 执行顺序应为 `third -> second -> first`  
**And** 返回结果顺序应与执行顺序一致

### Scenario: 单个 Hook 抛错时其余 Hook 仍应继续执行
**Given** 三个 Hook 中间一个执行时抛出异常  
**When** 执行 `executeAll(context)`  
**Then** 失败 Hook 应被隔离处理  
**And** 其余 Hook 结果仍应正常返回

### Scenario: 同名 Hook 重复注册时应覆盖旧实现
**Given** 连续两次以同名注册不同 Hook 函数  
**When** 执行 `executeAll(context)`  
**Then** 仅最新注册的 Hook 实现应生效  
**And** 旧实现不应再被调用

## Feature: StopHookContext 完整性

### Scenario: StopHookContext 应包含 cwd/messages/finalResponse
**Given** Agent 正常完成一次对话  
**When** Hook 接收上下文  
**Then** `cwd` 应等于当前进程目录  
**And** `messages` 与 `finalResponse` 应与本次对话结果一致

### Scenario: 非持久化运行时 StopHookContext.sessionId 应为 null
**Given** Runner 未配置 `session/sessionId/sessionsDir`  
**When** Hook 被触发  
**Then** `sessionId` 应为 `null`  
**And** 上下文其余字段仍应完整可用

## Feature: Offload 后阈值告警

### Scenario: 卸载后仍超阈值时应输出警告并继续流程
**Given** 上下文卸载后 `stillExceedsThreshold=true`  
**When** Agent 继续执行后续轮次  
**Then** 日志应包含 `Context still exceeds threshold` 警告  
**And** 主流程不应因该警告中断

## 备注
- 本分片聚焦“收敛终态行为”，确保 Hook 触发时机、顺序与容错在复杂执行链路下保持稳定。  
- 文件行数需保持小于等于 1000；后续超限请创建 `01-p0-core-runtime-part10.md`。
