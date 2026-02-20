# LLM Provider SDK 策略 Trade-off Matrix

**PRD Reference**: F-003, NFR-005, NFR-010, NFR-012

**Decision Domain**: LLM Provider SDK 实现策略

## Evaluation Criteria

| Criterion ID | Criterion | Weight (1-5) | Source (PRD Ref) | Description |
|-------------|-----------|--------------|-----------------|-------------|
| C-01 | Provider 特性覆盖度 | 5 | F-003 | 思考块、工具调用、流式响应等 Provider 特有功能的支持程度 |
| C-02 | 自定义接口适配度 | 5 | F-003, F-004 | 与 PRD 定义的 LLMProvider/LLMStream 接口的天然匹配程度 |
| C-03 | 依赖复杂度 | 4 | PRD 约束 | 引入的包数量、体积、维护负担 |
| C-04 | 维护活跃度 | 3 | NFR-010 | 社区活跃度、更新频率、issue 响应 |
| C-05 | 新增 Provider 扩展 | 3 | NFR-012 | 添加新 Provider 的难度和代码量 |
| C-06 | Bun 兼容性 | 4 | NFR-010 | 在 Bun 运行时下的兼容性和稳定性 |

## Scoring Matrix

| Criterion | Weight | Option A: 官方SDK+自建层 | Option B: Vercel AI SDK | Option C: 直接 REST |
|-----------|--------|------------------------|------------------------|-------------------|
| C-01: Provider 特性覆盖度 | 5 | 5 | 3 | 5 |
| C-02: 自定义接口适配度 | 5 | 5 | 3 | 5 |
| C-03: 依赖复杂度 | 4 | 4 | 2 | 5 |
| C-04: 维护活跃度 | 3 | 5 | 5 | 1 |
| C-05: 新增 Provider 扩展 | 3 | 4 | 5 | 2 |
| C-06: Bun 兼容性 | 4 | 4 | 3 | 5 |
| **Weighted Total** | | **108** | **77** | **92** |

## Scoring Justification

### Option A: 官方 SDK + 自建统一层
- C-01 scored 5 because: 各家 SDK 100% 覆盖其 API 特性（Anthropic 扩展思考 effort、OpenAI 结构化输出、Google 多模态等）
- C-02 scored 5 because: 自建层完全按 PRD LLMProvider/LLMStream 接口设计，无适配开销
- C-03 scored 4 because: 仅 3 个 SDK 包（@anthropic-ai/sdk + openai + @google/genai），可控
- C-06 scored 4 because: 三家 SDK 基于标准 fetch/node:http，Bun 支持良好

### Option B: Vercel AI SDK
- C-01 scored 3 because: 统一抽象可能丢失 Provider 特有功能（如 Anthropic thinking effort 精确控制）
- C-02 scored 3 because: Vercel 有自己的消息格式和流式协议，与我们的 LLMStream 设计冲突，需要额外适配
- C-03 scored 2 because: 引入 ai + @ai-sdk/anthropic + @ai-sdk/openai + @ai-sdk/google 等多个包，总体积大
- C-06 scored 3 because: Vercel AI SDK 主要针对 Next.js/Node.js 生态，Bun 兼容性未经充分验证

### Option C: 直接 REST API
- C-04 scored 1 because: 需自行跟踪三家 API 变更，无社区帮助
- C-05 scored 2 because: 每新增一家 Provider 需从零实现认证、流解析、错误处理

## Result

**Recommended option**: Option A — 官方 SDK + 自建统一层，加权总分 108

**Key differentiator**: 最大化 Provider 特性覆盖度和自定义接口适配度，同时保持依赖可控

**Caveats**: 需自行实现统一抽象层的格式转换逻辑（约 200-400 行/Provider），但这正是 PRD F-003 的核心交付物

## Decision

- [x] Matrix reviewed
- [x] Scores validated
- [x] Result accepted → proceed to ADR documentation
