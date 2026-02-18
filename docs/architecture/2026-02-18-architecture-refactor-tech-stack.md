# Confirmed Tech Stack: Synapse Agent 架构模块化重构

## Document Info

| Field | Value |
|-------|-------|
| PRD Reference | `docs/requirements/2026-02-18-architecture-refactor-prd.md` |
| Created | 2026-02-18 |
| Status | Confirmed |
| Versions Verified | 2026-02-18 (via Web Search) |

## Development Stack

### Runtime & Language

| Component | Technology | Version | ADR Reference | Rationale Summary |
|-----------|-----------|---------|---------------|-------------------|
| Runtime | Bun | 1.3.9 | ADR-001 | PRD 约束，现有运行时，内置 test/bundler |
| Language | TypeScript | ^5.0 | ADR-001 | PRD 约束，类型安全核心需求 |
| Package Manager | Bun (built-in) | 1.3.9 | ADR-001 | 与 Runtime 一体化 |

### Core Framework

| Component | Technology | Version | ADR Reference | Rationale Summary |
|-----------|-----------|---------|---------------|-------------------|
| Schema Validation | Zod | 4.3.6 | ADR-004 | PRD 约束，AgentConfig 等接口验证 |
| Token Counting | js-tiktoken | 1.0.21 | — (Constrained) | 上下文管理 offload/compact 需要 token 计数 |

### LLM Provider SDKs

| Component | Technology | Version | ADR Reference | Rationale Summary |
|-----------|-----------|---------|---------------|-------------------|
| Anthropic Provider | @anthropic-ai/sdk | 0.74.0 | ADR-002 | 官方 SDK，完整 API 覆盖（含扩展思考） |
| OpenAI Provider | openai | 6.22.0 | ADR-002 | 官方 SDK，完整 API 覆盖（含结构化输出） |
| Google Provider | @google/genai | 1.41.0 | ADR-003 | 新版官方 SDK，替代已废弃的 @google/generative-ai |
| SDK 策略 | 自建统一层 | — | ADR-002 | 各家官方 SDK + 自建 LLMProvider 统一抽象 |

### Extension Tools

| Component | Technology | Version | ADR Reference | Rationale Summary |
|-----------|-----------|---------|---------------|-------------------|
| MCP Integration | @modelcontextprotocol/sdk | 1.26.0 | ADR-006 | Extension Shell 层核心依赖 |

### CLI & UI

| Component | Technology | Version | ADR Reference | Rationale Summary |
|-----------|-----------|---------|---------------|-------------------|
| Terminal UI | ink | 6.7.0 | — (Constrained) | 非重构范围，保持现有 CLI |
| Terminal Styling | chalk | 5.6.2 | — (Constrained) | 非重构范围 |
| CLI Framework | commander | 14.0.2 | — (Constrained) | 非重构范围 |
| File Watching | chokidar | 5.0.0 | — (Constrained) | 非重构范围 |

## Testing Stack

| Component | Technology | Version | ADR Reference | Rationale Summary |
|-----------|-----------|---------|---------------|-------------------|
| Unit Test | Bun Test (built-in) | 1.3.9 | ADR-005 | Bun 内置，兼容 Jest API，支持覆盖率 |
| E2E Test | Bun Test + node-pty | 1.3.9 / 1.0.0 | ADR-005 | 现有 E2E 测试基础设施 |
| Type Check | TypeScript Compiler | ^5.0 | — (Constrained) | `tsc --noEmit` 类型检查 |

## DevOps / Code Quality Stack

| Component | Technology | Version | ADR Reference | Rationale Summary |
|-----------|-----------|---------|---------------|-------------------|
| Linter | ESLint | ^9.0.0 | — (Constrained) | 现有配置，保持代码质量 |
| TS Parser | @typescript-eslint/* | ^8.0.0 | — (Constrained) | ESLint TypeScript 支持 |
| Version Control | Git | — | — | 现有仓库 |

## Dependency Version Verification

| Component | Technology | Verified Version | Latest Stable | Status | Verified |
|-----------|-----------|-----------------|---------------|--------|----------|
| Runtime | Bun | 1.3.9 | 1.3.9 | Active | Yes |
| Language | TypeScript | ^5.0 | 5.7+ | Active | Yes |
| Validation | Zod | 4.3.6 | 4.3.6 | Active | Yes |
| Anthropic SDK | @anthropic-ai/sdk | 0.74.0 | 0.74.0 | Active | Yes |
| OpenAI SDK | openai | 6.22.0 | 6.22.0 | Active | Yes |
| Google SDK | @google/genai | 1.41.0 | 1.41.0 | Active | Yes |
| Google SDK (旧) | @google/generative-ai | — | 0.24.1 | **EOL** (2025-08-31) | Yes — 已排除 |
| MCP SDK | @modelcontextprotocol/sdk | 1.26.0 | 1.26.0 | Active (v2 Q1 2026) | Yes |
| Token Count | js-tiktoken | 1.0.21 | 1.0.21 | Active | Yes |
| Terminal UI | ink | 6.7.0 | 6.7.0 | Active | Yes |
| Styling | chalk | 5.6.2 | 5.6.2 | Active | Yes |

### Compatibility Matrix

| Dependency A | Version | Dependency B | Required Version | Compatible |
|-------------|---------|-------------|-----------------|------------|
| Bun | 1.3.9 | TypeScript | ^5.0 | Yes |
| Bun | 1.3.9 | @anthropic-ai/sdk | 0.74.0 | Yes |
| Bun | 1.3.9 | openai | 6.22.0 | Yes |
| Bun | 1.3.9 | @google/genai | 1.41.0 | Yes |
| Bun | 1.3.9 | @modelcontextprotocol/sdk | 1.26.0 | Yes |
| Zod | 4.3.6 | TypeScript | ^5.0 | Yes |
| ink | 6.7.0 | react | ^18.0.0 | Yes (peer dep) |

## Pending Items

- [ ] 无待 POC 验证项

## Cross-Reference

| PRD Requirement | NFR | Technology Decision | ADR |
|----------------|-----|-------------------|-----|
| F-001: EventStream 事件系统 | NFR-001, NFR-011 | Bun + TypeScript AsyncIterable | ADR-001 |
| F-002: Agent Core 接口抽象 | NFR-007 | Zod 验证 + TypeScript 接口 | ADR-004 |
| F-003: 统一 LLM Provider | NFR-005, NFR-012 | 三家官方 SDK + 自建统一层 | ADR-002, ADR-003 |
| F-004: 两层消息系统 | — | TypeScript 声明合并 + 纯函数转换 | ADR-001 |
| F-005: 工具可插拔操作 | NFR-004 | TypeScript 接口 + 依赖注入 | ADR-001 |
| F-006: SubAgent 同步重构 | — | 复用 Agent Core 接口 | ADR-001, ADR-002 |
| F-007: 技能多 Provider | NFR-005 | 通过 LLMProvider 接口间接使用 SDK | ADR-002 |
| F-008: 模块导出边界 | NFR-006 | TypeScript + 目录级模块化 | ADR-001 |
| — | NFR-003: Agent Loop 启动 | Bun 快速启动 + 延迟初始化 | ADR-001 |
| — | NFR-009: API Key 隔离 | Provider 实现内部封装 | ADR-002 |
| — | NFR-010: 运行时兼容 | Bun 1.3.9 + Node >= 18 兼容目标 | ADR-001 |
