# 技能增强触发效率提升 — 产品需求文档（PRD）

## Document Info
| Field | Value |
|-------|-------|
| Version | v1.0 |
| Created | 2026-02-23 |
| Last Updated | 2026-02-23 |
| Status | In Review |

## 1. Overview

### 1.1 Product/Feature Summary
当前自动技能增强在开关开启后仍存在显著漏触发，根因是触发条件依赖单点硬门槛（如 TodoWrite），与真实复杂任务特征不一致。本需求将触发逻辑升级为“可解释综合评分模型”，以任务复杂度信号决定是否增强。系统在任务正常结束后执行评分，达到阈值自动执行技能增强，不做去重冷却；未触发与失败场景都输出可观测原因码。目标是在可控成本下显著提升技能沉淀召回率，并保证增强失败不影响主任务结果。

### 1.2 Goals
- 将“单点硬门槛”替换为评分触发，降低漏触发。
- 默认保守阈值（总分 `>=3`）下实现可解释决策。
- 达标后自动执行增强，保持用户流程连续。
- 增强失败不影响主任务主响应。
- 每次决策均可追踪：信号命中、得分、阈值、原因码。

### 1.3 Non-Goals (explicitly excluded scope)
- 本迭代不引入去重/冷却策略。
- 不重写技能生成算法与 meta-skill 内容。
- 不覆盖异常结束任务的触发（仍以正常结束链路为主）。
- 不引入跨会话语义聚类或自动权重学习。

## 2. Users & Scenarios

### 2.1 Target Users
| User Role | Description | Core Need |
|-----------|------------|-----------|
| CLI 交互用户 | 在终端通过 Agent 完成多步任务 | 高价值任务能稳定触发技能沉淀 |
| 技能库维护者 | 维护和优化 `~/.synapse/skills` 内容 | 触发逻辑可解释、可调优、可观测 |

### 2.2 Core User Story
> As a Synapse Agent user, I want auto skill enhancement to be triggered by task complexity scoring, so that reusable workflows are captured reliably without extra manual steps.

### 2.3 Use Cases
| ID | Description | Trigger | Expected Outcome |
|----|------------|---------|-----------------|
| UC-001 | 复杂任务触发增强 | 开关开启，评分>=阈值 | 自动执行 skill enhance |
| UC-002 | 简单任务不触发 | 开关开启，评分<阈值 | 跳过增强并记录 `LOW_SCORE` |
| UC-003 | 错误恢复任务优先触发 | 任务内先失败后成功 | 命中 `错误并修复(+2)` 信号并更易达标 |
| UC-004 | 增强失败不中断主流程 | 子代理超时/异常 | 返回失败信息但保留主任务结果 |
| UC-005 | 无去重冷却 | 连续达标任务 | 每次均允许触发增强 |

## 3. Functional Requirements

### 3.1 Feature List
| ID | Feature Name | Description | Priority |
|----|-------------|------------|----------|
| F-001 | 综合评分触发判定 | 用多信号评分决定是否触发增强 | Must |
| F-002 | 达标自动增强执行 | 评分达标后自动执行 skill enhance | Must |
| F-003 | 决策可观测与原因码 | 每次触发/未触发均记录结构化原因 | Should |
| F-004 | 阈值档位配置 | 支持保守/中性/激进三档（默认保守） | Should |

### 3.2 Feature Details

#### F-001: 综合评分触发判定
**Description**: 在任务正常结束且自动增强开关开启时，基于固定信号分值计算总分，并与阈值比较生成触发决策。

**Input**:
- `autoEnhanceEnabled: boolean`
- `completedNormally: boolean`
- `sessionId: string | null`
- `signals: TriggerSignals`
  - `toolCallCount: integer`（>=0）
  - `uniqueToolCount: integer`（>=0）
  - `hasErrorRecovered: boolean`
  - `hasWriteOrEdit: boolean`
  - `userClarificationCount: integer`（>=0，LLM 语义判定）
