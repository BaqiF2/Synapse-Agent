# 第三部分：项目结构设计

## ⚠️ 强制验证法则

**在本部分的实施过程中，必须严格遵循以下验证流程：**

### 1. 迁移前检查（Pre-Migration Check）
- [ ] **Python 目录结构分析**：详细记录 Python 版本的目录组织方式
- [ ] **模块依赖关系图**：绘制 Python 版本各模块间的依赖关系
- [ ] **命名规范对照**：对比 Python 和 TypeScript 的命名习惯差异
- [ ] **导入导出机制**：理解 Python 和 TypeScript 的模块系统差异

### 2. 迁移后检查（Post-Migration Check）
- [ ] **目录结构对照**：逐一对照 TypeScript 和 Python 的目录结构
- [ ] **模块职责验证**：确保每个模块的职责与 Python 版本一致
- [ ] **导入路径检查**：验证所有模块导入路径正确且符合 ESM 规范
- [ ] **文件命名验证**：确保文件命名规范统一且易于查找

### 3. PRD 符合性检查（PRD Compliance Check）
- [ ] **可扩展性验证**：验证目录结构支持工具转换器、技能系统的扩展
- [ ] **分层架构清晰**：确保 Base/Agent/Field 三层结构在目录中清晰体现
- [ ] **技能文件系统**：验证技能目录结构符合"文件系统是记忆载体"理念
- [ ] **模块化设计**：确保每个模块可独立测试和维护

**❌ 未完成上述检查清单的任何一项，不得进入下一阶段**

---

## 3.1 目录结构

### 完整目录树

```
SynapseAgent/
├── src/
│   ├── core/                      # 核心模块
│   │   ├── agent.ts              # Agent 主循环
│   │   ├── agent-config.ts       # Agent 配置
│   │   ├── llm.ts                # LLM 客户端封装
│   │   ├── config.ts             # 配置管理
│   │   ├── prompts.ts            # 系统提示词
│   │   ├── repl.ts               # REPL 交互
│   │   └── types.ts              # 核心类型定义
│   │
│   ├── tools/                     # 工具系统
│   │   ├── base.ts               # 基础类型（ToolResult, BaseTool）
│   │   ├── bash-router.ts        # Bash 命令路由
│   │   ├── bash-session.ts       # 持久 Bash 会话
│   │   ├── bash-constants.ts     # Bash 常量定义
│   │   ├── registry.ts           # 工具注册表
│   │   │
│   │   ├── agent/                # Agent Bash 工具
│   │   │   ├── index.ts          # 导出所有工具
│   │   │   ├── read.ts           # 文件读取工具
│   │   │   ├── write.ts          # 文件写入工具
│   │   │   ├── edit.ts           # 文件编辑工具
│   │   │   ├── grep.ts           # 内容搜索工具
│   │   │   └── glob.ts           # 文件模式匹配工具
│   │   │
│   │   ├── converters/           # 工具转换器（待实现）
│   │   │   ├── base.ts
│   │   │   ├── anthropic.ts
│   │   │   ├── mcp.ts
│   │   │   └── skill.ts
│   │   │
│   │   └── field/                # Field Bash（待实现）
│   │       └── discovery.ts
│   │
│   ├── skills/                    # 技能系统
│   │   ├── types.ts              # 技能类型定义
│   │   ├── loader.ts             # 技能加载器
│   │   └── index.ts              # 技能索引管理
│   │
│   ├── cli/                       # CLI 交互层
│   │   └── commands/             # 命令实现
│   │       ├── run.ts            # 单次查询命令
│   │       ├── chat.ts           # REPL 命令
│   │       ├── config.ts         # 配置显示命令
│   │       ├── tools.ts          # 工具管理命令
│   │       └── skills.ts         # 技能管理命令
│   │
│   ├── utils/                     # 工具函数（可选）
│   │   ├── logger.ts             # 日志
│   │   └── validation.ts         # 数据验证
│   │
│   └── entrypoints/              # 入口文件
│       └── cli.tsx               # CLI 主入口
│
├── tests/                         # 测试目录
│   ├── unit/                     # 单元测试
│   │   ├── tools/
│   │   ├── skills/
│   │   └── core/
│   ├── integration/              # 集成测试
│   └── e2e/                      # 端到端测试
│
├── docs/                          # 文档
│   ├── plans/                    # 设计文档
│   └── testing/                  # 测试文档
│
├── scripts/                       # 构建和工具脚本
│   ├── build.ts
│   └── install-hooks.ts
│
├── dist/                          # 构建输出目录
│
├── .env.example                  # 环境变量示例
├── .gitignore
├── bunfig.toml                   # Bun 配置
├── tsconfig.json                 # TypeScript 配置
├── package.json                  # 项目配置
├── .eslintrc.json               # ESLint 配置
├── .prettierrc.json             # Prettier 配置
├── LICENSE
└── README.md
```

## 3.2 模块职责

### 核心模块 (src/core/)

**agent.ts**
- Agent 主类
- 消息循环管理
- 工具调用处理
- 对话历史维护

**llm.ts**
- LLM 客户端封装
- Anthropic SDK 调用
- 唯一 Bash 工具定义
- 流式响应支持

**config.ts**
- 配置加载和验证
- 环境变量读取
- 目录初始化
- 全局配置管理

