# Synapse Agent 架构模块化重构 — 需求提案

## 1. Background & Problem

### 1.1 Problem Description

Synapse Agent 是一个约 23,000 行的 AI 智能体框架，核心特色为"三层工具抽象"（Native Shell / Agent Shell / Extension Shell）和"技能自进化"机制。当前架构在功能上已较为完整，但模块间耦合度较高，主要表现在以下四个方面：

1. **AgentRunner 与 UI 层耦合**：Agent Loop 通过回调链（onMessagePart、onToolCall、onSubAgentToolStart 等）直接驱动 TerminalRenderer，无法脱离 CLI 独立运行或嵌入其他场景（Web 服务、桌面应用、SDK）。
2. **Provider 绑定**：仅支持 Anthropic SDK，Provider 接口与具体实现混合，切换其他 LLM 供应商需要修改核心代码。
3. **消息类型混合**：业务消息（技能搜索指令、上下文管理标记、SubAgent 通信等）与 LLM API 消息共用同一数据结构，导致消息过滤和转换逻辑分散在多处。
4. **工具执行环境固定**：三层工具系统的处理器直接操作本地文件系统和 Bash 会话，无法扩展到远程执行环境（SSH、容器等）。

这些耦合点限制了框架的复用性、可测试性和可扩展性。

### 1.2 Impact Scope

- **Universality assessment**: 通用性需求 — 影响所有使用和扩展 Synapse Agent 的开发者及使用场景
- **Affected roles/teams**:
  - 框架开发者：模块间依赖复杂，新功能开发受限
  - 集成开发者：无法将 Agent Core 嵌入 Web/桌面等非 CLI 环境
  - 测试工程师：Agent Loop 无法脱离真实 LLM API 独立测试
- **Current pain points**:
  - 无法独立测试 Agent Core（必须 mock 整个 CLI 层）
  - 无法替换 LLM Provider（硬编码 Anthropic SDK）
  - 无法在非 CLI 环境中使用 Agent Loop
  - 消息处理逻辑分散，调试困难

### 1.3 Problem Domain Boundary

- **问题域（本次重构范围）**：架构层面的模块化重构，建立清晰的模块边界和接口抽象
- **排除范围**：不涉及新功能开发（如新的 Agent Shell Command）、不涉及 UI/交互层的功能增强、不涉及部署和运维

## 2. User Stories

### 2.1 Core User Stories

**US-1: Agent Core 解耦**
> As a 框架开发者, I want Agent Core 与 UI/CLI 层完全解耦，采用 EventStream + 细粒度事件系统, so that Agent Loop 能独立使用、测试，并嵌入不同场景（Web 服务、桌面应用、SDK 引用）。

**US-2: 多 Provider 支持**
> As a 框架开发者, I want 拥有统一的 LLM API 抽象，支持多供应商无缝切换, so that 用户不需要修改 Agent 代码即可更换 LLM Provider。

**US-3: 消息系统分层**
> As a 框架开发者, I want 采用两层消息系统（自定义领域消息 + LLM 消息），通过显式转换函数分离, so that 业务逻辑和 LLM 通信有清晰的边界。

**US-4: 工具可插拔化**
> As a 框架开发者, I want 三层工具系统支持可插拔操作（如 SSH 远程执行）, so that 工具能在不同执行环境下工作，而无需修改核心逻辑。

## 3. Requirement Refinement

### 3.1 Functional Requirements

| ID | Description | Priority (MoSCoW) | Source |
|----|------------|-------------------|--------|
| FR-001 | Agent Core 事件系统：引入 EventStream 异步迭代器，定义 10+ 细粒度事件类型（agent_start, agent_end, turn_start, turn_end, message_start, message_update, message_end, tool_start, tool_end, error, usage），Agent Loop 只产生事件流，不持有 UI 引用 | Must have | US-1 |
| FR-002 | Agent Core 接口抽象：定义 AgentConfig、AgentTool 等接口，Agent Loop 通过接口接收工具集，保留上下文管理能力（offload/compact） | Must have | US-1 |
| FR-003 | 统一 LLM Provider 抽象：定义 Provider 无关的 LLMProvider 接口，初始支持 Anthropic、OpenAI、Google 三家，统一消息格式转换和流式响应处理，支持运行时切换 | Must have | US-2 |
| FR-004 | 两层消息系统：定义领域消息层（所有业务消息类型）和 LLM 消息层（API 消息格式），提供显式 convertToLlm() 转换函数，领域消息支持类型安全的声明合并扩展 | Must have | US-3 |
| FR-005 | 工具可插拔操作：为文件操作工具定义 FileOperations 接口，为 Bash 执行定义 BashOperations 接口，默认提供 LocalOperations 实现，三层路由器（BashRouter）保持不变 | Must have | US-4 |

