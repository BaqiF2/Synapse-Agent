# Architecture Simplification — Product Requirements Document (PRD)

## Document Info
| Field | Value |
|-------|-------|
| Version | v1.0 |
| Created | 2026-02-20 |
| Last Updated | 2026-02-20 |
| Status | Draft |

## 1. Overview

### 1.1 Product/Feature Summary

对 Synapse Agent 进行全面架构简化重构，以 `src/core/agent-loop.ts` 的 EventStream 架构为统一 Agent Loop，消除双轨实现，重组模块边界，统一类型系统，简化目录结构。保留所有核心能力（单一 Bash 工具 + 三层路由、MCP/Skill 扩展、自我成长、SubAgent 体系），使架构更清晰、代码更整洁。

### 1.2 Goals

- G-1: 消除双轨 Agent Loop，统一为 EventStream 架构
- G-2: 消除双轨 SubAgent，统一为基于 `runAgentLoop` 的实现
- G-3: 将 12 个顶层模块重组为分层清晰的 7 个模块
- G-4: 统一类型系统，消除 `core/types.ts` 与 `providers/types.ts` 的语义重叠
- G-5: Skills 模块 24 文件重组为 4 个子模块
- G-6: 工具系统从 4 层嵌套降至 2 层
- G-7: 循环依赖降至零（dependency-cruiser 检查通过）
- G-8: 所有现有测试迁移通过

### 1.3 Non-Goals (explicitly excluded scope)

- 新功能开发（如新 LLM Provider、新工具类型）
- 性能优化（如响应速度、内存使用）
- CLI UI 框架更换（保持 Ink + Commander）
- 技能系统的功能裁剪
- 生产依赖的增减

## 2. Users & Scenarios

### 2.1 Target Users

| User Role | Description | Core Need |
|-----------|------------|-----------|
| Core Developer | 项目核心开发者 | 清晰的模块边界，低认知负担 |
| Skill Developer | 技能扩展开发者 | 简洁的 Skills API，明确的扩展点 |
| Integration Developer | 集成其他 LLM/工具的开发者 | 统一的 Provider 和 Tool 接口 |

### 2.2 Core User Story

> As a developer, I want a single, clean Agent Loop implementation based on EventStream architecture, so that I don't have to choose between two parallel systems when adding features.

### 2.3 Use Cases

| ID | Description | Trigger | Expected Outcome |
|----|------------|---------|-----------------|
| UC-001 | 开发者添加新工具到 Agent | 需要新增 Agent Shell Command | 在 `tools/commands/` 下添加一个文件，注册到路由表即可 |
| UC-002 | 开发者为 Agent 添加新的生命周期 Hook | 需要在 Agent 循环中插入逻辑 | 通过 `AgentLoopConfig.hooks` 配置，无需修改核心循环 |
| UC-003 | 开发者接入新的 LLM Provider | 需要支持新的 LLM API | 实现 `LLMProviderLike` 接口，注册到 Provider 工厂 |
| UC-004 | 开发者阅读理解项目架构 | 新成员 onboarding | 7 个顶层模块，每个有明确的单一职责 |

## 3. Functional Requirements

### 3.1 Feature List

| ID | Feature Name | Description | Priority |
|----|-------------|------------|----------|
| F-001 | 统一 Agent Loop | 以 EventStream 架构为基础，接入所有成熟能力 | Must |
| F-002 | 统一 SubAgent | 消除旧版 SubAgentManager，统一到 sub-agent-core | Must |
| F-003 | 统一类型系统 | 合并消息/事件/工具类型为单一类型层 | Must |
| F-004 | Skills 模块重组 | 24 文件重组为 4 子模块，统一解析器 | Must |
| F-005 | 目标目录结构 | 12 模块重组为 7 模块的新包结构 | Must |
| F-006 | 工具系统扁平化 | 4 层嵌套降至 2 层 | Should |
| F-007 | CLI 渲染整合 | 渲染逻辑统一收敛 | Should |
| F-008 | 循环依赖消除 | 依赖注入替代动态 require | Should |
| F-009 | Hooks 系统简化 | Stop Hook + Skill Enhance Hook 整合 | Could |
| F-010 | Sandbox 模块简化 | Provider Registry 保留，内部精简 | Could |
| F-011 | 测试迁移 | 所有测试随代码迁移更新 | Must |

