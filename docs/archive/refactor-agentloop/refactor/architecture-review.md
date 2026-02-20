# Synapse Agent 架构审查报告

> 审查日期：2026-02-08
> 审查范围：`src/` 全目录（10 个顶层模块，约 70 个 TypeScript 文件）

---

## 一、项目架构概览

### 1.1 模块拓扑

```
src/
├── agent/          # Agent 循环、会话、上下文管理（9 files）
├── cli/            # REPL 交互界面、终端渲染（7 files）
├── config/         # 配置管理、定价（5 files）
├── hooks/          # Stop Hooks 系统（6 files）
├── providers/      # LLM 客户端抽象（6 files）
├── skills/         # 技能系统（8 files）
├── sub-agents/     # 子智能体管理（6 files）
├── tools/          # 三层工具体系核心（~25 files）
│   ├── handlers/   # 命令处理器
│   └── converters/ # MCP/Skill 转换器
└── utils/          # 通用工具函数（7 files）
```

### 1.2 模块依赖图

```
agent ──────→ [config, hooks, providers, skills, tools, utils]
cli ────────→ [agent, config, hooks, providers, sub-agents, tools, utils]
config ─────→ [providers, utils]
hooks ──────→ [config, providers, skills, sub-agents, tools, utils]
providers ──→ [config, tools, utils]
skills ─────→ [utils]
sub-agents ─→ [agent, cli, providers, skills, tools, utils]
tools ──────→ [cli, providers, skills, sub-agents, utils]
utils ──────→ [providers]
```

### 1.3 调用链关键路径

```
用户输入 → REPL (cli/repl.ts)
         → AgentRunner.run() (agent/agent-runner.ts)
         → step() (agent/step.ts)
         → generate() (providers/generate.ts)
         → AnthropicClient (providers/anthropic/)
         → Tool Call → CallableToolset.handle()
                     → BashTool.execute()
                     → BashRouter.route()
                     → Layer 1: NativeShellCommandHandler
                     → Layer 2: ReadHandler / WriteHandler / EditHandler / TodoWriteHandler
                     → Layer 3: MCP / Skill / Task (SubAgent)
```

---

## 二、问题清单

### P1 - 循环依赖（严重程度：高）

检测到 **6 组双向循环依赖**：

| 编号 | 模块 A | 模块 B | 涉及具体文件 |
|------|--------|--------|-------------|
| C1 | `tools` | `cli` | `bash-tool.ts` / `bash-router.ts` 导入 `cli/terminal-renderer-types.ts` |
| C2 | `tools` | `sub-agents` | `bash-router.ts` 导入 `sub-agents/sub-agent-types.ts`；`sub-agent-manager.ts` 导入 `tools/*` |
| C3 | `sub-agents` | `cli` | `sub-agent-manager.ts` 导入 `cli/terminal-renderer-types.ts` |
| C4 | `providers` | `tools` | `message.ts` 导入 `tools/callable-tool.ts`（ToolReturnValue 类型） |
| C5 | `providers` | `config` | `anthropic-client.ts` 导入 `config/settings-manager.ts` |
| C6 | `utils` | `providers` | `token-counter.ts` 导入 `providers/message.ts`（Message 类型） |

**影响分析**：
- C1/C2/C3 形成 `tools → cli → sub-agents → tools` 的三角循环，是当前最严重的架构问题
- C4 导致 `providers` 和 `tools` 互相依赖：`providers/message.ts` 引入 `ToolReturnValue`，而 `tools/*` 引入 `providers/*`
- C5 导致 `providers` 层不再是纯粹的 LLM 抽象层
- C6 导致 `utils` 依赖上层的 `providers`，破坏了 utils 作为底层工具库的定位

### P2 - `agent/index.ts` 跨层重导出（严重程度：高）

`agent/index.ts` 不仅导出自身模块的内容，还重导出了：
- `providers/message.ts` 的所有类型
- `providers/generate.ts` 的所有类型
- `tools/callable-tool.ts` 的 CallableTool、ToolOk、ToolError
- `tools/toolset.ts` 的 Toolset、CallableToolset
- `hooks/index.ts` 的 StopHook 类型

