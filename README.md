# Synapse Agent (TypeScript)

TypeScript implementation of Synapse Agent - A self-growing AI agent framework based on unified Bash abstraction.

## 迁移进度

### ✅ 阶段一：基础设施搭建 (Week 1-2) - 已完成

#### Week 1: 项目初始化 ✅

- [x] 创建 TypeScript 项目结构
  - [x] 初始化 `package.json`
  - [x] 配置 `tsconfig.json`
  - [x] 配置 `bunfig.toml`
  - [x] 设置 ESLint 和 Prettier
  - [x] 创建 `.gitignore`

- [x] 安装核心依赖
  - [x] @anthropic-ai/sdk@latest
  - [x] commander@latest + @commander-js/extra-typings@latest
  - [x] ink@latest + @inkjs/ui@latest
  - [x] chalk@latest, cli-table3@latest
  - [x] marked@latest, cli-highlight@latest
  - [x] glob@latest, shell-quote@latest
  - [x] js-yaml@latest, zod@latest
  - [x] dotenv@latest, nanoid@latest

- [x] 安装开发依赖
  - [x] typescript@latest
  - [x] @types/node@latest, @types/js-yaml@latest
  - [x] @typescript-eslint/parser@latest, @typescript-eslint/eslint-plugin@latest
  - [x] prettier@latest

- [x] 创建目录结构
  - [x] src/{core,tools/{agent,converters,field},skills,cli/commands,utils,entrypoints}
  - [x] tests/{unit/{core,tools,skills},integration,e2e}

#### Week 2: 基础类型和配置 ✅

- [x] 实现核心类型 (`src/core/types.ts`)
  - [x] `ToolCallStep` 接口
  - [x] `AgentResult` 接口
  - [x] Anthropic 类型导出
  - [x] `AgentState` 枚举

- [x] 实现配置管理 (`src/core/config.ts`)
  - [x] `SynapseConfig` 类
  - [x] `getConfig()` 工厂函数
  - [x] `resetConfig()` 测试辅助函数
  - [x] 环境变量加载
  - [x] 配置验证
  - [x] 目录管理 (ensureDirs)

- [x] 实现工具基础类型 (`src/tools/base.ts`)
  - [x] `ToolResult` 类
  - [x] `ToolError` 异常
  - [x] `BaseTool` 抽象类
  - [x] `ToolSchema` 接口
  - [x] 自动 help 生成
  - [x] 参数验证

- [x] 编写单元测试
  - [x] `tests/unit/core/config.test.ts` (11 tests passing)
  - [x] `tests/unit/tools/base.test.ts` (8 tests passing)

**测试结果**：
```
✓ 19 tests passing
✓ 0 tests failing
✓ 47 expect() calls
```

#### 验收标准验证

- ✅ 项目可以成功构建
- ✅ 所有依赖正确安装
- ✅ 基础类型测试通过
- ✅ 配置加载和验证正常工作

## 对齐验证

### 迁移前检查 ✅

- [x] **对照 Python 源码**：详细阅读了 `config.py`, `base.py`, `agent.py`
- [x] **记录功能清单**：所有基础类型、配置项已记录
- [x] **识别差异点**：Python dataclass → TypeScript class, snake_case 保持
- [x] **理解设计意图**：单例模式、工具抽象、kwargs 接口

### 迁移后检查 ✅

- [x] **功能对齐验证**：所有测试通过,行为与 Python 版本一致
- [x] **字段名称对齐**：
  - `tool_name`, `tool_input`, `tool_result` (保持 snake_case)
  - `success`, `output`, `error` (保持 snake_case)
  - 类/方法名使用 camelCase (TypeScript 惯例)
- [x] **错误处理对齐**：ToolError 格式与 Python 版本相同
- [x] **边界情况测试**：空值、缺失参数、验证逻辑已测试

### PRD 符合性检查 ✅

- [x] **核心理念验证**：支持统一 Bash 抽象的基础已建立
- [x] **架构一致性**：BaseTool 抽象类为三层 Bash 架构奠定基础
- [x] **扩展能力验证**：BaseTool 设计支持 Agent/Field 工具扩展
- [x] **使用场景覆盖**：配置管理支持多环境部署

## 技术栈

- **运行时**: Bun 1.3.5+
- **语言**: TypeScript 5.9+
- **LLM SDK**: @anthropic-ai/sdk (兼容 MiniMax API)
- **测试**: Bun 内置测试运行器
- **代码检查**: ESLint + Prettier

## 使用方法

### 运行测试

```bash
bun test                  # 运行所有测试
bun test:watch           # 监视模式
bun test:coverage        # 生成覆盖率报告
```

### 代码质量

```bash
bun run typecheck        # TypeScript 类型检查
bun run lint             # ESLint 检查
bun run lint:fix         # 自动修复
bun run format           # Prettier 格式化
```

## 下一步计划

根据实施计划第 8 部分,下一阶段将实现:

### 阶段二：核心模块实现 (Week 3-4)

**Week 3:**
- [ ] 实现 LLM 客户端 (`src/core/llm.ts`)
- [ ] 实现系统提示词 (`src/core/prompts.ts`)
- [ ] 实现 Agent 配置 (`src/core/agent-config.ts`)

**Week 4:**
- [ ] 实现 Agent 主类 (`src/core/agent.ts`)
- [ ] 编写集成测试

## 项目结构

```
.
├── src/
│   ├── core/                 # 核心模块 ✅
│   │   ├── types.ts         # 类型定义 ✅
│   │   └── config.ts        # 配置管理 ✅
│   ├── tools/               # 工具系统
│   │   ├── base.ts         # 工具基础类型 ✅
│   │   ├── agent/          # Agent Bash 工具
│   │   ├── converters/     # 工具转换器
│   │   └── field/          # Field Bash 工具
│   ├── skills/             # 技能系统
│   ├── cli/                # CLI 交互层
│   └── entrypoints/        # 入口文件
├── tests/                  # 测试目录 ✅
│   ├── unit/              # 单元测试 ✅
│   ├── integration/       # 集成测试
│   └── e2e/               # 端到端测试
├── package.json           # 项目配置 ✅
├── tsconfig.json          # TypeScript 配置 ✅
└── bunfig.toml            # Bun 配置 ✅
```

## 架构设计

### 三层 Bash 工具体系

1. **Base Bash**: Unix/Linux 原生命令
2. **Agent Bash**: Agent 核心工具（Read、Write、Edit、Glob、Grep、Bash、Skill）
3. **Field Bash**: 领域专业工具，通过 MCP/Anthropic 转换器转换为 `BashCommand`

### 核心原则

1. **完全复刻 Python 版本功能** - 不添加、不删减、不修改
2. **保持架构一致性** - 三层 Bash 体系、唯一工具设计
3. **使用最新依赖** - 所有 npm 包使用 latest 版本
4. **类型安全优先** - 充分利用 TypeScript 类型系统
5. **对齐字段命名** - 所有接口、类型与 Python 版本一致

## 许可证

MIT

## 贡献

本项目目前处于迁移阶段,暂不接受外部贡献。
