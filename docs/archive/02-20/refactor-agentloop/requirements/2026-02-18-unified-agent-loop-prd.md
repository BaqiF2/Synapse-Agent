# Agent Loop 统一重构 — Product Requirements Document (PRD)

## Document Info
| Field | Value |
|-------|-------|
| Version | v1.0 |
| Created | 2026-02-18 |
| Last Updated | 2026-02-18 |
| Status | Draft |
| Proposal | [unified-agent-loop-proposal.md](2026-02-18-unified-agent-loop-proposal.md) |

## 1. Overview

### 1.1 Product/Feature Summary

将 Synapse Agent 中并存的两套 Agent Loop 实现（`AgentRunner` 和 `runAgentLoop`）合并为单一核心循环，以 `src/core/agent-loop.ts` 的 EventStream 架构为基础。主 Agent 和 SubAgent 通过配置参数区分行为，不再维护独立的循环实现。同时修正 TodoList 强制注入、History Sanitization 全量重写、连续失败重置过于激进等非常规设计模式。

### 1.2 Goals

- **G1**: 消除重复实现 — 将 2 套 Agent Loop 合并为 1 套核心实现
- **G2**: 统一事件模型 — 所有 Agent（主/子）通过 EventStream 发射和消费事件
- **G3**: 修正非常规模式 — TodoList 引导、失败重置、消息验证符合业界通行实践
- **G4**: 保持功能完整 — 重构后所有现有功能正常工作

### 1.3 Non-Goals (explicitly excluded scope)

- **NG1**: EventStream 多消费者支持（当前无实际需求）
- **NG2**: Stop Hook 机制重构（影响范围有限，可独立迭代）
- **NG3**: Context offload/compact 架构重构（独立功能模块，不阻塞 loop 统一）
- **NG4**: 工具执行策略重构（混合串并行策略保留，可后续优化）

---

## 2. Users & Scenarios

### 2.1 Target Users

| User Role | Description | Core Need |
|-----------|------------|-----------|
| 框架开发者 | Synapse Agent 核心代码的维护者和贡献者 | 在单一实现上开发和维护 Agent Loop |
| 扩展开发者 | 基于 Synapse Agent 构建应用的开发者 | 清晰、一致的 API 接口和事件模型 |

### 2.2 Core User Stories

> **US-1**: 作为框架开发者，我希望项目中只有一个 agent loop 核心实现，以便减少重复维护成本，新功能只需实现一次。

> **US-2**: 作为框架开发者，我希望主 Agent 和 SubAgent 通过配置（提示词、工具集）区分行为，而非不同的 loop 实现。

> **US-3**: 作为框架开发者，我希望 TodoList 从"退出时强制检查"改为"多轮未更新时 System Reminder 注入"。

> **US-4**: 作为框架开发者，我希望统一使用 EventStream 事件模型。

> **US-5**: 作为框架开发者，我希望在统一 loop 过程中修正所有非常规设计模式。

> **US-6**: 作为框架开发者，我希望 History Sanitization 从后期全量重写改为入口预验证。

### 2.3 Use Cases

| ID | Description | Trigger | Expected Outcome |
|----|------------|---------|-----------------|
| UC-001 | 主 Agent CLI 交互 | 用户在终端输入消息 | 核心 loop 执行，AgentRunner 包装器处理会话/权限/Stop Hook |
| UC-002 | SubAgent 执行任务 | 主 Agent 通过 `task:*` 命令创建 SubAgent | 核心 loop 以精简配置执行，SubAgentManager 管理生命周期 |
| UC-003 | TodoList 引导 | Agent 连续 10 轮未更新 TodoList | 在下一轮 user 位置注入 System Reminder，LLM 自主决定是否继续 |
| UC-004 | 工具调用失败处理 | 最近 N 次工具调用中失败超过阈值 | 滑动窗口检测到异常比例，触发退出 |
| UC-005 | 消息格式验证 | LLM 产出格式错误的工具调用参数 | 入口验证捕获错误，返回 tool error 让 LLM 重试 |