**问题**：`agent/` 的 barrel file 实际上扮演了"全局 facade"角色，混淆了模块边界。消费者无法区分某个类型到底属于 agent、providers 还是 tools。

### P3 - `BashToolSchema` 与 `BashTool` 重复定义（严重程度：中）

- `bash-tool-schema.ts` 手工定义了 Anthropic Tool JSON Schema
- `bash-tool.ts` 中的 `BashTool` 通过 Zod 的 `toJSONSchema` 自动生成了同样的 schema

`BashToolSchema` 在项目中**零引用**（已被 `BashTool.toolDefinition` 完全替代），属于死代码。

### P4 - `repl.ts` 上帝文件（严重程度：高）

`repl.ts` 超过 **1050 行**，承担了过多职责：
1. REPL 循环管理（readline 交互）
2. Agent 初始化和生命周期
3. 特殊命令处理（/help, /clear, /cost, /context, /compact, /model, /tools, /skills, /resume, /skill enhance）
4. Shell 命令执行（!prefix）
5. MCP 和 Skill 工具初始化
6. Session resume 交互流程
7. 终端 UI 输出（showHelp, showToolsList, showSkillsList, showContextStats...）

违反单一职责原则，且包含大量 UI 展示代码。

### P5 - `agent-runner.ts` 职责膨胀（严重程度：中）

`agent-runner.ts` 超过 **900 行**，包含：
- Agent 循环主逻辑（核心）
- 会话持久化管理
- 上下文 offload 管理
- 上下文 compact 管理
- Stop Hooks 执行
- Todo 检查逻辑
- 工具协议消息清洗（`sanitizeToolProtocolHistory`）
- Bash 工具误用检测
- 技能搜索指令注入

其中 `sanitizeToolProtocolHistory()` 和 `parseEnvScanRatio()` 等辅助函数与 Agent 循环无关。

### P6 - `terminal-renderer-types.ts` 位置不当（严重程度：中）

`terminal-renderer-types.ts` 位于 `cli/` 目录，但被 `tools/bash-tool.ts`、`tools/bash-router.ts`、`sub-agents/sub-agent-manager.ts` 导入。这些底层模块不应依赖 `cli/`。

这是造成 C1 和 C3 循环依赖的直接原因。

### P7 - `providers/message.ts` 依赖 `tools/callable-tool.ts`（严重程度：中）

`Message` 和 `ToolResult` 是系统核心数据类型，定义在 `providers/message.ts`。但 `ToolResult` 引用了 `tools/callable-tool.ts` 中的 `ToolReturnValue`。

导致 `providers` 层依赖 `tools` 层，破坏了"providers 是纯 LLM 抽象层"的分层设计。

### P8 - `hooks` 模块依赖过重（严重程度：中）

`hooks/skill-enhance-hook.ts` 依赖：`config`, `providers`, `skills`, `sub-agents`, `tools`, `utils`（6 个模块）。

一个 Hook 函数不应直接依赖如此多的模块，说明 `skill-enhance-hook` 承担了过多逻辑，应将具体增强逻辑委托给 `skills` 模块。

### P9 - 缺少统一的类型/接口层（严重程度：中）

核心共享类型分散在多个模块中：
- `Message`, `ToolCall`, `ToolResult` → `providers/message.ts`
- `ToolReturnValue` → `tools/callable-tool.ts`
- `SubAgentType`, `ToolPermissions` → `sub-agents/sub-agent-types.ts`
- `ToolCallEvent`, `SubAgentToolCallEvent` → `cli/terminal-renderer-types.ts`
- `CommandResult` → `tools/handlers/base-bash-handler.ts`
- `TokenUsage` → `providers/anthropic/anthropic-types.ts`

缺少集中的类型定义层导致循环依赖和跨层引用泛滥。

### P10 - `AnthropicClient` 构造函数直接读取配置（严重程度：低）

`AnthropicClient` 构造函数内部调用 `new SettingsManager()` 读取配置，导致 `providers` 依赖 `config`。Provider 层应通过外部注入配置，而非自行读取。

### P11 - 分词/命令解析逻辑重复（严重程度：低）

