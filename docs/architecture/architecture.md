# Synapse Agent 架构设计文档

## 1. 架构概览

### 1.1 系统简介

Synapse Agent 是一个基于统一 Bash 抽象的 CLI 智能体框架，核心流程是：主 Agent 调用 LLM 生成工具调用，工具执行后将结果回灌会话历史并驱动下一轮推理。当前项目采用模块化单体架构，强调模块边界、依赖规则和可测试性。

### 1.2 架构风格

- 架构风格：模块化单体（Modular Monolith）
- 关键约束：
  - Provider 层与 Core 层解耦
  - Tools 不得反向依赖 CLI
  - 通过 dependency-cruiser 执行依赖规则

### 1.3 技术栈摘要

| 类别 | 选型 | 备注 |
|------|------|------|
| Runtime | Bun | 内置 test，脚本统一由 bun run 执行 |
| 语言 | TypeScript (ESM) | `strict` 开启 |
| LLM SDK | Anthropic/OpenAI/Google 官方 SDK | 多 Provider 抽象 |
| 工具集成 | MCP SDK | Extension Shell |
| 测试 | Bun Test | unit/integration/e2e |
| 架构检查 | dependency-cruiser + validate_architecture.py | 依赖与结构双重检查 |

## 2. 目录结构与模块边界

### 2.1 目录结构（当前仓库）

```text
src/
  cli/
  core/
    agent/
    context/
    session/
    sub-agents/
  providers/
    anthropic/
    openai/
    google/
  shared/
    config/
    sandbox/
  skills/
  tools/
    commands/
    converters/
    operations/
  types/

tests/
  unit/
  integration/
  e2e/
```

### 2.2 依赖与分层规则

基于 `.dependency-cruiser.cjs` 与当前实现约束：

1. `core` 不依赖 `cli/tools/skills/providers/config`。
2. `providers` 不依赖 `core/cli/tools/skills/sub-agents/config`。
3. `tools` 不依赖 `cli/skills/sub-agents`（通过接口注入消除循环依赖）。
4. 禁止循环依赖。

### 2.3 模块间通信

| 源模块 | 目标模块 | 通信方式 | 说明 |
|--------|---------|---------|------|
| `cli` | `core/agent` | `AgentRunner` 调用 | 驱动主循环 |
| `core/agent` | `providers/*` | `generateFn + LLMClient` | 请求 LLM |
| `core/agent` | `tools/*` | `Toolset` | 执行工具调用 |
| `tools/task-handler` | `core/sub-agents` | `ISubAgentExecutor` | 执行 `task:*` 子代理 |

## 3. PRD Feature → 模块映射（当前需求）

PRD: `docs/requirements/2026-02-23-task-return-summary-prd.md`

| Feature ID | Feature Name | 主要实现模块 | 主要测试位置 |
|------------|-------------|-------------|-------------|
| F-001 | Task 返回强制单句摘要 | `src/core/sub-agents/sub-agent-core.ts` | `tests/unit/sub-agents/` |
| F-002 | 4096 token 硬限制与截断 | `src/core/sub-agents/sub-agent-core.ts`, `src/shared/token-counter.ts` | `tests/unit/sub-agents/` |
| F-003 | 摘要降级与兜底 | `src/core/sub-agents/sub-agent-core.ts` | `tests/unit/sub-agents/` |
| F-004 | 范围隔离（仅 task:*） | `src/tools/commands/task-handler.ts` + `src/core/sub-agents/sub-agent-core.ts` | `tests/unit/tools/handlers/` |
| F-005 | 可观测日志 | `src/core/sub-agents/sub-agent-core.ts`, `src/shared/file-logger.ts` | `tests/unit/sub-agents/` |

## 4. 测试架构

### 4.1 测试金字塔

| 测试类型 | 覆盖层 | 工具 | 触发 |
|----------|-------|------|------|
| Unit | 纯逻辑与模块行为 | `bun test tests/unit/` | 本地/CI |
| Integration | 跨模块协作 | `bun test tests/integration/` | CI |
| E2E | CLI 全流程 | `bun test tests/e2e/` | CI/专项 |

### 4.2 覆盖率目标

| 层/模块 | 行覆盖率目标 |
|--------|-------------|
| core / shared | >= 80% |
| tools / providers / skills | >= 60% |
| cli | >= 40% |

### 4.3 命令清单（BDD 开发会话使用）

- Build: `bun run typecheck`
- Test (all): `bun run test`
- Test (unit): `bun run test:unit`
- Test (integration): `bun run test:integration`
- Test (single): `bun test <test-file-path>`
- Coverage: `bun run test:cov`
- Architecture deps: `bun run test:arch`
- Architecture structure: `bun run test:arch:structure`
- Source root: `src/`
- Test root: `tests/`

## 5. 架构适应度函数

### 5.1 依赖规则检查

- 工具：dependency-cruiser
- 配置：`.dependency-cruiser.cjs`
- 执行：`bun run test:arch`

### 5.2 结构检查

- 工具：`validate_architecture.py`
- 配置：`architecture-config.json`
- 执行：`bun run test:arch:structure`

## 6. CI/CD 质量门禁

基于 `.github/workflows/ci.yml`：

1. `bun install --frozen-lockfile`
2. `bun run lint`
3. `bun run typecheck`
4. `bun run test:unit`
5. `bun run test:integration`
6. `bun run test:arch`
7. `bun run test:cov`

## 7. Walking Skeleton 基线状态

检查时间：2026-02-23

- `bun run typecheck`：PASS
- `bun run test:unit`：PASS（1963 通过 / 0 失败）
- 结论：在当前仓库状态下，已具备进入 BDD feature 实施的基础能力。

## 8. ADR 索引

| ADR | 文件 |
|-----|------|
| ADR-001 | `docs/architecture/adr/2026-02-18-ADR-001-runtime-and-language.md` |
| ADR-002 | `docs/architecture/adr/2026-02-18-ADR-002-llm-provider-sdk-strategy.md` |
| ADR-003 | `docs/architecture/adr/2026-02-18-ADR-003-google-llm-sdk.md` |
| ADR-004 | `docs/architecture/adr/2026-02-18-ADR-004-validation-library.md` |
| ADR-005 | `docs/architecture/adr/2026-02-18-ADR-005-test-framework.md` |
| ADR-006 | `docs/architecture/adr/2026-02-18-ADR-006-mcp-sdk.md` |
| ADR-007 | `docs/architecture/adr/2026-02-18-ADR-007-logging-framework.md` |
| ADR-008 | `docs/architecture/adr/2026-02-18-ADR-008-architecture-fitness-functions.md` |
| ADR-009 | `docs/architecture/adr/2026-02-23-ADR-009-task-summary-placement.md` |
