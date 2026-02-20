# Agent Loop 统一重构 — 需求提案

> 日期: 2026-02-18
> 状态: Draft

---

## 1. 背景与问题陈述

### 1.1 现状

Synapse Agent 当前存在两套独立的 Agent Loop 实现：

| 实现 | 路径 | 模式 | 用途 |
|------|------|------|------|
| `AgentRunner` | `src/agent/agent-runner.ts` (583行) | Class-based, 有状态 | 主 Agent + CLI |
| `runAgentLoop` | `src/core/agent-loop.ts` (354行) | Function-based, 无状态 | SubAgent |

两者共享底层 LLM 调用和工具执行，但在循环控制、事件模型、错误处理、上下文管理等方面各自独立实现。

### 1.2 核心痛点

1. **功能重复维护成本高** — 修改一个 loop 的逻辑时，另一个也需要同步修改，容易遗漏
2. **新功能难以统一添加** — 新增能力（如新的事件类型、错误处理策略）需要在两处分别实现
3. **代码可读性差** — 新开发者难以理解为什么存在两套实现、何时该用哪个
4. **非常规设计模式** — 审查发现多处偏离业界通行实践的实现

### 1.3 非常规设计模式审查结果

经过对比 Claude Code、LangChain Agent Executor、AutoGPT 等业界实现，发现以下非常规模式：

| # | 问题 | 位置 | 风险 |
|---|------|------|------|
| 1 | TodoList 退出时强制注入 user message | agent-runner.ts:460-475 | 🔴 高 |
| 2 | 两个 Agent Loop 并存 | agent-runner.ts + agent-loop.ts | 🟡 中 |
| 3 | Context offload/compact 双重机制 + 冷却期 | context-orchestrator.ts | 🟡 中 |
| 4 | 工具执行混合串并行策略 | step.ts:70-106 | 🟡 中 |
| 5 | 连续失败分类计数（重置过于激进） | agent-runner.ts:478-498 | 🟡 中 |
| 6 | History Sanitization 后期全量重写 | agent-runner.ts:507-520 | 🔴 高 |
| 7 | Stop Hook 循环外执行 | stop-hook-executor.ts | 🟡 中 |
| 8 | Context Compactor 离线 LLM 总结 | context-compactor.ts | 🟡 中 |
| 9 | EventStream 单消费者限制 | event-stream.ts | 🟢 低 |

---

## 2. 目标与范围

### 2.1 目标

**统一 Agent Loop 实现**，保证 Synapse Agent 的核心特色（三层工具体系、自我成长机制），同时使循环控制逻辑符合业界通行实践。

### 2.2 范围定义

**Must — 必须实现：**

| ID | 需求 | 关联故事 |
|----|------|---------|
| M1 | 合并为单一 Agent Loop 核心，位于 `src/core/` | US-1 |
| M2 | 主 Agent 和 SubAgent 通过配置参数区分行为 | US-2 |
| M3 | TodoList 引导方式改为多轮未更新时 System Reminder 注入 | US-3 |
| M4 | 统一使用 EventStream 事件模型 | US-4 |
| M5 | 修正连续失败重置策略（避免振荡式无限循环） | US-5 |

**Should — 应该实现：**

| ID | 需求 | 关联故事 |
|----|------|---------|
| S1 | History Sanitization 从后期全量重写改为入口预验证 | US-6 |
| S2 | 外层包装器（AgentRunner 类）适配 EventStream 到回调接口 | US-4 |

**Could — 可以考虑：**

| ID | 需求 | 说明 |
|----|------|------|
| C1 | Context compact 成本收益分析 | 审查发现 compact 成本不透明，可增加成本统计 |
| C2 | 工具执行策略可配置化 | 当前混合串并行策略硬编码，可改为配置驱动 |

**Won't — 本次不做：**

| ID | 需求 | 原因 |
|----|------|------|
| W1 | EventStream 多消费者支持 | 已有设计文档说明，当前无实际需求 |
| W2 | Stop Hook 机制重构 | 影响范围有限，可后续独立重构 |
| W3 | Context offload/compact 架构重构 | 独立功能模块，不阻塞 loop 统一 |

---

## 3. 用户故事

### US-1: 单一 Agent Loop 核心

> 作为**框架开发者**，我希望**项目中只有一个 agent loop 核心实现**，以便**减少重复维护成本，新功能只需实现一次**。

**验收标准：**
- 只有 `src/core/agent-loop.ts` 包含循环核心逻辑
- `src/agent/agent-runner.ts` 转变为外层包装器，内部调用核心 loop
- 原 `AgentRunner` 的所有功能通过核心 loop + 配置 + 外层包装实现

### US-2: 配置驱动的行为差异

> 作为**框架开发者**，我希望**主 Agent 和 SubAgent 通过配置（提示词、工具集）区分行为，而非不同的 loop 实现**，以便**架构更清晰，新开发者容易理解**。

**验收标准：**
- 核心 loop 接受 `AgentLoopConfig` 配置参数
- 主 Agent 和 SubAgent 通过不同的配置实例使用同一个 loop
- 配置包括但不限于：工具集、系统提示词、最大迭代数、回调/钩子、TodoList 策略

### US-3: TodoList 引导方式重构

> 作为**框架开发者**，我希望**TodoList 从"退出时强制检查"改为"多轮未更新时 System Reminder 注入"**，以便**符合业界常规做法，让 LLM 有更自然的决策空间**。