### 3.2 Feature Details

---

#### F-001: 统一 Agent Loop

**Description**: 以 `src/core/agent-loop.ts` 的 EventStream 架构为最终实现，将 `src/agent/agent-runner.ts` 的 12 项成熟能力逐步接入。

**当前差距矩阵**:

| 能力 | 旧版 (agent-runner) | 新版 (agent-loop) | 迁移动作 |
|------|---------------------|-------------------|----------|
| 会话持久化 | AgentSessionManager | 无 | 新增 SessionPersistence 接口，通过 hooks 接入 |
| 上下文 Offload | ContextOrchestrator | 配置声明但无实现 | 迁移 ContextOrchestrator 逻辑到 core |
| 上下文 Compact | ContextOrchestrator | 配置声明但无实现 | 同上 |
| task: 并行调度 | step.ts groupToolCallsByOrder | 无 | 提取为 tool-executor 模块 |
| 沙箱权限中断 | SandboxPermissionHandler | 无 | 在 AgentResult.stopReason 中增加 |
| 滑动窗口失败检测 | 简单计数 | 组件已实现，未接入 | 接入 executeLoop |
| Stop Hook | StopHookExecutor | hooks 接口声明未调用 | 接入 onComplete hook |
| Todo 提醒 | hasIncompleteTodos() 强制 | TodoReminderStrategy 被动 | 接入 executeLoop |
| MessageValidator | history-sanitizer.ts | 组件已实现，未接入 | 接入 executeLoop |
| Usage 统计 | SessionUsage 累计 | 每轮独立发射 | 增加累计聚合 |
| 自动增强触发 | AutoEnhanceTrigger | 无 | 通过 Stop Hook 机制承载 |
| 流式回调 | onMessagePart | MessageDeltaEvent | 已替代（更好） |

**Input**:
- `AgentLoopConfig`: 配置对象（已有，需扩展）
- `messages: DomainMessage[]`: 初始消息历史
- `tools: AgentTool[]`: 可用工具列表

**Output**:
- `EventStream<AgentEvent>`: 事件流（已有）
- `AgentResult`: 执行结果（需扩展 `stopReason` 联合类型）

**Business Rules**:
1. 所有已存在但未接入的组件（SlidingWindowFailureDetector、TodoReminderStrategy、MessageValidator）必须在 `executeLoop` 中接入
2. `AgentLoopHooks` 的所有声明钩子必须有调用点
3. `AgentLoopConfig` 扩展：增加 `sessionPersistence?`、`sandboxMode?`、完善 `ContextManagerConfig`
4. task: 命令的并行调度作为 `executeToolCalls` 的内部优化，不改变外部接口

**Error & Exception Scenarios**:

| Scenario | Trigger Condition | Expected Behavior |
|----------|------------------|-------------------|
| 连续工具失败 | SlidingWindowFailureDetector.shouldStop() 返回 true | 停止循环，stopReason: 'tool_failure' |
| 达到最大迭代 | turnIndex >= maxIterations | 停止循环，stopReason: 'max_iterations'，发射准确 usage |
| 沙箱阻止 | 工具返回 sandbox_blocked metadata | 暂停循环，stopReason: 'requires_permission' |
| LLM 调用失败 | Provider 抛出异常 | 重试一次后抛出，stopReason: 'error' |
| 上下文超限 | token 数超过 maxContextTokens | 触发 offload/compact，压缩后继续 |

**Boundary Conditions**:
- maxIterations 为 0 时不执行任何 turn
- 空工具列表时仍可执行（纯对话模式）
- hooks 全部可选，缺省时跳过

---

#### F-002: 统一 SubAgent

**Description**: 废弃 `sub-agent-manager.ts`（旧版），统一到 `sub-agent-core.ts`（基于 `runAgentLoop` + `AgentLoopConfig`）。

