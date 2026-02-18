# Synapse Agent 架构模块化重构 — Product Requirements Document (PRD)

## Document Info

| Field | Value |
|-------|-------|
| Version | v1.0 |
| Created | 2026-02-18 |
| Last Updated | 2026-02-18 |
| Status | Draft |
| Proposal Reference | `docs/requirements/2026-02-18-architecture-refactor-proposal.md` |

## 1. Overview

### 1.1 Product/Feature Summary

对 Synapse Agent 框架进行架构模块化重构，在保持三层工具抽象和技能自进化核心特色的前提下，参考 pi-mono 项目的设计模式，将当前约 23,000 行的单体架构重构为模块边界清晰的内聚结构。核心改动包括：Agent Core 采用 EventStream 事件驱动解耦 UI、引入统一多 Provider LLM 抽象、建立两层消息系统、实现工具可插拔操作。

### 1.2 Goals

- **G1**: Agent Core 可脱离 CLI 独立运行和测试，支持嵌入 Web/桌面/SDK 等场景
- **G2**: 通过统一 LLM Provider 接口，实现 Anthropic、OpenAI、Google 三家供应商的无缝切换
- **G3**: 通过两层消息系统和显式转换，消除业务消息与 LLM 消息的边界模糊
- **G4**: 通过可插拔操作接口，使工具系统支持本地/远程等不同执行环境
- **G5**: 模块间依赖通过公共接口通信，实现独立演进和测试

### 1.3 Non-Goals (explicitly excluded scope)

- 不开发新的 Agent Shell Command 或 Extension Shell Command
- 不增强 CLI/REPL 的 UI 功能
- 不提供旧版会话数据迁移方案
- 不实现 SSH 等远程执行的具体 Provider（仅定义接口）
- 不拆分为独立 npm 包（Monorepo）
- 不要求向后兼容

## 2. Users & Scenarios

### 2.1 Target Users

| User Role | Description | Core Need |
|-----------|------------|-----------|
| 框架开发者 | 直接维护和扩展 Synapse Agent 代码库的开发者 | 清晰的模块边界，独立可测试的模块 |
| 集成开发者 | 将 Synapse Agent Core 嵌入到其他应用中的开发者 | Agent Core 作为独立库使用，不依赖 CLI |
| 工具扩展者 | 为 Synapse Agent 添加新工具或适配新执行环境的开发者 | 通过接口扩展工具能力，无需修改核心代码 |

### 2.2 Core User Stories

**US-1**: As a 框架开发者, I want Agent Core 与 UI/CLI 层完全解耦，采用 EventStream + 细粒度事件系统, so that Agent Loop 能独立使用、测试，并嵌入不同场景。

**US-2**: As a 框架开发者, I want 拥有统一的 LLM API 抽象，支持多供应商无缝切换, so that 用户不需要修改 Agent 代码即可更换 LLM Provider。

**US-3**: As a 框架开发者, I want 采用两层消息系统（自定义领域消息 + LLM 消息），通过显式转换函数分离, so that 业务逻辑和 LLM 通信有清晰的边界。

**US-4**: As a 框架开发者, I want 三层工具系统支持可插拔操作, so that 工具能在不同执行环境下工作，而无需修改核心逻辑。

### 2.3 Use Cases

| ID | Description | Trigger | Expected Outcome |
|----|------------|---------|-----------------|
| UC-001 | 在 Web 服务中嵌入 Agent Core | 集成开发者导入 Agent Core 模块 | Agent Core 通过 EventStream 返回事件流，无 CLI 依赖 |
| UC-002 | 切换 LLM Provider 为 OpenAI | 框架开发者修改配置中的 provider 字段 | Agent Loop 使用 OpenAI API，行为不变 |
| UC-003 | 为工具添加 SSH 远程执行能力 | 工具扩展者实现 RemoteBashOperations | 现有工具通过 SSH 在远程服务器上执行命令 |
| UC-004 | 添加自定义领域消息类型 | 框架开发者使用声明合并扩展消息接口 | 新消息类型在 Agent Loop 中正常流转，convertToLlm() 可自定义处理 |
| UC-005 | 独立测试 Agent Core | 测试工程师使用 Mock Provider + Mock Tools | Agent Loop 完整运行，无需真实 LLM API 调用 |

## 3. Functional Requirements

### 3.1 Feature List

