# Synapse Agent

基于统一 Shell 抽象的自我成长 AI 智能体框架。

## 核心理念

**一切工具都是 Shell Command** - 通过三层工具体系实现可扩展的智能体能力：

- **Layer 1 - Native Shell Command**: 标准 Unix 命令（ls, cd, git 等）
- **Layer 2 - Agent Shell Command**: 内置 Agent 工具（read, write, edit, glob, grep）
- **Layer 3 - Extension Shell Command**: 领域工具（mcp:\*, skill:\*）

## 特性

- 持久 Bash 会话，保持环境变量和工作目录状态
- MCP (Model Context Protocol) 工具集成
- 可扩展的技能系统
- 交互式 REPL 界面
- 性能监控和分级日志

## 安装

```bash
# 安装依赖
bun install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，设置 MINIMAX_API_KEY
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

### grep - 代码搜索

```bash
grep "pattern" --path /path/to/dir --type ts
```

## 技能系统

Synapse Agent 支持可扩展的技能系统，允许 Agent 学习和复用知识。

### 技能管理命令

```bash
# 列出所有可用技能
skill list

# 搜索技能
skill search "代码分析"
skill search --domain programming
skill search --tag automation

# 加载技能到上下文
skill load <skill-name>

# 启用自动技能强化
skill enhance --on

# 禁用自动技能强化
skill enhance --off

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
- `skill-creator`: 指导新技能创建
- `enhancing-skills`: 指导技能强化
- `evaluating-skills`: 评估技能质量

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
  agent/         # Agent 核心（LLM 客户端、上下文管理）
  tools/         # 工具系统
    handlers/    # 命令处理器
    converters/  # MCP/Skill 转换器
  skills/        # 技能系统
  utils/         # 工具函数（日志、性能监控）
tests/
  e2e/           # 端到端测试
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `MINIMAX_API_KEY` | Minimax API 密钥 | - |
| `MINIMAX_API_BASE_URL` | API 基础 URL | - |
| `MINIMAX_MODEL` | 模型名称 | minimax-2.1 |
| `SYNAPSE_LOG_LEVEL` | 日志级别 | INFO |
| `SYNAPSE_LOG_DIR` | 日志目录 | ~/.synapse/logs |
| `SYNAPSE_HISTORY_FILE` | 历史文件路径 | ~/.synapse/.repl_history |

## 开发

```bash
# 运行所有测试
bun run test

# 运行 E2E 测试
bun run test:e2e

# 类型检查
bun run typecheck
```

## 技术栈

- **运行时**: Bun
- **语言**: TypeScript
- **LLM**: Minimax 2.1 (Anthropic SDK 兼容)
- **MCP**: Model Context Protocol SDK

## 许可证

MIT
