## 项目概述

Synapse Agent 是一个基于统一 Shell 抽象的自我成长 AI 智能体框架。核心理念是"一切工具都是 Shell Command"，通过三层工具体系（Native Shell Command、Agent Shell Command、Extension Shell Command）实现可扩展的智能体能力。

## 核心架构

### 三层工具体系

| 层次 | 类型 | 示例 | 说明 |
|------|------|------|------|
| Layer 1 | Native Shell Command | `ls`, `git`, `npm` | 标准 Unix 命令 |
| Layer 2 | Agent Shell Command | `read`, `write`, `edit`, `glob`, `search` | 内置文件/搜索工具 |
| Layer 3 | Extension Shell Command | `mcp:*`, `skill:*`, `task:*` | 第三方工具和技能 |

### 设计特点

- **单一 Bash 工具**: LLM 只需学习一个工具，内部路由处理复杂度
- **统一命令抽象**: 原生命令、Agent 工具、扩展工具无缝集成
- **自我成长机制**: 从成功任务中自动生成可复用技能

## 目录结构

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
│   └── resource/           # 资源文件（系统提示词等）
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

## 文档组织指南

### 📁 核心文档说明

| 文件/目录 | 用途 | 重要性 |
|-----------|------|--------|
| **README.md** | 项目介绍、快速开始、API 概览 | ⭐⭐⭐ |
| **CLAUDE.md** | AI 助手开发指导、架构说明 | ⭐⭐⭐ |
| **docs/** | 详细技术文档、教程 | ⭐⭐ |
| **skills/** | 可复用技能库、示例脚本 | ⭐⭐ |
| **examples/** | 完整示例项目、最佳实践 | ⭐⭐ |

### 📖 文档优先级

1. **必读**: README.md → 了解项目概况
2. **开发**: CLAUDE.md → 理解开发规范
3. **深入**: docs/ → 详细技术文档
4. **实践**: examples/ → 示例学习
5. **扩展**: skills/ → 技能复用

### 🔍 查找文档的路径

- **安装配置**: README.md → 安装与配置
- **API 参考**: docs/api/ → 接口文档
- **使用教程**: docs/guides/ → 步骤指南
- **技能开发**: docs/skills/ → 技能指南
- **故障排除**: docs/ → 搜索 "troubleshooting"
- **最新变更**: CHANGELOG.md → 版本更新

### 💡 文档维护建议

- 新增功能时，同步更新相关文档
- 示例代码要保持与最新版本兼容
- 技能文档要有清晰的使用场景说明
- 重要变更要在 CHANGELOG.md 中记录

## 核心模块

### Agent (`src/agent/`)
- `AgentRunner`: Agent 主循环，维护对话历史
- `step()`: 单个执行步骤（生成响应 + 执行工具）
- `Session`: 会话管理与持久化

### Tools (`src/tools/`)
- `BashTool`: 单一 Bash 工具入口
- `BashRouter`: 三层命令路由器
- `CallableTool`: 工具基类，Zod 参数验证
- `handlers/agent-bash/`: Agent Shell 命令处理器

### Providers (`src/providers/`)
- `AnthropicClient`: Anthropic SDK 封装
- `generate()`: LLM 调用，支持流式输出

### Skills (`src/skills/`)
- `SkillLoader`: 技能加载与缓存
- `SkillGenerator`: 从对话生成新技能
- `SkillEnhancer`: 自动技能增强

### Sub-Agents (`src/sub-agents/`)
- `SubAgentManager`: 子智能体生命周期管理
- 支持类型: `explore`, `general`, `skill`

## SDK 依赖

### Anthropic SDK
https://github.com/anthropics/anthropic-sdk-typescript

### MCP SDK
https://github.com/modelcontextprotocol/sdk

## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `ANTHROPIC_API_KEY` | LLM API 密钥 | - |
| `ANTHROPIC_BASE_URL` | LLM 服务端点 | - |
| `SYNAPSE_MAX_TOOL_ITERATIONS` | 最大工具迭代次数 | 50 |
| `SYNAPSE_MAX_CONSECUTIVE_TOOL_FAILURES` | 连续失败阈值 | 3 |
| `SYNAPSE_SESSIONS_DIR` | 会话保存目录 | `~/.synapse/sessions/` |
| `COMMAND_TIMEOUT` | 命令超时时间 | 30s |

## 约定

- 当前处于项目开发阶段，任何调整优先考虑重构而非向后兼容
- 日志和异常信息统一使用英文
- 代码注释优先使用中文
- 禁止硬编码数值，配置参数需支持环境变量
