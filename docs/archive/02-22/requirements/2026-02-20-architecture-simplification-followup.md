# 架构简化重构 — 后续迭代计划

## Document Info

| Field | Value |
|-------|-------|
| Version | v1.0 |
| Date | 2026-02-20 |
| Base | 架构简化重构最终交付 (2143 tests, 0 failures, B+/A- rating) |
| Source | 测试报告 + Code Review 报告 + Phase 2/3 遗留项 |

---

## 一、迭代概览

| 优先级 | 数量 | 主题 |
|--------|------|------|
| P0 (关键缺陷) | 1 | 消息丢失风险 |
| P1 (重要改进) | 12 | 模块拆分、依赖治理、代码职责拆分、测试补充 |
| P2 (建议改进) | 8 | 死代码清理、目录扁平化、阈值收敛、健壮性提升 |
| P3 (长期优化) | 4 | 性能基线、事件追踪、DAG 编排、数据定义拆分 |

---

## 二、P0 — 关键缺陷（必须修复）

### P0-1: 迭代超限处理消息丢失

- **来源**: agent-core-review.md #1.8
- **文件**: `src/core/agent-runner.ts`
- **问题**: 迭代超限时直接 `push` 到 history 数组而非通过 `appendMessage`，导致会话 resume 时消息丢失
- **影响**: 用户在超限场景下恢复会话会缺少最后的系统提示消息
- **修复方案**: 改用 `appendMessage` 方法，确保消息持久化到会话存储

---

## 三、P1 — 重要改进（下一迭代优先）

### 3.1 模块结构优化

#### P1-1: core/ 模块拆分

- **现状**: 29 个直接 .ts 文件（旧 agent/、hooks/、sub-agents/ 三模块合并迁入）
- **目标**: 每个子目录 ≤ 10 个文件
- **方案**: 拆分为 `core/session/`、`core/context/`、`core/hooks/`、`core/sub-agents/` 子目录
- **涉及文件**: agent-runner.ts, step.ts, session.ts, context-manager.ts, context-compactor.ts 等

#### P1-2: skills/ 文件迁入子模块

- **现状**: 23 个 .ts 文件仍在 skills/ 根目录
- **目标**: 全部迁入 schema/、loader/、generator/、manager/ 四个子目录
- **复杂度**: 低（纯文件移动 + import 路径更新）

#### P1-3: 架构约束测试阈值收敛

- **现状**: `MAX_FILES_PER_MODULE` = 30（为通过测试而放宽）
- **目标**: 逐步收敛到 PRD 要求的 10
- **路线**: 每迭代降 5 → 30 → 25 → 20 → 15 → 10（4 个迭代）

### 3.2 依赖方向治理

#### P1-4: 消除 37 处跨层依赖

- **分布**:
  - `core` → providers/tools/skills/cli: **25 处**（68%）
  - `skills` → providers: **7 处**
  - `shared` → tools: **3 处**
  - `tools` → skills: **2 处**
- **方案**: 通过接口抽象 + 依赖注入，逐步消除直接引用
- **重点文件**: agent-runner.ts, step.ts, sub-agent-manager.ts
- **依赖方向规则**: `types ← shared ← core ← providers ← tools ← skills ← cli`

#### P1-5: 循环依赖消除（遗留）

- **来源**: architecture-review.md
- **已知循环**:
  - tools ↔ cli（通过 terminal-renderer-types.ts）
  - tools ↔ sub-agents ↔ cli 三角循环
  - providers ↔ tools（Message 依赖 ToolReturnValue）
  - providers ↔ config（anthropic-client 依赖 settings-manager）
  - utils ↔ providers（token-counter 依赖 Message 类型）
- **方案**: 将共享类型提升到 types/ 层，打破循环引用

### 3.3 大文件职责拆分

#### P1-6: agent-runner.ts 拆分

- **现状**: ~900 行，混合循环 + 会话 + 上下文 + hooks 四种职责
- **方案**: 拆分为 agent-loop.ts（循环控制）、session-manager.ts（会话管理）、context-orchestrator.ts（上下文编排）
- **来源**: agent-core-review.md #1.1, #1.2, #1.4