### 3.2 Non-Functional Requirements

| ID | Description | Acceptance Criteria | Priority |
|----|------------|-------------------|----------|
| NFR-001 | 模块边界清晰度：模块间只通过 index.ts 导出的公共接口通信 | 架构测试通过（import 路径检查无跨模块内部引用） | Must have |
| NFR-002 | 向后兼容性：项目处于开发阶段，不要求向后兼容 | N/A — 明确不要求 | Won't have |
| NFR-003 | 可测试性：Agent Core 可通过 Mock Provider + Mock Tools 独立测试 | Agent Core 模块单元测试覆盖率 > 80% | Must have |
| NFR-004 | 代码规模控制：每个模块（目录）不超过 5,000 行，单文件不超过 500 行，Agent Core 核心循环不超过 300 行 | 代码行数统计满足约束 | Should have |

### 3.3 Key Decision Records

| Decision ID | Question | Conclusion | Rationale |
|------------|----------|-----------|-----------|
| DR-001 | 是否拆分为独立 npm 包（Monorepo）？ | 不拆分，单体仓库内模块化 | 当前阶段快速迭代更重要，避免包管理复杂度 |
| DR-002 | 事件系统采用回调还是 EventStream？ | EventStream 异步迭代器 | 参考 pi-mono，解耦更彻底，消费者可自由选择处理方式 |
| DR-003 | 初始支持哪些 LLM Provider？ | Anthropic + OpenAI + Google | 覆盖主流供应商，验证抽象层设计的通用性 |
| DR-004 | 消息系统是否使用 TypeScript 声明合并？ | 是 | 参考 pi-mono，类型安全的扩展机制，无运行时开销 |

## 4. MoSCoW Priority Overview

### Must Have
- FR-001: Agent Core 事件系统（EventStream + 细粒度事件）
- FR-002: Agent Core 接口抽象（AgentConfig、AgentTool）
- FR-003: 统一 LLM Provider 抽象（三家 Provider）
- FR-004: 两层消息系统（领域消息 + LLM 消息 + convertToLlm）
- FR-005: 工具可插拔操作（FileOperations、BashOperations 接口）
- NFR-001: 模块边界清晰度
- NFR-003: 可测试性

### Should Have
- NFR-004: 代码规模控制

### Could Have
- 会话数据迁移工具
- 架构 fitness function（自动化架构检查）

### Won't Have (this iteration)
- NFR-002: 向后兼容性（明确排除）
- UI/交互层功能增强
- 新的 Agent Shell Command
- 远程执行 Provider 的具体实现（仅定义接口）

## 5. Constraints & Assumptions

### 5.1 Constraints

- **技术栈不变**：Bun + TypeScript + Zod，不引入新的构建工具或运行时
- **核心特色保留**：三层工具抽象（Native Shell / Agent Shell / Extension Shell）和技能自进化机制必须保留
- **单体仓库**：通过目录结构和导出边界实现模块化，不拆分 npm 包
- **项目阶段**：开发阶段，优先重构质量，不需要向后兼容

### 5.2 Assumptions

- Bun 运行时对所有目标 LLM Provider SDK 有良好支持
- pi-mono 的 EventStream 模式可以适配 Synapse Agent 的上下文管理需求（offload/compact）
- 三家 LLM Provider 的 API 差异可以通过统一抽象层有效屏蔽

## 6. Open Questions (All Resolved)

| ID | Question | Status | Resolution |
|----|---------|--------|------------|
| Q-001 | SubAgent 系统是否需要同步重构？ | Resolved | 同步重构 — SubAgent 作为 Agent Core 的消费者，需在本次一起调整以确保一致性 |
| Q-002 | 技能系统是否需要适配多 Provider？ | Resolved | 同步适配 — SkillGenerator/SkillEnhancer 需通过统一的 LLMProvider 接口工作 |
| Q-003 | 现有会话数据是否需要迁移方案？ | Resolved | 不需要 — 新消息格式不兼容旧会话，清空重来即可 |