| ID | Feature Name | Description | Priority |
|----|-------------|------------|----------|
| F-001 | EventStream 事件系统 | Agent Core 采用 EventStream 异步迭代器模式，定义细粒度事件类型，解耦 UI 层 | Must |
| F-002 | Agent Core 接口抽象 | 定义 AgentConfig、AgentTool 等核心接口，Agent Loop 通过接口接收依赖 | Must |
| F-003 | 统一 LLM Provider 接口 | Provider 无关的 LLMProvider 接口，支持 Anthropic/OpenAI/Google | Must |
| F-004 | 两层消息系统 | 领域消息层 + LLM 消息层 + convertToLlm() 显式转换 | Must |
| F-005 | 工具可插拔操作 | FileOperations/BashOperations 接口 + LocalOperations 默认实现 | Must |
| F-006 | SubAgent 同步重构 | SubAgent 系统适配新的 Agent Core 接口和事件系统 | Must |
| F-007 | 技能系统多 Provider 适配 | SkillGenerator/SkillEnhancer 通过统一 LLMProvider 接口工作 | Must |
| F-008 | 模块导出边界 | 每个模块通过 index.ts 统一导出公共接口 | Must |

### 3.2 Feature Details

#### F-001: EventStream 事件系统

**Description**: 参考 pi-mono 的 EventStream 设计，为 Agent Core 引入异步迭代器模式的事件系统，使 Agent Loop 只产生事件流，不持有任何 UI/消费者引用。

**Input**:
- `AgentConfig`: Agent 运行配置
- `userMessage: string`: 用户输入消息
- `tools: AgentTool[]`: 工具集合
- `provider: LLMProvider`: LLM 提供者

**Output**:
- `EventStream<AgentEvent>`: 异步可迭代的事件流，同时支持 `.result` 获取最终结果

**事件类型定义**:

| Event Type | Payload | Trigger Timing |
|-----------|---------|---------------|
| `agent_start` | `{ sessionId, config }` | Agent 开始运行时 |
| `agent_end` | `{ result, usage }` | Agent 运行结束时 |
| `turn_start` | `{ turnIndex }` | 每轮迭代开始时 |
| `turn_end` | `{ turnIndex, hasToolCalls }` | 每轮迭代结束时 |
| `message_start` | `{ role }` | LLM 开始生成消息时 |
| `message_delta` | `{ contentDelta }` | LLM 流式输出每个片段时 |
| `message_end` | `{ message, stopReason }` | LLM 消息生成完成时 |
| `tool_start` | `{ toolName, toolId, input }` | 工具开始执行时 |
| `tool_end` | `{ toolName, toolId, output, isError, duration }` | 工具执行完成时 |
| `thinking` | `{ content }` | LLM 思考过程（扩展思考模式）|
| `error` | `{ error, recoverable }` | 发生错误时 |
| `usage` | `{ inputTokens, outputTokens, cost }` | 每次 LLM 调用的 token 使用统计 |
| `context_management` | `{ action: 'offload' \| 'compact', details }` | 上下文管理操作时 |

**Business Rules**:
1. EventStream 必须是异步可迭代的（实现 `AsyncIterable<AgentEvent>` 协议）
2. EventStream 必须提供 `.result` 属性获取最终结果（Promise）
3. 事件按时间顺序严格有序发射
4. Agent Loop 内部不得直接调用任何 UI/渲染函数
5. EventStream 支持提前中止（通过 AbortSignal）

**Error & Exception Scenarios**:

| Scenario | Trigger Condition | Expected Behavior |
|----------|------------------|-------------------|
| LLM Provider 调用失败 | API 返回错误或超时 | 发射 `error` 事件（recoverable: true），根据配置重试或终止 |
| 工具执行失败 | 工具返回 isError: true | 发射 `tool_end` 事件（isError: true），继续 Agent Loop |
| 连续工具失败 | 连续失败次数超过阈值 | 发射 `error` 事件（recoverable: false），终止 Agent Loop |
| 最大迭代次数 | 迭代次数达到 maxIterations | 发射 `agent_end` 事件，包含截断原因 |
| 消费者未消费事件 | EventStream 缓冲区满 | 背压处理：暂停事件生成，等待消费者消费 |

**Boundary Conditions**:
- 零工具调用：Agent 直接返回文本响应，事件序列为 agent_start → turn_start → message_start → message_delta* → message_end → turn_end → agent_end
- 上下文超出窗口：触发 offload/compact，发射 `context_management` 事件后继续

**State Behavior**:
- EventStream 是一次性的，迭代完成后不可重用
- Agent 的对话历史状态由调用者管理，通过 AgentConfig 传入

