# Task 子命令终端可见性 — 产品需求文档（PRD）

## Document Info
| Field | Value |
|-------|-------|
| Version | v1.0 |
| Created | 2026-02-23 |
| Last Updated | 2026-02-23 |
| Status | In Review |

## 1. Overview

### 1.1 Product/Feature Summary
当前系统在执行 `task:*` 命令时，终端经常看不到明确的调用开始/结束信息，导致用户无法判断任务是否已启动、是否结束、是否失败。本需求为所有 `task:*` 子命令（`task:skill:search`、`task:skill:enhance`、`task:explore`、`task:general`）提供统一的“任务级摘要可见性”：在 TTY 交互终端中，必须输出开始行与结束行，并在失败时输出一行简短原因。该能力不依赖子代理内部是否有工具调用，因此即使是纯推理任务（如 skill search）也必须可见。

### 1.2 Goals
- 在 TTY 下，100% 的 `task:*` 调用都可见“开始+结束”。
- 失败场景可见：结束状态为 failed 且包含一行简短 reason。
- 并发 `task:*` 下，无串号、无丢失、无重复渲染。
- 不改变非 `task:*` 命令现有渲染行为。

### 1.3 Non-Goals (explicitly excluded scope)
- 非 TTY 环境的统一展示规范（本期不强制）。
- 非 `task:*` 工具（如 `read/write/edit`）的新展示样式。
- 全链路可观测性重构（如统一 EventBus 全量改造）。

## 2. Users & Scenarios

### 2.1 Target Users
| User Role | Description | Core Need |
|-----------|------------|-----------|
| CLI 交互用户 | 在终端直接与 Agent 交互的开发者 | 立即看到 task 是否开始、完成或失败 |
| 调试/排障用户 | 复现 task 问题的维护者 | 快速定位失败与耗时，不依赖内部细节 |

### 2.2 Core User Story
> As a CLI user, I want each `task:*` command to show start/end summary in terminal, so that I can know execution status without guessing.

### 2.3 Use Cases
| ID | Description | Trigger | Expected Outcome |
|----|------------|---------|-----------------|
| UC-001 | 单个 task 成功执行 | Agent 发起 `task:*` | 显示开始行与成功结束行（含耗时） |
| UC-002 | task 失败执行 | task 路由/执行报错 | 显示开始行、失败结束行、一行 reason |
| UC-003 | 并发多个 task | 同轮多个 `task:*` | 每个 task 独立开始/结束，按 toolCallId 配对 |
| UC-004 | task 内部无工具调用 | `task:skill:search` 纯推理 | 仍显示开始/结束，不因内部“零工具”缺失 |
| UC-005 | 非 task 命令 | `read/write/edit` 等 | 继续走原渲染逻辑，无行为变化 |

## 3. Functional Requirements

### 3.1 Feature List
| ID | Feature Name | Description | Priority |
|----|-------------|------------|----------|
| F-001 | Task 生命周期摘要事件 | 为 `task:*` 产生开始/结束摘要语义，支持并发关联 | Must |
| F-002 | TTY 任务摘要渲染 | 在 TTY 中输出任务级简洁开始/结束与失败原因 | Must |
| F-003 | 去重与回退机制 | 防止 task 双重渲染；解析失败时回退默认渲染 | Must |

### 3.2 Feature Details

#### F-001: Task 生命周期摘要事件
**Description**: 为所有 `task:*` 调用建立稳定生命周期：开始事件与结束事件一一对应。

**Input**:
- `toolCallId: string`（唯一关联键）
- `command: string`（Bash command）
- `description: string`（来自 `--description/-d`，可为空）
- `taskType: enum`（`skill:search|skill:enhance|explore|general`）

**Output**:
- `TaskSummaryStart`：`taskCallId, taskType, description, startedAt`
- `TaskSummaryEnd`：`taskCallId, taskType, description, success, durationMs, errorSummary?`

**Business Rules**:
1. 识别到 `task:*` 后必须发出且仅发出 1 次开始事件。
2. 每个开始事件必须对应 1 次结束事件（成功/失败/中断均要发）。
3. 并发任务用 `toolCallId` 配对，禁止字符串匹配配对。
4. 结束后必须清理内存状态，防止泄漏。

**Error & Exception Scenarios**:
| Scenario | Trigger Condition | Expected Behavior |
|----------|------------------|-------------------|
| 执行器缺失 | 无 SubAgent executor | 发开始后发失败结束，`errorSummary` 为短错误 |
| 用户中断 | Abort/Ctrl+C | 发失败结束，`errorSummary=Task execution interrupted.` |
| 未知执行错误 | tool 返回 isError | 发失败结束，`errorSummary` 单行截断 |

**Boundary Conditions**:
- 同轮并发多个 `task:*`：每个调用独立事件对。
- `description` 为空：使用 `Unnamed task` 作为显示回退值。
- `durationMs` 最小为 0，禁止负值。

**State Behavior**:
- 仅会话内内存态（`Map<toolCallId, TaskState>`）。
- 任务结束即删除该 key。
- 新会话不继承旧状态。

