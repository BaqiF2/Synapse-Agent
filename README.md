# Synapse Agent

基于统一 Shell 抽象的自我成长 AI 智能体框架，提供交互式 REPL、可扩展工具体系与技能系统。

## 亮点

- 统一 Shell 抽象：三层工具体系（原生命令 / Agent Shell / 扩展工具）
- 交互式 REPL：支持流式输出与工具执行状态
- MCP 与技能扩展：可接入外部工具与可复用技能
- 会话持久化与恢复：支持历史会话管理
- 自动技能增强：完成任务后可自动沉淀技能

## 安装与配置

```bash
bun install
cp .env.example .env
```

编辑 `.env`（最少需要设置 API Key）。当 `.env.example` 更新时，请同步新增配置项到 `.env`（保留自己的值）：

- `ANTHROPIC_API_KEY`：必填
- `ANTHROPIC_BASE_URL`：默认 `https://api.minimaxi.chat/v1`
- `MODEL`：默认 `minimax-2.1`
- `MAX_TOKENS`：默认 `4096`
- `MAX_CONTEXT_TOKENS`：默认 `200000`（上下文窗口上限）

> 其他可选项见 `.env.example`，用于日志、持久化与增强策略等。

## 快速开始

```bash
# 启动交互式 REPL
bun run chat

# 或直接运行 CLI
bun run src/cli/index.ts chat
```

## REPL 常用命令

**特殊命令（以 / 开头）**

| 命令 | 说明 |
|------|------|
| `/help` | 显示帮助信息 |
| `/exit` | 退出 REPL |
| `/clear` | 清空对话历史 |
| `/history` | 显示对话历史 |
| `/tools` | 列出可用工具 |
| `/skills` | 列出本地技能 |
| `/sessions` | 列出已保存会话 |
| `/resume <id>` | 恢复会话 |
| `/skill enhance` | 查看技能自动增强状态 |

**Shell 命令（以 ! 开头）**

```bash
!ls -la
!git status
```

## 工具与技能（给 Agent 使用）

在对话中，你可以提示 Agent 使用以下工具：

**Agent Shell 工具（Layer 2）**

- `read <file>` 读取文件
- `write <file>` 写入文件
- `edit <file>` 文本替换编辑
- `glob <pattern>` 文件匹配
- `search <pattern>` 内容搜索
- `bash <cmd>` 执行命令

**扩展工具（Layer 3）**

- `tools search`：搜索可用工具（支持 `--type=mcp|skill`）
- `skill search`：语义搜索技能
- `mcp:*`：调用 MCP 工具
- `skill:*`：调用技能脚本

## 进阶功能

**会话持久化与恢复**

- 默认启用持久化（`SYNAPSE_PERSISTENCE_ENABLED`）
- `/sessions` 查看会话，`/resume <id>` 恢复

**自动技能增强**

- `/skill enhance --on` 开启
- `/skill enhance --off` 关闭
- `/skill enhance --conversation <path>` 手动分析对话

## MCP 配置

MCP 配置文件默认读取位置：

- `./mcp_servers.json`
- `~/.synapse/mcp/mcp_servers.json`

示例：

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

## 开发命令

```bash
bun run test
bun run test:e2e
bun run typecheck
```

## 许可证

MIT