---

#### F-002: Agent Core 接口抽象

**Description**: 定义 Agent Core 的所有核心接口，使 Agent Loop 只依赖抽象接口而非具体实现。

**核心接口定义**:

```
AgentConfig {
  provider: LLMProvider           // LLM 提供者
  tools: AgentTool[]              // 工具集合
  systemPrompt: string            // 系统提示词
  maxIterations: number           // 最大迭代次数
  maxConsecutiveFailures: number  // 连续失败阈值
  contextWindow: number           // 上下文窗口大小
  abortSignal?: AbortSignal       // 中止信号
}

AgentTool {
  name: string                    // 工具名称
  description: string             // 工具描述（给 LLM 的说明）
  inputSchema: object             // JSON Schema 输入参数定义
  execute(input): Promise<ToolResult>  // 执行工具
}

ToolResult {
  output: string                  // 工具输出内容
  isError: boolean                // 是否执行失败
  metadata?: Record<string, unknown>  // 额外元数据
}
```

**Business Rules**:
1. AgentConfig 中所有必填字段必须通过 Zod 验证
2. AgentTool.execute() 不得抛出异常，所有错误通过 ToolResult.isError 返回
3. Agent Loop 不得直接创建任何 Provider 或 Tool 实例，只通过 AgentConfig 接收

**Error & Exception Scenarios**:

| Scenario | Trigger Condition | Expected Behavior |
|----------|------------------|-------------------|
| 无效的 AgentConfig | 缺少必填字段或类型错误 | 在 Agent 启动前抛出 Zod 验证错误 |
| 工具名冲突 | 两个工具注册了相同的 name | 在 Agent 启动前抛出配置错误 |

---

#### F-003: 统一 LLM Provider 接口

**Description**: 定义 Provider 无关的 LLM 调用接口，屏蔽各供应商 API 的差异，初始支持 Anthropic、OpenAI、Google 三家。

**核心接口定义**:

```
LLMProvider {
  readonly name: string                 // Provider 名称
  readonly model: string                // 模型标识
  generate(params: GenerateParams): LLMStream  // 生成响应
}

GenerateParams {
  systemPrompt: string                  // 系统提示词
  messages: LLMMessage[]                // LLM 消息列表
  tools?: LLMToolDefinition[]           // 工具定义列表
  maxTokens?: number                    // 最大生成 token
  temperature?: number                  // 温度参数
  thinking?: { effort: 'low' | 'medium' | 'high' }  // 扩展思考
  abortSignal?: AbortSignal             // 中止信号
}

LLMStream extends AsyncIterable<LLMStreamChunk> {
  result: Promise<LLMResponse>          // 最终完整响应
}

LLMStreamChunk {
  type: 'text_delta' | 'thinking_delta' | 'tool_use_start' | 'tool_use_delta' | 'usage'
  // ... 各类型对应的 payload
}

LLMResponse {
  content: LLMContentBlock[]            // 响应内容块列表
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens'
  usage: { inputTokens: number, outputTokens: number }
}
```

**Input**:
- GenerateParams: 统一的生成请求参数

**Output**:
- LLMStream: 流式响应 + 最终结果

**Business Rules**:
1. 所有 Provider 实现必须将供应商特定的消息格式转换为统一的 LLMMessage 格式
2. 流式响应必须实现 AsyncIterable 协议
3. 各 Provider 的思考块（Thinking Block）必须统一转换为 `thinking_delta` 类型
4. Tool Use 的调用格式必须在 Provider 层统一为标准 JSON

**Error & Exception Scenarios**:

| Scenario | Trigger Condition | Expected Behavior |
|----------|------------------|-------------------|
| API Key 无效 | Provider 返回 401 | 抛出 AuthenticationError，包含 Provider 名称 |
| 模型不存在 | Provider 返回 404 | 抛出 ModelNotFoundError，包含请求的模型名 |
| 速率限制 | Provider 返回 429 | 抛出 RateLimitError，包含重试等待时间 |
| 网络超时 | 连接或读取超时 | 抛出 TimeoutError，包含超时时长 |
| 上下文超长 | 输入超过模型上下文窗口 | 抛出 ContextLengthError，包含实际和最大 token 数 |
| 流中断 | 流式传输过程中断开 | 抛出 StreamInterruptedError，包含已接收的部分内容 |

**Boundary Conditions**:
- 空工具列表：正常调用，不传递 tools 参数给 Provider API
- 超长系统提示词：由调用方负责截断，Provider 层直传
- 不支持思考模式的 Provider：忽略 thinking 参数，不报错

