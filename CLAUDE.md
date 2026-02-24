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
│   ├── types/              # 共享类型定义（message, tool, events, provider, skill）
│   ├── shared/             # 共享工具层（logger, errors, constants, config, bash-session）
│   ├── core/               # Agent 核心
│   │   ├── agent/          # Agent 循环、运行器、步骤执行
│   │   ├── session/        # 会话管理与持久化
│   │   ├── context/        # 上下文管理与压缩
│   │   ├── sub-agents/     # 子智能体生命周期管理
│   │   ├── hooks/          # Hook 系统（停止钩子、技能增强）
│   │   └── prompts/        # 系统提示词模板
│   ├── providers/          # LLM 提供者接口
│   │   ├── anthropic/      # Anthropic 适配器
│   │   ├── openai/         # OpenAI 适配器
│   │   └── google/         # Google 适配器
│   ├── tools/              # 工具系统（三层架构核心）
│   │   ├── commands/       # Agent Shell 命令处理器（read, write, edit, bash 等）
│   │   ├── operations/     # 可插拔操作接口（FileOps/BashOps）
│   │   └── converters/     # MCP/Skill 转换器
│   ├── skills/             # 技能系统
│   │   ├── loader/         # 技能加载与搜索
│   │   ├── generator/      # 技能生成与增强
│   │   ├── manager/        # 技能管理（导入、版本、元数据）
│   │   └── schema/         # 技能文档解析与模板
│   ├── cli/                # 命令行接口和 REPL
│   │   ├── commands/       # CLI 命令处理器
│   │   └── renderer/       # 终端渲染组件
│   └── resource/           # 资源文件（meta-skill 模板）
│
├── tests/                   # 测试目录
│   ├── unit/               # 单元测试（镜像 src/ 结构）
│   ├── integration/        # 集成测试
│   ├── e2e/                # 端到端测试
│   └── fixtures/           # 测试夹具
│
├── docs/                    # 项目文档
│   ├── requirements/       # PRD 和需求文档
│   ├── reports/            # 测试与交付报告
│   ├── plans/              # 开发计划
│   └── archive/            # 归档文档
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
| **docs/** | 详细技术文档、需求、报告 | ⭐⭐ |

### 📖 文档优先级

1. **必读**: README.md → 了解项目概况
2. **开发**: CLAUDE.md → 理解开发规范
3. **深入**: docs/ → 详细技术文档
4. **最新变更**: CHANGELOG.md → 版本更新

### 💡 文档维护建议

- 新增功能时，同步更新相关文档
- 重要变更要在 CHANGELOG.md 中记录

## 核心模块

### 依赖方向规则

`types ← shared ← core ← providers ← tools ← skills ← cli`

### Types (`src/types/`)
- 共享类型定义：`Message`, `ToolCall`, `LLMClient`, `Toolset`, `GenerateFunction` 等
- DI 接口：`IAgentRunner`, `IBashToolProvider`, `ISkillLoader`, `ISkillManager`

### Shared (`src/shared/`)
- `logger`: 日志系统（pino）
- `errors`: 错误定义
- `constants`: 全局常量
- `config/`: 配置管理（SettingsManager）
- `bash-session`: Bash 会话管理（事件驱动）
- `message-utils`: 消息工具函数
- `token-counter`: Token 计算

### Core (`src/core/`)
- `agent/AgentRunner`: Agent 主循环，维护对话历史
- `agent/step()`: 单个执行步骤（生成响应 + 执行工具）
- `session/`: 会话管理与持久化
- `context/`: 上下文管理与压缩（滑动窗口）
- `sub-agents/SubAgentManager`: 子智能体生命周期管理
- `hooks/`: Hook 系统（停止钩子、技能增强钩子）

### Providers (`src/providers/`)
- `AnthropicClient`: Anthropic SDK 封装
- `OpenAIClient`: OpenAI SDK 封装
- `GoogleClient`: Google SDK 封装
- `generate()`: LLM 调用，支持流式输出

### Tools (`src/tools/`)
- `BashTool`: 单一 Bash 工具入口
- `BashRouter`: 三层命令路由器（声明式路由表 + 懒加载）
- `commands/`: Agent Shell 命令处理器（read, write, edit, bash, skill, mcp, task 等）
- `operations/`: 可插拔操作接口（FileOps/BashOps）
- `converters/`: MCP/Skill 转换器

### Skills (`src/skills/`)
- `loader/SkillLoader`: 技能加载与缓存
- `generator/SkillGenerator`: 从对话生成新技能
- `generator/SkillEnhancer`: 自动技能增强
- `manager/SkillManager`: 技能导入/导出/版本管理
- `schema/`: 技能文档解析与模板

### CLI (`src/cli/`)
- `repl.ts`: REPL 主循环
- `repl-init.ts`: REPL 初始化（工具创建、回调配置）
- `terminal-renderer.ts`: 流式终端渲染
- `renderer/`: 渲染组件

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

## Code Review

When checking implementation against PRD documents, first summarize the key requirements, then systematically verify each one against the codebase before providing a gap analysis.

## Debugging

For test failures, always check both authentication/credentials issues AND timeout configurations as common root causes before diving deeper.

## Workflow Preferences

When executing multi-step plans or skills, provide a brief progress checkpoint after each major step so the user knows status if they need to interrupt.