以下文件各自实现了独立的命令行分词逻辑：
- `tools/handlers/agent-bash/command-utils.ts`（`parseCommandArgs`）
- `tools/handlers/skill-command-handler.ts`（`tokenize`）
- `tools/handlers/task-command-handler.ts`（间接使用 `parseCommandArgs`）

### P12 - `step.ts` 内联了过多并发控制逻辑（严重程度：低）

`step.ts` 近 400 行，其中超过一半是 task 批次并发执行、abort 信号守护等逻辑。核心的 `step()` 函数签名清晰，但实现被并发管理代码稀释。

### P13 - 没有顶层 `src/index.ts` 统一入口（严重程度：低）

项目缺少 `src/index.ts` 统一导出入口。虽然各子模块有 barrel file，但对外使用者需要从具体子模块路径导入，不利于包的对外暴露。

### P14 - `BashRouter` 构造函数参数过多（严重程度：低）

`BashRouter` 构造函数通过 `BashRouterOptions` 接收 8 个可选参数（包括 4 个回调函数），且这些回调仅用于 SubAgent 场景。过多的可选参数暗示职责边界模糊。

### P15 - `session.ts` 同步 IO（严重程度：低）

`Session` 类中大量使用 `fs.readFileSync` / `fs.writeFileSync` / `fs.existsSync` 等同步 IO 调用。`loadHistory()` 方法名暗示异步但内部调用 `loadHistorySync()`。虽然在当前 Bun 运行时下性能影响有限，但不利于将来迁移到严格异步场景。

---

## 三、与业界 Agent 框架对比

### 3.1 Claude Code Agent SDK

| 维度 | Claude Code | Synapse Agent |
|------|-------------|---------------|
| 工具暴露 | 多工具（Bash, Read, Write, Glob, Grep...） | 单一 Bash 工具 + 内部路由 |
| Provider 抽象 | 多 Provider 支持 | 仅 Anthropic |
| 子 Agent | 内建 Task/Explore agent | task:* 命令路由到 SubAgent |
| 技能系统 | 无内建 | 完整的 Skill 生命周期 |
| 上下文管理 | 自动压缩 | Offload + Compact 双策略 |

**启示**：Synapse 的"单一 Bash 工具"设计虽然降低了 LLM 学习成本，但也增加了路由层的复杂度。Claude Code 选择多工具方案，实测中 LLM 的工具选择准确率并无明显下降。

### 3.2 LangChain Agent

| 维度 | LangChain | Synapse Agent |
|------|-----------|---------------|
| 架构模式 | Chain/Agent/Tool 分离 | Runner/Step/Tool 分离 |
| 消息类型 | 独立 MessageSchema | 自定义 Message + Anthropic 转换 |
| Provider | BaseLanguageModel 抽象 | 直接绑定 AnthropicClient |
| 可扩展性 | Plugin 机制 | MCP/Skill 转换器 |

**启示**：LangChain 的 `BaseLanguageModel` 抽象使得切换 Provider 无需改动上层代码。Synapse 当前与 Anthropic 强耦合。

### 3.3 AutoGen

| 维度 | AutoGen | Synapse Agent |
|------|---------|---------------|
| 多 Agent | 原生支持多 Agent 协作 | SubAgentManager 实现受限并发 |
| 通信 | Agent 间消息传递 | 无 Agent 间通信，仅父→子委托 |
| 工具注册 | 装饰器注册 | BashRouter 静态注册 |

**启示**：如果要扩展多 Agent 协作场景，当前的 SubAgent 模型需要重大改造。

---

## 四、重构建议

### R1 - 抽取 `src/types/` 共享类型层 [优先级：高]

**目标**：消除 P4/P6/P7/P9 识别的循环依赖根源

**实现思路**：
1. 创建 `src/types/` 目录，包含：
   - `message.ts`：Message, ToolCall, ToolResult, ContentPart 等核心消息类型
   - `tool.ts`：ToolReturnValue, CommandResult, ToolPermissions
   - `events.ts`：ToolCallEvent, ToolResultEvent, SubAgentToolCallEvent, SubAgentCompleteEvent（从 `cli/terminal-renderer-types.ts` 迁移）
   - `usage.ts`：TokenUsage, SessionUsage
