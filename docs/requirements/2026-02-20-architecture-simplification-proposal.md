# Architecture Simplification — Requirement Proposal

## 1. Background & Problem

### 1.1 Problem Description

Synapse Agent 在快速迭代过程中积累了显著的架构债务。核心问题是**双轨并行**：项目中存在两套 Agent Loop 实现（`src/agent/agent-runner.ts` 与 `src/core/agent-loop.ts`）、两套 SubAgent 实现（`sub-agent-manager.ts` 与 `sub-agent-core.ts`）、两套消息类型系统（`providers/types.ts` 与 `core/types.ts`），以及分散在多个模块中的职责重叠代码。

这导致新功能开发时开发者需要在"旧版"和"新版"之间做选择，理解成本线性增长，且两套实现之间的行为差异可能引入隐蔽 bug。

### 1.2 Impact Scope

- **普遍性评估**: 普遍问题——影响所有模块的开发和维护效率
- **影响角色**: 项目核心开发者、技能开发者、集成开发者
- **当前痛点**:
  1. 两套 Agent Loop 并行，新增功能不知该放哪套
  2. `src/tools/` 嵌套 4 层目录（`handlers/agent-bash/todo/`），代码导航困难
  3. Skills 模块 24 个文件，含两套 SKILL.md 解析器行为可能不一致
  4. CLI 渲染逻辑分散在 5+ 个文件，SubAgent 渲染回调链需穿越 5 层
  5. 模块间循环依赖需要 `require()` 动态加载和 `setToolExecutor()` 延迟绑定来打破
  6. `core/types.ts` 与 `providers/types.ts` 语义重叠，跨模块理解需心智翻译

### 1.3 Problem Domain Boundary

- **问题域（要解决的）**: 包结构重组、模块边界重新划分、重复代码消除、类型系统统一、循环依赖消除
- **方案域（不在本阶段范围）**: 新功能开发、性能优化、新 LLM Provider 接入、UI 重写

## 2. User Stories

### 2.1 核心用户故事

> As a developer, I want a single, clean Agent Loop implementation based on EventStream architecture, so that I don't have to choose between two parallel systems when adding features.

### 2.2 扩展用户故事

> US-2: As a developer, I want clear module boundaries with single responsibilities and explicit interfaces, so that cross-module integration doesn't require understanding hidden dependencies.

> US-3: As a developer, I want the Skills module reorganized into clear sub-modules, so that its 24 files are navigable and the duplicate SKILL.md parsers are unified.

> US-4: As a developer, I want a unified type system for messages, events, and tool results, so that I don't need mental translation between core/types and providers/types.

> US-5: As a developer, I want the tools directory flattened from 4-level nesting to a simpler structure, so that the three-layer routing architecture is easy to follow.

> US-6: As a developer, I want CLI rendering logic consolidated, so that the SubAgent rendering callback chain doesn't span 5 layers.

## 3. Requirement Refinement

### 3.1 Functional Requirements

| ID | Description | Priority (MoSCoW) | Source |
|----|------------|-------------------|--------|
| FR-001 | 统一 Agent Loop：以 `core/agent-loop.ts` 的 EventStream 架构为基础，迁移 `agent-runner.ts` 的成熟能力（会话管理、上下文压缩、沙箱权限、stop hooks 等） | Must have | US-1 |
| FR-002 | 消除双轨 SubAgent：将 `sub-agent-manager.ts`（旧版）迁移到 `sub-agent-core.ts`（新版），统一为一套实现 | Must have | US-1 |
| FR-003 | 统一类型系统：合并 `core/types.ts` 与 `providers/types.ts`、`types/` 为单一类型层，消除语义重叠 | Must have | US-4 |
| FR-004 | Skills 模块重组：将 24 个文件按职责分为 4-5 个子模块（loader、generator、enhancer、manager、schema），统一 SKILL.md 解析器 | Must have | US-3 |
| FR-005 | 工具系统结构扁平化：将 `handlers/agent-bash/`、`handlers/extend-bash/` 的 4 层嵌套简化为 2 层，保持三层路由核心不变 | Should have | US-5 |
| FR-006 | CLI 渲染整合：将 `terminal-renderer.ts`、`fixed-bottom-renderer.ts`、`renderer/` 子目录统一为一个内聚的渲染模块 | Should have | US-6 |
| FR-007 | 消除循环依赖：重新设计模块间的依赖方向，用依赖注入替代 `require()` 动态加载和 `setToolExecutor()` 延迟绑定 | Should have | US-2 |
| FR-008 | 模块重新划分：将当前 12 个顶层模块重组为更清晰的分层结构（core → domain → infrastructure → application） | Should have | US-2 |
| FR-009 | Hooks 模块简化：将 Stop Hook 和 Skill Enhance Hook 整合为统一的事件钩子系统 | Could have | US-2 |
| FR-010 | Sandbox 模块简化：保留 Provider Registry 模式，精简内部实现 | Could have | US-2 |
| FR-011 | 保留并迁移现有测试：所有单元测试和集成测试随代码迁移更新，不丢失覆盖率 | Must have | - |

