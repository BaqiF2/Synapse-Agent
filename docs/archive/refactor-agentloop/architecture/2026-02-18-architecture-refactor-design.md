# Synapse Agent 架构模块化重构 — 架构设计文档

> 本文档由开发和测试共同编写，既是代码的地图，也是测试的策略。

## 1. 架构概览

### 1.1 系统简介

Synapse Agent 是一个基于统一 Shell 抽象的自我成长 AI 智能体框架。本次重构将约 23,000 行的单体架构重构为模块边界清晰的内聚结构，核心改动包括：Agent Core 采用 EventStream 事件驱动解耦 UI、引入统一多 Provider LLM 抽象、建立两层消息系统、实现工具可插拔操作。

目标用户包括：框架开发者（直接维护和扩展代码库）、集成开发者（将 Agent Core 嵌入其他应用）、工具扩展者（适配新工具或执行环境）。

### 1.2 架构风格

**模块化单体**（Modular Monolith）— 单体仓库，目录级模块化。

选择理由：
- PRD 明确约束"不拆分为独立 npm 包"
- 代码规模 ~23,000 行，微服务拆分过度
- 模块间通过 `index.ts` 导出边界实现清晰隔离
- 满足独立演进和测试的需求（PRD G5）

### 1.3 技术栈摘要

> 详细选型见 `docs/architecture/2026-02-18-architecture-refactor-tech-stack.md`

| 类别 | 选型 | 版本 | 备注 |
|------|------|------|------|
| 运行时 | Bun | 1.3.9 | 主运行时，内置 test/bundler |
| 语言 | TypeScript | ^5.0 | 严格模式 |
| 参数验证 | Zod | 4.3.6 | AgentConfig 等核心接口验证 |
| Anthropic SDK | @anthropic-ai/sdk | 0.74.0 | Anthropic Provider |
| OpenAI SDK | openai | 6.22.0 | OpenAI Provider |
| Google SDK | @google/genai | 1.41.0 | Google Provider |
| MCP SDK | @modelcontextprotocol/sdk | 1.26.0 | Extension Shell 层 |
| Token 计数 | js-tiktoken | 1.0.21 | 上下文管理 |
| 测试 | Bun Test | 1.3.9 | 兼容 Jest API |
| Linter | ESLint | ^9.0.0 | Flat Config |
| 类型检查 | tsc --noEmit | ^5.0 | CI 质量门禁 |

## 2. 包结构与模块依赖

### 2.1 目录结构