**Input**:
- `SubAgentConfig`: 子智能体配置（类型、权限、系统提示词）
- 父 Agent 的工具集（用于权限过滤）

**Output**:
- `SubAgentResult`: 执行结果（文本 + usage）

**Business Rules**:
1. `createSubAgent()` 为唯一创建入口
2. `filterToolsByPermissions()` 根据 `include/exclude` 配置过滤工具
3. 子智能体不可递归创建子智能体（`task:` 命令被过滤）
4. 子智能体的 BashTool 通过 `createIsolatedCopy()` 实现会话隔离

**迁移策略**:
- `TaskCommandHandler` 中将 `ISubAgentExecutor` 实现从 `SubAgentManager` 切换到 `sub-agent-core` 的新实现
- `BashTool.createIsolatedCopy()` 能力需要在新架构中保留
- `RestrictedBashTool` 的命令过滤逻辑迁移到 `filterToolsByPermissions()`

---

#### F-003: 统一类型系统

**Description**: 合并分散在 `src/core/types.ts`、`src/providers/types.ts`、`src/types/` 三处的类型定义为单一类型层。

**当前类型重叠分析**:

| 语义 | core/types.ts | providers/types.ts | types/ |
|------|---------------|-------------------|--------|
| 消息 | DomainMessage, LLMProviderMessage | Message (providers) | Message (types/message.ts) |
| 工具调用 | AgentTool, ToolCallResult | - | ToolCall, ToolResult |
| 事件 | AgentEvent, ToolCallEvent | - | ToolCallEvent, SubAgentEvent |
| Usage | AgentUsage | - | TokenUsage, SessionUsage |
| LLM 接口 | LLMProviderLike | LLMClient | - |

**目标设计**:

统一到 `src/types/` 目录，分为以下文件：
- `message.ts`: `DomainMessage`（领域层）+ `LLMMessage`（传输层），废弃旧 `Message` 类型
- `tool.ts`: `AgentTool`, `ToolCall`, `ToolResult`, `ToolCallResult`
- `events.ts`: 所有 `AgentEvent` 联合类型
- `usage.ts`: `TokenUsage`, `SessionUsage`, `AgentUsage`（统一）
- `provider.ts`: `LLMProviderLike` 接口（唯一 LLM 抽象）
- `index.ts`: 统一导出

**Business Rules**:
1. 新版 `DomainMessage` + `LLMMessage` 的两层消息模型为标准，废弃旧版单层 `Message`
2. `LLMProviderLike` 为唯一 LLM 接口抽象，废弃 `LLMClient`
3. 所有模块通过 `import from '../types'` 引用类型，不再有模块内部类型定义

---

#### F-004: Skills 模块重组

**Description**: 将 24 个文件按职责重组为 4 个子模块，统一 SKILL.md 解析器。

**解析器统一决策**: 保留第二套（`skill-schema.ts` + Zod 校验），废弃第一套（`skill-md-parser.ts`）。原因：
- 实现质量更高（逐行状态机、Zod 校验、中英文支持、代码块追踪）
- 被更多消费者使用（indexer、loader vs 仅 generator）
- 需补充缺失字段：`quickStart?`, `bestPractices: string[]`

**目标子模块划分**:

