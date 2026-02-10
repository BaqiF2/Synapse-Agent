# P3 稳定性与体验保障 E2E BDD（part03）

## 范围
- Context offload/compact 的触发边界
- 历史协议清洗（tool protocol sanitizer）
- Session 用量统计与展示稳定性
- Stop Hook 执行器行为

## Feature: Context offload 触发规则

### Scenario: token 低于阈值时不执行卸载
**Given** `ContextManager.offloadThreshold` 高于当前历史 token  
**When** 调用 `offloadIfNeeded(messages)`  
**Then** `offloadedCount` 应为 `0`  
**And** 返回消息应与输入一致

### Scenario: token 达到阈值时替换 tool 内容为路径引用
**Given** 历史中包含超长 `tool` 消息文本  
**And** 当前 token 超过 offload 阈值  
**When** 调用 `offloadIfNeeded(messages)`  
**Then** 目标 tool 消息应被替换为 `Tool result is at: <path>`

### Scenario: 仅扫描前 `scanRatio` 区间消息
**Given** `scanRatio=0.5` 且前后半区都存在 tool 消息  
**When** 调用 `offloadIfNeeded(messages)`  
**Then** 仅前半区满足条件的 tool 消息会被 offload

### Scenario: 短 tool 输出不应卸载
**Given** tool 文本长度小于等于 `minChars`  
**When** 调用 `offloadIfNeeded(messages)`  
**Then** 该消息应保持原样  
**And** `offloadedCount` 不增加

### Scenario: 已经是路径引用的 tool 消息不重复卸载
**Given** tool 消息内容以 `Tool result is at:` 开头  
**When** 调用 `offloadIfNeeded(messages)`  
**Then** 该消息应保持不变

### Scenario: 卸载后仍超阈值时设置标记
**Given** offload 完成后 token 仍高于阈值  
**When** `offloadIfNeeded(messages)` 返回结果  
**Then** `stillExceedsThreshold` 应为 `true`

## Feature: Context compaction 触发规则

### Scenario: offload 后仍超阈值且释放不足时触发 compact
**Given** `stillExceedsThreshold=true` 且 `freedTokens < compactTriggerThreshold`  
**And** compact 冷却期已满足  
**When** `ContextOrchestrator.offloadIfNeeded(...)` 执行  
**Then** 应调用 `ContextCompactor.compact(...)`

### Scenario: offload 释放已足够时不触发 compact
**Given** `stillExceedsThreshold=true` 但 `freedTokens >= compactTriggerThreshold`  
**When** 执行 `offloadIfNeeded(...)`  
**Then** 不应调用 compact

### Scenario: 已不超阈值时不触发 compact
**Given** `stillExceedsThreshold=false`  
**When** 执行 `offloadIfNeeded(...)`  
**Then** 不应调用 compact

### Scenario: 冷却期内禁止重复 compact
**Given** 上一次 compact 尝试发生在最近 `compactCooldownSteps` 内  
**When** 再次执行 `offloadIfNeeded(...)`  
**Then** 不应再次触发 compact

### Scenario: compact 成功后应更新历史并发出 compact 事件
**Given** `forceCompact()` 返回 `success=true`  
**When** AgentRunner 执行强制压缩  
**Then** `history` 应替换为压缩后消息  
**And** 会话文件应被 rewrite  
**And** 应触发 `compact` 事件

## Feature: 工具协议历史清洗

### Scenario: 恢复会话时清除悬空 assistant toolCalls
**Given** 历史中存在 assistant toolCalls 但缺失对应 tool 消息  
**When** AgentRunner 运行新请求前执行 sanitize  
**Then** 悬空 toolCalls 应被移除  
**And** 后续请求可正常完成

### Scenario: tool arguments 非法 JSON 时整段工具序列被清理
**Given** assistant toolCall.arguments 不是合法对象 JSON 字符串  
**When** 执行 sanitizer  
**Then** 对应 assistant/tool 序列应被移除  
**And** 不应向上游模型回放畸形协议

### Scenario: 孤立 tool 消息应被删除
**Given** 历史中出现没有上游 assistant toolCall 对应的 tool 消息  
**When** 执行 sanitizer  
**Then** 该孤立 tool 消息应被删除

## Feature: Session Usage 统计稳定性

### Scenario: 空会话 cost 输出应显示 0 值
**Given** 新建空 `SessionUsage`  
**When** 调用 `formatCostOutput(usage)`  
**Then** 输出应为 `Token: 0 in / 0 out ... Cost: $0.00`

### Scenario: 未配置定价时 cost 输出为 N/A
**Given** 模型无 pricing 配置且已有 usage round  
**When** 调用 `formatCostOutput(usage)`  
**Then** 输出中的 `Cost` 应为 `N/A`

### Scenario: usage rounds 超过上限时仅保留最近 N 轮
**Given** 连续累积超过 `MAX_ROUNDS_KEPT` 的 usage 轮次  
**When** 调用 `accumulateUsage` 完成累积  
**Then** `rounds.length` 应被截断到上限  
**And** total 字段仍保留完整累计值

## Feature: Stop Hook 执行器

### Scenario: enabled=false 时不加载也不执行 hooks
**Given** `StopHookExecutor.enabled=false`  
**When** 执行 `init()` 与后续 run 收尾  
**Then** 不应加载 stop hooks  
**And** 最终响应不应追加 hook 内容

### Scenario: enabled=true 且 hooks 返回消息时追加 marker
**Given** `stopHookRegistry.executeAll` 返回非空 message 列表  
**When** 调用 `executeAndAppend(finalResponse, context)`  
**Then** 最终文本应包含 `STOP_HOOK_MARKER`  
**And** marker 后应包含 hook 消息正文

### Scenario: hooks 返回空消息时保持原响应
**Given** hook 返回空或全空白 message  
**When** 调用 `executeAndAppend(...)`  
**Then** 应返回原始 `finalResponse` 不变

### Scenario: onProgress 回调异常不应中断主流程
**Given** onMessagePart 回调抛出异常  
**When** hook 执行中调用 `emitProgress`  
**Then** 异常应被捕获并记录 warning  
**And** 主流程继续执行

## 备注
- 本文件补充“高负载与异常场景下系统仍可解释、可恢复”的验证点。  
- 文件行数需保持小于等于 1000；后续超限请创建 `04-p3-reliability-ux-part04.md`。