```
synapse-agent/
├── src/
│   ├── core/                       # Agent Core — 事件系统、消息系统、Agent Loop
│   │   ├── index.ts                # 公共导出
│   │   ├── agent-loop.ts           # Agent 主循环
│   │   ├── event-stream.ts         # EventStream 异步迭代器实现
│   │   ├── messages.ts             # 两层消息 + convertToLlm()
│   │   └── types.ts                # 核心类型定义（AgentConfig, AgentTool, ToolResult）
│   │
│   ├── providers/                  # LLM Provider 抽象与实现
│   │   ├── index.ts                # 公共导出
│   │   ├── types.ts                # Provider 接口定义（LLMProvider, LLMStream, GenerateParams）
│   │   ├── anthropic/              # Anthropic Provider 实现
│   │   │   ├── index.ts
│   │   │   ├── anthropic-provider.ts
│   │   │   └── anthropic-mapper.ts # 格式转换
│   │   ├── openai/                 # OpenAI Provider 实现
│   │   │   ├── index.ts
│   │   │   ├── openai-provider.ts
│   │   │   └── openai-mapper.ts
│   │   └── google/                 # Google Provider 实现
│   │       ├── index.ts
│   │       ├── google-provider.ts
│   │       └── google-mapper.ts
│   │
│   ├── tools/                      # 三层工具系统
│   │   ├── index.ts                # 公共导出
│   │   ├── bash-tool.ts            # 统一 Bash 工具入口
│   │   ├── bash-router.ts          # 三层命令路由器
│   │   ├── operations/             # 可插拔操作接口与实现
│   │   │   ├── types.ts            # FileOperations, BashOperations 接口
│   │   │   ├── local-file-ops.ts   # 基于 fs/promises 的本地实现
│   │   │   └── local-bash-ops.ts   # 基于 child_process/Bun Shell 的本地实现
│   │   ├── handlers/               # Agent Shell Command 处理器
│   │   │   ├── read-handler.ts
│   │   │   ├── write-handler.ts
│   │   │   ├── edit-handler.ts
│   │   │   ├── glob-handler.ts
│   │   │   └── search-handler.ts
│   │   └── converters/             # MCP/Skill 工具转换器
│   │       ├── mcp-converter.ts
│   │       └── skill-converter.ts
│   │
│   ├── skills/                     # 技能系统
│   │   ├── index.ts                # 公共导出
│   │   ├── skill-loader.ts         # 技能加载与缓存
│   │   ├── skill-generator.ts      # 从对话生成新技能
│   │   ├── skill-enhancer.ts       # 自动技能增强
│   │   └── skill-indexer.ts        # 技能索引与搜索
│   │
│   ├── sub-agents/                 # 子智能体系统
│   │   ├── index.ts                # 公共导出
│   │   ├── sub-agent-manager.ts    # SubAgent 生命周期管理
│   │   └── sub-agent-types.ts      # SubAgent 类型定义
│   │
│   ├── cli/                        # CLI/REPL（Agent Core 的消费者）
│   │   ├── index.ts                # 公共导出 + CLI 入口
│   │   ├── repl.ts                 # REPL 交互
│   │   ├── terminal-renderer.ts    # 终端渲染（消费 EventStream）
│   │   └── commands/               # CLI 命令
│   │
│   ├── config/                     # 配置管理
│   │   ├── index.ts                # 公共导出
│   │   ├── config-loader.ts        # 配置加载
│   │   └── env.ts                  # 环境变量定义与默认值
│   │
│   ├── common/                     # 公共工具和类型
│   │   ├── index.ts                # 公共导出
│   │   ├── errors.ts               # 统一错误类型
│   │   ├── logger.ts               # 日志基础设施
│   │   └── constants.ts            # 全局常量
│   │
│   └── resource/                   # 资源文件（系统提示词等）
│       └── system-prompts/
│
├── tests/
│   ├── unit/                       # 单元测试（镜像 src/ 结构）
│   │   ├── core/
│   │   │   ├── agent-loop.test.ts
│   │   │   ├── event-stream.test.ts
│   │   │   └── messages.test.ts
│   │   ├── providers/
│   │   │   ├── anthropic/
│   │   │   ├── openai/
│   │   │   └── google/
│   │   ├── tools/
│   │   │   ├── operations/
│   │   │   └── handlers/
│   │   ├── skills/
│   │   ├── sub-agents/
│   │   └── common/
│   ├── integration/                # 集成测试
│   │   ├── core/                   # Agent Loop 端到端流程（Mock Provider）
│   │   ├── providers/              # Provider 实际 API 调用验证
│   │   └── tools/                  # 工具链集成
│   └── e2e/                        # 端到端测试
│       └── cli/                    # CLI 端到端测试
│
├── docs/
│   ├── architecture/
│   │   ├── 2026-02-18-architecture-refactor-design.md   # ← 本文档
│   │   ├── 2026-02-18-architecture-refactor-tech-stack.md
│   │   ├── 2026-02-18-architecture-refactor-nfr.md
│   │   └── adr/                    # 架构决策记录
│   └── requirements/
│       ├── 2026-02-18-architecture-refactor-prd.md
│       └── 2026-02-18-architecture-refactor-bdd/
│
├── .github/workflows/ci.yml       # CI 流水线
├── package.json
├── tsconfig.json
├── eslint.config.js
└── architecture-config.json        # 架构验证配置
```

### 2.2 依赖规则

本项目按**技术关注点**而非业务域划分模块。依赖方向遵循依赖倒置原则（DIP）：