---

## 3. Functional Requirements

### 3.1 Feature List

| ID | Feature Name | Description | Priority |
|----|-------------|------------|----------|
| F-001 | 核心 Agent Loop | 统一的循环核心，位于 `src/core/` | Must |
| F-002 | AgentLoopConfig 配置体系 | 通过配置参数区分主 Agent 和 SubAgent 行为 | Must |
| F-003 | TodoList System Reminder 引导 | 多轮未更新时注入 System Reminder | Must |
| F-004 | EventStream 统一事件模型 | 核心 loop 仅通过 EventStream 发射事件 | Must |
| F-005 | 滑动窗口失败检测 | 替代当前的连续失败计数 + 即时重置 | Must |
| F-006 | AgentRunner 外层包装器 | 将 AgentRunner 改为核心 loop 的包装器 | Should |
| F-007 | 消息入口预验证 | 替代 History Sanitization 的后期全量重写 | Should |

### 3.2 Feature Details

---

#### F-001: 核心 Agent Loop

**Description**: 以现有 `src/core/agent-loop.ts` 的 EventStream 架构为基础，将 `AgentRunner.executeLoop()` 的完整功能下沉到核心 loop 中。核心 loop 是唯一的循环实现，主 Agent 和 SubAgent 都通过此 loop 运行。

**Input**:
- `config: AgentLoopConfig` — 循环配置（详见 F-002）
- `userMessage: string` — 用户输入消息
- `history?: Message[]` — 可选的历史消息（用于会话恢复）

**Output**:
- `EventStream<AgentEvent>` — 异步可迭代的事件流，包含循环过程中的所有事件

**Business Rules**:
1. 核心 loop 是无状态函数，所有状态通过参数传入
2. 循环在以下条件退出：(a) LLM 无工具调用且无 System Reminder 需要注入；(b) 达到 `maxIterations`；(c) 滑动窗口失败检测触发；(d) `abortSignal` 被触发
3. 每轮循环发射标准化 `AgentEvent` 事件
4. 工具执行逻辑从 `step.ts` 的 `groupToolCallsByOrder` 迁移到核心 loop

**Error & Exception Scenarios**:

| Scenario | Trigger Condition | Expected Behavior |
|----------|------------------|-------------------|
| LLM 调用失败 | Provider 返回错误（网络、API 限流等） | 发射 `error` 事件，包含错误详情；循环终止 |
| 工具执行超时 | 单个工具超过 `COMMAND_TIMEOUT` | 工具返回 timeout error；计入滑动窗口；循环继续 |
| 最大迭代超限 | `turnIndex >= maxIterations` | 发射 `agent_end` 事件，`stopReason: 'max_iterations'`；循环终止 |
| 中止信号 | `abortSignal.aborted === true` | 发射 `agent_end` 事件，`stopReason: 'aborted'`；循环终止 |

**Boundary Conditions**:
- `maxIterations = 1` 时，核心 loop 只执行一轮
- `tools` 为空数组时，核心 loop 只进行 LLM 对话，不执行工具
- `history` 为空时，从新会话开始

**State Behavior**:
- 核心 loop 本身无状态，消息历史通过 `messages` 局部变量维护
- 每轮循环后，新消息通过 EventStream 事件暴露给外层
- 外层包装器（AgentRunner）负责持久化

---

#### F-002: AgentLoopConfig 配置体系

**Description**: 定义统一的配置接口，主 Agent 和 SubAgent 通过不同配置实例使用同一个核心 loop。