```
src/skills/
├── index.ts                    — 统一导出
├── types.ts                    — 所有技能类型定义
├── schema/                     — 解析与校验子模块（≤5 文件）
│   ├── index.ts
│   ├── skill-doc-parser.ts     — 统一解析器（原 skill-schema.ts）
│   ├── skill-doc-schema.ts     — Zod schema（原 skill-schema-utils.ts）
│   └── skill-template.ts       — SKILL.md 模板渲染（原 skill-template.ts）
├── loader/                     — 加载与搜索子模块（≤5 文件）
│   ├── index.ts
│   ├── skill-loader.ts         — 渐进式加载（原 skill-loader.ts）
│   ├── skill-cache.ts          — TTL 缓存（原 skill-cache.ts）
│   ├── skill-search.ts         — 文本/语义搜索（原 skill-search.ts）
│   └── indexer.ts              — 索引构建（原 indexer.ts + index-updater.ts 合并）
├── generator/                  — 生成与增强子模块（≤6 文件）
│   ├── index.ts
│   ├── skill-generator.ts      — 技能生成（原 skill-generator.ts）
│   ├── skill-enhancer.ts       — 技能增强（原 skill-enhancer.ts）
│   ├── skill-analysis.ts       — 模式检测（原 skill-analysis.ts）
│   ├── skill-spec-builder.ts   — 规格构建（原 skill-spec-builder.ts）
│   ├── generation-pipeline.ts  — 生成流水线（原 skill-generation-pipeline.ts）
│   └── skill-validator.ts      — 结构验证（原 skill-validator.ts）
└── manager/                    — 管理操作子模块（≤6 文件）
    ├── index.ts
    ├── skill-manager.ts        — 顶层 Facade（原 skill-manager.ts）
    ├── metadata-service.ts     — 列表/详情/版本查询（原 skill-metadata-service.ts）
    ├── version-manager.ts      — 版本快照与回滚（原 skill-version-manager.ts）
    ├── import-export.ts        — 导入导出（原 skill-import-export.ts）
    ├── skill-merger.ts         — 技能合并（原 skill-merger.ts）
    └── meta-skill-installer.ts — 内置技能安装（原 meta-skill-installer.ts）
```

**合并/废弃清单**:
- `skill-md-parser.ts` → **废弃**，功能由 `schema/skill-doc-parser.ts` 统一承担
- `indexer.ts` + `index-updater.ts` → **合并**为 `loader/indexer.ts`
- `conversation-reader.ts` → **移入** `generator/`（仅被 enhancer 使用）
- `skill-schema-utils.ts` → **重命名**为 `schema/skill-doc-schema.ts`

**Business Rules**:
1. 统一解析器在 `SkillDocSchema` 中补充 `quickStart?: z.string()` 和 `bestPractices: z.array(z.string()).default([])`
2. `normalizeSection()` 增加 `'quick start'`→`'quickStart'`、`'best practices'`→`'bestPractices'` 映射
3. `skill-generator.ts` 中 `parseSkillMdToSpec` 替换为 `SkillDocParser.parseContent()`，通过转换函数映射到 `SkillSpec`

---

#### F-005: 目标目录结构

**Description**: 将当前 12 个顶层模块重组为 7 个模块。

**当前结构 → 目标结构映射**:

```
当前（12 个顶层模块）:
src/
├── agent/          → 拆分迁移到 core/ 和 session/
├── cli/            → 保留并整合
├── common/         → 合并到 core/
├── config/         → 保留
├── core/           → 扩展为核心循环层
├── hooks/          → 合并到 core/hooks/
├── providers/      → 保留
├── resource/       → 保留
├── sandbox/        → 保留（简化）
├── skills/         → 重组（4 子模块）
├── sub-agents/     → 简化
├── tools/          → 扁平化
├── types/          → 扩展为统一类型层
└── utils/          → 保留

目标（7 个顶层模块）:
src/
├── core/           — Agent 循环核心（agent-loop + 上下文管理 + 事件系统）
├── types/          — 统一类型层（消息/事件/工具/用量）
├── providers/      — LLM Provider 实现
├── tools/          — 三层工具系统（扁平化）
├── skills/         — 技能系统（4 子模块）
├── cli/            — CLI 入口与渲染
└── shared/         — 共享基础设施（config + utils + sandbox）
```

**详细目标结构**:

