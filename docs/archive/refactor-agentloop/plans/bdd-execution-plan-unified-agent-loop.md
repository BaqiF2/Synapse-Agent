# BDD-Driven Development Execution Plan — Agent Loop 统一重构

> Generated: 2026-02-18
> PRD: `docs/requirements/2026-02-18-unified-agent-loop-prd.md`
> Architecture: (无独立文档 — 从现有代码结构和 CLAUDE.md 推导)
> Tech Stack: `docs/architecture/2026-02-18-architecture-refactor-tech-stack.md`

## Project Context

| Item | Value |
|------|-------|
| Project | Synapse Agent — Agent Loop 统一重构 |
| Language | TypeScript ^5.0 |
| Runtime | Bun 1.3.9 |
| Build Tool | Bun (built-in, 无独立构建步骤) |
| Test Framework | Bun Test (兼容 Jest API) |
| Mock Tool | Bun Test 内置 mock (jest.fn/spyOn 兼容) |
| Architecture Test | dependency-cruiser ^17.3.8 |
| Coverage Tool | Bun Test --coverage (内置) |
| Validation | Zod 4.3.6 |

## Command Cheat Sheet

```
Build:              (无独立构建步骤，Bun 直接运行 .ts)
Test (all):         bun test
Test (unit only):   bun test tests/unit/
Test (integ only):  bun test tests/integration/
Test (e2e only):    bun test tests/e2e/
Test (single):      bun test <file-path>
Coverage:           bun test --coverage --coverage-reporter=text
Lint:               bun run lint
Typecheck:          bun run typecheck
Source root:        src/
Test root:          tests/
```

## Walking Skeleton Status

本次是重构（非新建），相关基础设施已完整：

- [x] `src/core/agent-loop.ts` — 核心 Agent Loop（EventStream 版本，当前供 SubAgent 使用）
- [x] `src/core/event-stream.ts` — EventStream 异步事件流
- [x] `src/core/types.ts` — AgentConfig, AgentEvent, AgentTool 等类型定义
- [x] `src/agent/agent-runner.ts` — AgentRunner 类（当前主 Agent 循环，待重构为包装器）
- [x] `src/agent/step.ts` — 单步执行逻辑（工具分组执行）
- [x] `src/tools/handlers/agent-bash/todo/` — TodoList 系统（TodoStore + TodoWrite）
- [x] `src/agent/context-orchestrator.ts` — 上下文 offload/compact 编排
- [x] `src/agent/context-compactor.ts` — LLM 驱动的上下文压缩
- [x] `src/agent/stop-hook-executor.ts` — Stop Hook 执行器
- [x] `src/agent/history-sanitizer.ts` — 历史消息清理（待重构为入口预验证）
- [x] `src/sub-agents/sub-agent-manager.ts` — 子智能体管理
- [x] `tests/unit/` — 单元测试基础设施（1097 pass / 20 fail 基线）
- [x] `tests/integration/` — 集成测试基础设施
- [x] `tests/e2e/` — E2E 测试基础设施

## Feature Execution Order

> PRD 定义 5 个 Must 和 2 个 Should 功能。
> 按依赖关系排序：底层基础先行，上层包装后续。

### Phase 1: Must Features — 核心循环层

| # | Feature | BDD File | Module | Scenarios | Status |
|---|---------|----------|--------|-----------|--------|
| 1 | F-005 滑动窗口失败检测 | sliding-window-failure.json | core | 7 | Done |
| 2 | F-003 TodoList System Reminder 引导 | todo-system-reminder.json | core | 8 | Done |
| 3 | F-002 AgentLoopConfig 配置体系 | agent-loop-config.json | core | 5 | Done |
| 4 | F-001 核心 Agent Loop | core-agent-loop.json | core | 7 | Done |
| 5 | F-004 EventStream 统一事件模型 | event-stream-unified.json | core | 6 | Done |

### Phase 2: Should Features — 外层包装层

| # | Feature | BDD File | Module | Scenarios | Status |
|---|---------|----------|--------|-----------|--------|
| 6 | F-006 AgentRunner 外层包装器 | agent-runner-wrapper.json | agent | 6 | Done |
| 7 | F-007 消息入口预验证 | message-validation.json | core | 6 | Done |

**Total: 7 features, 45 BDD scenarios**

## Feature Dependencies

```
Phase 1 — 核心循环层（按依赖顺序实现）:

  F-005 滑动窗口失败检测 ──┐ (独立模块，无依赖)
                            │
  F-003 TodoList Reminder ──┤ (独立模块，无依赖)
                            │
  F-002 AgentLoopConfig ────┤ (定义配置接口，集成 F-005 和 F-003 的策略)
                            │
                            ▼
  F-001 核心 Agent Loop ────► (核心循环实现，使用 F-002 配置 + F-003 策略 + F-005 检测)
                            │
                            ▼
  F-004 EventStream 统一 ──► (验证核心 loop 的事件发射行为)

Phase 2 — 外层包装层（依赖 Phase 1 完成）:

  核心 loop (F-001~F-005)
         │
         ├──► F-006 AgentRunner 包装器（消费 EventStream，适配回调接口）
         │
         └──► F-007 消息入口预验证（集成到核心 loop 的消息追加路径）
```

**关键依赖:**
- F-001 依赖 F-002（配置接口）、F-003（TodoList 策略）、F-005（失败检测）
- F-004 验证 F-001 的事件行为，必须在 F-001 之后
- F-006 依赖完整的核心 loop（F-001~F-005）
- F-005 和 F-003 可独立实现，作为 utility 模块先行

## BDD Review Notes