- `profile: "conservative" | "neutral" | "aggressive"`（默认 `conservative`）

**Output**:
- `decision: TriggerDecision`
  - `shouldTrigger: boolean`
  - `totalScore: integer`（0..6）
  - `threshold: integer`（1|2|3）
  - `signalHits: string[]`
  - `reasonCode: "AUTO_ENHANCE_OFF" | "TASK_NOT_COMPLETED_NORMALLY" | "SESSION_NOT_FOUND" | "LOW_SCORE" | "SCORE_REACHED"`

**Business Rules**:
1. 前置门禁优先级：`autoEnhanceEnabled=false`、`completedNormally=false`、`sessionId=null` 时直接不触发。
2. 评分信号与分值固定为：
- `toolCallCount>=3` => `+1`
- `uniqueToolCount>=2` => `+1`
- `hasErrorRecovered=true` => `+2`
- `hasWriteOrEdit=true` => `+1`
- `userClarificationCount>=2` => `+1`
3. 总分 `>= threshold` 时 `shouldTrigger=true`，否则为 `false`。
4. 边界值命中即计分（如 `toolCallCount=3`、`uniqueToolCount=2`、`userClarificationCount=2`）。
5. “错误并修复”采用宽松口径：任务内出现过工具错误，且后续任意一次工具成功即视为修复。
6. “用户澄清”采用 LLM 语义判定（结构化 JSON 输出）。

**Error & Exception Scenarios**:
| Scenario | Trigger Condition | Expected Behavior |
|----------|------------------|-------------------|
| 信号提取失败 | 工具结果或消息解析异常 | 该信号按未命中处理，记录解析告警，不中断判定 |
| profile 非法 | 读取到未知档位值 | 回退为 `conservative`（threshold=3） |
| 负数输入 | 输入计数异常为负数 | 归零后参与计算 |

**Boundary Conditions**:
- `totalScore` 上限 6，下限 0。
- `totalScore==threshold` 必须触发。
- 所有计数型信号仅接受整数，非整数先标准化为整数后判定。

**State Behavior**:
- 评分计算为单次任务内临时态，不跨会话持久化。
- 仅阈值档位配置可持久化到 settings。

#### F-002: 达标自动增强执行
**Description**: 当 F-001 判定触发后，系统自动执行增强流程，不要求用户确认；失败时错误隔离。

**Input**:
- `decision.shouldTrigger: boolean`
- `conversationPath: string`
- `maxEnhanceContextChars: integer (>0)`
- `subAgentTimeoutMs: integer (>0)`

**Output**:
- `HookResult.message: string`
  - 成功：`[Skill] Created: <name>` / `[Skill] Enhanced: <name>` / `[Skill] No enhancement needed`
  - 失败：`Enhancement failed: <reason>`

**Business Rules**:
1. `shouldTrigger=true` 时必须自动进入增强执行链路。
2. 不做去重冷却：同类任务多次达标允许多次执行。
3. 子代理输出格式非法时允许 1 次重试；仍非法则返回固定兜底文案。
4. 增强失败不得修改主任务的最终响应主体，只作为 stop-hook 附加信息输出。

**Error & Exception Scenarios**:
| Scenario | Trigger Condition | Expected Behavior |
|----------|------------------|-------------------|
| 会话读取失败 | 会话文件不存在/不可读 | 返回 `Enhancement failed: failed to read session - ...` |
| Meta-skill 缺失 | `skill-creator` 或 `skill-enhance` 缺失 | 返回 `Enhancement failed: meta-skills not found` |
| 执行超时 | 超过 `subAgentTimeoutMs` | 返回 `Enhancement failed: execution timeout` |
| 子代理异常 | LLM/工具调用报错 | 返回 `Enhancement failed: <error>` |

**Boundary Conditions**:
- `maxEnhanceContextChars` 最小为 1，异常值回退系统默认。
- 重试次数固定 1 次，禁止无限重试。