2. 所有模块从 `types/` 导入共享类型，不再跨层引用
3. `providers/message.ts` 不再引用 `tools/callable-tool.ts`
4. `tools/` 不再引用 `cli/`

**预期收益**：消除 C1、C3、C4、C6 四组循环依赖

### R2 - 拆分 `repl.ts` [优先级：高]

**目标**：解决 P4，将 1050 行文件拆分为合理粒度

**实现思路**：
```
cli/
├── index.ts              # CLI 入口（保持）
├── repl.ts               # REPL 主循环（精简到 ~200 行）
├── repl-commands.ts      # 特殊命令处理（/help, /exit, /clear 等）
├── repl-display.ts       # UI 展示函数（showHelp, showContextStats 等）
├── repl-initializer.ts   # Agent/MCP/Skill 初始化
├── terminal-renderer.ts  # 终端渲染（保持）
├── fixed-bottom-renderer.ts  # 固定底部渲染（保持）
└── hook-output.ts        # Hook 输出处理（保持）
```

### R3 - 拆分 `agent-runner.ts` [优先级：中]

**目标**：解决 P5，将 AgentRunner 聚焦于核心循环

**实现思路**：
1. 将 `sanitizeToolProtocolHistory()` 抽取到 `agent/history-sanitizer.ts`
2. 将上下文管理（offload/compact）逻辑已经在 `context-manager.ts` 和 `context-compactor.ts`，AgentRunner 中的编排代码可抽取到 `agent/context-orchestrator.ts`
3. 将 `prependSkillSearchInstruction()` 和 `parseEnvScanRatio()` 等辅助函数移到合适的 utils 文件
4. 将 StopHooks 执行逻辑抽取到独立方法或模块

**目标行数**：AgentRunner 类精简到 ~400 行

### R4 - Provider 抽象化 [优先级：中]

**目标**：解决 P10，为未来支持多 Provider 做准备

**实现思路**：
1. 定义 `providers/base-client.ts`：
   ```typescript
   interface LLMClient {
     readonly modelName: string;
     generate(systemPrompt: string, messages: Message[], tools: Tool[], options?: GenerateOptions): Promise<StreamedMessage>;
     withModel(model: string): LLMClient;
     withGenerationKwargs(kwargs: Partial<GenerationKwargs>): LLMClient;
   }
   ```
2. `AnthropicClient` 实现 `LLMClient` 接口
3. 配置注入改为构造函数参数，不在 Provider 内部读取 SettingsManager
4. 上层代码（AgentRunner, ContextCompactor 等）仅依赖 `LLMClient` 接口

**预期收益**：消除 C5 循环依赖，支持未来添加 OpenAI/Gemini 等 Provider

### R5 - 清理 `agent/index.ts` 重导出 [优先级：中]

**目标**：解决 P2，让每个模块的 barrel file 只导出自身的内容

**实现思路**：
1. `agent/index.ts` 仅导出 agent 自身的类和函数：AgentRunner, Session, step, buildSystemPrompt 等
2. 消费者直接从 `providers/` 导入 Message 类型，从 `tools/` 导入 Toolset
3. 更新所有使用方的 import 路径

### R6 - 删除死代码 `bash-tool-schema.ts` [优先级：中]

**目标**：解决 P3

**实现思路**：
- 确认 `BashToolSchema` 在项目中零引用（已确认）
- 删除 `src/tools/bash-tool-schema.ts`

### R7 - `BashRouter` 回调抽象 [优先级：低]

**目标**：解决 P14，降低 BashRouter 构造函数的参数数量

**实现思路**：
1. 将 SubAgent 相关的 4 个回调合并为一个 `SubAgentEventListener` 接口：
   ```typescript
   interface SubAgentEventListener {
     onToolStart?(event: SubAgentToolCallEvent): void;
     onToolEnd?(event: ToolResultEvent): void;
     onComplete?(event: SubAgentCompleteEvent): void;
     onUsage?(usage: TokenUsage, model: string): void;
   }
   ```
2. BashRouterOptions 简化为：
   ```typescript
   interface BashRouterOptions {
     synapseDir?: string;
     llmClient?: AnthropicClient;
     toolExecutor?: BashTool;
     getConversationPath?: () => string | null;
     subAgentListener?: SubAgentEventListener;
   }
   ```