**Input**:
```typescript
interface AgentLoopConfig {
  // 基础配置（必填）
  systemPrompt: string;
  tools: ToolDefinition[];
  maxIterations: number;
  provider: LLMProvider;

  // TodoList 策略（可选，SubAgent 不传则不启用）
  todoStrategy?: {
    enabled: boolean;
    staleThresholdTurns: number;  // 默认 10
    reminderTemplate: string;
  };

  // 上下文管理（可选）
  contextManager?: ContextManager;

  // 消息验证（可选）
  messageValidator?: MessageValidator;

  // 错误处理
  failureDetection: {
    strategy: 'sliding-window';
    windowSize: number;          // 滑动窗口大小，默认 10
    failureThreshold: number;    // 窗口内失败次数阈值，默认 3
  };

  // 信号
  abortSignal?: AbortSignal;

  // 钩子（可选，扩展点）
  hooks?: {
    beforeTurn?: (turnIndex: number) => Promise<void>;
    afterTurn?: (turnIndex: number, result: TurnResult) => Promise<void>;
    beforeToolExecution?: (toolCall: ToolCall) => Promise<void>;
    afterToolExecution?: (toolCall: ToolCall, result: ToolResult) => Promise<void>;
  };
}
```

**Output**:
- 类型安全的配置对象，必填字段编译时校验

**Business Rules**:
1. 主 Agent 配置：启用 TodoList、ContextManager、MessageValidator、所有 hooks
2. SubAgent 配置：仅填必填字段 + failureDetection，其余不传
3. `todoStrategy` 不传时，核心 loop 跳过 TodoList 相关逻辑
4. `contextManager` 不传时，核心 loop 不执行 offload/compact
5. `hooks` 不传时，核心 loop 跳过钩子调用

**Error & Exception Scenarios**:

| Scenario | Trigger Condition | Expected Behavior |
|----------|------------------|-------------------|
| 必填字段缺失 | `systemPrompt` 或 `tools` 未提供 | TypeScript 编译错误（编译时校验） |
| 无效阈值 | `staleThresholdTurns <= 0` | 运行时抛出 `ConfigValidationError` |

**State Behavior**:
- Config 在 loop 启动后不可变
- 如需动态修改（如切换工具集），需重新启动 loop

---

#### F-003: TodoList System Reminder 引导

**Description**: 将 TodoList 的引导方式从"退出时强制检查并注入 user message"改为"多轮未更新时注入 System Reminder"。

**Input**:
- `todoStore: TodoStore` — 当前 TodoList 状态
- `turnsSinceLastUpdate: number` — 自上次 TodoList 更新以来的轮数
- `staleThresholdTurns: number` — 触发阈值（默认 10，环境变量 `SYNAPSE_TODO_STALE_THRESHOLD`）

**Output**:
- 当达到阈值时，在下一轮的 user 位置追加 `[System Reminder]` 内容

**Business Rules**:
1. 每轮循环开始时检查 `turnsSinceLastUpdate`
2. 当 `turnsSinceLastUpdate >= staleThresholdTurns` 且存在未完成的 todo 项时，生成 System Reminder
3. System Reminder 格式为 `[System Reminder] You have incomplete tasks that haven't been updated for {N} turns:\n{todo_list}\nPlease review and continue working on them, or mark them as completed if done.`
4. System Reminder 注入到 messages 数组的最后一条 user message 中，作为附加内容
5. LLM 收到提醒后自主决定是否继续工作 — 核心 loop **不强制**继续
6. 当 LLM 通过 TodoWrite 工具更新了 todo 状态后，`turnsSinceLastUpdate` 重置为 0
7. **不再**在循环退出条件中检查 TodoList 状态

**Error & Exception Scenarios**:

| Scenario | Trigger Condition | Expected Behavior |
|----------|------------------|-------------------|
| TodoStore 为空 | 没有任何 todo 项 | 跳过检查，不注入 reminder |
| 所有 todo 已完成 | 所有项状态为 `completed` | 跳过检查，不注入 reminder |
| TodoStore 不可用 | todoStrategy 未启用 | 核心 loop 完全跳过 TodoList 逻辑 |

