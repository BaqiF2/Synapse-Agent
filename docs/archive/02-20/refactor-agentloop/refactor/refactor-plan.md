# Synapse Agent 综合重构方案

> 综合日期：2026-02-08
> 基于四份审查报告：architecture-review.md, agent-core-review.md, tools-review.md, periphery-review.md
> 基线：826 tests passing, 0 failures

---

## 一、全局问题摘要

四份报告共发现 **6 个 P0 关键问题、20+ 个 P1 重要问题、30+ 个 P2 改善项**。

### 跨报告交叉验证的高频问题

| 问题 | 被几份报告提及 | 影响范围 |
|------|---------------|---------|
| **循环依赖**（6 组） | architect, core, tools, periphery | 全局架构 |
| **repl.ts 上帝文件**（1057 行） | architect, periphery | CLI 层 |
| **agent-runner.ts 职责膨胀**（900+ 行） | architect, core | Agent 核心 |
| **BashRouter 职责过重**（608 行） | architect, tools | 工具系统 |
| **Provider 层无抽象** | architect, periphery | 可扩展性 |
| **代码重复**（分词/安装/帮助/路径） | architect, tools, periphery | 全局 |
| **Session 同步 I/O + 竞态** | core | 数据安全 |

---

## 二、分阶段重构计划

### Phase 0：紧急修复（1-2 天）

> 修复可能导致数据丢失或运行时错误的 P0 问题

| # | 任务 | 来源 | 风险 | 工作量 |
|---|------|------|------|--------|
| **0.1** | 修复 `agent-runner.ts:822` 迭代超限消息未持久化 — 使用 `appendMessage` 替代直接 push | core P0-3 | 数据丢失 | S |
| **0.2** | 清理 `SubAgentManager.agents` 死代码 — 删除未使用的 Map 及 `get/has/destroy/destroyAll/size`，简化为纯工厂 | core P0-1 | 误导开发者 | S |
| **0.3** | 删除 `bash-tool-schema.ts` — 零引用的死代码 | architect P3 + tools | 无 | XS |
| **0.4** | 修复 `settings-schema.ts` 占位符 API key — 改为 `process.env.ANTHROPIC_API_KEY ?? ''`，增加使用前校验 | periphery H3 | 无效请求 | S |

---

### Phase 1：消除循环依赖 + 清理模块边界（3-5 天）

> 这是后续所有重构的基础，必须最先完成

#### 1.1 创建 `src/types/` 共享类型层

**目标**：一次性消除 6 组循环依赖中的 4 组（C1, C3, C4, C6）

```
src/types/
├── index.ts          # 统一导出
├── message.ts        # Message, ToolCall, ToolResult, ContentPart, MergeablePart
├── tool.ts           # ToolReturnValue, CommandResult, ToolPermissions, CommandHandler
├── events.ts         # ToolCallEvent, ToolResultEvent, SubAgentToolCallEvent（从 cli/terminal-renderer-types.ts 迁移）
└── usage.ts          # TokenUsage, SessionUsage, RoundUsage
```

**迁移步骤**：
1. 创建 `src/types/` 目录和文件
2. 将 `providers/message.ts` 中的核心类型移至 `types/message.ts`
3. 将 `tools/callable-tool.ts` 中的 `ToolReturnValue` 移至 `types/tool.ts`
4. 将 `cli/terminal-renderer-types.ts` 中的事件类型移至 `types/events.ts`
5. 将 `tools/handlers/base-bash-handler.ts` 中的 `CommandResult` 移至 `types/tool.ts`
6. 更新所有 import 路径（预计影响 30+ 文件）
7. 运行 `bun test` 验证

**预期收益**：
- 消除 C1（tools ↔ cli）、C3（sub-agents ↔ cli）、C4（providers ↔ tools）、C6（utils ↔ providers）
- `cli/terminal-renderer-types.ts` 可删除或仅保留渲染专用类型

#### 1.2 清理 `agent/index.ts` 跨层重导出