1. **F-005 滑动窗口失败检测** — 纯算法模块，环形缓冲区实现。保留现有的 `shouldCountToolFailure` 分类机制。环境变量 `SYNAPSE_FAILURE_WINDOW_SIZE` 和 `SYNAPSE_FAILURE_THRESHOLD` 配置。
2. **F-003 TodoList System Reminder 引导** — 需要移除 `agent-runner.ts:460-475` 的 `hasIncompleteTodos()` 强制逻辑。新逻辑基于 `turnsSinceLastUpdate` 计数器和 TodoStore 的 `onChange` 监听器。环境变量 `SYNAPSE_TODO_STALE_THRESHOLD` 默认 10。
3. **F-002 AgentLoopConfig 配置体系** — 定义统一配置接口，整合 todoStrategy、failureDetection、contextManager、hooks 等可选能力。需要 Zod schema 验证。
4. **F-001 核心 Agent Loop** — 本次重构的核心。需要将 `agent-runner.ts` 的 `executeLoop()` 逻辑重构到 `core/agent-loop.ts`。保留工具分组执行（`groupToolCallsByOrder`）。EventStream 驱动。
5. **F-004 EventStream 统一事件模型** — 验证核心 loop 发射的事件类型和顺序。需要新增 `todo_reminder` 和 `context_compact` 事件类型到 `AgentEvent` 联合类型。
6. **F-006 AgentRunner 外层包装器** — 最大的重构工作。需要将 `AgentRunner` 从独立循环改为消费核心 loop 的 EventStream。保持 `run()`/`step()` 接口不变。涉及 13 个引用文件。
7. **F-007 消息入口预验证** — 替代 `sanitizeHistoryForToolProtocol()`。在消息追加前验证 JSON 格式和 tool_use_id 唯一性。验证失败返回 tool error 而非全量重写。

8. **无矛盾或阻塞问题发现。** BDD 场景与 PRD 规范一致。注意：F-006 涉及大量现有代码重构，需要逐步推进并频繁运行回归测试。

## Per-Feature Development Cycle

Each feature follows BDD-guided TDD:

```
1. RED    — Translate BDD scenarios to failing tests
2. GREEN  — Write minimal production code to pass
3. REFACTOR — Clean up while tests pass
4. VERIFY — Confirm all BDD scenarios covered
5. COMMIT — One atomic commit per feature
6. REPORT — Progress summary, then next feature
```

## Layered Implementation Order

```
1. core/     — 滑动窗口(F-005)、TodoList 策略(F-003)、配置体系(F-002)、核心 loop(F-001)、EventStream 验证(F-004)、消息验证(F-007)
2. agent/    — AgentRunner 包装器(F-006)
3. cli/      — 不在本次重构范围（AgentRunner 接口不变，CLI 层无需改动）
```

## Test Classification Rules

| BDD `given` Pattern | Test Type | Location |
|---------------------|-----------|----------|
| 纯算法（环形缓冲区、计数器） | Unit test | `tests/unit/core/` |
| 配置验证、Zod schema | Unit test | `tests/unit/core/` |
| TodoStore 交互、onChange 监听 | Unit test | `tests/unit/core/` |
| EventStream 事件序列验证 | Unit test | `tests/unit/core/` |
| 核心 loop 完整流程（Mock Provider + Mock Tools） | Integration test | `tests/integration/core/` |
| AgentRunner 包装器（消费 EventStream） | Integration test | `tests/integration/agent/` |
| CLI 完整交互流程 | E2E test | `tests/e2e/` |

### E2E Test Environment Requirements

本项目是 CLI 框架，E2E 测试使用 node-pty 模拟终端交互。
- E2E 测试不需要外部服务或 API Key（使用 Mock 配置）
- E2E 测试是自包含的 — 无需外部环境设置
- 注意：本次重构核心在内部循环逻辑，E2E 行为不应有可见变化

## Coverage Targets

| Module | Line Coverage | Branch Coverage |
|--------|--------------|-----------------|
| core (agent-loop, config, sliding-window, todo-strategy) | >= 80% | >= 70% |
| agent (AgentRunner wrapper) | >= 60% | >= 50% |
| Overall (delta from baseline) | 不低于重构前基线 | 不低于重构前基线 |

## Progress Log

> Append-only log. Each entry records a feature status change during the development cycle.

| Feature | From | To | Note |
|---------|------|----|------|
| F-005 滑动窗口失败检测 | Pending | Done | 7/7 scenarios, 33 assertions (dev-alpha) |
| F-003 TodoList System Reminder 引导 | Pending | Done | 8/8 scenarios, 28 assertions (dev-beta) |
| F-002 AgentLoopConfig 配置体系 | Pending | Done | 5/5 scenarios, 22 assertions (dev-beta) |
| F-001 核心 Agent Loop | Pending | Done | 7/7 scenarios, 72 core tests passing (dev-beta) |
| F-004 EventStream 统一事件模型 | Pending | Done | 6/6 scenarios, 78 core tests passing (dev-beta) |
| F-006 AgentRunner 外层包装器 | Pending | Done | 6/6 scenarios, 199 agent tests passing (dev-alpha) |
| F-007 消息入口预验证 | Pending | Done | 6/6 scenarios, 84 core tests passing (dev-beta) |

## Final Verification Checklist

- [x] All 45 BDD scenarios have corresponding tests
- [x] All unit tests pass
- [x] All integration tests pass
- [ ] Typecheck passes (`bun run typecheck`)
- [ ] Lint passes (`bun run lint`)
- [ ] Architecture tests pass (`bun run test:arch`)
- [ ] Coverage meets thresholds
- [ ] BDD JSON files updated (`passes: true`, `overallPass: true`)
- [x] All commits follow Conventional Commits format
- [x] AgentRunner 对外接口不变（`run()`, `step()` 签名）
- [x] 现有 CLI 功能无回归