**Boundary Conditions**:
- `staleThresholdTurns = 0` 时，每轮都注入 reminder（不推荐但允许）
- 首次创建 todo 后立即注入 reminder 前，需等待至少 `staleThresholdTurns` 轮
- 连续多轮触发 reminder 时，每轮都注入（不做去重）

**State Behavior**:
- `turnsSinceLastUpdate` 由核心 loop 维护为局部变量
- TodoStore 的变更通过 `onChange` 监听器检测
- 不持久化 `turnsSinceLastUpdate`（loop 重启时重置为 0）

---

#### F-004: EventStream 统一事件模型

**Description**: 核心 loop 仅通过 EventStream 发射结构化事件。外层包装器可通过适配器将 EventStream 转换为回调接口。

**Input**:
- 核心 loop 的各个执行阶段产生的事件数据

**Output**:
- `EventStream<AgentEvent>` 异步可迭代流

**Business Rules**:

1. 标准 AgentEvent 类型定义：

```typescript
type AgentEvent =
  | { type: 'agent_start'; sessionId: string; config: AgentLoopConfig }
  | { type: 'turn_start'; turnIndex: number }
  | { type: 'message_start'; role: 'assistant' }
  | { type: 'message_delta'; contentDelta: string }
  | { type: 'message_end'; stopReason: string }
  | { type: 'tool_start'; toolName: string; toolId: string; input: unknown }
  | { type: 'tool_end'; toolName: string; toolId: string; output: string; isError: boolean; durationMs: number }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'todo_reminder'; turnsSinceUpdate: number; items: TodoItem[] }
  | { type: 'context_compact'; beforeTokens: number; afterTokens: number; success: boolean }
  | { type: 'agent_end'; result: AgentResult }
  | { type: 'error'; error: Error };
```

2. 事件发射顺序保证：`agent_start` → (`turn_start` → `message_start` → `message_delta`* → `message_end` → `tool_start` → `tool_end`)* → `agent_end`
3. `error` 事件可在任意时刻发射，发射后 stream 终止
4. 每个 `tool_start` 必须有对应的 `tool_end`
5. `usage` 事件在每轮 LLM 调用后发射

**Error & Exception Scenarios**:

| Scenario | Trigger Condition | Expected Behavior |
|----------|------------------|-------------------|
| 消费者未消费 | EventStream 无消费者 | 事件在内部队列中缓存，不阻塞 loop |
| 消费者异常 | 消费者 for-await 循环抛出异常 | 不影响核心 loop 执行 |

**State Behavior**:
- EventStream 实例与核心 loop 生命周期绑定
- `stream.complete()` 后不再接受新事件
- 单消费者限制保留（设计文档已说明）

---

#### F-005: 滑动窗口失败检测

**Description**: 替代当前 AgentRunner 的"连续失败计数 + 任一成功即重置"机制。使用滑动窗口检测工具调用失败率。

**Input**:
- `windowSize: number` — 滑动窗口大小（默认 10，环境变量 `SYNAPSE_FAILURE_WINDOW_SIZE`）
- `failureThreshold: number` — 窗口内失败次数阈值（默认 3，环境变量 `SYNAPSE_FAILURE_THRESHOLD`）
- 每次工具执行的成功/失败结果

**Output**:
- 当窗口内失败次数 `>= failureThreshold` 时触发退出

**Business Rules**:
1. 维护一个固定大小为 `windowSize` 的布尔数组（环形缓冲区），记录最近 N 次工具调用的成功/失败
2. 每次工具执行后，将结果推入环形缓冲区
3. 当缓冲区中 `true`（失败）的数量 `>= failureThreshold` 时，触发退出
4. 保留当前的 `shouldCountToolFailure` 分类机制 — 用户权限拒绝等不计入失败
5. 窗口未填满时（前 N-1 次调用），按已有数据计算失败比例
6. 触发退出时发射 `agent_end` 事件，`stopReason: 'failure_threshold'`

**Error & Exception Scenarios**:

