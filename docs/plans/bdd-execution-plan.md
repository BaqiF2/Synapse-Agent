# BDD-Driven Development Execution Plan

> Generated: 2026-02-18
> PRD: `docs/requirements/2026-02-18-architecture-refactor-prd.md`
> Architecture: `docs/architecture/2026-02-18-architecture-refactor-design.md`
> Tech Stack: `docs/architecture/2026-02-18-architecture-refactor-tech-stack.md`

## Project Context

| Item | Value |
|------|-------|
| Project | Synapse Agent 架构模块化重构 |
| Language | TypeScript ^5.0 |
| Runtime | Bun 1.3.9 |
| Build Tool | Bun (built-in) |
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
Arch test:          bun run test:arch
Validate all:       bun run validate
Source root:        src/
Test root:          tests/
```

## Walking Skeleton Status

- [x] 项目目录结构（所有模块目录已创建）
- [x] package.json（所有依赖已安装）
- [x] tsconfig.json（严格模式配置）
- [x] eslint.config.js（Flat Config）
- [x] `src/common/` 模块（logger, errors, constants）
- [x] `src/core/types.ts`（AgentConfig, AgentTool, ToolResult, AgentEvent 类型）
- [x] `src/core/event-stream.ts`（EventStream 基础实现）
- [x] `src/core/messages.ts`（convertToLlm 基础实现）
- [x] `src/core/index.ts`（公共导出）
- [x] `src/providers/types.ts`（LLMProvider, LLMStream, GenerateParams 接口）
- [x] `src/tools/operations/types.ts`（FileOperations, BashOperations 接口）
- [x] `.dependency-cruiser.cjs`（依赖规则配置）
- [x] `.dependency-cruiser-known-violations.json`（已知违规基线）
- [x] `.github/workflows/ci.yml`（CI 流水线）
- [x] 单元测试基线（830 pass）
- [x] 集成测试基线（2 pass）
- [x] `src/core/agent-loop.ts`（Agent Loop 主循环 — 已实现）
- [x] `src/providers/anthropic/`（Anthropic Provider 实现 — 已实现）
- [x] `src/providers/openai/`（OpenAI Provider 实现 — 已实现）
- [x] `src/providers/google/`（Google Provider 实现 — 已实现）
- [x] `src/tools/operations/local-file-ops.ts`（本地文件操作 — 已实现）
- [x] `src/tools/operations/local-bash-ops.ts`（本地命令执行 — 已实现）

## Feature Execution Order

> 所有 8 个功能均为 PRD Must 优先级。按依赖关系和 F-ID 排序。
> 基础模块优先（core → providers → tools），上层模块后续（skills → sub-agents → module-boundaries）。

### Phase 1: Must Features — 基础模块层

| # | Feature | Module | Scenarios | Status |
|---|---------|--------|-----------|--------|
| 1 | F-001 EventStream 事件系统 | core | 10 | Done |
| 2 | F-002 Agent Core 接口抽象 | core | 5 | Done |
| 3 | F-004 两层消息系统 | core | 10 | Done |
| 4 | F-003 统一 LLM Provider 接口 | providers | 10 | Done |
| 5 | F-005 工具可插拔操作 | tools | 9 | Done |

### Phase 2: Must Features — 上层模块层

| # | Feature | Module | Scenarios | Status |
|---|---------|--------|-----------|--------|
| 6 | F-006 SubAgent 同步重构 | sub-agents | 5 | Done |
| 7 | F-007 技能系统多 Provider 适配 | skills | 3 | Done |
| 8 | F-008 模块导出边界 | 全局 | 5 | Done |

**Total: 8 features, 59 BDD scenarios**

## Feature Dependencies

```
Phase 1 — 基础模块（无跨模块依赖，可按顺序独立实现）:

  F-001 EventStream ──┐
  F-002 Agent Core ───┤──► core 模块完成
  F-004 消息系统 ─────┘
                         │
                         ▼
  F-003 LLM Provider ──► providers 模块完成
                         │
                         ▼
  F-005 可插拔操作 ────► tools 模块完成

Phase 2 — 上层模块（依赖 Phase 1 完成）:

  core + providers + tools
         │
         ├──► F-006 SubAgent（依赖 core + providers + tools）
         ├──► F-007 技能多 Provider（依赖 core + providers）
         └──► F-008 模块边界（验证所有模块的导出规则）