**目标**：消除 barrel file 的 facade 角色

**步骤**：
1. `agent/index.ts` 仅导出 agent 自身：`AgentRunner`, `Session`, `step`, `buildSystemPrompt` 等
2. 外部消费者直接从 `types/`、`providers/`、`tools/` 导入
3. 全局搜索 `from '../agent'` 或 `from './agent'` 更新 import

#### 1.3 Provider 配置注入（消除 C5）

**目标**：`AnthropicClient` 不再自行读取 `SettingsManager`

**步骤**：
1. `AnthropicClient` 构造函数改为接受配置参数（apiKey, baseUrl, model）
2. 在 `repl.ts` 初始化时注入配置
3. 消除 `providers → config` 的循环依赖（C5）

---

### Phase 2：拆分上帝文件（5-7 天）

> 降低核心文件的复杂度，提升可维护性

#### 2.1 拆分 `repl.ts`（1057 行 → 4 文件）

```
src/cli/
├── repl.ts               # REPL 主循环 + 事件绑定（~250 行）
├── repl-commands.ts       # 特殊命令处理：/help, /clear, /cost, /context, /compact, /model, /tools, /skills, /resume, /skill enhance
├── repl-display.ts        # 显示函数：showHelp, showToolsList, showSkillsList, showContextStats, showSkillEnhanceHelp
└── repl-init.ts           # 初始化逻辑：initializeAgent, initializeMcpTools, initializeSkillTools
```

**注意**：`repl-display.ts` 中的 `showSkillsList` 应复用 `SkillLoader` 而非直接操作文件系统

#### 2.2 拆分 `agent-runner.ts`（900+ 行 → 4 文件）

```
src/agent/
├── agent-runner.ts           # 核心循环 run() + step 编排（~400 行）
├── history-sanitizer.ts      # sanitizeToolProtocolHistory, hasMalformedToolArguments, isObjectJsonString
├── context-orchestrator.ts   # offload/compact 编排逻辑（从 AgentRunner 提取）
└── context-constants.ts      # OFFLOAD_REFERENCE_PREFIX 等共享常量
```

**额外清理**：
- `parseEnvScanRatio`, `parseEnvOptionalString` → 移入 `utils/env.ts`
- `prependSkillSearchInstruction` → 移入 `system-prompt.ts`
- `BASH_TOOL_NAME` → 使用 `tools/constants.ts` 中的定义
- `appendMessage` 闭包 → 改为实例方法

#### 2.3 拆分 `BashRouter`（608 行 → 路由 + Handler）

```
src/tools/
├── bash-router.ts                         # 仅保留路由逻辑 + handler 注册（~200 行）
├── handlers/
│   ├── extend-bash/
│   │   ├── mcp-command-handler.ts         # 从 BashRouter.executeMcpCommand 提取
│   │   └── skill-tool-handler.ts          # 从 BashRouter.executeSkillCommand 提取
```

#### 2.4 拆分 `skill-enhance-hook.ts`（481 行 → 2 文件）

```
src/hooks/
├── skill-enhance-hook.ts              # 主钩子逻辑（~250 行）
└── skill-enhance-result-parser.ts     # 结果解析和标准化（~150 行）
```

---

### Phase 3：消除代码重复（3-5 天）

> 提取公共逻辑，减少维护负担

#### 3.1 统一 BashToolParamsSchema

```
src/tools/schemas.ts    # BashToolParamsSchema 唯一定义
```

- `bash-tool.ts` 和 `restricted-bash-tool.ts` 都从此文件导入

#### 3.2 统一命令分词函数

增强 `command-utils.ts` 中的 `parseCommandArgs`，支持转义字符，然后替换：
- `edit.ts:parseQuotedArgs` → 删除
- `skill-command-handler.ts:tokenize` → 删除

#### 3.3 提取 BinInstaller 公共类

