# ADR-004: 参数验证库 — Zod

## Status

Accepted

## Context

PRD F-002 要求 AgentConfig 等核心接口通过验证。项目当前已使用 Zod 进行参数验证。

**PRD Reference**: F-002, PRD §5.1 Constraints

**Business Driver**: 技术栈约束，现有代码一致性

## Decision Drivers

- PRD 明确约束：Bun + TypeScript + Zod
- 现有代码大量使用 Zod schema
- Zod 提供 TypeScript 类型推断，与项目类型安全需求匹配

## Considered Options

### Option A: Zod (Current)

| Dimension | Assessment |
|-----------|-----------|
| Performance | v4.x 性能显著提升 |
| Learning Curve | 团队已熟悉 |
| Community & Ecosystem | TypeScript 生态最流行的验证库 |

## Decision

**Chosen**: Option A — Zod

本决策为 **Constrained**，由 PRD 直接约束。

## Rationale

1. PRD 明确要求保持 Zod
2. 现有代码库全面使用 Zod
3. Zod 的 TypeScript 类型推断对接口定义至关重要

## Consequences

### Positive
- 零迁移成本
- 与 TypeScript 类型系统深度集成

### Neutral
- 当前项目使用 zod ^4.3.6（最新主版本）

## Validation

- [x] Team sign-off obtained (PRD constraint)
