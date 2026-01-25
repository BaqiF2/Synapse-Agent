# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Synapse Agent 是一个基于统一 Bash 抽象的自我成长 AI 智能体框架。核心理念是"一切工具都是 Bash"，通过三层工具体系（Base Bash、Agent Bash、Field Bash）实现可扩展的智能体能力。

## 常用命令

### 开发环境

```bash
bun run dev                 # 运行开发版本 (src/entrypoints/cli.ts)
bun run build              # 构建生产版本到 dist/cli.js
bun run start              # 运行构建后的版本 (dist/cli.js)
```

**构建说明**：
- 入口文件：`src/entrypoints/cli.ts`（TypeScript，非 TSX）
- 构建输出：`dist/cli.js`（单文件打包，包含所有依赖）
- 构建工具：Bun bundler（`bun build --target bun`）

### 测试

```bash
bun test                   # 运行所有测试
bun test tests/unit        # 仅运行单元测试
bun test tests/e2e         # 仅运行端到端测试
bun test:watch             # 监视模式
bun test:coverage          # 生成覆盖率报告
```

**单个测试文件**：
```bash
bun test tests/unit/core/agent.test.ts
```

### 代码质量

```bash
bun run typecheck          # TypeScript 类型检查
bun run lint               # ESLint 检查
bun run lint:fix           # 自动修复 lint 问题
bun run format             # Prettier 格式化代码
```

### CLI 使用

**前提条件：全局安装**

```bash
# 构建并全局安装
bun run build
npm install -g .
```

**已全局安装后：**

```bash
synapse "你的问题"          # 单次查询
synapse chat               # 交互式 REPL
synapse config             # 显示配置
synapse tools              # 列出可用工具
synapse skills             # 管理技能
```

**未全局安装的替代方式：**

```bash
bun run start "你的问题"    # 使用 npm 脚本
bun dist/cli.js "你的问题"  # 直接执行构建文件
bun run dev "你的问题"      # 开发模式（无需构建）
```



## 环境配置

API Key 环境变量：
- `ANTHROPIC_API_KEY`: API 密钥

其他配置：
- `SYNAPSE_HOME`: 主目录，默认 `~/.synapse`
- `MODEL`: 模型名称（如 `MiniMax-M2`、`claude-4-5-sonnet`）
- `ANTHROPIC_BASE_URL`: API 基础 URL（Minimax: `https://api.minimaxi.com/anthropic`）

## 架构设计

### 三层 Bash 工具体系

1. **Base Bash**: Unix/Linux 原生命令
2. **Agent Bash**: Agent 核心工具（Read、Write、Edit、Glob、Grep、Bash、Skill）
3. **Field Bash**: 领域专业工具，通过 MCP/Anthropic 转换器转换为 `BashCommand`

### 核心模块 (`src/core/`)

- **types.ts**: 基础类型定义（ToolCallStep、AgentResult、AgentState）
- **config.ts**: 配置管理（SynapseConfig 单例，环境变量加载）
- **agent-config.ts**: Agent 配置（max_iterations、max_tokens、bash_timeout）
- **prompts.ts**: 系统提示词模板
- **llm.ts**: LLM 客户端封装（Anthropic SDK，支持 MiniMax）
- **agent.ts**: 核心 Agent Loop 实现

**关键设计**：Agent 通过 BashRouter 统一路由所有工具调用，LLM 只看到单一 Bash 工具接口。

### 工具系统 (`src/tools/`)