```
                    ┌──────────┐
                    │   cli    │  （顶层消费者）
                    └────┬─────┘
          ┌──────────┬───┼────────┬──────────┐
          ▼          ▼   ▼        ▼          ▼
    ┌──────────┐ ┌──────┐ ┌─────────┐ ┌──────────┐
    │sub-agents│ │skills│ │  tools  │ │  config  │
    └────┬─────┘ └──┬───┘ └────┬────┘ └──────────┘
         │          │          │
         ▼          ▼          ▼
    ┌──────────┐ ┌──────────┐
    │   core   │ │providers │  （基础模块，无内部依赖）
    └──────────┘ └──────────┘
         ▲          ▲
         │          │
    ┌──────────┐
    │  common  │  （被所有模块依赖的公共工具）
    └──────────┘
```

#### 严格依赖规则

| 模块 | 允许依赖 | 禁止依赖 |
|------|---------|---------|
| `core` | `common` | `cli`, `skills`, `sub-agents`, `tools`, `providers`, `config` |
| `providers` | `common` | `cli`, `skills`, `sub-agents`, `tools`, `core`, `config` |
| `config` | `common` | `cli`, `skills`, `sub-agents`, `tools`, `core`, `providers` |
| `tools` | `core`(types), `providers`(types), `common` | `cli`, `skills`, `sub-agents` |
| `skills` | `core`, `providers`, `common` | `cli`, `sub-agents`, `tools` |
| `sub-agents` | `core`, `providers`, `tools`, `common` | `cli`, `skills` |
| `cli` | 所有模块 | — |
| `common` | (无内部依赖) | 所有其他模块 |

#### 模块导出规则

1. 模块间引用必须通过 `import { X } from '../module-name'`（即 index.ts）
2. **禁止** `import { X } from '../module-name/internal-file'` 形式的引用
3. 每个模块的 `index.ts` 只导出公共 API，内部实现细节不暴露

### 2.3 模块间通信

| 源模块 | 目标模块 | 通信方式 | 说明 |
|--------|---------|---------|------|
| `cli` | `core` | 调用 Agent Loop + 消费 EventStream | CLI 创建 Agent 实例并消费事件流 |
| `core` | `providers` | 通过 LLMProvider 接口调用 | Agent Loop 调用 provider.generate() |
| `core` | `tools` | 通过 AgentTool 接口调用 | Agent Loop 调用 tool.execute() |
| `sub-agents` | `core` | 复用 Agent Loop | SubAgent 使用相同的 AgentLoop 接口 |
| `skills` | `providers` | 通过 LLMProvider 接口调用 | SkillGenerator 通过统一接口生成技能 |
| `tools` | `core` | 仅类型引用 | tools 使用 core 定义的 AgentTool/ToolResult 类型 |

## 3. 外部依赖清单

> 详细版本验证见 `docs/architecture/2026-02-18-architecture-refactor-tech-stack.md`

### 3.1 核心框架

| 依赖 | 版本 | 用途 |
|------|------|------|
| bun | 1.3.9 | 运行时 + 包管理 + 测试 + 构建 |
| typescript | ^5.0 | 语言 + 类型检查 |
| zod | 4.3.6 | 参数验证（AgentConfig, Provider 配置等） |
| js-tiktoken | 1.0.21 | Token 计数（上下文管理 offload/compact） |

### 3.2 LLM Provider SDK

| 依赖 | 版本 | 用途 |
|------|------|------|
| @anthropic-ai/sdk | 0.74.0 | Anthropic Provider 实现 |
| openai | 6.22.0 | OpenAI Provider 实现 |
| @google/genai | 1.41.0 | Google Provider 实现 |

### 3.3 扩展工具

| 依赖 | 版本 | 用途 |
|------|------|------|
| @modelcontextprotocol/sdk | 1.26.0 | MCP Extension Shell 集成 |

### 3.4 CLI 依赖（非重构范围）

| 依赖 | 版本 | 用途 |
|------|------|------|
| ink | 6.7.0 | 终端 UI |
| chalk | 5.6.2 | 终端样式 |
| commander | 14.0.2 | CLI 命令解析 |
| chokidar | 5.0.0 | 文件监控 |

