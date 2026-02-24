# Task 返回主 Agent 摘要压缩 — 产品需求文档（PRD）

## Document Info
| Field | Value |
|-------|-------|
| Version | v1.0 |
| Created | 2026-02-23 |
| Last Updated | 2026-02-23 |
| Status | In Review |

## 1. Overview

### 1.1 Product/Feature Summary
当前 `task:*`（包括 `task:general`、`task:explore`、`task:skill:*`）在完成后会把 SubAgent 原始输出直接返回给主 Agent，并被写入主会话历史。当 SubAgent 产出较长检索/分析文本时，主会话 token 迅速膨胀，容易触发上游模型上下文窗口超限错误。为降低此风险，本需求引入“Task 返回前强制摘要”机制：所有 `task:*` 返回值在进入主 Agent 前，统一压缩为单句文本，并以现有 `countTokens` 口径强制校验，最大不超过 4096 token。该机制必须覆盖成功与失败两类 Task 结果，且仅作用于 `task:*`，不改变其他工具（如 `read/write/edit/bash`）行为。

### 1.2 Goals
- 将 `task:*` 写回主 Agent 的文本严格限制为“单句摘要”。
- `task:*` 返回文本按统一 token 口径（`countTokens`）强制 `<= 4096`。
- 摘要生成路径具备可恢复能力：LLM 摘要失败时可本地降级，最终仍保证可返回。
- 降低主会话上下文暴涨概率，减少后续轮次因上下文过大导致的请求失败。
- 保留必要排障能力：允许记录原始 Task 文本相关日志（不入 history）。

### 1.3 Non-Goals (explicitly excluded scope)
- 不改变主 Agent 非 `task:*` 工具返回的写回策略。
- 不引入新的 tokenizer 或 provider 级精确计数器。
- 不保证摘要语义“最佳质量”，本期优先稳定性与上下文体积控制。
- 不新增会话存储结构，不在 history 中保存 Task 原文副本。

## 2. Users & Scenarios

### 2.1 Target Users
| User Role | Description | Core Need |
|-----------|------------|-----------|
| CLI 终端用户 | 使用 Synapse-Agent 执行多轮任务的开发者/研究者 | 任务结果可读且不导致后续轮次上下文爆炸 |
| Agent 运行维护者 | 关注稳定性、可观测性和故障排查的维护者 | 可验证压缩策略生效，并可通过日志定位异常 |

### 2.2 Core User Story
> 作为 CLI 用户，我希望 `task:*` 的返回在写回主 Agent 前自动压缩成单句且控长，这样我可以继续多轮对话而不容易遇到上下文超限。

### 2.3 Use Cases
| ID | Description | Trigger | Expected Outcome |
|----|------------|---------|-----------------|
| UC-001 | Task 成功返回长文本 | 用户执行 `task:general` 并得到长结果 | 主 Agent 仅接收单句摘要，且 `<=4096 token` |
| UC-002 | Task 返回失败结果 | `task:*` 执行报错 | 主 Agent 接收单句失败摘要，且 `<=4096 token` |
| UC-003 | LLM 摘要失败 | 摘要阶段超时或异常 | 自动降级本地摘要/兜底文案并返回 |
| UC-004 | 摘要超长 | 摘要文本仍超过阈值 | 直接截断并追加 `…` 后返回 |
| UC-005 | 非 Task 工具执行 | 用户执行 `read/write/edit/bash` | 行为保持不变，不走强制摘要 |

## 3. Functional Requirements

### 3.1 Feature List
| ID | Feature Name | Description | Priority |
|----|-------------|------------|----------|
| F-001 | Task 返回强制单句摘要 | `task:*` 输出进入主 Agent 前必须压缩为单句 | Must |
| F-002 | 4096 token 硬限制与截断 | 摘要结果必须通过 token 校验并在超限时截断 | Must |
| F-003 | 摘要降级与兜底 | LLM 失败时本地降级，仍失败则输出兜底文案 | Must |
| F-004 | 范围隔离 | 仅 `task:*` 生效，其他工具不受影响 | Must |
| F-005 | 可观测日志 | 记录压缩过程关键指标，允许原文相关日志但不入 history | Should |

### 3.2 Feature Details

#### F-001: Task 返回强制单句摘要
**Description**: 对所有 `task:*` 返回值（成功/失败）执行单句摘要后再返回主 Agent。

**Input**:
- `taskType: string`，值域：`general`/`explore`/`skill:*`
- `rawResult: string`，SubAgent 原始文本输出
- `isError: boolean`，任务是否失败

**Output**:
- `summary: string`，单句文本，作为 `task:*` 返回值写回主 Agent

**Business Rules**:
1. 对每一次 `task:*` 返回都必须执行摘要，不允许直通原文。
2. 摘要目标格式为单句（语义可简化，但只能返回一条句子文本）。
3. 成功与失败路径均适用相同的摘要与控长流程。

**Error & Exception Scenarios**:
| Scenario | Trigger Condition | Expected Behavior |
|----------|------------------|-------------------|
| 摘要器异常 | LLM 摘要调用抛错/超时 | 转本地单句提取 |
| 本地提取异常 | 文本异常或处理异常 | 使用兜底文案 |

**Boundary Conditions**:
- `rawResult` 为空字符串时仍返回单句（走兜底）。
- `rawResult` 极长（>100k token）时也必须产出单句摘要。

**State Behavior**:
- 主会话 history 仅保存摘要后的 `task:*` 文本。
- 原始 Task 文本不写入 history。

#### F-002: 4096 token 硬限制与截断
**Description**: 摘要文本必须使用现有 `countTokens` 口径进行硬校验。

