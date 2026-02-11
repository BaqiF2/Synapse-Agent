# Synapse Agent

![Synapse Logo](assets/logo.png)

[English](README.md)

基于统一 Shell 抽象的自我成长 AI 智能体框架，提供交互式 REPL、可扩展工具体系与技能系统。

## 开源协作文档

- [贡献指南](CONTRIBUTING.md)
- [社区行为准则](CODE_OF_CONDUCT.md)
- [更新日志](CHANGELOG.md)

## 功能亮点

- **统一 Shell 抽象**：三层工具体系（原生命令 / Agent Shell / 扩展工具），LLM 主要学习一个 Bash 风格接口
- **交互式 REPL**：支持流式输出、工具执行状态展示与斜杠命令
- **MCP 与技能扩展**：可接入外部 MCP 工具与可复用本地技能
- **会话持久化与恢复**：支持历史会话管理与恢复
- **自动技能增强**：任务完成后可沉淀可复用技能
- **子智能体支持**：内置 `explore`、`general`、`skill` 子智能体

## 核心架构

```text
┌─────────────────────────────────────────────────────────┐
│                      AgentRunner                        │
│  ┌─────────────────────────────────────────────────┐   │
│  │               三层工具路由 (BashRouter)          │   │
│  │  ┌─────────┬─────────────────┬──────────────┐   │   │
│  │  │ Layer 1 │     Layer 2     │   Layer 3    │   │   │
│  │  │ Native  │   Agent Shell   │  Extension   │   │   │
│  │  │ ls, git │ read,write,edit │ mcp:*, skill:*│   │   │
│  │  └─────────┴─────────────────┴──────────────┘   │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## 安装与配置

### 本地安装

```bash
bun install
cp .env.example .env
```

### 全局安装（可在任意路径使用 `synapse` 命令）

```bash
# 1. 安装依赖
bun install

# 2. 创建全局链接
bun link

# 3. 确保 ~/.bun/bin 在 PATH 中（添加到 ~/.zshrc 或 ~/.bashrc）
export PATH="$HOME/.bun/bin:$PATH"

# 4. 重新加载配置
source ~/.zshrc  # 或 source ~/.bashrc
```

如果 `bun link` 报错 `package.json missing "name"`，先执行：

```bash
echo '{"name": "bun-global"}' > ~/.bun/install/global/package.json
```

### LLM 配置

LLM 配置位于 `~/.synapse/settings.json`：

```json
{
  "env": {
    "ANTHROPIC_API_KEY": "your_api_key_here",
    "ANTHROPIC_BASE_URL": "https://api.anthropic.com"
  },
  "model": "claude-sonnet-4-5",
  "skillEnhance": {
    "autoEnhance": false,
    "maxEnhanceContextChars": 50000
  }
}
```

| 配置项 | 说明 |
| --- | --- |
| `ANTHROPIC_API_KEY` | 必填 API Key |
| `ANTHROPIC_BASE_URL` | 可选 API 端点 |
| `model` | 模型名称（默认：`claude-sonnet-4-5`） |
| `skillEnhance.autoEnhance` | 自动技能增强开关 |
| `skillEnhance.maxEnhanceContextChars` | 技能增强分析上下文字符上限 |

> 备注：Synapse Agent 支持 Anthropic API，也支持通过 `ANTHROPIC_BASE_URL` 接入 Anthropic 兼容接口。  
> 作者日常使用的是 MiniMax（通过兼容接口方式接入）。

#### MiniMax（Anthropic 兼容）

Synapse Agent 可以通过 Anthropic 兼容接口接入 MiniMax。配置方式如下：

- `ANTHROPIC_API_KEY`：填写 MiniMax 的 API Key
- `ANTHROPIC_BASE_URL`：填写 MiniMax 的兼容接口地址
- `model`：填写 MiniMax 模型名（作者日常使用 `minimax-2.1`）

示例：

```json
{
  "env": {
    "ANTHROPIC_API_KEY": "<your-minimax-api-key>",
    "ANTHROPIC_BASE_URL": "https://api.minimaxi.chat/v1"
  },
  "model": "minimax-2.1"
}
```

参考文档：

- [MiniMax API 概览](https://platform.minimaxi.com/docs/api-reference/api-overview)
- [Anthropic API 概览](https://platform.claude.com/docs/en/api/overview)

更多可选项见 `.env.example`（日志、持久化、增强策略等）。

## 快速开始

```bash
# 全局安装后，任意路径启动
synapse chat