```

**关键依赖:** F-006/F-007 依赖 F-001~F-005 提供的核心接口。F-008 作为最后的架构验证，确认所有模块边界正确。

## BDD Review Notes

1. **F-001 EventStream 事件系统** — Walking Skeleton 已实现 EventStream 基础类和 5 个测试。需补充 AbortSignal 中止、错误事件、连续失败、上下文管理、thinking 事件等高级场景。事件类型枚举已在 core/types.ts 完整定义。
2. **F-002 Agent Core 接口抽象** — AgentConfig 等类型已在 core/types.ts 定义。需实现 Zod 验证 schema、工具名冲突检测、Agent Loop 主循环。注意 AgentTool.execute() 不得抛出异常的约束。
3. **F-004 两层消息系统** — convertToLlm() 已有基础实现和 9 个测试。需补充"声明合并扩展"场景和"纯函数验证"场景。注意 skill_search 和 context_summary 的转换规则。
4. **F-003 统一 LLM Provider 接口** — 最复杂的功能，需实现 3 个 Provider（Anthropic/OpenAI/Google）的适配器。接口类型已在 providers/types.ts 定义。每个 Provider 约 200-400 行转换代码。不需要真实 API 调用，用 Mock SDK 测试。
5. **F-005 工具可插拔操作** — Operations 接口已在 tools/operations/types.ts 定义。需实现 LocalFileOperations 和 LocalBashOperations。BashRouter 三层路由的集成测试需要 Mock Operations。
6. **F-006 SubAgent 同步重构** — SubAgent 使用 Agent Core 接口创建，产生独立 EventStream。工具权限隔离通过过滤 AgentConfig.tools 实现。
7. **F-007 技能系统多 Provider 适配** — SkillGenerator/SkillEnhancer 接收 LLMProvider 接口而非 AnthropicClient。Provider 不支持 embedding 时降级为文本匹配。
8. **F-008 模块导出边界** — 架构适应度函数（dependency-cruiser）已配置。验证 index.ts 导出和依赖方向。部分场景可通过运行 `bun run test:arch` 直接验证。

9. **无矛盾或阻塞问题发现。** BDD 场景与 PRD 规范一致。

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
1. core/      — 类型定义、EventStream、消息系统、Agent Loop（纯业务逻辑，无框架依赖）
2. providers/ — LLMProvider 接口实现（依赖各 SDK，不依赖 core）
3. tools/     — Operations 接口实现、处理器（依赖 core 类型）
4. skills/    — 技能系统适配（依赖 core + providers）
5. sub-agents/ — SubAgent 管理（依赖 core + providers + tools）
6. cli/       — CLI 消费者（依赖所有模块 — 不在本次重构范围内）
```

## Test Classification Rules

| BDD `given` Pattern | Test Type | Location |
|---------------------|-----------|----------|
| 纯输入验证、业务规则、类型检查 | Unit test | `tests/unit/<module>/` |
| EventStream 事件序列、消息转换 | Unit test | `tests/unit/core/` |
| Provider SDK 格式转换（Mock SDK） | Unit test | `tests/unit/providers/` |
| Agent Loop 完整流程（Mock Provider + Mock Tools） | Integration test | `tests/integration/core/` |
| Provider 实际 API 调用（需要 API Key） | Integration test | `tests/integration/providers/` |
| Operations 真实文件系统操作 | Integration test | `tests/integration/tools/` |
| CLI 完整交互流程 | E2E test | `tests/e2e/cli/` |
| 依赖方向和模块边界验证 | Architecture test | `bun run test:arch` |

### E2E Test Environment Requirements

本项目是 CLI 框架，E2E 测试使用 node-pty 模拟终端交互。
- E2E 测试不需要外部服务或 API Key（使用 Mock 配置）
- E2E 测试是自包含的 — 无需外部环境设置

## Coverage Targets

| Module | Line Coverage | Branch Coverage |
|--------|--------------|-----------------|
| core | >= 80% | >= 70% |
| providers | >= 60% | >= 50% |
| tools | >= 60% | >= 50% |
| skills | >= 60% | >= 50% |
| sub-agents | >= 60% | >= 50% |
| common | >= 80% | >= 70% |
| cli | >= 40% | >= 30% |
| Overall | >= 70% | >= 60% |

## Progress Log

> Append-only log. Each entry records a feature status change during the development cycle.

| Feature | From | To | Note |
|---------|------|----|------|
| F-001 EventStream 事件系统 | Pending | Done | 10/10 scenarios, 16 tests |
| F-002 Agent Core 接口抽象 | Pending | Done | 5/5 scenarios, 12 tests |
| F-004 两层消息系统 | Pending | Done | 10/10 scenarios, 17 tests |
| F-003 统一 LLM Provider 接口 | Pending | Done | 10/10 scenarios, 28 tests |
| F-005 工具可插拔操作 | Pending | Done | 9/9 scenarios, 20 tests |
| F-006 SubAgent 同步重构 | Pending | Done | 5/5 scenarios, 59 tests |
| F-007 技能系统多 Provider 适配 | Pending | Done | 3/3 scenarios, 6 tests |
| F-008 模块导出边界 | Pending | Done | 5/5 scenarios, 25 tests |

## Final Verification Checklist

- [x] All 57 BDD scenarios have corresponding tests
- [x] All unit tests pass (950 tests)
- [x] All integration tests pass
- [x] Architecture tests pass (`bun run test:arch`)
- [x] Code style checks pass (`bun run lint`)
- [x] Type checks pass (`bun run typecheck`)
- [ ] Coverage meets thresholds
- [x] BDD JSON files updated (`passes: true`, `overallPass: true`)
- [x] All commits follow Conventional Commits format