```
src/
├── core/                       — Agent 循环核心
│   ├── index.ts
│   ├── agent-loop.ts           — 主循环（扩展接入所有能力）
│   ├── agent-loop-config.ts    — 配置接口
│   ├── event-stream.ts         — 事件流
│   ├── event-bus.ts            — 事件总线
│   ├── tool-executor.ts        — 工具执行器（含并行调度）
│   ├── context-orchestrator.ts — 上下文管理（offload + compact）
│   ├── session-persistence.ts  — 会话持久化
│   ├── failure-detector.ts     — 滑动窗口失败检测
│   ├── todo-strategy.ts        — Todo 提醒策略
│   ├── message-validator.ts    — 消息校验
│   ├── cost-tracker.ts         — 成本追踪
│   ├── metrics-collector.ts    — 指标收集
│   ├── system-prompt.ts        — 系统提示词构建
│   ├── hooks/                  — 钩子子系统
│   │   ├── index.ts
│   │   ├── hook-registry.ts    — 钩子注册表
│   │   ├── stop-hook.ts        — Stop Hook 实现
│   │   └── skill-enhance-hook.ts — 技能增强 Hook
│   └── prompts/                — 提示词模板
│       ├── role.md
│       ├── command-system.md
│       └── ...
│
├── types/                      — 统一类型层
│   ├── index.ts
│   ├── message.ts              — DomainMessage + LLMMessage
│   ├── tool.ts                 — AgentTool, ToolCall, ToolResult
│   ├── events.ts               — AgentEvent 联合类型
│   ├── usage.ts                — TokenUsage, SessionUsage
│   └── provider.ts             — LLMProviderLike 接口
│
├── providers/                  — LLM Provider
│   ├── index.ts
│   ├── generate.ts             — 流式生成封装
│   ├── anthropic/
│   │   ├── client.ts
│   │   ├── mapper.ts
│   │   ├── streamed-message.ts
│   │   └── types.ts
│   ├── openai/
│   │   ├── mapper.ts
│   │   └── provider.ts
│   └── google/
│       ├── mapper.ts
│       └── provider.ts
│
├── tools/                      — 三层工具系统（扁平化后）
│   ├── index.ts
│   ├── bash-tool.ts            — 单一 Bash 工具入口
│   ├── bash-router.ts          — 三层命令路由器
│   ├── bash-session.ts         — Shell 会话管理
│   ├── callable-tool.ts        — 工具基类
│   ├── toolset.ts              — 工具集合
│   ├── commands/               — 所有命令处理器（扁平结构）
│   │   ├── index.ts
│   │   ├── base-handler.ts     — 抽象基类
│   │   ├── native-handler.ts   — Layer 1: 原生 Shell
│   │   ├── read-handler.ts     — Layer 2: read 命令
│   │   ├── write-handler.ts    — Layer 2: write 命令
│   │   ├── edit-handler.ts     — Layer 2: edit 命令
│   │   ├── bash-wrapper.ts     — Layer 2: bash 包装
│   │   ├── todo-handler.ts     — Layer 2: todo 命令
│   │   ├── search-handler.ts   — Layer 2: command:search
│   │   ├── mcp-handler.ts      — Layer 3: mcp:* 路由
│   │   ├── skill-tool.ts       — Layer 3: skill:<skill>:<tool>
│   │   ├── skill-mgmt.ts       — Layer 3: skill:* 管理命令
│   │   └── task-handler.ts     — Layer 3: task:* 子智能体
│   ├── converters/             — 工具转换器
│   │   ├── mcp/
│   │   │   ├── index.ts
│   │   │   ├── client.ts
│   │   │   ├── client-manager.ts
│   │   │   ├── config-parser.ts
│   │   │   ├── installer.ts
│   │   │   └── initializer.ts
│   │   ├── skill/
│   │   │   ├── index.ts
│   │   │   ├── structure.ts
│   │   │   ├── docstring-parser.ts
│   │   │   ├── wrapper-generator.ts
│   │   │   ├── initializer.ts
│   │   │   └── watcher.ts
│   │   └── shared/
│   │       ├── bin-installer.ts
│   │       ├── help-generator.ts
│   │       └── interpreter.ts
│   └── operations/             — 文件/Shell 操作抽象
│       ├── file-ops.ts
│       └── bash-ops.ts
│
├── skills/                     — 技能系统（4 子模块，见 F-004）
│   ├── index.ts
│   ├── types.ts
│   ├── schema/
│   ├── loader/
│   ├── generator/
│   └── manager/
│
├── cli/                        — CLI 入口与渲染
│   ├── index.ts                — CLI 入口（commander）
│   ├── repl.ts                 — REPL 主循环
│   ├── repl-init.ts            — REPL 初始化
│   ├── commands/               — 特殊命令（/help, /session 等）
│   │   ├── index.ts
│   │   ├── config-commands.ts
│   │   ├── help-commands.ts
│   │   ├── session-commands.ts
│   │   ├── shell-commands.ts
│   │   └── skill-commands.ts
│   └── renderer/               — 统一渲染模块
│       ├── index.ts
│       ├── terminal-renderer.ts   — 主渲染器（合并原 terminal-renderer + repl-display）
│       ├── tool-call-renderer.ts  — 工具调用渲染
│       ├── sub-agent-renderer.ts  — SubAgent 渲染
│       ├── bottom-bar.ts          — 底部固定区域（原 fixed-bottom-renderer）
│       └── animation.ts           — 动画控制
│
└── shared/                     — 共享基础设施
    ├── index.ts
    ├── constants.ts            — 全局常量
    ├── errors.ts               — 错误类型
    ├── logger.ts               — 日志
    ├── env.ts                  — 环境变量解析
    ├── abort.ts                — 中止信号
    ├── token-counter.ts        — Token 计数
    ├── load-desc.ts            — 模板加载
    ├── config/                 — 配置管理
    │   ├── index.ts
    │   ├── settings-manager.ts
    │   ├── settings-schema.ts
    │   ├── paths.ts
    │   ├── pricing.ts
    │   └── version.ts
    ├── sandbox/                — 沙箱管理
    │   ├── index.ts
    │   ├── sandbox-manager.ts
    │   ├── provider-registry.ts
    │   ├── providers/
    │   │   ├── daytona.ts
    │   │   └── local.ts
    │   └── types.ts
    └── sub-agents/             — 子智能体
        ├── index.ts
        ├── sub-agent.ts        — 统一实现（原 sub-agent-core.ts）
        ├── types.ts
        └── configs/
            ├── index.ts
            ├── explore.ts
            ├── general.ts
            └── skill.ts
```

