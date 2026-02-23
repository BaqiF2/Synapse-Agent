# ADR-009: Task 摘要插入点 — SubAgent 返回口

## Status

Accepted

## Date

2026-02-23

## Context

`task:*` 返回原文写回主 Agent 会导致上下文快速膨胀，触发上游 context window 超限。PRD 要求：
- 仅作用于 `task:*`
- 始终单句摘要
- `countTokens` 口径 `<= 4096`
- 摘要失败可降级并兜底

候选插入点：
1. `AgentRunner.processToolResults` 写回前
2. `TaskCommandHandler` 返回前
3. `SubAgentExecutor.execute` 返回前

## Decision

选择 **Option 3：在 `SubAgentExecutor.execute` 返回前做摘要**。

## Rationale

1. 语义边界最清晰：SubAgent 输出在离开子代理边界前被压缩。 
2. 天然限定作用域：只影响 `task:*`，不影响 `read/write/edit/bash`。 
3. 与主 Agent 写回链路解耦：主 Agent 仍按既有协议处理字符串结果。

## Consequences

### Positive
- 改动面小，回归风险低。
- 容易对 `task:*` 场景做统一测试。

### Negative
- 摘要逻辑位于 sub-agent 层，若未来需要“所有 tool 统一策略”需再上提。

## Validation

- [ ] BDD 场景验证：`task:*` 成功/失败均单句
- [ ] `countTokens(summary) <= 4096`
- [ ] 非 `task:*` 工具行为不变
