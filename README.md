# Synapse Agent

> ⚠️ **开发中项目** - 当前处于早期开发阶段，API 可能会发生变更

基于统一 Bash 抽象的自我成长 AI 智能体框架。Synapse Agent 将所有工具统一为 Bash 命令接口，通过三层工具体系实现可扩展的智能体能力。

## 核心理念

**"一切工具都是 Bash"** - 无论是文件操作、LLM 调用还是领域专业工具，在 Agent 视角下都是统一的 Bash 命令。这种设计带来：

- 🔌 **统一接口**：Agent 只需理解单一的 Bash 工具，降低认知负担
- 🧩 **无限扩展**：通过 MCP 协议轻松集成任意外部工具
- 🎯 **专注能力**：Agent 专注于任务规划，工具执行细节由框架处理

## 特性

- ✅ 三层 Bash 工具体系（Base / Agent / Field）
- ✅ 技能系统（Skill System）支持能力扩展
- ✅ MCP 协议集成，连接外部工具生态
- ✅ TypeScript 实现，完整类型安全
- ✅ Bun 运行时，极速开发体验

## 快速开始

### 安装

```bash
# 克隆仓库
git clone https://github.com/your-org/synapse-agent.git
cd synapse-agent

# 安装依赖（需要 Bun 1.3.5+）
bun install

# 构建项目
bun run build
```

### 配置

创建 `.env` 文件配置 API：

```bash
# Anthropic Claude
ANTHROPIC_API_KEY=your_api_key

# 或使用 MiniMax（兼容 Anthropic API）
ANTHROPIC_API_KEY=your_minimax_key
ANTHROPIC_BASE_URL=https://api.minimaxi.com/anthropic
MODEL=MiniMax-M2
```

### 基础使用

```bash
# 单次查询
synapse "帮我分析这个项目的架构"

# 交互式 REPL
synapse chat

# 查看可用工具
synapse tools

# 管理技能
synapse skills
```

### 示例：Agent 执行流程

```bash
$ synapse "读取 README.md 并总结要点"

# Agent 内部执行：
# 1. 调用 Bash 工具: read README.md
# 2. BashRouter 路由到 Agent Bash (ReadTool)
# 3. 返回文件内容
# 4. Agent 分析并总结
```

## 架构设计

### 三层 Bash 工具体系

Synapse Agent 通过三层架构实现工具的统一抽象：

```
┌─────────────────────────────────────┐
│          Agent (LLM)                │
│   只看到单一 Bash 工具接口            │
└──────────────┬──────────────────────┘
               │
        ┌──────▼──────┐
        │ BashRouter  │  命令解析和路由
        └──────┬──────┘
               │
       ┌───────┼───────┐
       │       │       │
   ┌───▼──┐ ┌──▼──┐ ┌─▼────┐
   │Layer │ │Layer│ │Layer │
   │  1   │ │  2  │ │  3   │
   └──────┘ └─────┘ └──────┘
```

**Layer 1: Base Bash**
- Unix/Linux 原生命令（`ls`, `grep`, `git` 等）
- 通过持久化 Bash 会话执行
- 提供基础系统能力

**Layer 2: Agent Bash**
- Agent 核心工具：`read`, `write`, `edit`, `glob`, `grep`, `bash`, `skill`
- 为 Agent 提供结构化操作能力
- 预定义工具集，开箱即用

**Layer 3: Field Bash**
- 领域专业工具（数据库、API、DevOps 等）
- 通过 MCP/Anthropic 转换器动态注册
- 语法：`field:domain:tool_name`

### 数据流

```
用户输入 → Agent.run()
    ↓
LLM 返回 Bash 工具调用
    ↓
BashRouter 解析命令
    ↓
    ├─ read/write/edit → ToolRegistry (Layer 2)
    ├─ field:* → ToolIndex (Layer 3)
    └─ 其他 → BashSession (Layer 1)
    ↓
执行结果 → Agent → 最终响应
```

## 开发指南

### 测试

```bash
# 运行所有测试
bun test

# 监视模式
bun test:watch

# 生成覆盖率报告
bun test:coverage

# 运行特定测试
bun test tests/unit/core/agent.test.ts
```

### 代码质量

```bash
# TypeScript 类型检查
bun run typecheck

# ESLint 检查
bun run lint

# 自动修复 lint 问题
bun run lint:fix

# 格式化代码
bun run format
```

### 项目结构

```
src/
├── core/              # 核心模块
│   ├── types.ts      # 基础类型定义
│   ├── config.ts     # 配置管理
│   ├── agent.ts      # Agent 主类
│   └── llm.ts        # LLM 客户端
├── tools/            # 工具系统
│   ├── base.ts       # 工具基础类
│   ├── registry.ts   # 工具注册表
│   ├── bash-router.ts # 命令路由器
│   └── agent/        # Agent Bash 工具实现
├── skills/           # 技能系统
└── cli/              # CLI 交互层
```

### 扩展开发

**添加 Agent Bash 工具：**

```typescript
import { BaseTool, ToolResult } from '../tools/base';

export class MyTool extends BaseTool {
  name = 'mytool';
  description = 'My custom tool';

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    // 实现工具逻辑
    return ToolResult.success('Result');
  }
}

// 注册到 ToolRegistry
registry.register(new MyTool());
```

**添加技能（Skill）：**

```yaml
# ~/.synapse/skills/my-skill.yaml
name: my-skill
description: Custom skill description
prompt: |
  You are an expert at...

  Follow these steps:
  1. ...
```

## 文档

- 📖 [完整文档](./docs/) - 深入了解架构设计
- 🎯 [CLAUDE.md](./CLAUDE.md) - 项目开发指南
- 🔧 [API 参考](./docs/api/) - 详细 API 文档
- 💡 [技能开发](./docs/skills.md) - 如何创建自定义技能

## 技术栈

- **运行时**: Bun 1.3.5+
- **语言**: TypeScript 5.9+
- **LLM SDK**: @anthropic-ai/sdk (兼容 MiniMax API)
- **测试**: Bun 内置测试运行器
- **代码质量**: ESLint + Prettier

## 路线图

- [x] ✅ 基础设施和核心类型
- [x] ✅ Agent Bash 工具实现
- [x] ✅ LLM 客户端和 Agent Loop
- [x] ✅ 技能系统集成
- [ ] 🚧 Field Bash 工具索引
- [ ] 🚧 MCP 协议完整支持
- [ ] 📋 工具转换器优化
- [ ] 📋 性能优化和生产就绪

## 贡献

本项目目前处于早期开发阶段，暂不接受外部贡献。欢迎提交 Issue 反馈问题和建议。

## 许可证

MIT License - 详见 [LICENSE](./LICENSE) 文件

---

**Built with ❤️ using Bun and TypeScript**
