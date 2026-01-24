# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Synapse Agent 是一个基于统一 Bash 抽象的自我成长 AI 智能体框架。核心理念是"一切工具都是 Bash"，通过三层工具体系（Base Bash、Agent Bash、Field Bash）实现可扩展的智能体能力。

## 常用命令

### 开发环境



### 测试



### 代码质量



### CLI 使用



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

### 核心模块 (`src/synapse/core/`)


### 工具系统 (`src/synapse/tools/`)


### 技能系统 (`src/synapse/skills/`)


### 数据流



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
- 使用 Ruff 进行代码检查和格式化
- 遵循 SOLID 原则，模块化开发
- 单个文件代码不超过 800 行