#### P1-7: repl.ts 拆分

- **现状**: 1057 行，混合 REPL + 命令处理 + 初始化 + UI
- **问题**:
  - extractSkillDescription 与 skill-schema.ts 功能重复
  - showSkillsList 直接操作文件系统，与 SkillLoader 重复
- **方案**: 拆分为 repl-core.ts、repl-commands.ts、repl-init.ts
- **来源**: periphery-review.md #1.1

#### P1-8: bash-router.ts 职责拆分

- **现状**: 608 行，路由 + MCP + Skill 逻辑混杂
- **问题**:
  - executeMcpCommand 内联 120 行 MCP 逻辑
  - executeSkillCommand 内联 105 行脚本执行逻辑，使用 `execSync` 阻塞
  - 每次 MCP 调用新建连接，未使用 McpClientManager 连接池
- **方案**: MCP/Skill 逻辑提取到独立 handler，启用连接池
- **来源**: tools-review.md #2.2

#### P1-9: bash-session.ts 改为事件驱动

- **现状**: waitForCompletion 使用 50ms setInterval 轮询
- **问题**:
  - 轮询浪费 CPU
  - 进程退出后 Promise 永远挂起
  - 无并发保护，同时 execute 时 buffer 混乱
- **方案**: 改为 EventEmitter / readline event-driven 模式
- **来源**: tools-review.md #2.3

### 3.4 测试覆盖率补充

#### P1-10: 低覆盖率模块测试补充

| 文件 | 当前覆盖率 | 目标 |
|------|-----------|------|
| mcp-initializer.ts | 11.66% | ≥ 70% |
| repl-init.ts | 12.50% | ≥ 60% |
| watcher.ts | 61.64% | ≥ 80% |
| skill-initializer.ts | 71.32% | ≥ 85% |

### 3.5 代码质量修复

#### P1-11: YAML 生成/解析健壮性

- **来源**: periphery-review.md #2.4
- **问题**: SkillGenerator 的 YAML 生成未转义特殊字符，parseSkillMd 使用简单字符串分割无法处理多行值
- **方案**: 引入 yaml 库替代手动字符串拼接

#### P1-12: SkillEnhancer 模式检测升级

- **来源**: periphery-review.md #2.3
- **问题**: detectPattern 阈值过低（matches >= 1），findMatchingSkill 50% 重叠率过粗糙
- **方案**: 提升阈值，引入加权匹配或语义相似度

---

## 四、P2 — 建议改进

#### P2-1: 死代码清理

- BashToolSchema 与 BashTool 重复定义 schema（零引用）
- terminal-renderer.ts 中 attachTodoStore() 和 renderTodos() 是死代码
- BASH_TOOL_MISUSE_REMINDER 常量定义未使用
- agent/index.ts 跨层重导出（facade 模式滥用）

#### P2-2: 目录嵌套扁平化

- **现状**: 最深 5 层（shared/sandbox/providers/local/platforms/）
- **目标**: ≤ 3 层（PRD 要求）
- **方案**: sandbox 平台适配器代码内联到 local.ts

#### P2-3: tools/handlers/ 残留清理

- 旧 agent-bash/todo/ 四层嵌套结构待删除
- 已有 tools/commands/ 扁平替代，旧 handlers 为兼容性保留

#### P2-4: 测试覆盖率补充（中优先级）

| 文件 | 当前覆盖率 | 目标 |
|------|-----------|------|
| repl.ts | 6.09% | ≥ 40% |
| mcp-client.ts | 37.55% | ≥ 60% |
| openai-mapper.ts | 69.15% | ≥ 80% |
| render-tree-builder.ts | 55.56% | ≥ 70% |

#### P2-5: ContextManager 竞态风险

- **来源**: agent-core-review.md #1.7
- **问题**: ContextManager 和 ContextCompactor 各自独立创建 OffloadStorage，指向同一目录
- **方案**: 共享单一 OffloadStorage 实例

#### P2-6: stopHooksLoadPromise 模块级单例

- **来源**: agent-core-review.md #1.6
- **问题**: 模块级可变单例，无法测试清理，失败无重试
- **方案**: 改为实例级管理，添加重试机制