```
src/tools/converters/shared/
├── bin-installer.ts     # install, remove, removeByPrefix, ensureBinDir
├── help-generator.ts    # briefHelp, detailedHelp 生成
└── interpreter.ts       # 脚本解释器映射（getInterpreter）
```

统一 MCP installer.ts 和 Skill wrapper-generator.ts 的重复逻辑

#### 3.4 统一路径常量

```
src/config/paths.ts      # SYNAPSE_HOME, SKILLS_DIR, SESSIONS_DIR, SCRIPTS_DIR 等
```

替换 5 处 `~/.synapse/skills` 的重复定义

#### 3.5 统一环境变量解析

- `todo-schema.ts:readPositiveIntEnv` → 使用 `utils/env.ts:parseEnvInt`
- `settings-schema.ts` → 使用 `parseEnvInt`

#### 3.6 提取 BaseAgentHandler

```typescript
// src/tools/handlers/agent-bash/base-agent-handler.ts
abstract class BaseAgentHandler {
  abstract readonly commandName: string;
  abstract readonly helpText: string;

  isHelpRequest(command: string): boolean { /* 统一 -h/--help 检测 */ }
  showHelp(type: 'brief' | 'detailed'): CommandResult { /* 统一帮助输出 */ }
  resolveFilePath(filepath: string): string { /* 统一路径解析 */ }
  abstract execute(command: string): Promise<CommandResult>;
}
```

---

### Phase 4：架构改善（5-7 天）

> 提升框架的可扩展性和健壮性

#### 4.1 Provider 抽象化

```typescript
// src/providers/llm-client.ts
interface LLMClient {
  readonly providerName: string;
  generate(
    systemPrompt: string,
    messages: Message[],
    tools: LLMTool[],
    options?: GenerateOptions
  ): Promise<StreamedMessage>;
  withModel(model: string): LLMClient;
}

// src/types/tool.ts（新增）
interface LLMTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}
```

- `AnthropicClient implements LLMClient`
- `generate.ts` 接受 `LLMClient` 而非 `AnthropicClient`
- 消除 `generate.ts` 对 `Anthropic.Tool` 的直接依赖
- `message.ts` 中的 `MergeablePart` 解耦 Anthropic 专有类型

#### 4.2 Session I/O 改善

1. `appendMessage` 和 `updateIndex` 改为真正的异步 I/O（`fs.promises`）
2. `updateIndex` 增加写入序列化（队列或文件锁）
3. `parseJsonl` 增加逐行 try-catch
4. `Session` 方法签名与实际行为统一（async = 真异步）

#### 4.3 Context Compact 冷却期

```typescript
// context-compactor.ts
private lastCompactAttempt: number = 0;
private static readonly COMPACT_COOLDOWN_STEPS = parseInt(
  process.env.SYNAPSE_COMPACT_COOLDOWN_STEPS || '5', 10
);

shouldAttemptCompact(): boolean {
  return this.stepsSinceLastAttempt >= COMPACT_COOLDOWN_STEPS;
}
```

#### 4.4 Session Usage rounds 限制

```typescript
// session-usage.ts
const MAX_ROUNDS_KEPT = parseInt(process.env.SYNAPSE_MAX_ROUNDS_KEPT || '50', 10);

// accumulateUsage 中：保留最近 MAX_ROUNDS_KEPT 轮，旧数据合并到 total
```

#### 4.5 BashSession 改为事件驱动

- 替换 `setInterval` 轮询为 stdout `data` 事件监听
- 监听进程 `exit` 事件，reject 挂起的 Promise
- 添加执行锁防止并发

#### 4.6 SettingsManager 单例化

```typescript
// src/config/settings-manager.ts
class SettingsManager {
  private static instance: SettingsManager | null = null;
  static getInstance(): SettingsManager {
    if (!SettingsManager.instance) {
      SettingsManager.instance = new SettingsManager();
    }
    return SettingsManager.instance;
  }
}
```

#### 4.7 BashRouter 注册表模式