#### F-002: TTY 任务摘要渲染
**Description**: 仅在 TTY 场景强保证可见性，输出简洁模式。

**Input**:
- `TaskSummaryStart/End` 事件流
- `isTTY: boolean`

**Output**:
- 开始行：`• Task(<taskType>) <description>`
- 成功结束行：`✓ Task(<taskType>) completed [<seconds>s]`
- 失败结束行：`✗ Task(<taskType>) failed [<seconds>s]`
- 失败附加行：`reason: <short-error>`（仅一行）

**Business Rules**:
1. TTY 下必须渲染上述 3 类摘要行。
2. 失败时必须追加一行 reason。
3. reason 必须单行，超长截断（保留可读前缀）。
4. 非 TTY 不做强保证（保持现有行为）。

**Error & Exception Scenarios**:
| Scenario | Trigger Condition | Expected Behavior |
|----------|------------------|-------------------|
| 事件缺字段 | description/taskType 缺失 | 使用回退值，不中断渲染 |
| 原地渲染冲突 | 并发刷新时序交错 | 允许交错输出，但禁止缺失结束行 |

**Boundary Conditions**:
- 耗时显示统一到秒级（小数 1 位）。
- description 仅显示简洁文本，不展示 prompt/action。

**State Behavior**:
- 渲染层不持久化，按事件即打即走。
- 仅依赖事件，不反查执行器内部状态。

#### F-003: 去重与回退机制
**Description**: 防止 `task:*` 在顶层工具渲染器和任务摘要渲染器重复展示；无法识别时安全回退。

**Input**:
- 原始工具调用（含 name/arguments）
- task 解析结果（成功/失败）

**Output**:
- `task:*` 仅展示任务摘要，不重复展示顶层工具调用。
- 非 task 或解析失败调用，展示现有顶层工具调用。

**Business Rules**:
1. `task:*` 优先级高于普通顶层工具渲染。
2. 解析失败必须回退到默认渲染，禁止吞掉输出。
3. 非 `task:*` 行为完全保持现状。

**Error & Exception Scenarios**:
| Scenario | Trigger Condition | Expected Behavior |
|----------|------------------|-------------------|
| task 误判 | 命令接近但非 `task:*` | 走默认渲染 |
| JSON 解析失败 | Bash arguments 非法 | 走默认渲染 |

**Boundary Conditions**:
- 同一 `toolCallId` 不可重复渲染结束。
- 解析器异常不应影响主流程执行。

**State Behavior**:
- 去重仅针对当前回合内工具调用。
- 回退路径不依赖 task 状态表。

## 4. Non-Functional Requirements

### 4.1 Performance Requirements
| Metric | Requirement | Measurement Method |
|--------|------------|-------------------|
| 渲染附加开销 | 每个 task 摘要渲染额外 CPU 开销可忽略（O(1) 状态操作） | 基于单测与手工压测对比 |
| 内存占用 | 状态表大小与并发 task 数线性，任务结束后归零 | 并发场景单测断言 map 清空 |

### 4.2 Security Requirements
- 不输出 prompt 全文，避免潜在敏感信息在终端泄露。
- 错误原因输出做单行截断，避免泄露长堆栈。

### 4.3 Usability Requirements
- 用户无需阅读内部工具细节即可判断执行状态。
- 成功/失败与耗时信息一眼可读。

### 4.4 Compatibility Requirements
- 兼容现有 `task:*` 命令格式。
- 不破坏现有非 `task:*` 命令的渲染与测试。

## 5. Constraints & Dependencies

### 5.1 Constraints
- 本期仅保证 TTY 交互终端可见性。
- 不进行大规模事件总线重构。

### 5.2 External Dependencies
- 依赖当前 AgentRunner 的 `onToolCall/onToolResult` 回调链。
- 依赖现有 Bash task 路由行为。

### 5.3 Assumptions
- `toolCall.id` 在单次会话内唯一。
- `task:*` 执行路径仍通过 Bash 工具。
- CLI 在 TTY 下允许标准输出摘要行。

## 6. BDD Testability Check

| Dimension | Verification Question | Status |
|-----------|----------------------|--------|
| Input/Output format | Are exact input/output formats specified? (data types, structure, encoding) | Pass |
| Error & exception scenarios | Is every failure mode explicitly described with expected behavior? | Pass |
| Boundary & priority rules | Are conflict/ambiguity resolution rules defined? | Pass |
| State behavior | Is state persistence, isolation, and reset behavior clear? | Pass |
| Verifiable granularity | Can each behavior be independently tested with concrete steps and a single expected outcome? | Pass |
| Ambiguity check | Are there implicit assumptions that different readers could interpret differently? | Pass |

## 7. Glossary
| Term | Definition |
|------|-----------|
| Task 摘要 | 指 `task:*` 的开始/结束简洁终端输出 |
| TTY | 交互式终端环境（`process.stdout.isTTY=true`） |
| 回退渲染 | 当 task 解析失败时，走原有工具渲染逻辑 |
| 去重渲染 | 避免同一 task 同时出现摘要输出和顶层工具输出 |
