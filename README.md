# Synapse Agent

基于统一 Shell 抽象的自我成长 AI 智能体框架。

## 核心理念

**一切工具都是 Shell Command** - 通过三层工具体系实现可扩展的智能体能力：

- **Layer 1 - Native Shell Command**: 标准 Unix 命令（ls, cd, git 等）
- **Layer 2 - Agent Shell Command**: 内置 Agent 工具（read, write, edit, glob, search）
- **Layer 3 - Extension Shell Command**: 领域工具（mcp:\*, skill:\*）

## 特性

- 持久 Bash 会话，保持环境变量和工作目录状态
- MCP (Model Context Protocol) 工具集成
- 可扩展的技能系统
- 交互式 REPL 界面
- 性能监控和分级日志
- **可复用的 AgentRunner 模块**，支持 streaming/silent 输出模式
- **Skill 子 Agent**，具备完整 Agent Loop 能力

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                        REPL (repl.ts)                       │
├─────────────────────────────────────────────────────────────┤
│                    AgentRunner (streaming)                  │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  LlmClient  │  │ContextManager│  │   ToolExecutor    │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                    SkillSubAgent (silent)                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  AgentRunner + SkillMemoryStore + Meta Skills       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### AgentRunner 模块

`AgentRunner` 是从 REPL 提取的可复用 Agent Loop 实现：

- **streaming 模式**: 用于主 Agent，实时输出文本和工具执行状态
- **silent 模式**: 用于 SkillSubAgent，静默执行，仅返回结果

```typescript
// 主 Agent 使用 streaming 模式
const agentRunner = new AgentRunner({
  llmClient,
  contextManager,
  toolExecutor,
  systemPrompt,
  tools: [BashToolSchema],
  outputMode: 'streaming',
  onText: (text) => process.stdout.write(text),
});

// SkillSubAgent 使用 silent 模式
const skillSubAgent = new SkillSubAgent({
  llmClient: agentRunner.getLlmClient(),
  toolExecutor: agentRunner.getToolExecutor(),
});
```

## 安装

```bash
# 安装依赖
bun install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，设置 ANTHROPIC_API_KEY
```

## 快速开始

```bash
# 启动交互式 REPL
bun run chat

# 或直接运行
bun run src/cli/index.ts chat
```

## REPL 命令

### 特殊命令

| 命令 | 说明 |
|------|------|
| `/help`, `/h`, `/?` | 显示帮助信息 |
| `/exit`, `/quit`, `/q` | 退出 REPL |
| `/clear` | 清空对话历史 |
| `/history` | 显示对话历史 |
| `/tools` | 列出所有可用工具 |
| `/skills` | 列出所有可用技能 |

### Shell 命令

使用 `!` 前缀直接执行 Shell 命令：

```bash
!ls -la
!git status
!pwd
```

## Agent Shell Command 工具

### read - 读取文件

```bash
read /path/to/file.txt
read /path/to/file.txt --offset 10 --limit 20
```

### write - 写入文件

```bash
write /path/to/file.txt "内容"
```

### edit - 编辑文件

```bash
edit /path/to/file.txt "旧内容" "新内容"
edit /path/to/file.txt "旧内容" "新内容" --all
```

### glob - 文件模式匹配

```bash
glob "**/*.ts" --path /path/to/dir
```

### search - 代码搜索

```bash
search "pattern" --path /path/to/dir --type ts
```

## 技能系统

Synapse Agent 支持可扩展的技能系统，允许 Agent 学习和复用知识。

### 技能管理命令

```bash
# 列出所有可用技能
skill list

# 搜索技能（使用 LLM 语义搜索）
skill search "代码分析"
skill search --domain programming
skill search --tag automation

# 加载技能到上下文
skill load <skill-name>

# 启用自动技能强化
skill enhance --on

# 禁用自动技能强化
skill enhance --off

# 查看强化状态
skill enhance --status

# 手动触发技能强化
skill enhance --conversation <path>
```

### 技能目录结构

技能存储在 `~/.synapse/skills/` 目录下：

```
~/.synapse/skills/
├── <skill-name>/
│   ├── SKILL.md           # 技能定义（必需）
│   ├── references/        # 参考文档（可选）
│   │   └── *.md
│   └── scripts/           # 可执行脚本（可选）
│       └── *.py|*.ts|*.sh
└── index.json             # 技能索引
```

### SKILL.md 格式

```markdown
---
name: skill-name
description: 技能描述（用于搜索匹配）
type: meta  # 可选，仅元技能需要设置
---

# 技能标题

## Quick Start
[快速开始示例]

## Execution Steps
1. 步骤 1
2. 步骤 2

## Best Practices
- 最佳实践 1
- 最佳实践 2

## Examples
[使用示例]
```

### 技能类型

| 类型 | type 字段 | 说明 |
|------|-----------|------|
| 普通技能 | 无 | 用户创建的可复用技能 |
| 元技能 | `type: meta` | 系统内置，用于指导技能管理 |