```typescript
// bash-router.ts
class BashRouter {
  private handlerRegistry = new Map<string, CommandHandler>();

  registerHandler(prefix: string, handler: CommandHandler): void { ... }
  route(command: string): Promise<CommandResult> {
    const handler = this.findHandler(command);
    return handler.execute(command);
  }
}
```

---

### Phase 5：清理与规范化（2-3 天）

> 代码卫生和规范合规

| # | 任务 | 工作量 |
|---|------|--------|
| 5.1 | 重命名 `base-bash-handler.ts` → `native-command-handler.ts` | XS |
| 5.2 | 移动 `utils/tool-failure.ts` → `tools/tool-failure.ts` | XS |
| 5.3 | 统一环境变量 `SYNAPSE_` 前缀（6 处） | S |
| 5.4 | 补充文件头文档（5 个文件） | S |
| 5.5 | 删除 `TerminalRenderer` 死代码（`attachTodoStore`/`renderTodos`） | XS |
| 5.6 | 删除 `auto-enhance-trigger.ts` 的 default export | XS |
| 5.7 | 修复 `SkillGenerator` YAML 生成（引号包裹特殊字符） | S |
| 5.8 | 合并 `SkillIndexUpdater` 到 `SkillIndexer` | S |
| 5.9 | MCP 连接超时 timer 清理 | XS |
| 5.10 | Logger 改为异步写入或 buffered writer | M |
| 5.11 | `stopHooksLoadPromise` 失败重试逻辑 | S |

---

## 三、重构依赖图

```
Phase 0 (紧急修复)
    │
    ▼
Phase 1 (循环依赖 + 模块边界)  ← 后续所有 Phase 的前提
    │
    ├──→ Phase 2 (拆分上帝文件)
    │        │
    │        ▼
    │    Phase 3 (消除代码重复)
    │
    └──→ Phase 4 (架构改善)
              │
              ▼
         Phase 5 (清理规范化)
```

**Phase 2 和 Phase 4 可并行**，但 Phase 3 依赖 Phase 2（拆分后才能准确识别可提取的公共逻辑）。

---

## 四、风险评估

| Phase | 风险 | 缓解措施 |
|-------|------|---------|
| Phase 0 | 极低 — 小范围修改 | 单元测试覆盖 |
| Phase 1 | **中** — 大量 import 路径变更 | 分批迁移，每批后运行全量测试 |
| Phase 2 | **中** — 文件拆分可能遗漏依赖 | 拆分后运行 typecheck + test |
| Phase 3 | 低 — 提取公共逻辑，行为不变 | 现有测试兜底 |
| Phase 4 | **高** — Provider 抽象涉及核心调用链 | 先写接口 + 适配器，再逐步迁移 |
| Phase 5 | 极低 — 清理性质 | 逐项验证 |

---

## 五、重构后预期目录结构