### 3.2 Non-Functional Requirements

| ID | Description | Acceptance Criteria | Priority |
|----|------------|-------------------|----------|
| NFR-001 | 模块最大文件数控制 | 任何单一模块不超过 10 个文件（不含 index.ts） | Should have |
| NFR-002 | 目录嵌套深度 | src/ 下最大嵌套不超过 3 层 | Should have |
| NFR-003 | 循环依赖为零 | `dependency-cruiser` 检查通过，无循环依赖 | Must have |
| NFR-004 | 类型安全 | `tsc --noEmit` 零错误 | Must have |
| NFR-005 | 测试通过 | `bun test` 全部通过 | Must have |

### 3.3 Key Decision Records

| Decision ID | Question | Conclusion | Rationale |
|------------|----------|-----------|-----------|
| KD-001 | 保留哪套 Agent Loop？ | 保留 `core/agent-loop.ts`（EventStream 架构） | EventStream 是更现代的事件驱动模式，扩展性更好 |
| KD-002 | 是否允许 Breaking Change？ | 允许 | 项目处于开发阶段，重构优先于兼容 |
| KD-003 | Skills 功能是否裁剪？ | 保留全部功能，重组结构 | 自我成长是核心差异化能力 |
| KD-004 | LLM Provider 数量？ | 保留全部 3 个（Anthropic/OpenAI/Google） | 多 Provider 支持是重要功能 |
| KD-005 | Sandbox/Hooks 处理？ | 保留并简化 | 均为有价值的功能，但实现可精简 |

## 4. MoSCoW Priority Overview

### Must Have
- FR-001: 统一 Agent Loop（EventStream 架构）
- FR-002: 消除双轨 SubAgent
- FR-003: 统一类型系统
- FR-004: Skills 模块重组
- FR-011: 测试迁移

### Should Have
- FR-005: 工具系统结构扁平化
- FR-006: CLI 渲染整合
- FR-007: 消除循环依赖
- FR-008: 模块重新划分

### Could Have
- FR-009: Hooks 模块简化
- FR-010: Sandbox 模块简化

### Won't Have (this iteration)
- 新功能开发
- 性能优化
- 新 LLM Provider 接入
- CLI UI 框架更换（保持 Ink + Commander）

## 5. Constraints & Assumptions

### 5.1 Constraints
- 核心思想不变：单一 Bash 工具 + 三层路由、MCP/Skill 扩展、自我成长、SubAgent 体系
- 技术栈不变：Bun + TypeScript + Ink + Zod + Pino
- 依赖不变：不增减生产依赖
- 测试框架不变：Bun Test

### 5.2 Assumptions
- `core/agent-loop.ts` 的 EventStream 架构足以承载 `agent-runner.ts` 的所有成熟能力
- 两套 SKILL.md 解析器合并后不会引入解析行为回退
- 循环依赖可以通过依赖注入 + 接口抽象完全消除，无需动态 `require()`

## 6. Open Questions

| ID | Question | Status | Owner |
|----|---------|--------|-------|
| Q-001 | `core/agent-loop.ts` 是否已覆盖 `agent-runner.ts` 的全部能力（会话持久化、上下文压缩等）？需要详细 gap 分析 | Open | Architect |
| Q-002 | SKILL.md 两套解析器的行为差异有多大？是否可以直接选择其中一个？ | Open | Architect |
| Q-003 | 重组后的目录结构具体设计方案需要在 PRD 中详细描述 | Open | Architect |