### 执行技能工具

```bash
skill:example-skill:tool arg1 arg2
```

### 自动技能强化

启用自动强化后，Agent 会在任务完成后分析执行过程：
- 检测可复用的工具使用模式
- 自动生成新技能或增强现有技能
- 维护技能索引

### 元技能

系统内置三个元技能，指导技能的创建和维护：

| 元技能 | 说明 |
|--------|------|
| `skill-creator` | 指导新技能创建 |
| `enhancing-skills` | 指导技能强化 |
| `evaluating-skills` | 评估技能质量 |

元技能在 SKILL.md 的 frontmatter 中包含 `type: meta` 字段，会被自动加载到 SkillSubAgent 的系统提示词中。

### Skill 子 Agent 架构

SkillSubAgent 具备完整的 Agent Loop 能力，用于技能管理操作：

```
┌─────────────────────────────────────────────┐
│              SkillSubAgent                  │
├─────────────────────────────────────────────┤
│  System Prompt (4 Sections):                │
│  1. Your Role - 角色定义                     │
│  2. Tools - Bash 工具说明                    │
│  3. Meta Skills - 元技能完整内容              │
│  4. Available Skills - 技能元数据列表         │
├─────────────────────────────────────────────┤
│  AgentRunner (silent mode)                  │
│  ├── LlmClient                              │
│  ├── ContextManager (persistent)            │
│  └── ToolExecutor                           │
├─────────────────────────────────────────────┤
│  Operations:                                │
│  • search(query) - 语义搜索技能              │
│  • enhance(path) - 分析对话创建/强化技能      │
│  • evaluate(name) - 评估技能质量             │
└─────────────────────────────────────────────┘
```

**主要方法:**

| 方法 | 说明 |
|------|------|
| `search(query)` | 使用 LLM 进行语义搜索 |
| `searchLocal(query)` | 本地关键词搜索（同步） |
| `enhance(path)` | 分析对话历史，创建或强化技能 |
| `evaluate(name)` | 评估技能质量，返回评分 |
| `getSkillContent(name)` | 获取技能完整内容 |
| `reloadAll()` | 重新加载所有技能 |

## MCP 工具

配置文件位置：`~/.synapse/mcp/mcp_servers.json`

```json
{
  "mcpServers": {
    "server-name": {
      "command": "node",
      "args": ["server.js"]
    }
  }
}
```

### 搜索工具

```bash
tools search "关键词"
tools search --type=mcp
tools search --type=skill
```

### 调用 MCP 工具

```bash
mcp:server-name:tool-name arg1 arg2
```

## 项目结构

```
src/
  cli/           # CLI 入口和 REPL
  agent/         # Agent 核心
    agent-runner.ts       # 可复用 Agent Loop
    context-manager.ts    # 上下文管理
    llm-client.ts         # LLM 客户端
    skill-sub-agent.ts    # Skill 子 Agent
    skill-memory-store.ts # 技能内存存储
    tool-executor.ts      # 工具执行器
  tools/         # 工具系统
    handlers/    # 命令处理器
    converters/  # MCP/Skill 转换器
  skills/        # 技能系统
  utils/         # 工具函数（日志、性能监控）
tests/
  unit/          # 单元测试
  e2e/           # 端到端测试
docs/
  plans/         # 实现计划
  testing/       # 测试指南
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ANTHROPIC_API_KEY` | Anthropic API 密钥 | - |
| `ANTHROPIC_BASE_URL` | API 基础 URL | - |
| `ANTHROPIC_MODEL` | 模型名称 | claude-sonnet-4-20250514 |
| `SYNAPSE_LOG_LEVEL` | 日志级别 | INFO |
| `SYNAPSE_LOG_DIR` | 日志目录 | ~/.synapse/logs |
| `SYNAPSE_HISTORY_FILE` | 历史文件路径 | ~/.synapse/.repl_history |
| `MAX_TOOL_ITERATIONS` | Agent Loop 最大迭代次数 | 20 |

## 开发

```bash
# 运行所有测试
bun run test

# 运行单元测试
bun test tests/unit/

# 运行 Agent 模块测试
bun test tests/unit/agent/

# 运行 E2E 测试
bun run test:e2e

# 类型检查
bun run typecheck
```

### 关键模块测试

```bash
# AgentRunner 测试
bun test tests/unit/agent/agent-runner.test.ts

# SkillSubAgent 测试
bun test tests/unit/agent/skill-sub-agent.test.ts

# SkillMemoryStore 测试
bun test tests/unit/agent/skill-memory-store.test.ts
```

## 技术栈

- **运行时**: Bun
- **语言**: TypeScript
- **LLM**: Anthropic Claude (Anthropic SDK)
- **MCP**: Model Context Protocol SDK
- **测试**: Bun Test
- **验证**: Zod

## 许可证

MIT
