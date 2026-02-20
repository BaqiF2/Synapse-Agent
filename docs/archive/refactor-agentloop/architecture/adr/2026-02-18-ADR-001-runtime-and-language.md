# ADR-001: Runtime 与核心语言选择 — Bun + TypeScript

## Status

Accepted

## Context

Synapse Agent 架构模块化重构需要确定运行时和开发语言。项目当前已使用 Bun + TypeScript，PRD 明确约束"不引入新的构建工具或运行时"。

**PRD Reference**: PRD §5.1 Constraints, NFR-010

**Business Driver**: 技术栈连续性，避免迁移成本

## Decision Drivers

- PRD 明确约束：Bun + TypeScript + Zod，不引入新构建工具或运行时
- 现有代码库 23,000+ 行 TypeScript，迁移成本不可接受
- Bun 提供内置测试框架、TypeScript 支持、高性能运行时

## Considered Options

### Option A: Bun + TypeScript (Current)

| Dimension | Assessment |
|-----------|-----------|
| Performance | Bun 启动时间和 I/O 性能优于 Node.js |
| Learning Curve | 团队已熟悉，零学习成本 |
| Community & Ecosystem | 快速增长，npm 生态完全兼容 |
| Operational Complexity | 单一运行时，内置 test/bundler |
| Risk | Bun 生态较新，部分 Node.js 库可能不完全兼容 |

## Decision

**Chosen**: Option A — Bun + TypeScript

本决策为 **Constrained**，由 PRD 直接约束。

## Rationale

1. PRD 明确要求保持现有技术栈
2. 现有代码库迁移成本远超收益
3. Bun 的内置能力（test、TypeScript 支持）满足项目需求

## Consequences

### Positive
- 零迁移成本，开发可立即开始
- Bun 内置 test 框架满足 NFR-007（可测试性）

### Negative
- Bun 部分 API 与 Node.js 不完全兼容（需关注 NFR-010 Node >= 18 兼容目标）

## Validation

- [x] Team sign-off obtained (PRD constraint)