#### P2-7: appendMessage 闭包问题

- **来源**: agent-core-review.md #1.5
- **问题**: 闭包捕获而非实例方法，每次创建新函数对象
- **方案**: 改为 AgentRunner 实例方法

#### P2-8: 硬编码常量提取

- MAX_COMMAND_DISPLAY_LENGTH、ANIMATION_INTERVAL 等散落各处
- 统一提取到 shared/constants.ts 并支持环境变量覆盖

---

## 五、P3 — 长期优化

#### P3-1: 性能基准测试

- 建立关键路径（Agent Loop、工具路由、LLM 调用）的性能基准
- 引入 benchmark 框架持续追踪性能变化

#### P3-2: 结构化事件追踪

- 引入 OpenTelemetry 或类似框架
- 追踪 Agent Loop 每步执行的耗时和状态

#### P3-3: SubAgent DAG 编排

- 当前 SubAgent 仅支持单任务执行
- 长期支持 DAG 式多 Agent 编排（依赖关系、并行执行）

#### P3-4: 超 300 行文件持续拆分

| 文件 | 行数 | 说明 |
|------|------|------|
| skill-structure.ts | 516 | 数据结构定义密集型 |
| auto-updater.ts | 426 | — |
| fixed-bottom-renderer.ts | 425 | — |
| indexer.ts | 423 | — |
| step.ts | 404 | 与 P1-6 关联 |
| conversation-reader.ts | 366 | — |

---

## 六、建议迭代路线

### Iteration 1（近期）— 结构稳固

| 任务 | 优先级 | 预估工作量 |
|------|--------|-----------|
| P0-1 消息丢失修复 | P0 | S |
| P1-1 core/ 模块拆分 | P1 | L |
| P1-2 skills/ 文件迁入 | P1 | M |
| P1-3 测试阈值收敛（30→25） | P1 | S |
| P2-1 死代码清理 | P2 | S |

### Iteration 2（短期）— 依赖解耦

| 任务 | 优先级 | 预估工作量 |
|------|--------|-----------|
| P1-4 跨层依赖消除（core 25 处） | P1 | XL |
| P1-5 循环依赖消除 | P1 | L |
| P1-3 测试阈值收敛（25→20） | P1 | S |
| P2-2 目录嵌套扁平化 | P2 | M |
| P2-3 handlers 残留清理 | P2 | S |

### Iteration 3（中期）— 代码质量

| 任务 | 优先级 | 预估工作量 |
|------|--------|-----------|
| P1-6 agent-runner.ts 拆分 | P1 | L |
| P1-7 repl.ts 拆分 | P1 | L |
| P1-8 bash-router.ts 拆分 | P1 | M |
| P1-9 bash-session.ts 事件驱动 | P1 | M |
| P1-10 低覆盖率测试补充 | P1 | M |

### Iteration 4（中期）— 健壮性 & 收敛

| 任务 | 优先级 | 预估工作量 |
|------|--------|-----------|
| P1-11 YAML 生成健壮性 | P1 | M |
| P1-12 SkillEnhancer 升级 | P1 | M |
| P1-3 测试阈值收敛（20→10） | P1 | S |
| P2-4 ~ P2-8 剩余 P2 项 | P2 | L |
| P3-1 ~ P3-4 启动长期项 | P3 | L |

---

## 七、参考文档

| 文档 | 路径 |
|------|------|
| 架构简化 PRD | `docs/requirements/2026-02-20-architecture-simplification-prd.md` |
| 最终测试报告 | `docs/reports/2026-02-20-architecture-simplification-test-report.md` |
| Agent 核心审查 | `docs/archive/02-20/refactor-agentloop/refactor/agent-core-review.md` |
| 架构整体审查 | `docs/archive/02-20/refactor-agentloop/refactor/architecture-review.md` |
| 工具系统审查 | `docs/archive/02-20/refactor-agentloop/refactor/tools-review.md` |
| 外围系统审查 | `docs/archive/02-20/refactor-agentloop/refactor/periphery-review.md` |
| Phase 3 测试报告 | `docs/archive/02-20/reports/phase3-test-report.md` |