**State Behavior**:
- 执行状态仅本次 hook 生命周期内有效。
- 不记录去重状态，不跨任务记忆“已增强”。

#### F-003: 决策可观测与原因码
**Description**: 为每次评估和执行输出结构化日志，支持后续调参和问题定位。

**Input**:
- `TriggerDecision`
- `signalDetails`
- `executionResult`

**Output**:
- 结构化日志字段：`reasonCode`、`totalScore`、`threshold`、`signalHits`、`profile`、`sessionId`、`executionStatus`。

**Business Rules**:
1. 每次评估必须记录决策日志（触发/未触发都记录）。
2. 未触发至少输出一个明确原因码。
3. 日志不得输出完整会话正文或敏感 prompt。

**Error & Exception Scenarios**:
| Scenario | Trigger Condition | Expected Behavior |
|----------|------------------|-------------------|
| 日志写入失败 | IO 或 logger 异常 | 吞吐错误，不影响主流程 |

**Boundary Conditions**:
- `reasonCode` 必须属于枚举集合。
- `signalHits` 可为空数组（表示 0 分）。

**State Behavior**:
- 日志持久化策略沿用现有 logger，不新增数据库状态。

#### F-004: 阈值档位配置
**Description**: 支持三档触发阈值配置，默认保守档。

**Input**:
- `settings.skillEnhance.triggerProfile?: string`

**Output**:
- 有效档位：
  - `conservative` => `threshold=3`
  - `neutral` => `threshold=2`
  - `aggressive` => `threshold=1`

**Business Rules**:
1. 未配置时默认 `conservative`。
2. 非法值自动回退 `conservative`。
3. 本迭代用户默认配置保持 `conservative`，无需额外交互。

**Error & Exception Scenarios**:
| Scenario | Trigger Condition | Expected Behavior |
|----------|------------------|-------------------|
| settings 解析失败 | 配置文件字段非法 | 使用默认档位并记录告警 |

**Boundary Conditions**:
- 阈值只能为 1/2/3，不接受其他值。

**State Behavior**:
- 档位配置持久化于 settings，跨会话生效。

## 4. Non-Functional Requirements

### 4.1 Performance Requirements
| Metric | Requirement | Measurement Method |
|--------|------------|-------------------|
| 评分计算开销 | 评估阶段 P95 < 100ms（不含子代理执行） | 单元测试 + 基准脚本统计 |
| 决策日志开销 | 单次日志序列化不引入可见交互卡顿 | 本地压测与日志采样 |

### 4.2 Security Requirements
- 不记录完整会话文本和完整 prompt 到触发日志。
- 错误信息输出需控制长度，避免泄露长堆栈细节。

### 4.3 Usability Requirements
- 在不新增用户操作的前提下，提高增强触发可感知率。
- 未触发时可通过原因码解释“为什么没触发”。

### 4.4 Compatibility Requirements
- 与现有 `StopHook` 链路兼容。
- 与现有 `/skill enhance --on/--off` 开关行为兼容。

## 5. Constraints & Dependencies

### 5.1 Constraints
- 当前迭代仅调整触发判定与执行策略，不改技能内容生成主流程。
- 不引入去重冷却。
- 依赖任务“正常结束”链路触发 stop hook。

### 5.2 External Dependencies
- `SettingsManager`（读取开关、上下文长度、档位配置）。
- `StopHookExecutor`（触发时机）。
- `SubAgentManager` 与 LLM Provider（增强执行）。

### 5.3 Assumptions
- LLM 语义判定可避免关键词硬编码带来的规则僵化问题。
- “宽松错误恢复”口径可显著提升高价值任务召回。
- 默认保守档有利于控制误触发成本。

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
| 触发评分模型 | 基于多信号加权求和并与阈值比较的触发机制 |
| 宽松错误恢复 | 任务中出现错误后，后续任意工具成功即视为恢复 |
| 原因码 | 用于解释触发/未触发决策的标准枚举值 |
| 保守档 | 默认阈值 3 分的触发配置 |