**State Behavior**:
- LLMProvider 实例无状态，每次 generate() 调用独立
- LLMStream 是一次性的，消费完成后不可重用

---

#### F-004: 两层消息系统

**Description**: 将消息分为领域消息层和 LLM 消息层，通过显式转换函数连接。

**领域消息层**（Domain Messages）:

```
DomainMessage {
  id: string                            // 唯一标识
  role: 'user' | 'assistant' | 'system' | 'tool_result'
  content: DomainContentBlock[]         // 内容块列表
  timestamp: number                     // 创建时间戳
  metadata?: Record<string, unknown>    // 扩展元数据
}

DomainContentBlock =
  | { type: 'text', text: string }
  | { type: 'thinking', content: string }
  | { type: 'tool_use', toolName: string, toolId: string, input: unknown }
  | { type: 'tool_result', toolId: string, output: string, isError: boolean }
  | { type: 'skill_search', query: string, results: SkillSearchResult[] }
  | { type: 'context_summary', summary: string, compactedCount: number }
  // 可通过声明合并扩展更多类型
```

**LLM 消息层**（LLM Messages）:

```
LLMMessage {
  role: 'user' | 'assistant'
  content: LLMContentBlock[]
}

LLMContentBlock =
  | { type: 'text', text: string }
  | { type: 'thinking', content: string }
  | { type: 'tool_use', id: string, name: string, input: unknown }
  | { type: 'tool_result', tool_use_id: string, content: string, is_error?: boolean }
```

**转换函数**:

```
convertToLlm(messages: DomainMessage[], options?: ConvertOptions): LLMMessage[]

ConvertOptions {
  filterTypes?: DomainContentBlock['type'][]   // 过滤掉这些类型
  maxMessages?: number                          // 最大消息数
  includeMetadata?: boolean                     // 是否保留元数据
}
```

**Business Rules**:
1. 领域消息是 Agent 的完整历史记录，包含所有业务信息
2. LLM 消息只包含 LLM API 能理解的内容，由 convertToLlm() 从领域消息转换而来
3. `skill_search`、`context_summary` 等领域专属消息类型在转换时被过滤或转换为文本
4. 领域消息的 `metadata` 字段在转换为 LLM 消息时丢弃
5. 领域消息支持 TypeScript 声明合并扩展新的 ContentBlock 类型

**Error & Exception Scenarios**:

| Scenario | Trigger Condition | Expected Behavior |
|----------|------------------|-------------------|
| 未知 ContentBlock 类型 | 转换遇到未注册的类型 | 忽略该 block，记录警告日志 |
| 空消息列表 | convertToLlm([]) | 返回空数组 [] |

**State Behavior**:
- 领域消息一旦创建后不可变（immutable）
- convertToLlm() 是纯函数，无副作用

---

#### F-005: 工具可插拔操作

**Description**: 为三层工具系统的具体操作定义接口，使工具逻辑与执行环境解耦。

**核心接口定义**:

```
FileOperations {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  editFile(path: string, edits: FileEdit[]): Promise<string>
  fileExists(path: string): Promise<boolean>
  listFiles(pattern: string): Promise<string[]>
  searchContent(pattern: string, options?: SearchOptions): Promise<SearchResult[]>
}

BashOperations {
  execute(command: string, options?: ExecOptions): Promise<ExecResult>
  isAvailable(): Promise<boolean>
}

ExecOptions {
  cwd?: string
  timeout?: number
  env?: Record<string, string>
  abortSignal?: AbortSignal
}

ExecResult {
  stdout: string
  stderr: string
  exitCode: number
  duration: number
}
```

**默认实现**:
- `LocalFileOperations`: 基于 `fs/promises` 的本地文件操作
- `LocalBashOperations`: 基于 `child_process` / Bun Shell 的本地命令执行

**Business Rules**:
1. 三层路由器（BashRouter）保持不变，不受 Operations 接口影响
2. 每个 Agent Shell Command Handler 通过构造函数注入 Operations 实例
3. Native Shell Command Handler 通过 BashOperations 执行命令
4. Operations 实例在 Agent 启动时确定，运行中不可切换
5. 接口只定义必要的操作方法，不暴露底层实现细节

**Error & Exception Scenarios**:

| Scenario | Trigger Condition | Expected Behavior |
|----------|------------------|-------------------|
| 文件不存在 | readFile() 读取不存在的路径 | 抛出 FileNotFoundError |
| 命令超时 | execute() 超过 timeout | 抛出 TimeoutError，终止进程 |
| 权限不足 | 写入只读文件或执行受限命令 | 抛出 PermissionError |

**State Behavior**:
- Operations 实例可以维护内部状态（如 SSH 连接池），但对外接口无状态
- 每次方法调用独立，不依赖之前的调用状态

---

#### F-006: SubAgent 同步重构

**Description**: SubAgent 系统适配新的 Agent Core 接口和事件系统，作为 Agent Core 的消费者重新实现。

**Input**:
- `SubAgentConfig`: 继承自 AgentConfig 的子智能体配置
- `type: SubAgentType`: 子智能体类型（explore / general / skill）
- `prompt: string`: 任务提示词

**Output**:
- `EventStream<AgentEvent>`: SubAgent 产生的事件流（可嵌套在父 Agent 的事件流中）

**Business Rules**:
1. SubAgent 使用与父 Agent 相同的 Agent Core 接口创建
2. SubAgent 的工具集是父 Agent 工具集的子集（通过权限配置过滤）
3. SubAgent 的事件流可以由父 Agent 消费并转发（用于 UI 展示嵌套工具调用）
4. SubAgent 共享父 Agent 的 LLMProvider 实例
5. SubAgent 的生命周期独立于父 Agent（一次性执行，完成即销毁）

**Error & Exception Scenarios**:

| Scenario | Trigger Condition | Expected Behavior |
|----------|------------------|-------------------|
| SubAgent 超时 | 执行时间超过配置的最大时长 | 通过 AbortSignal 中止，返回部分结果 |
| SubAgent 连续失败 | 工具连续失败超过阈值 | 终止 SubAgent，返回错误信息 |

---

#### F-007: 技能系统多 Provider 适配

**Description**: SkillGenerator 和 SkillEnhancer 通过统一的 LLMProvider 接口工作，不再直接依赖 Anthropic SDK。

**Business Rules**:
1. SkillGenerator 接收 LLMProvider 实例而非 AnthropicClient
2. SkillEnhancer 接收 LLMProvider 实例而非 AnthropicClient
3. 技能索引器（Indexer）的 embedding 计算通过 LLMProvider 的扩展接口完成
4. 技能搜索逻辑保持不变

**Error & Exception Scenarios**:

| Scenario | Trigger Condition | Expected Behavior |
|----------|------------------|-------------------|
| Provider 不支持 embedding | 使用不支持 embedding 的 Provider | 降级为文本匹配搜索，记录警告 |

---

#### F-008: 模块导出边界

**Description**: 每个模块目录下通过 `index.ts` 统一导出公共接口，模块间禁止直接引用内部文件。

**目标模块结构**:

```
src/
├── core/                    // Agent Core（事件系统、消息系统、Agent Loop）
│   ├── index.ts             // 公共导出
│   ├── agent-loop.ts        // Agent 主循环
│   ├── event-stream.ts      // EventStream 实现
│   ├── messages.ts          // 两层消息 + convertToLlm()
│   └── types.ts             // 核心类型定义
│
├── providers/               // LLM Provider 抽象与实现
│   ├── index.ts             // 公共导出
│   ├── types.ts             // Provider 接口定义
│   ├── anthropic/           // Anthropic 实现
│   ├── openai/              // OpenAI 实现
│   └── google/              // Google 实现
│
├── tools/                   // 三层工具系统
│   ├── index.ts             // 公共导出
│   ├── operations/          // 可插拔操作接口与实现
│   ├── handlers/            // Agent Shell Command 处理器
│   ├── bash-router.ts       // 三层命令路由器
│   └── bash-tool.ts         // 统一 Bash 工具入口
│
├── skills/                  // 技能系统
│   ├── index.ts             // 公共导出
│   └── ...
│
├── sub-agents/              // 子智能体系统
│   ├── index.ts             // 公共导出
│   └── ...
│
├── cli/                     // CLI/REPL（Agent Core 的消费者）
│   ├── index.ts             // 公共导出
│   └── ...
│
└── config/                  // 配置管理
    ├── index.ts             // 公共导出
    └── ...
```

**Business Rules**:
1. 模块间引用必须通过 `import { X } from '../module-name'`（即 index.ts）
2. 禁止 `import { X } from '../module-name/internal-file'` 形式的引用
3. `core/` 模块不依赖 `cli/`、`skills/`、`sub-agents/`
4. `providers/` 模块不依赖 `tools/`、`skills/`、`cli/`
5. `cli/` 作为顶层消费者，可依赖所有其他模块

