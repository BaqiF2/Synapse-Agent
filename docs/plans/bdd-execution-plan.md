# BDD-Driven Development Execution Plan

> Generated: 2026-02-23
> PRD: `docs/requirements/2026-02-23-task-return-summary-prd.md`
> Architecture: `docs/architecture/architecture.md`
> Tech Stack: `docs/architecture/2026-02-23-task-return-summary-tech-stack.md`

## Project Context

| Item | Value |
|------|-------|
| Project | Synapse Agent |
| Language | TypeScript (^5) |
| Framework | Bun Runtime + 模块化单体架构 |
| Build Tool | Bun (`bun run ...`) |
| Test Framework | Bun Test (unit/integration/e2e) |
| HTTP Mock | N/A（本特性主要为内部逻辑，不依赖外部 HTTP） |
| Architecture Test | dependency-cruiser + validate_architecture.py |
| Coverage Tool | Bun Test coverage (`bun run test:cov`) |

## Command Cheat Sheet

```text
Build:              bun run typecheck
Test (all):         bun run test
Test (unit only):   bun run test:unit
Test (integ only):  bun run test:integration
Test (single):      bun test <test-file-path>
Coverage:           bun run test:cov
Source root:        src/
Test root:          tests/
```

## Walking Skeleton Status

- [x] CLI 与 Agent 主循环可运行（`bun run start` / `bun run chat`）
- [x] LLM Provider 抽象已存在（Anthropic/OpenAI/Google）
- [x] Task 子代理链路已存在（`task:*` -> `TaskCommandHandler` -> `SubAgentExecutor`）
- [x] Token 计数能力已存在（`src/shared/token-counter.ts`）
- [x] 基线测试通过（2026-02-23：`typecheck`/`test`/`test:integration`）
- [ ] 结构校验脚本 `test:arch:structure` 与当前目录约定存在历史偏差（非本特性阻塞项）

## Feature Execution Order

### Phase 0: Infrastructure Verification

> 当前需求不需要新增基础设施模块，Phase 0 仅执行基线验证。

| # | Feature | Module | Scenarios | Status |
|---|---------|--------|-----------|--------|
| 0 | Baseline Verification | `core/sub-agents`, `tools/commands` | 0 | Done |

### Phase 1: Must Features

| # | Feature | Module | MCP Tool | Scenarios | Status |
|---|---------|--------|----------|-----------|--------|
| 1 | F-001~F-004 TaskReturnSummary Core Flow | `src/core/sub-agents/sub-agent-core.ts` + `src/tools/commands/task-handler.ts` | `N/A (repo code change)` | 6 | Done |

### Phase 2: Should Features

| # | Feature | Module | MCP Tool | Scenarios | Status |
|---|---------|--------|----------|-----------|--------|
| 1 | F-005 可观测日志增强 | `src/core/sub-agents/sub-agent-core.ts` + `src/shared/file-logger.ts` | `N/A (repo code change)` | 0 (BDD 待补) | Pending |

### Phase 3: Could Features

| # | Feature | Module | MCP Tool | Scenarios | Status |
|---|---------|--------|----------|-----------|--------|
| - | None | - | - | 0 | - |

**Total: 2 features, 6 BDD scenarios（当前 BDD 文件）**

## Feature Dependencies

```text
Phase 0 Baseline
   |
   v
Phase 1 F-001~F-004 (摘要主流程)
   |
   v
Phase 2 F-005 (日志增强，依赖 Phase 1 中摘要执行路径)
```

**Key dependency:** F-005 的日志字段依赖 F-001~F-004 完成后的摘要执行结果（rawTokens/summaryTokens/truncated/fallbackUsed）。

## BDD Review Notes

1. **F-001~F-004 TaskReturnSummary Core Flow** — BDD 场景覆盖了单句摘要、硬截断、降级兜底、作用域隔离，描述完整可执行。
2. **F-005 可观测日志增强** — PRD 为 Should，但当前 BDD JSON 未包含日志断言场景（覆盖缺口，建议在实现前补 1 个 scenario）。
3. **BDD 文件与 PRD 粒度不一致** — PRD 5 个 feature 被合并为 1 个 BDD feature 文件；不阻塞开发，但会影响“1:1 映射”审计可读性。

## Per-Feature Development Cycle

每个特性遵循 BDD-guided TDD：

```text
1. RED      — 先把 BDD 场景翻译为失败测试
2. GREEN    — 写最小生产代码让测试通过
3. REFACTOR — 清理结构，保持测试全绿
4. VERIFY   — 场景与测试逐条映射验证
5. COMMIT   — 单特性单提交
6. REPORT   — 汇报并进入下一个特性
```

## Layered Implementation Order

```text
1. core/agent + core/sub-agents （摘要主逻辑）
2. tools/commands （task:* 路由与作用域保护）
3. shared/ （日志与token计数复用）
```

## Test Classification Rules

| BDD `given` Pattern | Test Type | Location |
|---------------------|-----------|----------|
| 纯逻辑规则（单句化、截断、兜底） | Unit test | `tests/unit/sub-agents/*.test.ts` |
| task 与非 task 作用域隔离 | Unit test | `tests/unit/tools/*.test.ts` |
| 需要验证主循环写回行为 | Integration test | `tests/integration/core/*.test.ts` |
| 日志字段输出验证（F-005） | Unit/Integration（按现有日志测试模式） | `tests/unit/core/*.test.ts` 或 `tests/integration/core/*.test.ts` |

## Coverage Targets

| Module | Line Coverage | Branch Coverage |
|--------|--------------|-----------------|
| core / shared | >= 80% | >= 70% |
| tools / providers / skills | >= 60% | >= 50% |
| cli | >= 40% | >= 30% |
| Overall | >= 70% | >= 60% |

## Progress Log

> Append-only log. Each entry records a feature status change during the development cycle.

| Feature | From | To | Note |
|---------|------|----|------|
| Baseline Verification | Pending | Done | `bun run typecheck`, `bun run test`, `bun run test:integration` all pass |
| F-001~F-004 TaskReturnSummary Core Flow | Pending | In Progress | Started RED phase: add scenario tests for single-sentence summary, hard token cap, fallback, and task-only scope |
| F-001~F-004 TaskReturnSummary Core Flow | In Progress | Done | GREEN complete: implemented summary pipeline in `SubAgentExecutor` and added `task-return-summary` tests (all pass) |

## Final Verification Checklist

- [ ] All 6 BDD scenarios have corresponding tests
- [ ] All tests pass (`bun run test`)
- [ ] Architecture tests pass (`bun run test:arch`)
- [ ] Code style checks pass (`bun run lint`)
- [ ] Coverage meets thresholds (`bun run test:cov`)
- [ ] BDD JSON files updated (`passes: true`, `overallPass: true`)
- [ ] Commits follow Conventional Commits
- [ ] F-005 logging scenario coverage gap resolved (add BDD scenario or documented defer)
