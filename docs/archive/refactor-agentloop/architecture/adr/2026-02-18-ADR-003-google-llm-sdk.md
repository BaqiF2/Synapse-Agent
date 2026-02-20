# ADR-003: Google LLM SDK 选择 — @google/genai

## Status

Accepted

## Context

PRD F-003 要求支持 Google 作为 LLM Provider 之一。Google 提供多个 SDK 选项，需要选择最合适的一个。

**PRD Reference**: F-003, NFR-005

**Business Driver**: Google Provider 实现的底层 SDK 选择

## Decision Drivers

- `@google/generative-ai`（旧版）已于 2025 年 8 月停止支持
- 需要选择一个积极维护、功能完整的 Google LLM SDK
- 需要支持 Gemini 模型的工具调用和流式响应

## Considered Options

### Option A: @google/genai (v1.41.0)

| Dimension | Assessment |
|-----------|-----------|
| Performance | 官方最新 SDK，直接调用 Google AI API |
| Learning Curve | 新 SDK，API 设计现代化 |
| Community & Ecosystem | Google 官方维护，积极更新 |
| Risk | 作为新 SDK，API 可能还在演进中 |

### Option B: @google/generative-ai (v0.24.1) — DEPRECATED

| Dimension | Assessment |
|-----------|-----------|
| Performance | 与 Option A 相当 |
| Learning Curve | 文档较多，社区经验丰富 |
| Community & Ecosystem | **已废弃**，2025-08-31 停止支持 |
| Risk | **高风险** — 无后续维护和安全修复 |

### Option C: @google-cloud/vertexai

| Dimension | Assessment |
|-----------|-----------|
| Performance | 企业级 SDK，通过 Google Cloud Vertex AI |
| Learning Curve | 需要 Google Cloud 账户和配置 |
| Community & Ecosystem | Google Cloud 团队维护 |
| Risk | 需要 Google Cloud 基础设施，对个人开发者不友好 |

## Decision

**Chosen**: Option A — @google/genai

## Rationale

1. **唯一活跃的免费 SDK**：旧版已废弃，Vertex AI 需要 Cloud 账户
2. **版本 v1.41.0 成熟度足够**：已迭代到 1.x 正式版，API 稳定
3. **支持 Google AI Studio**：通过 API Key 即可使用，无需 Cloud 配置
4. **Google 官方推荐**：旧 SDK 的迁移指南明确推荐 @google/genai

## Consequences

### Positive
- 使用 Google 官方推荐和积极维护的 SDK
- API Key 认证简单，降低使用门槛

### Negative
- 作为相对较新的 SDK，可能遇到少量文档不完善的情况
- Gemini 的工具调用格式与 Anthropic/OpenAI 差异较大，需要更多转换代码

## Validation

- [x] Version verified: v1.41.0 (latest stable)
- [x] Team sign-off obtained