**模块依赖方向规则（严格单向）**:

```
types       ← 零依赖，所有模块共享
  ↑
shared      ← 依赖 types
  ↑
core        ← 依赖 types, shared
  ↑
providers   ← 依赖 types, shared
  ↑
tools       ← 依赖 types, shared, core, providers
  ↑
skills      ← 依赖 types, shared, tools
  ↑
cli         ← 依赖所有模块（应用层）
```

**被移除的模块**:
- `src/agent/` → 能力迁移到 `core/`，会话管理合并到 `core/session-persistence.ts`
- `src/common/` → 合并到 `shared/`
- `src/hooks/` → 合并到 `core/hooks/`
- `src/utils/` → 合并到 `shared/`

---

#### F-006: 工具系统扁平化

**Description**: 将 `tools/handlers/agent-bash/`、`tools/handlers/extend-bash/` 的 4 层嵌套合并为 `tools/commands/` 的 2 层结构。

**当前结构**:
```
tools/handlers/
├── agent-bash/
│   ├── todo/
│   │   ├── todo-schema.ts
│   │   ├── todo-store.ts
│   │   └── todo-write.ts
│   ├── read.ts
│   ├── write.ts
│   ├── edit.ts
│   └── bash-wrapper.ts
├── extend-bash/
│   ├── mcp-command-handler.ts
│   ├── skill-tool-handler.ts
│   └── command-search.ts
├── native-command-handler.ts
├── skill-command-handler.ts
├── skill-command-read-handlers.ts
├── skill-command-write-handlers.ts
└── task-command-handler.ts
```

**目标结构**:
```
tools/commands/
├── index.ts
├── base-handler.ts
├── native-handler.ts
├── read-handler.ts
├── write-handler.ts
├── edit-handler.ts
├── bash-wrapper.ts
├── todo-handler.ts        （合并 todo/ 3 文件）
├── search-handler.ts
├── mcp-handler.ts
├── skill-tool.ts
├── skill-mgmt.ts          （合并 read/write handlers）
└── task-handler.ts
```

