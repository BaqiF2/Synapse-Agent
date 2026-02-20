# ADR-005: 测试框架 — Bun Test

## Status

Accepted

## Context

PRD NFR-003 要求 Agent Core 可 Mock 测试，覆盖率 > 80%。需要确认测试框架选择。

**PRD Reference**: NFR-003, NFR-007

**Business Driver**: 可测试性是重构的核心目标之一

## Decision Drivers

- 项目已使用 Bun Test 作为测试框架
- Bun 内置测试运行器，零配置
- 测试文件已存在于 tests/unit/ 和 tests/e2e/

## Considered Options

### Option A: Bun Test (Current)

| Dimension | Assessment |
|-----------|-----------|
| Performance | 极快的测试执行速度 |
| Learning Curve | 兼容 Jest API，团队已熟悉 |
| Community & Ecosystem | Bun 内置，与运行时深度集成 |
| Coverage | 支持 --coverage 覆盖率报告 |

## Decision

**Chosen**: Option A — Bun Test

本决策为 **Constrained**，由现有基础设施约束。

## Rationale

1. 与 Bun 运行时深度集成，零额外依赖
2. 兼容 Jest API，降低学习成本
3. 内置覆盖率报告满足 NFR-003 要求

## Consequences

### Positive
- 测试运行速度极快
- 与 Bun 运行时行为完全一致（避免 Node/Bun 差异问题）

### Negative
- 生态比 Jest 小，部分高级功能（如自定义 matcher）可能需要手动实现

## Validation

- [x] Team sign-off obtained