### R8 - 统一命令解析工具 [优先级：低]

**目标**：解决 P11

**实现思路**：
- 将 `command-utils.ts` 中的 `parseCommandArgs` 作为唯一的命令行分词函数
- 删除 `skill-command-handler.ts` 中重复的 `tokenize()` 方法，改用 `parseCommandArgs`

### R9 - `hooks/skill-enhance-hook.ts` 瘦身 [优先级：低]

**目标**：解决 P8

**实现思路**：
- Hook 函数仅负责"判定是否应该触发增强"和"发起增强调用"
- 将实际的对话分析、技能生成逻辑保持在 `skills/skill-enhancer.ts`
- Hook 通过简洁的接口调用 SkillEnhancer，而非在 Hook 中重复组装上下文

### R10 - 考虑引入 Provider 独立的消息协议 [优先级：低/远期]

**目标**：完全解耦 Message 类型与任何具体 Provider

**实现思路**：
- `src/types/message.ts` 定义 Provider 无关的消息类型
- `providers/anthropic/` 中保留 Anthropic 专有类型（如 `ThinkingEffort`、`cache_control`）
- 在 `providers/anthropic/anthropic-client.ts` 中完成转换

---

## 五、重构优先级路线图

```
Phase 1 (短期，1-2 周)
├── R1: 抽取 src/types/ 共享类型层 ─── 消除循环依赖
├── R6: 删除 bash-tool-schema.ts ──── 清理死代码
└── R5: 清理 agent/index.ts 重导出 ── 明确模块边界

Phase 2 (中期，2-3 周)
├── R2: 拆分 repl.ts ─────────────── 降低文件复杂度
├── R3: 拆分 agent-runner.ts ──────── 聚焦核心循环
└── R8: 统一命令解析 ──────────────── 消除重复代码

Phase 3 (长期，按需)
├── R4: Provider 抽象化 ───────────── 支持多 Provider
├── R7: BashRouter 回调抽象 ────────── 简化接口
├── R9: hooks 瘦身 ────────────────── 降低耦合
└── R10: 消息协议解耦 ─────────────── 完全独立
```

---

## 六、可扩展性评估

### 6.1 添加新 Provider

**当前状态**：困难。`AnthropicClient` 在项目中硬编码使用，且在 `providers/message.ts` 中混入了 Anthropic 特有的 `ThinkingPart` 和 `cache_control` 概念。

**改进后**：实施 R4 后，新增 Provider 只需实现 `LLMClient` 接口。

### 6.2 添加新 Agent Shell Command（Layer 2）

**当前状态**：较易。在 `tools/handlers/agent-bash/` 中创建新 Handler 类，然后在 `BashRouter.agentHandlers` 数组中注册即可。

**不足**：新增命令需要修改 `BashRouter` 构造函数，无动态注册机制。

### 6.3 添加新 MCP/Skill 工具（Layer 3）

**当前状态**：良好。MCP 通过 `mcp_servers.json` 配置，Skill 通过 `~/.synapse/skills/` 目录结构。均有初始化器（`mcp-initializer.ts`, `skill-initializer.ts`）自动发现和注册。

### 6.4 添加新 SubAgent 类型

**当前状态**：中等。需要：
1. 在 `sub-agents/sub-agent-types.ts` 中添加新类型
2. 在 `sub-agents/configs/` 下创建配置文件
3. 在 `configs/index.ts` 的 `staticConfigs` 中注册

流程清晰但分散，可考虑使用注册器模式。

---

## 七、总结

Synapse Agent 的"一切皆 Shell Command"设计理念独特，三层工具体系清晰。但在快速迭代过程中，模块间边界逐渐模糊，产生了 6 组循环依赖和多个上帝文件。

**最需要优先解决的三个问题**：
1. **循环依赖**（P1）—— 通过 R1 抽取共享类型层解决
2. **repl.ts 上帝文件**（P4）—— 通过 R2 拆分解决
3. **agent/index.ts 跨层重导出**（P2）—— 通过 R5 清理解决

这三项改动风险可控、收益明显，建议在 Phase 1 优先实施。