### 3.5 测试依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| Bun Test (built-in) | 1.3.9 | 单元 + 集成测试 |
| node-pty | 1.0.0 | E2E CLI 测试 |

### 3.6 代码质量

| 依赖 | 版本 | 用途 |
|------|------|------|
| eslint | ^9.0.0 | Linter |
| @typescript-eslint/* | ^8.0.0 | TypeScript ESLint 支持 |
| dependency-cruiser | ^16.0.0 | 架构适应度函数（依赖规则检查）|

## 4. 测试架构

### 4.1 测试金字塔

| 测试类型 | 目标层级 | 工具/技术 | 编写者 | 执行时机 |
|----------|---------|----------|--------|---------|
| 单元测试 | core、providers、tools、skills 的纯逻辑 | Bun Test + Mock | 开发 | 每次提交 |
| 集成测试 | Agent Loop 端到端流程、Provider 实际调用 | Bun Test + Mock Provider | 开发 | CI 流程 |
| E2E 测试 | CLI 完整交互流程 | Bun Test + node-pty | 测试 | CI 流程 |

### 4.2 测试数据管理

| 测试层级 | 数据来源 | 隔离方式 |
|----------|---------|---------|
| 单元测试 | 内存对象 / Mock Provider / Mock Tools | 完全隔离，无外部依赖 |
| 集成测试 | Mock LLM Provider + 真实文件系统 (tmp) | 临时目录隔离 |
| E2E 测试 | node-pty 模拟终端 + Mock 配置 | 进程级隔离 |

### 4.3 覆盖率目标

| 模块 | 行覆盖率 | 分支覆盖率 | 说明 |
|------|---------|----------|------|
| core | ≥ 80% | ≥ 70% | 核心业务逻辑，最高优先级 |
| providers | ≥ 60% | ≥ 50% | SDK 封装层，外部依赖多 |
| tools | ≥ 60% | ≥ 50% | 含文件系统操作 |
| skills | ≥ 60% | ≥ 50% | 依赖 LLM 调用 |
| sub-agents | ≥ 60% | ≥ 50% | 复用 core 逻辑 |
| common | ≥ 80% | ≥ 70% | 公共工具，复用度高 |
| cli | ≥ 40% | ≥ 30% | UI 层，E2E 覆盖为主 |
| 整体项目 | ≥ 70% | ≥ 60% | |

### 4.4 测试目录结构（镜像法）

```
tests/
├── unit/                          # 镜像 src/ 结构
│   ├── core/
│   │   ├── agent-loop.test.ts
│   │   ├── event-stream.test.ts
│   │   └── messages.test.ts
│   ├── providers/
│   │   ├── anthropic/
│   │   │   └── anthropic-provider.test.ts
│   │   ├── openai/
│   │   │   └── openai-provider.test.ts
│   │   └── google/
│   │       └── google-provider.test.ts
│   ├── tools/
│   │   ├── operations/
│   │   │   ├── local-file-ops.test.ts
│   │   │   └── local-bash-ops.test.ts
│   │   └── handlers/
│   │       └── *.test.ts
│   ├── skills/
│   │   └── *.test.ts
│   ├── sub-agents/
│   │   └── sub-agent-manager.test.ts
│   └── common/
│       ├── errors.test.ts
│       └── logger.test.ts
├── integration/
│   ├── core/
│   │   └── agent-loop-flow.test.ts  # Agent Loop + Mock Provider 完整流程
│   ├── providers/
│   │   └── provider-integration.test.ts
│   └── tools/
│       └── tool-chain-flow.test.ts  # BashRouter + Operations 集成
└── e2e/
    └── cli/
        └── *.test.ts               # CLI 端到端测试
```

## 5. 架构适应度函数

### 5.1 依赖规则检查

使用 **dependency-cruiser** 强制执行模块间依赖规则。

配置文件 `.dependency-cruiser.cjs` 定义以下规则：

| 规则名 | 描述 | 检查内容 |
|--------|------|---------|
| `no-core-import-others` | core 模块不依赖其他模块 | core/ 不得 import cli/, tools/, skills/, sub-agents/, providers/ |
| `no-providers-import-others` | providers 不依赖其他模块 | providers/ 不得 import cli/, tools/, skills/, sub-agents/, core/ |
| `no-config-import-others` | config 不依赖其他模块 | config/ 不得 import cli/, tools/, skills/, sub-agents/, core/, providers/ |
| `no-circular-deps` | 禁止循环依赖 | 所有模块间无循环引用 |
| `no-deep-import` | 禁止深层导入 | 模块间禁止 import 非 index.ts 的内部文件 |

### 5.2 编码规范检查

ESLint Flat Config (`eslint.config.js`) 包含：

- TypeScript 严格模式规则（`@typescript-eslint/recommended`）
- `consistent-type-imports` 强制类型导入使用 `import type`
- 未使用变量检查（忽略 `_` 前缀）
- 受限全局变量检查

### 5.3 类型安全检查

- `tsc --noEmit` 严格类型检查
- `strict: true`、`noUncheckedIndexedAccess: true`、`noImplicitOverride: true`

## 6. 日志与可观测性

### 6.1 日志框架

| 配置项 | 值 | 说明 |
|--------|---|------|
| 日志框架 | pino | TypeScript 生态性能最优，原生 JSON 输出 |
| 开发格式 | pino-pretty | 人类可读的彩色输出 |
| 生产格式 | JSON | 结构化日志，便于日志分析 |
| 日志语言 | English | 所有日志消息统一使用英文 |
| 关联 ID | AsyncLocalStorage | 请求追踪标识，贯穿 Agent Loop 完整生命周期 |
| 日志级别控制 | 环境变量 `LOG_LEVEL` | 默认 `info`，支持运行时调整 |

### 6.2 日志级别规划

| 级别 | 使用场景 | 示例 |
|------|---------|------|
| ERROR | 不可恢复的错误，需要立即关注 | Provider API unreachable, data corruption |
| WARN | 潜在问题，不影响当前操作 | Retry succeeded, cache fallback, rate limit approaching |
| INFO | 关键业务事件和状态变化 | Agent loop started, tool executed, skill generated |
| DEBUG | 详细诊断信息（生产环境默认关闭） | LLM request params, tool input/output details |

### 6.3 日志规范

- 使用参数化消息，禁止字符串拼接构建日志
- **禁止**记录敏感信息（API Key、令牌、密码、PII）
- 每条日志包含：时间戳、级别、模块名、关联 ID、消息
- 异常日志包含完整堆栈（仅内部使用）

### 6.4 结构化日志格式

```json
{
  "timestamp": "2026-02-18T10:30:00.123Z",
  "level": "info",
  "module": "core.agent-loop",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Agent loop completed",
  "context": {
    "sessionId": "sess-001",
    "turnCount": 5,
    "totalTokens": 12500
  }
}
```

### 6.5 关联 ID 传播

```
CLI 入口 → 生成 correlationId → AsyncLocalStorage
    → Agent Loop（读取 correlationId）
        → Provider 调用（传播 correlationId）
        → Tool 执行（传播 correlationId）
        → SubAgent（继承父 Agent 的 correlationId）
```

## 7. CI/CD 流水线

### 7.1 流水线步骤

```
Checkout → Setup Bun → Install Dependencies → Lint → Typecheck
    → Unit Tests + Coverage → Integration Tests → Architecture Fitness Tests → Build
```

### 7.2 质量门禁

CI 必须在以下任一门禁失败时报错：

- [ ] ESLint 零 error（`--max-warnings 0`）
- [ ] TypeScript 类型检查通过（`tsc --noEmit`）
- [ ] 所有单元测试通过
- [ ] 所有集成测试通过
- [ ] 覆盖率达到各模块阈值
- [ ] dependency-cruiser 依赖规则检查通过
- [ ] 架构结构验证通过（`validate_architecture.py`）

### 7.3 CI 配置

平台：GitHub Actions

```yaml
# .github/workflows/ci.yml
# 详见项目中的完整配置
Stages:
  1. Checkout (actions/checkout@v6)
  2. Setup Bun (oven-sh/setup-bun@v2)
  3. Install (bun install --frozen-lockfile)
  4. Lint (bun run lint)
  5. Typecheck (bun run typecheck)
  6. Unit Tests (bun test tests/unit/ --coverage)
  7. Integration Tests (bun test tests/integration/)
  8. Architecture Tests (bun run test:arch + python3 validate_architecture.py)
```

## 附录

### A. 架构决策记录索引

| ADR 编号 | 标题 | 状态 |
|---------|------|------|
| ADR-001 | Runtime 与核心语言选择 — Bun + TypeScript | ACCEPTED |
| ADR-002 | LLM Provider SDK 策略 — 各家官方 SDK + 自建统一层 | ACCEPTED |
| ADR-003 | Google LLM SDK 选择 — @google/genai | ACCEPTED |
| ADR-004 | 参数验证库 — Zod | ACCEPTED |
| ADR-005 | 测试框架 — Bun Test | ACCEPTED |
| ADR-006 | MCP 集成 SDK — @modelcontextprotocol/sdk | ACCEPTED |
| ADR-007 | 日志框架 — pino | ACCEPTED |
| ADR-008 | 架构适应度函数 — dependency-cruiser | ACCEPTED |

### B. 术语表

| 术语 | 定义 |
|------|------|
| EventStream | 异步可迭代的事件流，支持事件迭代和最终结果获取 |
| Domain Message | 领域消息，包含 Agent 运行过程中的所有业务信息 |
| LLM Message | LLM 消息，仅包含 LLM API 能理解的内容格式 |
| Operations | 可插拔操作接口，定义工具执行的具体环境抽象 |
| Three-Layer Tool System | 三层工具体系：Native Shell / Agent Shell / Extension Shell |
| BashRouter | 三层命令路由器，根据命令类型分发到对应处理器 |
| Skill Self-Evolution | 技能自进化，从成功对话中自动生成和增强可复用技能 |
| SubAgent | 子智能体，在受限工具权限下独立执行任务的 Agent 实例 |
| Walking Skeleton | 最小可运行项目骨架，验证所有技术集成 |
| Fitness Function | 架构适应度函数，自动化检查架构约束的测试 |

### C. PRD 功能到模块映射

| PRD 功能 | 主模块 | 关联模块 |
|----------|--------|---------|
| F-001: EventStream 事件系统 | core | — |
| F-002: Agent Core 接口抽象 | core | — |
| F-003: 统一 LLM Provider 接口 | providers | — |
| F-004: 两层消息系统 | core | — |
| F-005: 工具可插拔操作 | tools | core (types) |
| F-006: SubAgent 同步重构 | sub-agents | core, providers, tools |
| F-007: 技能系统多 Provider 适配 | skills | providers |
| F-008: 模块导出边界 | 所有模块 | — |

### D. NFR 到架构映射

| NFR ID | 架构保障措施 |
|--------|------------|
| NFR-001 (EventStream 延迟 <1ms) | 轻量级 AsyncIterable，无序列化开销 |
| NFR-002 (启动时间 <100ms) | Provider 延迟初始化，按需加载 |
| NFR-003 (Provider 切换零开销) | Provider 无状态设计 |
| NFR-004 (工具执行环境可插拔) | FileOperations/BashOperations 接口 + DI |
| NFR-005 (多 Provider 切换) | LLMProvider 统一抽象层 |
| NFR-006 (模块边界严格隔离) | index.ts 导出边界 + dependency-cruiser |
| NFR-007 (Agent Core 可 Mock 测试) | 依赖注入，所有外部依赖通过接口 |
| NFR-008 (代码规模控制) | 模块 <5000 行，文件 <500 行 |
| NFR-009 (API Key 隔离) | Key 仅在 Provider 实现内部使用 |
| NFR-010 (运行时兼容) | 优先标准 Web API，避免 Bun-only API |
| NFR-011 (背压处理) | AsyncIterable + 生产者/消费者协调 |
| NFR-012 (新增 Provider 简单) | 只需实现 LLMProvider 接口 + 注册 |
