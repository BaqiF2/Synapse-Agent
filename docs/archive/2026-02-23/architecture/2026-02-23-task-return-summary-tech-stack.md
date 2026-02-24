# Confirmed Tech Stack: Task 返回主 Agent 摘要压缩

## Document Info

| Field | Value |
|-------|-------|
| PRD Reference | `docs/requirements/2026-02-23-task-return-summary-prd.md` |
| Created | 2026-02-23 |
| Status | Confirmed |
| Versions Verified | 2026-02-23（基于仓库 `package.json` / `bun.lock`） |

## NFR 驱动摘要

| NFR / 约束 | 技术驱动 |
|-----------|---------|
| task 返回必须 `<=4096 token` | 复用现有 `js-tiktoken` 计数能力，避免新增 tokenizer |
| 失败时必须可恢复返回 | 保留当前 LLM Provider + 本地降级路径，不引入外部摘要服务 |
| 仅作用 `task:*`，不得影响其他工具 | 在现有 `SubAgentExecutor` / `TaskCommandHandler` 路径内改造 |
| 可观测性增强（不入 history） | 复用当前 `pino` 日志基础设施 |

## Development Stack

### Runtime / Language

| Component | Technology | Version | Source | Decision |
|-----------|------------|---------|--------|----------|
| Runtime | Bun | 1.3.8 (`@types/bun`), `.bun-version`=1.x | `package.json` / `.bun-version` | 维持现状 |
| Language | TypeScript | ^5 | `package.json` peerDependencies | 维持现状 |
| Module System | ESM | `"type":"module"` | `package.json` | 维持现状 |

### Core Libraries

| Component | Technology | Version | Source | Decision |
|-----------|------------|---------|--------|----------|
| Validation | zod | ^4.3.6 | `package.json` | 维持现状 |
| Token Counter | js-tiktoken | ^1.0.21 | `package.json` | 复用作为 4096 上限口径 |
| Logging | pino + pino-pretty | ^10.3.1 / ^13.1.3 | `package.json` | 维持现状并扩展字段 |

### LLM / Tooling SDK

| Component | Technology | Version | Source | Decision |
|-----------|------------|---------|--------|----------|
| Anthropic SDK | @anthropic-ai/sdk | ^0.72.1 | `package.json` | 维持现状 |
| OpenAI SDK | openai | ^6.22.0 | `package.json` | 维持现状 |
| Google SDK | @google/genai | ^1.41.0 | `package.json` | 维持现状 |
| MCP SDK | @modelcontextprotocol/sdk | ^1.25.3 | `package.json` | 维持现状 |

## Testing Stack

| Component | Technology | Version | Source | Decision |
|-----------|------------|---------|--------|----------|
| Unit / Integration / E2E Runner | Bun Test | Bun built-in | `package.json` scripts | 维持现状 |
| Type Check | `tsc --noEmit` | TypeScript ^5 | `package.json` scripts | 维持现状 |
| Architecture Fitness | dependency-cruiser | ^17.3.8 | `package.json` scripts | 维持现状 |
| Structure Validation | `validate_architecture.py` | in-repo script | `package.json` scripts | 维持现状 |

## DevOps / CI Stack

| Component | Technology | Version / Mode | Source | Decision |
|-----------|------------|----------------|--------|----------|
| CI | GitHub Actions | ubuntu-latest + setup-bun@v2 | `.github/workflows/ci.yml` | 维持现状 |
| Quality Gates | lint + typecheck + unit + integration + arch + coverage | workflow steps | `.github/workflows/ci.yml` | 维持现状 |

## Architecture Decision Records

| ADR | Title | Status |
|-----|-------|--------|
| `docs/architecture/adr/2026-02-18-ADR-001-runtime-and-language.md` | Runtime 与核心语言选择 — Bun + TypeScript | Accepted |
| `docs/architecture/adr/2026-02-18-ADR-005-test-framework.md` | 测试框架 — Bun Test | Accepted |
| `docs/architecture/adr/2026-02-18-ADR-007-logging-framework.md` | 日志框架 — pino | Accepted |
| `docs/architecture/adr/2026-02-23-ADR-009-task-summary-placement.md` | Task 摘要插入点 — SubAgent 返回口 | Accepted |

## Compatibility / Risk Notes

| Item | Assessment | Mitigation |
|------|------------|------------|
| `countTokens` 与上游 provider 真实 token 口径可能有偏差 | 可接受（PRD 已指定统一口径） | 采用硬截断 + 最终再校验 |
| LLM 摘要可能超时/失败 | 中等 | 本地首句降级 + 固定兜底文案 |
| 直接截断可能损失语义 | 已接受 | 本期优先稳定性与防超窗 |

## Final Confirmation

本技术栈采用“**最小变更、复用现有栈**”策略：不引入新基础设施，仅在现有 Bun + TypeScript + Bun Test + Provider SDK 架构下实现 `task:*` 返回压缩能力，可直接进入 BDD 开发阶段。