| Scenario | Trigger Condition | Expected Behavior |
|----------|------------------|-------------------|
| 窗口全部失败 | 连续 N 次全失败 | 立即触发退出（与当前行为一致） |
| 振荡模式 | fail-succeed-fail 交替 | 窗口内失败比例可能低于阈值，允许继续（修复了当前的振荡无限循环） |
| 无工具调用 | LLM 只输出文本 | 不更新窗口，不影响失败检测 |

**Boundary Conditions**:
- `windowSize = 1` 时退化为"任一失败即退出"
- `failureThreshold > windowSize` 时永远不会触发（应在配置验证中拒绝）
- 首次工具调用失败时，窗口 [fail]，失败数 1，若 threshold=3 则不退出

**State Behavior**:
- 环形缓冲区为核心 loop 的局部变量
- 不持久化（loop 重启时重置）

---

#### F-006: AgentRunner 外层包装器

**Description**: 将 `AgentRunner` 从独立的循环实现改为核心 loop 的外层包装器。保留其对外接口不变，内部通过消费 EventStream 实现。

**Input**:
- 与当前 `AgentRunner` 相同的构造参数和方法签名

**Output**:
- 与当前 `AgentRunner` 相同的返回值类型

**Business Rules**:
1. `AgentRunner.run(userMessage)` 内部调用 `runAgentLoop(config, userMessage)`，获得 EventStream
2. 消费 EventStream 事件，转换为当前的回调调用（`onMessagePart`, `onToolCall`, `onToolResult`, `onUsage`）
3. 会话管理（Session 持久化、恢复）在 AgentRunner 层实现
4. 权限管理（SandboxPermission）在 AgentRunner 层实现
5. Stop Hook 在 AgentRunner 层实现（循环结束后执行）
6. Context offload/compact 通过 `AgentLoopConfig.contextManager` 传入核心 loop

**Error & Exception Scenarios**:

| Scenario | Trigger Condition | Expected Behavior |
|----------|------------------|-------------------|
| EventStream 异常终止 | 核心 loop 发射 error 事件 | AgentRunner 捕获错误，返回错误响应 |
| 回调异常 | `onToolCall` 等回调抛出异常 | AgentRunner 捕获，记录日志，不影响循环 |

**State Behavior**:
- AgentRunner 有状态（Session、History）
- 核心 loop 无状态
- AgentRunner 负责在 loop 结束后持久化状态

---

#### F-007: 消息入口预验证

**Description**: 替代当前 `sanitizeHistoryForToolProtocol` 的后期全量重写机制。在消息追加到历史记录时即进行格式验证。

**Input**:
- LLM 返回的 assistant message（可能包含工具调用）
- 工具执行的结果 message

**Output**:
- 验证通过：消息正常追加到历史
- 验证失败：返回 `tool_result` 格式的错误消息，让 LLM 重新生成

**Business Rules**:
1. 在核心 loop 中，每次将 assistant message 追加到 `messages` 前进行格式验证
2. 验证内容：(a) 工具调用参数是否为有效 JSON；(b) tool_use_id 是否唯一；(c) 消息结构是否符合 Anthropic API 协议
3. 验证失败时，不追加该消息，而是构造一个 tool_result 错误返回给 LLM：`{"type": "tool_result", "tool_use_id": "...", "content": "Invalid tool call format: {error_detail}. Please retry with correct format.", "is_error": true}`
4. LLM 收到错误后可重新生成工具调用
5. 移除 `sanitizeHistoryForToolProtocol` 方法及其两阶段调用

**Error & Exception Scenarios**:

| Scenario | Trigger Condition | Expected Behavior |
|----------|------------------|-------------------|
| JSON 解析失败 | 工具参数不是有效 JSON | 返回 tool error，LLM 重试 |
| 重复 tool_use_id | 同一轮中出现重复 ID | 返回 tool error，LLM 重试 |
| LLM 反复验证失败 | 连续多次格式错误 | 计入滑动窗口失败检测，可能触发退出 |