**验收标准：**
- 移除 `hasIncompleteTodos()` 的强制继续逻辑
- 当检测到 TodoList 多轮未更新时，在下一轮 user message 中追加 `[System Reminder]`
- "多轮"的阈值可通过配置定义（默认值待确认）
- LLM 收到提醒后可自主决定是否继续，loop 不强制

### US-4: 统一 EventStream 事件模型

> 作为**框架开发者**，我希望**统一使用 EventStream 事件模型**，以便**主 Agent 和 SubAgent 有一致的事件消费方式**。

**验收标准：**
- 核心 loop 仅通过 EventStream 发射事件
- 外层包装器（AgentRunner）可将 EventStream 适配为回调接口
- 事件类型覆盖：`agent_start`, `turn_start`, `message_start`, `message_delta`, `message_end`, `tool_start`, `tool_end`, `usage`, `agent_end`, `error`

### US-5: 修正非常规设计模式

> 作为**框架开发者**，我希望**在统一 loop 过程中识别并修正所有非常规设计模式**，以便**agent loop 的行为符合业界通行实现标准**。

**验收标准：**
- 连续失败重置策略：从"任一成功即重置"改为"滑动窗口"或"渐进重置"
- 所有非常规模式审查结论记录在架构决策文档中

### US-6: History Sanitization 入口预验证

> 作为**框架开发者**，我希望**History Sanitization 从后期全量重写改为入口预验证**，以便**避免全量 session 重写的并发风险和性能问题**。

**验收标准：**
- 消息在追加到历史记录时即进行格式验证
- 格式错误的消息被拒绝并让 LLM 重试，而非事后清理
- 移除 `sanitizeHistoryForToolProtocol` 的全量重写逻辑

---

## 4. 统一架构设计方向

### 4.1 目标架构

```
┌─────────────────────────────────────────────────────────┐
│                  CLI / REPL Layer                         │
│            (repl-init.ts, repl-commands.ts)               │
└──────────────────────┬──────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
        ▼                             ▼
  ┌──────────────┐          ┌──────────────────┐
  │ AgentRunner  │          │ SubAgentManager  │
  │ (外层包装)    │          │ (外层包装)        │
  │              │          │                  │
  │ • 会话管理    │          │ • 生命周期管理    │
  │ • 权限控制    │          │ • 回调适配       │
  │ • Stop Hook  │          │                  │
  └──────┬───────┘          └────────┬─────────┘
         │                           │
         │   ┌───────────────────┐   │
         └──►│  Core Agent Loop  │◄──┘
             │ (src/core/)       │
             │                   │
             │ • 循环控制        │
             │ • 工具执行        │
             │ • EventStream     │
             │ • TodoList 引导   │
             │ • 消息历史管理    │
             │ • 错误处理        │
             └─────────┬─────────┘
                       │
             ┌─────────┴─────────┐
             │  LLM + Tools      │
             │ (providers/tools)  │
             └───────────────────┘
```

### 4.2 配置参数模型

```typescript
interface AgentLoopConfig {
  // 基础配置
  systemPrompt: string;
  tools: ToolDefinition[];
  maxIterations: number;

  // 可选能力（主 Agent 启用，SubAgent 不启用）
  todoStrategy?: TodoStrategy;          // TodoList 引导策略
  contextManager?: ContextManager;      // 上下文 offload/compact
  historySanitizer?: HistorySanitizer;  // 消息验证

  // 错误处理
  maxConsecutiveFailures: number;
  failureResetStrategy: 'immediate' | 'sliding-window' | 'progressive';

  // 信号
  abortSignal?: AbortSignal;
}
```

### 4.3 TodoList 新策略

```
当前：loop 退出时 → 检查 todo → 有未完成则注入 user message 强制继续
改后：每轮开始时 → 检查 todo 最后更新时间 → 如超过 N 轮未更新 → 注入 System Reminder → LLM 自主决定
```

---

## 5. 约束与假设

### 5.1 约束

- **保持核心特色**：三层工具体系（Native/Agent/Extension Shell Command）不变
- **保持功能完整**：重构后所有现有功能必须正常工作
- **向后兼容**：`AgentRunner` 的对外接口保持不变，内部实现切换为核心 loop
- **项目开发阶段**：优先重构，不做向后兼容 hack

### 5.2 假设

- 现有测试用例覆盖了核心功能，可作为重构的安全网
- `src/core/agent-loop.ts` 的 EventStream 设计是成熟可靠的基础
- SubAgent 不需要 TodoList、会话持久化、权限管理等高级能力

---

## 6. 风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 重构范围扩大 | 时间超出预期 | 严格按 MoSCoW 分期，Won't 不做 |
| 现有测试不足 | 重构引入回归 | 重构前补充关键路径测试 |
| EventStream 性能 | 主 Agent 事件量大 | EventStream 已被验证适用于 SubAgent，扩展到主 Agent 需性能测试 |
| 外层包装器复杂度 | AgentRunner 包装逻辑过重 | 尽可能将逻辑下沉到核心 loop |

---

## 7. 开放问题（已全部确认）

| # | 问题 | 决议 |
|---|------|------|
| Q1 | TodoList "多轮未更新"的阈值设为多少轮？ | **10 轮**，可通过环境变量配置 |
| Q2 | 连续失败重置策略选择"滑动窗口"还是"渐进重置"？ | **滑动窗口** — 在最近 N 次工具调用中，失败次数超过阈值才触发退出 |
| Q3 | History Sanitization 预验证失败后，是让 LLM 重试还是直接丢弃？ | **返回错误让 LLM 重试** — 将格式错误标记为 tool error 返回，不修改历史 |