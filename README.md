# Synapse Agent

基于统一 Shell 抽象的自我成长 AI 智能体框架，提供交互式 REPL、可扩展工具体系与技能系统。

## 功能亮点

- **统一 Shell 抽象**: 三层工具体系（原生命令 / Agent Shell / 扩展工具），LLM 只需学习一个 Bash 工具
- **交互式 REPL**: 支持流式输出、工具执行状态展示与特殊命令
- **MCP 与技能扩展**: 可接入外部 MCP 工具与可复用技能脚本
- **会话持久化与恢复**: 支持历史会话管理与恢复
- **自动技能增强**: 完成任务后可自动沉淀技能供后续复用
- **子智能体支持**: 支持 explore、general、skill 等专用子智能体

## 核心架构

```
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

```bash
bun install
cp .env.example .env
```

LLM 配置位于 `~/.synapse/settings.json`：

```json
{
  "env": {
    "ANTHROPIC_API_KEY": "your_api_key_here",
    "ANTHROPIC_BASE_URL": "https://api.anthropic.com"
  },
  "model": "claude-sonnet-4-20250514"
}
```

| 配置项 | 说明 |
|--------|------|
| `ANTHROPIC_API_KEY` | 必填，API Key |
| `ANTHROPIC_BASE_URL` | API 端点（可选） |
| `model` | 模型名称 |

> 其他可选项见 `.env.example`，用于日志、持久化与增强策略等。

## 快速开始

```bash
# 启动交互式 REPL
bun run chat

# 或直接运行 CLI
bun run src/cli/index.ts chat
```

## REPL 命令

### 特殊命令（以 / 开头）

| 命令 | 说明 |
|------|------|
| `/help` | 显示帮助信息 |
| `/exit` | 退出 REPL |
| `/clear` | 清空对话历史 |
| `/cost` | 查看当前会话 token/费用统计 |
| `/tools` | 列出可用工具 |
| `/skills` | 列出本地技能 |
| `/sessions` | 列出已保存会话 |
| `/resume <id>` | 恢复会话 |
| `/skill enhance` | 查看技能自动增强状态 |

### Shell 命令（以 ! 开头）

```bash
!ls -la
!git status
```

## 工具体系

### Layer 2: Agent Shell 工具

| 命令 | 说明 |
|------|------|
| `read <file>` | 读取文件（支持偏移量和行数限制） |
| `write <file>` | 创建/覆写文件 |
| `edit <file>` | 基于正则的文本替换编辑 |
| `bash <cmd>` | 执行原生 Shell 命令 |

> 文件查找与内容搜索请使用原生命令（如 `find` / `rg` / `grep`）。

### Layer 3: 扩展工具

| 命令 | 说明 |
|------|------|
| `tools search` | 搜索可用工具（支持 `--type=mcp\|skill`） |
| `skill search` | 语义搜索技能 |
| `mcp:*` | 调用 MCP 工具 |
| `skill:*` | 调用技能脚本 |
| `task:*` | 子智能体任务 |

## 进阶功能

### 会话持久化与恢复

- 默认启用持久化（`SYNAPSE_PERSISTENCE_ENABLED`）
- 会话存储于 `~/.synapse/sessions/`
- `/sessions` 查看会话，`/resume <id>` 恢复

### 自动技能增强

- `/skill enhance --on` 开启
- `/skill enhance --off` 关闭
- `/skill enhance --conversation <path>` 手动分析对话

### 子智能体

- `explore`: 代码库探索专用
- `general`: 通用任务处理
- `skill`: 技能生成专用

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

## 项目结构

```
├── src/                     # 源代码目录
│   ├── agent/              # Agent 循环与会话管理
│   ├── cli/                # 命令行接口和 REPL
│   ├── config/             # 配置管理
│   ├── providers/          # LLM 提供者接口
│   ├── tools/              # 工具系统（三层架构核心）
│   │   ├── handlers/       # 命令处理器
│   │   └── converters/     # MCP/Skill 转换器
│   ├── skills/             # 技能系统
│   ├── sub-agents/         # 子智能体管理
│   ├── utils/              # 工具函数库
│   └── resource/           # 资源文件
│
├── tests/                   # 测试目录
│   ├── unit/               # 单元测试
│   ├── e2e/                # 端到端测试
│   └── fixtures/           # 测试夹具
│
├── docs/                    # 项目文档
│   ├── api/                # API 文档
│   ├── guides/             # 使用指南
│   ├── references/         # 参考资料
│   └── skills/             # 技能文档
│
├── skills/                  # 可复用技能库
│   ├── builtin/            # 内置技能
│   └── custom/             # 自定义技能
│
├── examples/                # 示例项目
│   ├── basic/              # 基础示例
│   ├── advanced/           # 高级示例
│   └── integrations/       # 集成示例
│
├── config/                  # 配置文件
│   ├── .env.example        # 环境变量示例
│   ├── mcp_servers.json    # MCP 服务器配置
│   └── package.json        # 项目配置
│
├── README.md                # 项目说明文档
├── CLAUDE.md               # AI 助手提示文档
├── CONTRIBUTING.md         # 贡献指南
├── LICENSE                 # 开源许可证
└── CHANGELOG.md            # 更新日志
```

## 文档导航

| 文档 | 用途 | 推荐时机 |
|------|------|----------|
| **README.md** | 项目介绍、快速开始 | 初次了解项目 |
| **CLAUDE.md** | 开发指导、架构说明 | 参与开发时 |
| **docs/** | 详细技术文档 | 深入使用时 |
| **examples/** | 示例项目 | 学习实践时 |
| **CHANGELOG.md** | 版本更新记录 | 版本升级时 |

## 开发命令

```bash
# 运行所有测试
bun run test

# 仅运行 E2E 测试
bun run test:e2e

# 类型检查
bun run typecheck
```

## 技术栈

- **运行时**: Bun
- **语言**: TypeScript
- **LLM SDK**: @anthropic-ai/sdk
- **MCP**: @modelcontextprotocol/sdk
- **终端 UI**: Ink + @inkjs/ui
- **CLI**: Commander.js
- **验证**: Zod

## 许可证

MIT