**prompts.ts**
- 系统提示词定义
- 技能搜索提示词
- 技能强化提示词

**repl.ts**
- REPL 主循环
- 命令解析
- Shell 命令执行
- 交互式界面

**types.ts**
- AgentResult
- ToolCallStep
- Message 类型
- ContentBlock 类型

### 工具系统 (src/tools/)

**base.ts**
- ToolResult 类
- ToolError 异常
- BaseTool 抽象类
- ToolSchema 接口

**bash-router.ts**
- 命令字符串解析
- 参数提取和类型转换
- 命令路由分发
- Help 请求处理

**bash-session.ts**
- 持久 Shell 进程管理
- 命令执行
- 环境变量维护
- 工作目录跟踪

**registry.ts**
- 工具注册和管理
- 工具查询
- 工具执行

**agent/**
- 各个 Agent Bash 工具实现
- 统一接口：execute(kwargs)
- 返回 ToolResult

### 技能系统 (src/skills/)

**types.ts**
- SkillMetadata 接口
- Skill 接口
- LoadResult 类型

**loader.ts**
- SKILL.md 文件解析
- Frontmatter 提取
- 三层加载支持
- 技能发现

**index.ts**
- SkillIndex 类
- 技能存储和检索
- 技能搜索
- 索引持久化

### CLI 层 (src/cli/)

**commands/**
- 各个命令的实现逻辑
- Agent 实例化
- 参数处理
- 结果输出

**entrypoints/cli.tsx**
- Commander 配置
- 命令注册
- 全局钩子
- 错误处理

## 3.3 文件命名规范

### TypeScript 文件

- **kebab-case**: `bash-router.ts`, `agent-config.ts`
- **对应 Python**: Python 的 `bash_router.py` → TS 的 `bash-router.ts`

### 类名

- **PascalCase**: `BashRouter`, `ToolRegistry`, `Agent`
- **对应 Python**: 保持一致

### 接口/类型

- **PascalCase**: `ToolResult`, `AgentConfig`, `SkillMetadata`
- **对应 Python**: 保持一致

### 变量/函数

- **camelCase**: `createLLMClient`, `loadConfig`, `getAvailableCommands`
- **Python snake_case** 映射：`load_config` → `loadConfig`

### 常量

- **SCREAMING_SNAKE_CASE**: `AGENT_COMMANDS`, `DEFAULT_SYSTEM_PROMPT`
- **对应 Python**: 保持一致

## 3.4 导入导出规范

### 模块导出

```typescript
// src/tools/base.ts
export class ToolResult { ... }
export class ToolError { ... }
export abstract class BaseTool { ... }
export interface ToolSchema { ... }
```

### 聚合导出

```typescript
// src/tools/agent/index.ts
export { ReadTool } from './read.js';
export { WriteTool } from './write.js';
export { EditTool } from './edit.js';
export { GrepTool } from './grep.js';
export { GlobTool } from './glob.js';

export function getAllAgentTools(): BaseTool[] {
  return [
    new ReadTool(),
    new WriteTool(),
    new EditTool(),
    new GrepTool(),
    new GlobTool(),
  ];
}
```

### 导入规范

```typescript
// 使用 .js 扩展名（ESM 要求）
import { ToolResult } from './base.js';
import { BashRouter } from '../tools/bash-router.js';

// 类型导入
import type { Config } from './config.js';
```

## 3.5 与 Python 结构对比

| Python | TypeScript | 说明 |
|--------|-----------|------|
| `src/synapse/core/agent.py` | `src/core/agent.ts` | Agent 主类 |
| `src/synapse/core/llm.py` | `src/core/llm.ts` | LLM 客户端 |
| `src/synapse/tools/bash_router.py` | `src/tools/bash-router.ts` | 命令路由 |
| `src/synapse/tools/agent/read.py` | `src/tools/agent/read.ts` | Read 工具 |
| `src/synapse/skills/loader.py` | `src/skills/loader.ts` | 技能加载 |
| `src/synapse/cli.py` | `src/entrypoints/cli.tsx` | CLI 入口 |

## 3.6 构建输出结构

```
dist/
├── entrypoints/
│   └── cli.js              # 编译后的 CLI 入口
├── core/
│   ├── agent.js
│   ├── llm.js
│   └── ...
├── tools/
│   ├── base.js
│   ├── bash-router.js
│   └── ...
└── skills/
    └── ...
```

## 3.7 配置文件位置

### 运行时配置

- **环境变量**: `.env`
- **Synapse 配置**: `~/.synapse/`
  - `tools/` - 工具定义
  - `skills/` - 技能定义

### 项目配置

- **TypeScript**: `tsconfig.json`
- **Bun**: `bunfig.toml`
- **ESLint**: `.eslintrc.json`
- **Prettier**: `.prettierrc.json`
- **Git**: `.gitignore`

## 3.8 文件大小建议

- **单个文件**: < 500 行
- **模块职责**: 单一职责原则
- **超过限制**: 拆分为多个文件

## 3.9 代码组织原则

1. ✅ **按功能模块划分**：core, tools, skills, cli
2. ✅ **深度不超过 3 层**：src/tools/agent/read.ts
3. ✅ **相关文件聚合**：同一功能的文件放在同一目录
4. ✅ **测试对应源码**：tests/ 结构镜像 src/
5. ✅ **配置文件集中**：项目根目录