**Input**:
- `summary: string`
- `maxTokens: number = 4096`

**Output**:
- `boundedSummary: string`

**Business Rules**:
1. 若 `countTokens(summary) <= 4096`，直接返回。
2. 若 `countTokens(summary) > 4096`，必须直接截断直到 `<=4096`。
3. 发生截断时末尾追加 `…`。

**Error & Exception Scenarios**:
| Scenario | Trigger Condition | Expected Behavior |
|----------|------------------|-------------------|
| token 计算失败 | `countTokens` 抛异常 | 走兜底并再次执行截断保护 |

**Boundary Conditions**:
- 恰好 4096 token 不截断。
- 截断后仍需再次校验，不允许超限返回。

**State Behavior**:
- 仅影响当前返回文本，不修改历史消息结构。

#### F-003: 摘要降级与兜底
**Description**: 摘要流程采用“LLM 优先，本地降级，最终兜底”三级策略。

**Input**:
- `rawResult: string`
- `errorContext?: string`

**Output**:
- `summary: string`

**Business Rules**:
1. 先尝试 LLM 生成单句摘要。
2. LLM 失败时改为本地首句提取。
3. 本地提取失败或结果不可用时输出：`[Task摘要失败] 原因: <极短原因>`。
4. 兜底文案不单独限制“原因”字符数，只要求最终整体不超过 4096 token。

**Error & Exception Scenarios**:
| Scenario | Trigger Condition | Expected Behavior |
|----------|------------------|-------------------|
| LLM 不可用 | 网络/鉴权/超时 | 自动降级本地摘要 |
| 本地摘要为空 | 原文为空或无有效句子 | 输出兜底文案 |

**Boundary Conditions**:
- 任意异常情况下必须有可返回文本。

**State Behavior**:
- 降级路径仅影响当前 Task 返回，不改变后续默认配置。

#### F-004: 范围隔离
**Description**: 强制摘要机制仅覆盖 `task:*`，其他工具输出保持现状。

**Input**:
- `commandName: string`

**Output**:
- `shouldSummarize: boolean`

**Business Rules**:
1. `task:*` → `true`。
2. 非 `task:*`（`read/write/edit/bash/...`）→ `false`。

**Error & Exception Scenarios**:
| Scenario | Trigger Condition | Expected Behavior |
|----------|------------------|-------------------|
| 命令类型识别失败 | 无法匹配工具命令 | 默认不应用 Task 摘要逻辑 |

**Boundary Conditions**:
- `task:skill:search` 与 `task:skill:enhance` 视为 `task:*`。

**State Behavior**:
- 仅本次 tool-result 处理分支变化，不引入全局状态。

#### F-005: 可观测日志
**Description**: 输出摘要过程关键指标，支持排障且避免污染会话上下文。

**Input**:
- `rawTokens: number`
- `summaryTokens: number`
- `truncated: boolean`
- `fallbackUsed: 'none' | 'local' | 'final'`

**Output**:
- 结构化日志记录

**Business Rules**:
1. 允许记录原始文本相关日志（如长度、hash、预览片段）。
2. 日志信息不得写入主 Agent history。

**Error & Exception Scenarios**:
| Scenario | Trigger Condition | Expected Behavior |
|----------|------------------|-------------------|
| 日志写入失败 | I/O 异常 | 不影响主流程返回 |

**Boundary Conditions**:
- 高并发 task 返回时日志字段必须完整且可区分。

**State Behavior**:
- 日志仅用于观测，不参与业务决策回放。

## 4. Non-Functional Requirements

### 4.1 Performance Requirements
| Metric | Requirement | Measurement Method |
|--------|------------|-------------------|
| 摘要阶段额外时延 | P95 增量 <= 1.5s（LLM可用时） | 对比改造前后同类 task 请求耗时 |
| 降级可用性 | 摘要阶段失败后返回成功率 100% | 故障注入测试（LLM失败/本地失败） |
| 返回体积约束 | 100% `task:*` 返回 `<=4096 token` | 自动化断言 `countTokens` |

### 4.2 Security Requirements
- 不在会话历史中持久化 Task 原始敏感长文本。
- 日志中原文相关信息应可配置脱敏（若已有日志策略则遵循）。

### 4.3 Usability Requirements
- 用户侧感知为“Task 回答更短且继续对话更稳定”。
- 失败场景提供可读失败句，不出现空白返回。

### 4.4 Compatibility Requirements
- 与现有 `task:*` 命令参数、返回协议兼容（仍是字符串 `stdout`）。
- 不影响 `read/write/edit/bash` 路径。

## 5. Constraints & Dependencies

### 5.1 Constraints
- 必须复用现有 `countTokens` 口径。
- 最大 token 固定默认值 4096。
- 截断策略采用“直接截断并追加 `…`”。

### 5.2 External Dependencies
- LLM 摘要能力依赖当前 Provider 可用性（仅主路径依赖，降级可脱离）。
- 文件日志组件可用性影响观测，不影响主流程。

### 5.3 Assumptions
- `task:*` 返回值在单点（SubAgent 返回口）可统一处理。
- 直接截断带来的语义损失在本期可接受。
- 现有 token 计数近似精度足以满足“防超窗”目标。

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
| `task:*` | 通过 TaskCommandHandler 路由执行的 SubAgent 任务命令 |
| 主 Agent history | 主会话中用于后续 LLM 请求的消息历史 |
| 单句摘要 | 对 Task 输出压缩后的单条句子文本 |
| 兜底文案 | 当摘要主路径与降级路径均失败时返回的固定格式文本 |