# 或在项目目录内使用
bun run chat
```

## REPL 命令

### 特殊命令（以 `/` 开头）

| 命令 | 说明 |
| --- | --- |
| `/help` | 显示帮助信息 |
| `/exit` | 退出 REPL |
| `/clear` | 清空对话历史 |
| `/cost` | 查看当前会话 token/费用统计 |
| `/context` | 查看上下文使用统计 |
| `/compact` | 压缩对话历史 |
| `/model` | 查看当前模型 |
| `/tools` | 列出可用工具 |
| `/resume` | 列出可恢复会话并选择恢复 |
| `/resume --latest` | 恢复最近会话 |
| `/resume <id>` | 按会话 ID 恢复 |

### 技能命令

| 命令 | 说明 |
| --- | --- |
| `/skill:list` | 列出已安装技能 |
| `/skill:info <name>` | 查看技能详情与版本 |
| `/skill:import <src>` | 从本地目录或 URL 导入技能 |
| `/skill:rollback <name> [version]` | 回滚技能版本 |
| `/skill:delete <name>` | 删除技能及其版本历史 |
| `/skill enhance` | 查看自动技能增强状态 |
| `/skill enhance --on` | 开启自动技能增强 |
| `/skill enhance --off` | 关闭自动技能增强 |
| `/skill enhance -h` | 查看自动技能增强帮助 |

### Shell 命令（以 `!` 开头）

```bash
!ls -la
!git status
```

## 工具体系

### Layer 2: Agent Shell

| 命令 | 说明 |
| --- | --- |
| `read <file>` | 读取文件（支持偏移量和行数限制） |
| `write <file>` | 创建/覆写文件 |
| `edit <file>` | 基于正则的文本替换编辑 |
| `bash <cmd>` | 执行原生 Shell 命令 |

文件查找与内容搜索建议使用原生命令 `find`、`rg`、`grep`。

### Layer 3: 扩展工具

| 命令 | 说明 |
| --- | --- |
| `tools search` | 搜索可用工具（支持 `--type=mcp\|skill`） |
| `skill search` | 语义搜索技能 |
| `mcp:*` | 调用 MCP 工具 |
| `skill:*` | 调用技能脚本 |
| `task:*` | 运行子智能体任务 |

## 进阶功能

### 会话持久化与恢复

- 会话默认存储于 `~/.synapse/sessions/`
- 可通过 `SYNAPSE_SESSIONS_DIR` 覆盖会话目录
- 使用 `/resume` 或 `/resume --latest`

### 自动技能增强

- `/skill enhance --on` 开启
- `/skill enhance --off` 关闭
- 配置会持久化到 `~/.synapse/settings.json`（`skillEnhance.autoEnhance`）

### 子智能体

- `explore`：代码库探索
- `general`：通用任务处理
- `skill`：技能生成

## MCP 配置

默认读取路径：

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

## 项目结构

```text
├── src/
│   ├── agent/
│   ├── cli/
│   ├── config/
│   ├── providers/
│   ├── tools/
│   ├── skills/
│   ├── sub-agents/
│   ├── utils/
│   └── resource/
├── tests/
│   ├── unit/
│   ├── e2e/
│   └── fixtures/
├── assets/
│   └── logo.png
├── docs/
├── examples/
├── README.md
├── README.zh-CN.md
├── CLAUDE.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── LICENSE
└── CHANGELOG.md
```

## 开发命令

```bash
bun run lint
bun run typecheck
bun run test
bun run test:cov
bun run test:e2e
bun run test:cli:e2e
```

## 技术栈

- 运行时：Bun
- 语言：TypeScript
- LLM SDK：`@anthropic-ai/sdk`
- MCP：`@modelcontextprotocol/sdk`
- 终端 UI：Ink + `@inkjs/ui`
- CLI：Commander.js
- 验证：Zod

## 灵感来源

感谢以下项目带来的灵感：

- [philschmid/mcp-cli](https://github.com/philschmid/mcp-cli)
- [shareAI-lab/learn-claude-code](https://github.com/shareAI-lab/learn-claude-code)

## 联系方式

- Google 邮箱：[wenjun19930614@gmail.com](mailto:wenjun19930614@gmail.com)

## 许可证

MIT