**Business Rules**:
1. `todo/` 子目录 3 个文件合并为 `todo-handler.ts`（TodoStore + TodoSchema 作为私有实现）
2. `skill-command-handler.ts` + `skill-command-read-handlers.ts` + `skill-command-write-handlers.ts` 合并为 `skill-mgmt.ts`
3. 所有 handler 继承 `base-handler.ts`（原 `base-agent-handler.ts`）
4. 三层路由逻辑不变，只是文件组织扁平化

---

#### F-007: CLI 渲染整合

**Description**: 将分散的渲染逻辑统一收敛到 `cli/renderer/` 子目录。

**合并策略**:
- `terminal-renderer.ts` + `repl-display.ts` → `renderer/terminal-renderer.ts`（消除 250 行的 repl-display 独立文件）
- `fixed-bottom-renderer.ts` → `renderer/bottom-bar.ts`
- `renderer/` 子目录保持现有结构，但去除 `tree-builder.ts`（如非必要）
- `hook-output.ts` 合并到 `renderer/` 中

**Business Rules**:
1. SubAgent 渲染回调链从 5 层缩短为 3 层：`CLI (renderer) → BashTool → SubAgent`
2. 所有渲染相关类型统一到 `renderer/types.ts`

---

#### F-008: 循环依赖消除

**Description**: 用依赖注入替代所有 `require()` 动态加载和 `setToolExecutor()` 延迟绑定。

**当前循环依赖**:
1. `BashRouter` ←→ `BashTool`（通过 `setToolExecutor()` 延迟绑定打破）
2. `BashRouter` → `SubAgentManager`（通过 `require()` 动态加载打破）
3. `TaskCommandHandler` → `ISubAgentExecutor`（已通过接口解耦）

**目标方案**:
1. `BashTool` 构造时将 `execute` 方法通过工厂函数注入 `BashRouter`，而非 `setToolExecutor()` 回调
2. `SubAgentManager` 通过 `AgentLoopConfig` 的工厂配置注入 `BashRouter`，不使用 `require()`
3. 保持 `ISubAgentExecutor` 接口解耦模式（这是正确的做法）

---

#### F-009: Hooks 系统简化

**Description**: 将 `src/hooks/` 的 9 个文件整合为 `core/hooks/` 的 3 个文件。

**当前 hooks/ 文件**:
```
hooks/
├── index.ts
├── types.ts
├── load-stop-hooks.ts
├── stop-hook-registry.ts
├── stop-hook-constants.ts
├── skill-enhance-hook.ts
├── skill-enhance-constants.ts
├── skill-enhance-meta-loader.ts
├── skill-enhance-result-parser.ts
└── skill-enhance-hook-prompt.md
```

**目标合并为**:
```
core/hooks/
├── index.ts
├── hook-registry.ts       — 合并 types + registry + constants + load
├── stop-hook.ts           — Stop Hook 基础实现
└── skill-enhance-hook.ts  — 合并 4 个 skill-enhance-* 文件
```

---

#### F-010: Sandbox 模块简化

**Description**: 保留 Provider Registry 模式，将文件结构从 3 层嵌套简化为 2 层。

**当前结构**:
```
sandbox/
├── providers/
│   ├── daytona/
│   │   ├── index.ts
│   │   └── daytona-backend.ts
│   └── local/
│       ├── index.ts
│       ├── local-backend.ts
│       └── platforms/
│           ├── index.ts
│           ├── linux-adapter.ts
│           ├── macos-adapter.ts
│           └── platform-adapter.ts
├── sandbox-manager.ts
├── provider-registry.ts
├── sandbox-config.ts
├── types.ts
└── index.ts
```

**目标**:
```
shared/sandbox/
├── index.ts
├── sandbox-manager.ts
├── provider-registry.ts
├── types.ts
├── providers/
│   ├── daytona.ts          — 合并 index + backend
│   └── local.ts            — 合并 index + backend + platforms
```