**模块依赖方向**:

```
cli/ → core/, providers/, tools/, skills/, sub-agents/, config/
sub-agents/ → core/, providers/, tools/
skills/ → core/, providers/
tools/ → core/, providers/ (仅 types)
providers/ → (无内部依赖)
core/ → (无内部依赖)
config/ → (无内部依赖)
```

## 4. Non-Functional Requirements

### 4.1 Performance Requirements

| Metric | Requirement | Measurement Method |
|--------|------------|-------------------|
| EventStream 事件延迟 | 从事件产生到消费者接收 < 1ms（本地） | 基准测试 |
| Provider 切换开销 | 运行时切换 Provider 无额外开销（无状态） | 代码审查 |
| Agent Loop 启动时间 | 首次 step() 调用前的初始化时间 < 100ms | 计时测试 |

### 4.2 Security Requirements

- LLM API Key 仅在对应 Provider 实现内部使用，不暴露给 Agent Core 或工具系统
- Sandbox 权限机制保持不变

### 4.3 Usability Requirements

- 模块导入路径简洁：`import { AgentLoop, EventStream } from './core'`
- 新增 Provider 只需实现 LLMProvider 接口并注册，无需修改现有代码

### 4.4 Compatibility Requirements

- 运行时：Bun >= 1.0
- TypeScript >= 5.0
- Node.js >= 18（兼容性目标，非主要运行时）

## 5. Constraints & Dependencies

### 5.1 Constraints

- **技术栈**：Bun + TypeScript + Zod，不引入新的构建工具或运行时
- **核心特色**：三层工具抽象和技能自进化必须保留
- **仓库结构**：单体仓库，目录级模块化
- **兼容性**：不要求向后兼容，开发阶段优先重构质量

### 5.2 External Dependencies

- `@anthropic-ai/sdk`: Anthropic Provider 实现依赖
- `openai`: OpenAI Provider 实现依赖
- `@google/generative-ai` 或 `@google-cloud/vertexai`: Google Provider 实现依赖
- `@modelcontextprotocol/sdk`: MCP 工具集成依赖
- `zod`: 参数验证

### 5.3 Assumptions

- Bun 运行时对 OpenAI SDK 和 Google SDK 有良好支持
- 三家 LLM Provider 的 Tool Use API 可以通过统一抽象有效屏蔽
- pi-mono 的 EventStream 模式可以适配 Synapse Agent 的上下文管理需求

## 6. BDD Testability Check

| Dimension | Verification Question | Status |
|-----------|----------------------|--------|
| Input/Output format | 所有接口的参数和返回值类型是否已明确定义？ | Pass — AgentConfig、AgentTool、LLMProvider、EventStream、DomainMessage、LLMMessage、FileOperations、BashOperations 均已定义 |
| Error & exception scenarios | 每个功能的失败模式是否已显式描述？ | Pass — 每个 Feature 均包含错误场景表格 |
| Boundary & priority rules | 冲突解决规则是否已定义？ | Pass — 事件顺序、消息转换过滤规则、工具名冲突检查均已说明 |
| State behavior | 状态持久化、隔离和重置行为是否清晰？ | Pass — EventStream 一次性、Provider 无状态、Operations 实例运行中不可切换 |
| Verifiable granularity | 每个行为是否可独立测试？ | Pass — 每个接口和转换函数可通过 Mock 独立验证 |
| Ambiguity check | 是否有隐含假设？ | Pass — 已明确列出 Assumptions |

## 7. Glossary

| Term | Definition |
|------|-----------|
| EventStream | 异步可迭代的事件流，参考 pi-mono 的实现模式，同时支持事件迭代和最终结果获取 |
| Domain Message | 领域消息，包含 Agent 运行过程中的所有业务信息，是完整的对话历史记录 |
| LLM Message | LLM 消息，仅包含 LLM API 能理解的内容格式，由 convertToLlm() 从领域消息转换而来 |
| Operations | 可插拔操作接口，定义工具执行的具体环境抽象（本地/远程） |
| Three-Layer Tool System | 三层工具体系：Native Shell Command、Agent Shell Command、Extension Shell Command |
| BashRouter | 三层命令路由器，根据命令类型分发到对应的处理器 |
| Skill Self-Evolution | 技能自进化，从成功的对话中自动生成和增强可复用技能 |
| SubAgent | 子智能体，在受限工具权限下独立执行任务的 Agent 实例 |