- **base.ts**: BaseTool 抽象基类、ToolResult、ToolError
- **registry.ts**: ToolRegistry 工具注册表
- **bash-router.ts**: BashRouter 命令解析和路由分发器
- **bash-session.ts**: BashSession 持久化 bash 会话管理
- **bash-constants.ts**: Agent 命令常量定义（read、write、edit、glob、grep、skill、field）
- **agent/**: Agent Bash 工具实现（read.ts、write.ts、edit.ts、glob.ts、grep.ts）

**关键流程**：`Agent.run()` → LLM 返回 Bash 工具调用 → `BashRouter.execute()` → 解析命令 → 路由到 Agent 工具/Field 工具/Native Bash

### 技能系统 (`src/skills/`)

- **types.ts**: 技能类型定义（SkillMetadata、Skill）
- **loader.ts**: 技能加载器（从 YAML 文件加载）
- **skill-index.ts**: 技能索引（注册、搜索）
- **index.ts**: 技能系统入口

### 数据流

```
用户输入 → Agent.run()
  ↓
  LLM.chat() [单一 Bash 工具]
  ↓
  LLM 返回 tool_use 块
  ↓
  BashRouter.execute(command)
    ↓
    ├─ Agent Bash (read/write/edit/glob/grep) → ToolRegistry.execute()
    ├─ Field Bash (field:domain:tool) → ToolIndex (TODO)
    └─ Native Bash (ls/cat/git) → BashSession.execute()
  ↓
  ToolResult → LLM.addToolResults()
  ↓
  循环直到 LLM 返回最终响应
```



### 命令路由逻辑

BashRouter 解析命令后的分发逻辑：
1. **Agent Bash**: 命令名在 `AGENT_COMMANDS` 中 → `ToolRegistry.execute()`
2. **Field Bash**: 命令以 `field:` 开头 → `ToolIndex` 查找并执行
3. **Native Bash**: 其他所有命令 → `BashSession.execute()`
4. **帮助请求**: 带 `-h` 或 `--help` 标志 → 返回帮助文本

## 运行时目录结构

```
~/.synapse/
├── tools/
│   ├── agent/    # Agent Bash 工具
│   └── field/    # Field Bash 工具
└── skills/       # 技能列表
```

## 代码规范

- 行长度限制：100 字符
- 遵循 SOLID 原则，模块化开发
- 单个文件代码不超过 800 行
- 所有接口/类型字段使用 **snake_case**（对齐 Python 版本）
  - 例如：`tool_name`, `tool_input`, `tool_result`, `is_native_bash`
- 类名、方法名使用 **camelCase**（TypeScript 惯例）
  - 例如：`ToolRegistry`, `executeToolCall()`
- 文件头必须包含功能说明和核心导出（参见 `.claude/rules/file-header-documentation.md`）

## 项目结构

```
src/
├── core/                  # 核心模块
│   ├── types.ts          # 基础类型定义
│   ├── config.ts         # 配置管理
│   ├── agent-config.ts   # Agent 配置
│   ├── prompts.ts        # 系统提示词
│   ├── llm.ts            # LLM 客户端
│   └── agent.ts          # 核心 Agent Loop
├── tools/                # 工具系统
│   ├── base.ts           # 工具基类
│   ├── registry.ts       # 工具注册表
│   ├── bash-router.ts    # 命令路由器
│   ├── bash-session.ts   # Bash 会话
│   ├── bash-constants.ts # 命令常量
│   └── agent/            # Agent Bash 工具
│       ├── read.ts
│       ├── write.ts
│       ├── edit.ts
│       ├── glob.ts
│       └── grep.ts
├── skills/               # 技能系统
│   ├── types.ts
│   ├── loader.ts
│   ├── skill-index.ts
│   └── index.ts
├── cli/                  # CLI 交互层
│   ├── commands/         # CLI 子命令
│   └── formatters/       # 输出格式化
└── entrypoints/          # 入口文件
    └── cli.ts

tests/
├── unit/                 # 单元测试
│   ├── core/
│   ├── tools/
│   └── skills/
└── e2e/                  # 端到端测试
```

## 重要实现细节

### 工具调用去重

`Agent.run()` 会自动检测并去重相同的工具调用（相同的 name 和 input），仅执行一次，但将结果返回给所有重复的 tool_use 块（参见 `src/core/agent.ts:181-235`）。

### 命令解析逻辑

BashRouter 支持以下格式（参见 `src/tools/bash-router.ts`）：
- 位置参数：`read /path/to/file`
- 命名参数：`read --file=/path --offset=10` 或 `read --file /path`
- 短参数：`read -h`
- 自动类型转换：`"true"` → `true`, `"10"` → `10`

### Bash Session 管理

BashSession 维护持久化进程，支持 `cd`、环境变量保留。配置项：
- `timeout`: 命令超时（毫秒）
- `max_output_lines`: 最大输出行数
- `max_output_chars`: 最大输出字符数
- `log_commands`: 是否记录命令日志

### 测试策略

- **单元测试**：测试单个类/函数逻辑（config、base、llm、tools）
- **端到端测试**：测试完整的 CLI 命令和 Agent 流程