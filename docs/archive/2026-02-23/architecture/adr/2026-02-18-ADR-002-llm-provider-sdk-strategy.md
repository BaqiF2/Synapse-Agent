# ADR-002: LLM Provider SDK 策略 — 各家官方 SDK + 自建统一层

## Status

Accepted

## Context

PRD F-003 要求实现统一 LLM Provider 接口，支持 Anthropic、OpenAI、Google 三家供应商无缝切换。需要决定底层 SDK 实现策略。

**PRD Reference**: F-003, NFR-005, NFR-010, NFR-012

**Business Driver**: 多 Provider 无缝切换是核心重构目标之一

## Decision Drivers

- PRD 要求支持三家 Provider，且需要统一的 LLMProvider/LLMStream 接口
- 需要完整覆盖 Provider 特有功能（Anthropic 扩展思考、OpenAI 结构化输出等）
- 自定义 LLMStream 接口需要对流式响应有精确控制
- 依赖数量需可控

## Considered Options

### Option A: 各家官方 SDK + 自建统一层

| Dimension | Assessment |
|-----------|-----------|
| Performance | 各 SDK 直接调用，无额外抽象开销 |
| Learning Curve | Anthropic SDK 已熟悉；OpenAI/Google SDK API 设计类似 |
| Community & Ecosystem | 三家 SDK 均由官方维护，活跃度极高 |
| Operational Complexity | 需维护自建统一层（约 200-400 行/Provider） |
| Cost | 开源免费 |
| Risk | 统一层需处理三家 API 差异；Provider 升级可能需同步更新 |

### Option B: Vercel AI SDK

| Dimension | Assessment |
|-----------|-----------|
| Performance | 额外一层抽象，有少量开销 |
| Learning Curve | 需学习 Vercel AI SDK 的 API 和约定 |
| Community & Ecosystem | 非常活跃（v6.x），大量贡献者 |
| Operational Complexity | 开箱即用，减少自建代码 |
| Cost | 开源免费 |
| Risk | 与自定义 LLMStream 接口冲突；部分 Provider 特性可能不支持；Bun 兼容未充分验证 |

### Option C: 直接 REST API

| Dimension | Assessment |
|-----------|-----------|
| Performance | 无 SDK 开销 |
| Learning Curve | 需深入理解三家 API 文档 |
| Community & Ecosystem | 无社区支持 |
| Operational Complexity | 需自行实现认证、流解析、重试、错误处理 |
| Cost | 开发和维护成本极高 |
| Risk | API 变更需自行跟踪；实现质量难以保证 |

## Decision

**Chosen**: Option A — 各家官方 SDK + 自建统一层

## Rationale

1. **Provider 特性覆盖度最高**：各 SDK 100% 覆盖其 API 特性，确保 Anthropic 扩展思考、OpenAI 结构化输出等功能可用
2. **与自定义接口完美适配**：自建统一层完全按 PRD LLMProvider/LLMStream 接口设计，无适配冲突
3. **依赖可控**：仅 3 个 SDK 包，总依赖面远小于 Vercel AI SDK 的多包生态
4. **自建层正是 PRD 要求**：F-003 的核心交付物就是统一抽象层，使用 Vercel AI SDK 实际上是把这层外包给了第三方

## Consequences

### Positive
- 完全控制统一抽象层的设计和行为
- Provider 特有功能无损保留
- 依赖链清晰，各 Provider 独立

### Negative
- 需编写和维护约 600-1200 行格式转换代码（3 个 Provider × 200-400 行）
- Provider SDK 升级需手动跟踪（风险可控，SDK 通常向后兼容）

### Neutral
- 自建统一层的质量直接决定多 Provider 切换体验

## Validation

- [x] Trade-off matrix completed (see `docs/architecture/tradeoff/2026-02-18-llm-provider-sdk-tradeoff-matrix.md`)
- [ ] Performance benchmarks meet PRD thresholds
- [x] Team sign-off obtained