**Business Rules**:
1. 平台适配器内联到 `local.ts`（macOS 和 Linux 的差异代码量小，无需独立文件）
2. `sandbox-config.ts` 合并到 `types.ts`

---

#### F-011: 测试迁移

**Description**: 所有现有测试随代码迁移更新路径和导入。

**Business Rules**:
1. 测试目录结构镜像源代码目录结构
2. 每个被移动/重命名的源文件，对应的测试文件同步调整 import 路径
3. 不新增测试，不删除测试（除了针对被删除代码的测试）
4. 迁移完成后 `bun test` 全部通过

## 4. Non-Functional Requirements

### 4.1 结构约束

| Metric | Requirement | Measurement Method |
|--------|------------|-------------------|
| 顶层模块数 | ≤ 7 个 | `ls src/` |
| 单模块最大文件数 | ≤ 10 个（不含 index.ts 和子目录） | `ls src/<module>/*.ts \| wc -l` |
| 目录嵌套深度 | src/ 下 ≤ 3 层 | 目录遍历检查 |
| 循环依赖 | 0 | `bun run test:arch`（dependency-cruiser） |

### 4.2 类型安全

| Metric | Requirement | Measurement Method |
|--------|------------|-------------------|
| TypeScript 编译 | 零错误 | `bun run typecheck` |
| any 使用 | 不增加 any 数量 | `grep -r 'any' src/ \| wc -l` 对比 |

### 4.3 测试要求

| Metric | Requirement | Measurement Method |
|--------|------------|-------------------|
| 现有测试通过率 | 100% | `bun test` |
| ESLint 检查 | 零警告 | `bun run lint` |

## 5. Constraints & Dependencies

### 5.1 Constraints
- 核心思想不变：单一 Bash 工具 + 三层路由、MCP/Skill 扩展、自我成长、SubAgent 体系
- 技术栈不变：Bun + TypeScript + Ink + Zod + Pino
- 不增减生产依赖
- Breaking Change 允许（项目开发阶段，重构优先于兼容）

### 5.2 External Dependencies
- `@anthropic-ai/sdk` ^0.72.1
- `@modelcontextprotocol/sdk` ^1.25.3
- `openai` ^6.22.0
- `@google/genai` ^1.41.0

### 5.3 Assumptions
- `core/agent-loop.ts` 的 EventStream 架构足以承载所有 `agent-runner.ts` 能力（差距分析已验证）
- 两套 SKILL.md 解析器合并后不会引入解析行为回退（保留更完整的一套）
- 循环依赖可通过依赖注入 + 接口抽象完全消除

## 6. BDD Testability Check

| Dimension | Verification Question | Status |
|-----------|----------------------|--------|
| Input/Output format | 所有模块的输入输出类型已在 F-003 中明确定义 | Pass |
| Error & exception scenarios | F-001 列出了 5 个错误场景及预期行为 | Pass |
| Boundary & priority rules | MoSCoW 优先级明确，模块依赖方向有严格规则 | Pass |
| State behavior | 会话持久化、上下文压缩的状态行为在 F-001 中描述 | Pass |
| Verifiable granularity | 每个 Feature 可独立测试（统一类型 → 统一循环 → 模块重组） | Pass |
| Ambiguity check | 目标目录结构精确到文件级，无歧义 | Pass |

## 7. Glossary

| Term | Definition |
|------|-----------|
| EventStream | 基于 AsyncIterable 的事件流，Agent Loop 的核心输出机制 |
| DomainMessage | 领域层消息，包含语义丰富的结构（角色、内容、工具调用） |
| LLMMessage | 传输层消息，适配具体 LLM Provider 的格式 |
| AgentTool | 工具抽象接口，包含 name、description、schema、execute |
| BashRouter | 三层命令路由器，将 shell 命令分发到不同处理器 |
| Stop Hook | Agent 循环结束后执行的回调钩子 |
| ContextOrchestrator | 上下文管理编排器，负责 offload（卸载）和 compact（压缩） |
| SubAgent | 子智能体，由父 Agent 的 task: 命令创建 |