```
src/
├── types/                    # [新增] 共享类型层
│   ├── index.ts
│   ├── message.ts
│   ├── tool.ts
│   ├── events.ts
│   └── usage.ts
├── agent/
│   ├── agent-runner.ts       # [精简] ~400 行
│   ├── step.ts
│   ├── session.ts            # [改善] 异步 I/O
│   ├── context-manager.ts
│   ├── context-compactor.ts  # [改善] 冷却期
│   ├── context-orchestrator.ts  # [新增] 上下文编排
│   ├── context-constants.ts  # [新增] 共享常量
│   ├── history-sanitizer.ts  # [新增] 历史清理
│   ├── offload-storage.ts
│   ├── session-usage.ts      # [改善] rounds 限制
│   ├── system-prompt.ts
│   ├── auto-enhance-trigger.ts
│   └── index.ts              # [清理] 仅导出自身
├── cli/
│   ├── repl.ts               # [精简] ~250 行
│   ├── repl-commands.ts      # [新增]
│   ├── repl-display.ts       # [新增]
│   ├── repl-init.ts          # [新增]
│   ├── terminal-renderer.ts  # [清理] 删除死代码
│   ├── fixed-bottom-renderer.ts
│   ├── tree-builder.ts
│   └── hook-output.ts
├── config/
│   ├── settings-manager.ts   # [改善] 单例
│   ├── settings-schema.ts    # [修复] API key 校验
│   ├── paths.ts              # [新增] 统一路径常量
│   ├── pricing.ts
│   ├── version.ts
│   └── index.ts
├── providers/
│   ├── llm-client.ts         # [新增] LLMClient 接口
│   ├── generate.ts           # [改善] 接受 LLMClient
│   ├── message.ts            # [改善] 解耦 Anthropic 类型
│   ├── anthropic/
│   │   ├── anthropic-client.ts  # [改善] implements LLMClient
│   │   ├── anthropic-types.ts
│   │   └── anthropic-streamed-message.ts
│   └── index.ts
├── tools/
│   ├── schemas.ts            # [新增] BashToolParamsSchema 唯一定义
│   ├── bash-tool.ts
│   ├── bash-router.ts        # [精简] 路由 + 注册表
│   ├── bash-session.ts       # [改善] 事件驱动
│   ├── callable-tool.ts
│   ├── restricted-bash-tool.ts
│   ├── toolset.ts
│   ├── tool-failure.ts       # [迁移] 从 utils/
│   ├── constants.ts
│   ├── handlers/
│   │   ├── types.ts          # [新增] CommandHandler 接口
│   │   ├── native-command-handler.ts  # [重命名]
│   │   ├── agent-bash/
│   │   │   ├── base-agent-handler.ts  # [新增] 公共基类
│   │   │   ├── read.ts
│   │   │   ├── write.ts
│   │   │   ├── edit.ts
│   │   │   ├── bash-wrapper.ts
│   │   │   ├── command-utils.ts  # [增强] 统一分词
│   │   │   ├── todo/
│   │   │   └── index.ts
│   │   ├── extend-bash/
│   │   │   ├── command-search.ts
│   │   │   ├── mcp-command-handler.ts  # [新增] 从 BashRouter 提取
│   │   │   └── skill-tool-handler.ts   # [新增] 从 BashRouter 提取
│   │   ├── skill-command-handler.ts
│   │   ├── task-command-handler.ts
│   │   └── index.ts
│   └── converters/
│       ├── shared/
│       │   ├── bin-installer.ts   # [新增]
│       │   ├── help-generator.ts  # [新增]
│       │   └── interpreter.ts     # [新增]
│       ├── mcp/
│       └── skill/
├── skills/
├── sub-agents/
│   └── sub-agent-manager.ts  # [清理] 删除死代码
├── hooks/
│   ├── skill-enhance-hook.ts  # [精简]
│   └── skill-enhance-result-parser.ts  # [新增]
├── utils/
│   ├── env.ts                # [增强] 合并 env 解析函数
│   ├── logger.ts             # [改善] 异步 I/O
│   └── ...
└── resource/
```

---

## 六、验证策略

每个 Phase 完成后必须通过：

1. **`bun run typecheck`** — 零类型错误
2. **`bun test`** — 826 tests 全部通过，无新增失败
3. **循环依赖检测** — `madge --circular src/` 确认消除目标循环
4. **代码行数对比** — 上帝文件行数降至目标范围

---

## 七、工作量估算

| Phase | 任务数 | 估算规模 | 可并行度 |
|-------|--------|---------|---------|
| Phase 0 | 4 | XS-S | 全部可并行 |
| Phase 1 | 3 | M-L | 1.1 必须先做，1.2/1.3 可并行 |
| Phase 2 | 4 | M-L | 2.1/2.2/2.3/2.4 可并行 |
| Phase 3 | 6 | S-M | 大部分可并行 |
| Phase 4 | 7 | M-XL | 4.1 最大，其余可并行 |
| Phase 5 | 11 | XS-M | 全部可并行 |
