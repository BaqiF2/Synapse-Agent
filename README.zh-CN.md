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
- **多 Provider LLM 支持**：统一 `LLMProvider` 接口，内置 Anthropic、OpenAI、Google 适配器 — 运行时切换无需改代码
- **事件驱动架构**：`EventStream` 异步可迭代流解耦 Agent Core 与 UI，支持灵活的消费模式
- **模块化单体**：`dependency-cruiser` 架构适应度函数强制模块边界 — `core`、`providers`、`tools`、`skills`、`sub-agents` 各有清晰的依赖规则
- **可插拔操作**：`FileOperations` / `BashOperations` 接口支持切换执行环境（本地、远程、沙箱）
- **两层消息系统**：领域消息保留完整上下文，`convertToLlm()` 纯函数显式转换用于 LLM API 调用
- **交互式 REPL**：支持流式输出、工具执行状态展示与斜杠命令
- **MCP 与技能扩展**：可接入外部 MCP 工具与可复用本地技能
- **会话持久化与恢复**：支持历史会话管理与恢复
- **自动技能增强**：任务完成后可沉淀可复用技能
- **子智能体支持**：内置 `explore`、`general`、`skill` 子智能体，独立 EventStream 与工具权限隔离

## 核心架构

```text
┌──────────────────────────────────────────────────────────────┐
│                         cli (REPL)                           │
│                     消费 EventStream                         │
├──────────┬───────────┬───────────┬───────────┬──────────────┤
│sub-agents│  skills   │   tools   │  config   │              │
│          │           │ BashRouter│           │              │
│          │           │ 三层路由   │           │              │
├──────────┴─────┬─────┴─────┬─────┴───────────┴──────────────┤
│     core       │ providers │                                │
│  EventStream   │ Anthropic │                                │
│  Agent Loop    │ OpenAI    │                                │
│  Messages      │ Google    │                                │
├────────────────┴───────────┴────────────────────────────────┤
│                        common                                │
│                  logger, errors, constants                    │
└──────────────────────────────────────────────────────────────┘
```

### 模块依赖规则

| 模块 | 允许依赖 | 说明 |
|------|---------|------|
| `core` | `common` | 事件系统、Agent Loop、消息转换 |
| `providers` | `common` | LLM Provider 适配器（Anthropic/OpenAI/Google） |
| `tools` | `core`(types), `common` | 三层工具系统、可插拔操作 |
| `skills` | `core`, `providers`, `common` | 技能生成与增强 |
| `sub-agents` | `core`, `providers`, `tools`, `common` | 子智能体生命周期管理 |
| `cli` | 所有模块 | 顶层消费者 |
| `common` | （无） | 公共工具 |

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

> 备注：Synapse Agent 通过统一 `LLMProvider` 接口支持多个 LLM 供应商。
> 内置适配器：**Anthropic**、**OpenAI**、**Google**。
> 也支持通过 `ANTHROPIC_BASE_URL` 接入 Anthropic 兼容接口（如 MiniMax）。

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
│   ├── core/               # Agent Core：EventStream、Agent Loop、消息系统
│   ├── providers/           # LLM Provider 适配器（Anthropic/OpenAI/Google）
│   │   ├── anthropic/
│   │   ├── openai/
│   │   └── google/
│   ├── tools/               # 三层工具系统
│   │   ├── operations/      # 可插拔操作（FileOps/BashOps）
│   │   ├── handlers/        # Agent Shell 命令处理器
│   │   └── converters/      # MCP/Skill 转换器
│   ├── skills/              # 技能生成与增强
│   ├── sub-agents/          # 子智能体生命周期管理
│   ├── common/              # 日志、错误、常量
│   ├── cli/                 # REPL 与终端 UI
│   ├── config/              # 配置管理
│   ├── agent/               # 旧版 Agent Runner
│   ├── utils/               # 工具函数
│   └── resource/            # 系统提示词
├── tests/
│   ├── unit/                # 单元测试（镜像 src/ 结构）
│   ├── integration/         # 集成测试
│   └── e2e/                 # 端到端 CLI 测试
├── docs/
│   ├── architecture/        # 架构设计与 ADR
│   └── requirements/        # PRD 与 BDD 验收标准
├── assets/
│   └── logo.png
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
bun run lint          # ESLint（Flat Config，严格模式）
bun run typecheck     # TypeScript 严格类型检查
bun test              # 运行所有测试
bun test tests/unit/  # 仅运行单元测试
bun test tests/integration/  # 仅运行集成测试
bun run test:arch     # 架构适应度测试（dependency-cruiser）
bun run test:cov      # 测试 + 覆盖率报告
bun run test:e2e      # 端到端测试
bun run validate      # 运行所有检查（lint + typecheck + tests + arch）
```

## 技术栈

- 运行时：Bun 1.3.9
- 语言：TypeScript（严格模式）
- LLM SDK：`@anthropic-ai/sdk`、`openai`、`@google/genai`
- MCP：`@modelcontextprotocol/sdk`
- 验证：Zod
- 日志：pino + pino-pretty
- 终端 UI：Ink + `@inkjs/ui`
- CLI：Commander.js
- 架构测试：dependency-cruiser

## 灵感来源

感谢以下项目带来的灵感：

- [philschmid/mcp-cli](https://github.com/philschmid/mcp-cli)
- [shareAI-lab/learn-claude-code](https://github.com/shareAI-lab/learn-claude-code)

## 联系方式

- Google 邮箱：[wenjun19930614@gmail.com](mailto:wenjun19930614@gmail.com)

## 许可证

MIT
