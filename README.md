# Synapse Agent

基于统一 Bash 抽象的自我成长 AI 智能体框架。

## 核心理念

**一切工具都是 Bash** - 通过三层工具体系实现可扩展的智能体能力：

- **Layer 1 - Base Bash**: 标准 Unix 命令（ls, cd, git 等）
- **Layer 2 - Agent Bash**: 内置 Agent 工具（read, write, edit, glob, grep）
- **Layer 3 - Field Bash**: 领域工具（mcp:\*, skill:\*）

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

## Agent Bash 工具

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

技能存储在 `~/.synapse/skills/` 目录下：

```
~/.synapse/skills/
  example-skill/
    SKILL.md           # 技能文档
    scripts/           # 可执行脚本
      tool.py
      helper.sh
```

### 搜索技能

```bash
skill search "关键词"
skill search --domain programming
skill search --tag automation
```

### 执行技能工具

```bash
skill:example-skill:tool arg1 arg2
```

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