**State Behavior**:
- 验证在消息追加前执行（前置守卫）
- 验证失败的消息不进入历史记录
- 不修改已有历史记录

---

## 4. Non-Functional Requirements

### 4.1 Performance Requirements

| Metric | Requirement | Measurement Method |
|--------|------------|-------------------|
| 循环单轮延迟 | 重构后单轮延迟增加不超过 5ms | 基准测试对比 |
| EventStream 事件延迟 | 事件从发射到消费 < 1ms | EventStream 内部计时 |
| 内存占用 | 核心 loop 内存占用 ≤ 当前 AgentRunner | 运行时内存分析 |

### 4.2 Security Requirements

- 消息入口预验证防止格式注入
- 不在核心 loop 中暴露 API 密钥或敏感配置

### 4.3 Usability Requirements

- 重构后 CLI 用户体验无变化
- SubAgent 创建者使用核心 loop API 的代码量不超过 20 行

### 4.4 Compatibility Requirements

- `AgentRunner` 对外接口保持不变（`run()`, `step()` 方法签名）
- 现有的 `onMessagePart`, `onToolCall`, `onToolResult`, `onUsage` 回调接口保持不变
- 现有测试用例在最小修改后通过

---

## 5. Constraints & Dependencies

### 5.1 Constraints

- 保持三层工具体系（Native/Agent/Extension Shell Command）不变
- 项目处于开发阶段，优先重构清晰度，不做向后兼容 hack
- 日志和异常信息使用英文
- 禁止硬编码数值，配置参数支持环境变量

### 5.2 External Dependencies

- Anthropic SDK (`@anthropic-ai/sdk`) — LLM 调用
- MCP SDK — Extension Shell Command
- Bun 运行时和测试框架

### 5.3 Assumptions

- 现有测试用例覆盖核心功能，可作为重构安全网
- `src/core/agent-loop.ts` 的 EventStream 设计是成熟可靠的基础
- SubAgent 不需要 TodoList、会话持久化、权限管理等高级能力

---

## 6. BDD Testability Check

| Dimension | Verification Question | Status |
|-----------|----------------------|--------|
| Input/Output format | AgentLoopConfig 接口定义了完整的输入类型；AgentEvent 定义了完整的事件类型 | Pass |
| Error & exception scenarios | 每个功能点都列出了错误场景和预期行为 | Pass |
| Boundary & priority rules | TodoList 阈值为 0/10 的边界行为已定义；滑动窗口边界条件已定义 | Pass |
| State behavior | 核心 loop 无状态（局部变量）；外层包装器有状态（Session）；持久化边界清晰 | Pass |
| Verifiable granularity | 每个功能可独立测试：loop 退出条件、TodoList 注入、失败检测、消息验证 | Pass |
| Ambiguity check | 已确认：阈值 10 轮、滑动窗口策略、返回错误让 LLM 重试 | Pass |

---

## 7. Glossary

| Term | Definition |
|------|-----------|
| Agent Loop | Agent 的核心执行循环：接收消息 → 调用 LLM → 执行工具 → 循环 |
| EventStream | 异步可迭代的事件流，核心 loop 通过它发射事件 |
| AgentEvent | EventStream 中的事件类型，包含 agent_start, tool_start 等 |
| TodoList | Agent 的任务清单，用于追踪多步骤任务的完成状态 |
| System Reminder | 注入到对话中的系统提醒消息，引导 LLM 关注特定信息 |
| 滑动窗口 | 固定大小的环形缓冲区，用于检测最近 N 次操作中的失败率 |
| AgentRunner | 核心 loop 的外层包装器，提供会话管理、权限控制等高级能力 |
| SubAgent | 由主 Agent 创建的子智能体，使用精简配置运行核心 loop |
| Context Compact | 通过 LLM 总结压缩对话历史，减少 token 消耗 |
| History Sanitization | 验证和修复消息历史中的格式问题 |
