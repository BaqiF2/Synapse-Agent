# 第八部分：实施计划与验证

## ⚠️ 强制验证法则

**在本部分的实施过程中，必须严格遵循以下验证流程：**

### 1. 迁移前检查（Pre-Migration Check）
- [ ] **完整功能清单**：基于 Python 源码创建完整的功能清单和验收标准
- [ ] **测试用例收集**：收集 Python 版本的所有测试用例作为验证基准
- [ ] **性能基准记录**：记录 Python 版本的性能指标（启动时间、执行速度）
- [ ] **依赖关系图**：绘制模块间的依赖关系，确定实施顺序

### 2. 迁移后检查（Post-Migration Check）
- [ ] **功能回归测试**：执行完整的功能回归测试套件
- [ ] **性能对比测试**：对比 TypeScript 和 Python 版本的性能指标
- [ ] **端到端测试**：执行 PRD 中定义的所有使用场景
- [ ] **文档完整性检查**：确保所有文档、注释、README 完整准确

### 3. PRD 符合性检查（PRD Compliance Check）
- [ ] **核心理念验证矩阵**：
  - [ ] 统一抽象层：一切工具通过 Bash 调用
  - [ ] 功能即工具：所有扩展通过工具实现
  - [ ] 智能涌现：技能+LLM 产生学习能力
  - [ ] 沙盒定位：作为工程实现的工作台
- [ ] **使用场景完整覆盖**：
  - [ ] 技能从零到有（自动生成技能）
  - [ ] 技能持续强化（优化工具调用）
  - [ ] 外源技能融合（导入外部技能）
  - [ ] 工具转换为 Bash（MCP/FC/Skills 转换）
- [ ] **非功能性需求**：
  - [ ] 响应时间：< 2s（简单查询）
  - [ ] 并发能力：支持多个 Agent 实例
  - [ ] 资源占用：内存 < 500MB
  - [ ] 错误率：< 5%

**❌ 未完成上述检查清单的任何一项，不得发布版本**

---

## 8.1 开发路线图

### 总体时间线：12 周

```
Week 1-2:  基础设施搭建
Week 3-4:  核心模块实现
Week 5-6:  工具系统实现
Week 7-8:  技能系统实现
Week 9-10: CLI 层实现
Week 11:   测试和验证
Week 12:   文档和发布
```

## 8.2 阶段一：基础设施搭建 (Week 1-2)

### 任务清单

**Week 1: 项目初始化**

- [ ] 创建 TypeScript 项目结构
  - [ ] 初始化 `package.json`
  - [ ] 配置 `tsconfig.json`
  - [ ] 配置 `bunfig.toml`
  - [ ] 设置 ESLint 和 Prettier
  - [ ] 创建 `.gitignore`

- [ ] 安装核心依赖
  ```bash
  bun add @anthropic-ai/sdk@latest
  bun add commander@latest @commander-js/extra-typings@latest
  bun add ink@latest @inkjs/ui@latest
  bun add chalk@latest cli-table3@latest
  bun add marked@latest cli-highlight@latest
  bun add glob@latest shell-quote@latest
  bun add js-yaml@latest zod@latest
  bun add dotenv@latest nanoid@latest
  ```

- [ ] 安装开发依赖
  ```bash
  bun add -d typescript@latest
  bun add -d @types/node@latest
  bun add -d @types/cli-table3@latest
  bun add -d @types/js-yaml@latest
  bun add -d @typescript-eslint/parser@latest
  bun add -d @typescript-eslint/eslint-plugin@latest
  bun add -d prettier@latest
  ```

- [ ] 创建目录结构
  ```bash
  mkdir -p src/{core,tools/{agent,converters,field},skills,cli/{commands,components},utils,entrypoints}
  mkdir -p tests/{unit,integration,e2e}
  mkdir -p docs/{plans,testing}
  ```

**Week 2: 基础类型和配置**

- [ ] 实现核心类型 (`src/core/types.ts`)
  - [ ] `ToolCallStep` 接口
  - [ ] `AgentResult` 接口
  - [ ] Anthropic 类型导出

- [ ] 实现配置管理 (`src/core/config.ts`)
  - [ ] `Config` 接口
  - [ ] `SynapseConfig` 类
  - [ ] `getConfig()` 工厂函数
  - [ ] 环境变量加载
  - [ ] 配置验证

- [ ] 实现工具基础类型 (`src/tools/base.ts`)
  - [ ] `ToolResult` 类
  - [ ] `ToolError` 异常
  - [ ] `BaseTool` 抽象类
  - [ ] `ToolSchema` 接口

- [ ] 编写单元测试
  - [ ] `config.test.ts`
  - [ ] `tool-result.test.ts`

**验收标准：**
- ✅ 项目可以成功构建
- ✅ 所有依赖正确安装
- ✅ 基础类型测试通过
- ✅ 配置加载和验证正常工作

## 8.3 阶段二：核心模块实现 (Week 3-4)

### 任务清单

**Week 3: LLM 客户端和 Agent**

- [ ] 实现 LLM 客户端 (`src/core/llm.ts`)
  - [ ] `BASH_TOOL` 定义
  - [ ] `LLMClient` 类
  - [ ] `createMessage()` 方法
  - [ ] `createLLMClient()` 工厂函数

- [ ] 实现系统提示词 (`src/core/prompts.ts`)
  - [ ] `DEFAULT_SYSTEM_PROMPT`
  - [ ] `SKILL_SEARCH_PROMPT`
  - [ ] `SKILL_ENHANCEMENT_PROMPT`

- [ ] 实现 Agent 配置 (`src/core/agent-config.ts`)
  - [ ] `AgentConfig` 接口
  - [ ] `DEFAULT_AGENT_CONFIG`

- [ ] 编写单元测试
  - [ ] `llm.test.ts`
  - [ ] `prompts.test.ts`

**Week 4: Agent 主循环**

- [ ] 实现 Agent 主类 (`src/core/agent.ts`)
  - [ ] 构造函数
  - [ ] `run()` 主循环
  - [ ] `executeTools()` 工具执行
  - [ ] `setSystemPrompt()` 方法
  - [ ] `registerTool()` 方法
  - [ ] `listTools()` 方法
  - [ ] `clearHistory()` 方法
  - [ ] `executeBash()` 直接执行

- [ ] 编写集成测试
  - [ ] `agent-loop.test.ts` - 测试主循环
  - [ ] `agent-tools.test.ts` - 测试工具调用

**验收标准：**
- ✅ Agent 可以成功调用 LLM
- ✅ 工具调用循环正常工作
- ✅ 对话历史正确维护
- ✅ 错误处理正确

## 8.4 阶段三：工具系统实现 (Week 5-6)

### 任务清单

**Week 5: BashRouter 和 BashSession**

- [ ] 实现 BashSession (`src/tools/bash-session.ts`)
  - [ ] 持久 Shell 会话管理
  - [ ] `execute()` 命令执行
  - [ ] 环境变量维护
  - [ ] 工作目录跟踪
  - [ ] 超时和输出限制

- [ ] 实现 BashRouter (`src/tools/bash-router.ts`)
  - [ ] `ParsedCommand` 接口
  - [ ] `parse()` 命令解析
  - [ ] `parseValue()` 类型转换
  - [ ] `execute()` 命令执行
  - [ ] `routeToBash()` 原生命令路由
  - [ ] `routeToTool()` 工具路由
  - [ ] `handleHelp()` 帮助处理

- [ ] 实现工具注册表 (`src/tools/registry.ts`)
  - [ ] `ToolRegistry` 类
  - [ ] `register()` 注册工具
  - [ ] `get()` 获取工具
  - [ ] `execute()` 执行工具
  - [ ] `listNames()` 列出工具名

- [ ] 编写单元测试
  - [ ] `bash-session.test.ts`
  - [ ] `bash-router.test.ts`
  - [ ] `registry.test.ts`

**Week 6: Agent Bash 工具**

- [ ] 实现 ReadTool (`src/tools/agent/read.ts`)
  - [ ] 路径展开和验证
  - [ ] 文件读取
  - [ ] offset/limit 支持
  - [ ] 行号显示

- [ ] 实现 WriteTool (`src/tools/agent/write.ts`)
  - [ ] 文件写入
  - [ ] 目录创建
  - [ ] 错误处理

- [ ] 实现 EditTool (`src/tools/agent/edit.ts`)
  - [ ] 字符串替换
  - [ ] replace_all 支持
  - [ ] 唯一性验证

- [ ] 实现 GrepTool (`src/tools/agent/grep.ts`)
  - [ ] 内容搜索
  - [ ] glob 过滤
  - [ ] 大小写忽略

- [ ] 实现 GlobTool (`src/tools/agent/glob.ts`)
  - [ ] 文件模式匹配
  - [ ] 递归搜索

- [ ] 编写单元测试
  - [ ] `read.test.ts`
  - [ ] `write.test.ts`
  - [ ] `edit.test.ts`
  - [ ] `grep.test.ts`
  - [ ] `glob.test.ts`

**验收标准：**
- ✅ 所有 Agent Bash 工具正常工作
- ✅ BashRouter 正确解析和路由命令
- ✅ 参数传递和类型转换正确
- ✅ Help 系统正常工作
- ✅ 所有单元测试通过

## 8.5 阶段四：技能系统实现 (Week 7-8)

### 任务清单

**Week 7: 技能加载**

- [ ] 实现技能类型 (`src/skills/types.ts`)
  - [ ] `SkillMetadata` 接口
  - [ ] `Skill` 接口
  - [ ] Zod schema 定义

- [ ] 实现技能加载器 (`src/skills/loader.ts`)
  - [ ] `SkillLoader` 类
  - [ ] `loadMetadata()` 元数据加载
  - [ ] `loadSkill()` 技能加载
  - [ ] `loadFull()` 完整加载
  - [ ] `parseFrontmatter()` frontmatter 解析
  - [ ] `discoverSkills()` 技能发现
  - [ ] `loadReferences()` 引用加载
  - [ ] `discoverScripts()` 脚本发现

- [ ] 编写单元测试
  - [ ] `loader.test.ts`
  - [ ] 创建测试技能文件

**Week 8: 技能索引**

- [ ] 实现技能索引 (`src/skills/index.ts`)
  - [ ] `SkillIndex` 类
  - [ ] `add()` 添加技能
  - [ ] `addMetadata()` 添加元数据
  - [ ] `get()` 获取技能
  - [ ] `search()` 搜索技能
  - [ ] `searchByDomain()` 按域搜索
  - [ ] `listDomains()` 列出域
  - [ ] `save()` 持久化
  - [ ] `load()` 加载索引

- [ ] 编写单元测试
  - [ ] `index.test.ts`

**验收标准：**
- ✅ 技能加载器可以正确解析 SKILL.md
- ✅ 三层加载机制正常工作
- ✅ 技能索引可以持久化和加载
- ✅ 搜索功能正常工作

## 8.6 阶段五：CLI 层实现 (Week 9-10)

### 任务清单

**Week 9: CLI 命令实现**

- [ ] 实现 run 命令 (`src/cli/commands/run.ts`)
  - [ ] 参数解析
  - [ ] Agent 初始化
  - [ ] 查询执行
  - [ ] 结果输出
  - [ ] Verbose 模式

- [ ] 实现 config 命令 (`src/cli/commands/config.ts`)
  - [ ] 配置展示
  - [ ] 表格格式化
  - [ ] 验证报告

- [ ] 实现 tools 命令 (`src/cli/commands/tools.ts`)
  - [ ] 工具列表
  - [ ] 详细模式
  - [ ] 表格展示

- [ ] 实现 skills 命令 (`src/cli/commands/skills.ts`)
  - [ ] 列出技能
  - [ ] 搜索技能
  - [ ] 按域过滤

**Week 10: REPL 和 UI**

- [ ] 实现 chat 命令 (`src/cli/commands/chat.tsx`)
  - [ ] REPL 主循环
  - [ ] 命令处理
  - [ ] Shell 命令执行
  - [ ] 历史管理

- [ ] 实现输出格式化 (`src/cli/formatters/output.ts`)
  - [ ] Markdown 渲染
  - [ ] 代码高亮
  - [ ] 错误格式化

- [ ] 实现 CLI 入口 (`src/entrypoints/cli.tsx`)
  - [ ] Commander 配置
  - [ ] 命令注册
  - [ ] 全局错误处理
  - [ ] Help 输出

**验收标准：**
- ✅ 所有 CLI 命令正常工作
- ✅ REPL 交互流畅
- ✅ 输出格式美观
- ✅ 错误处理完善

## 8.7 阶段六：测试和验证 (Week 11)

### 测试策略

**单元测试**
- 每个模块独立测试
- 覆盖率目标：> 80%
- 使用 Bun 内置测试运行器

**集成测试**
- 模块间交互测试
- Agent + Tools 集成
- Skills + Loader 集成

**端到端测试**
- CLI 命令测试
- 完整工作流测试
- 与 Python 版本对比测试

### 验证方法

**功能对齐验证**

创建验证脚本 (`tests/e2e/alignment-test.ts`):

```typescript
import { Agent } from '../../src/core/agent.js';
import { createLLMClient } from '../../src/core/llm.js';
import { getConfig } from '../../src/core/config.js';

// 测试用例：与 Python 版本相同的查询
const testCases = [
  'read test.txt',
  'write test.txt "Hello World"',
  'edit test.txt "Hello" "Hi"',
  'grep "pattern" .',
  'glob "**/*.ts"',
];

async function runAlignmentTests() {
  const config = getConfig();
  const llm = createLLMClient(config);
  const agent = new Agent(llm);

  for (const testCase of testCases) {
    console.log(`Testing: ${testCase}`);

    // 执行 TypeScript 版本
    const tsResult = await agent.executeBash(testCase);

    // 与 Python 版本对比
    // (需要手动运行 Python 版本并比较输出)
    console.log('TS Result:', tsResult);
  }
}
```

**字段对齐验证**

验证所有数据结构字段与 Python 版本一致:

```typescript
// 验证工具 schema
function validateToolSchemas() {
  const registry = new ToolRegistry();
  const toolNames = registry.listNames();

  for (const name of toolNames) {
    const tool = registry.get(name);
    const schema = tool.getSchema();

    console.log(`Tool: ${name}`);
    console.log('Parameters:', Object.keys(schema.input_schema.properties));

    // 检查是否使用 snake_case
    for (const param of Object.keys(schema.input_schema.properties)) {
      if (!/^[a-z]+(_[a-z]+)*$/.test(param)) {
        console.error(`ERROR: Parameter ${param} is not snake_case`);
      }
    }
  }
}
```

### 任务清单

- [ ] 完成所有单元测试
- [ ] 完成所有集成测试
- [ ] 完成端到端测试
- [ ] 运行对齐验证脚本
- [ ] 修复所有测试失败
- [ ] 达到覆盖率目标

**验收标准：**
- ✅ 所有测试通过
- ✅ 覆盖率 > 80%
- ✅ 与 Python 版本功能完全对齐
- ✅ 所有字段名保持 snake_case

## 8.8 阶段七：文档和发布 (Week 12)

### 文档任务

- [ ] 编写 README.md
  - [ ] 项目介绍
  - [ ] 安装说明
  - [ ] 快速开始
  - [ ] 使用示例
  - [ ] 配置说明

- [ ] 编写 CONTRIBUTING.md
  - [ ] 开发环境设置
  - [ ] 代码规范
  - [ ] 提交流程
  - [ ] 测试要求

- [ ] 编写 API 文档
  - [ ] 核心类文档
  - [ ] 工具接口文档
  - [ ] 技能系统文档

- [ ] 编写迁移指南
  - [ ] Python → TypeScript 迁移说明
  - [ ] 破坏性变更
  - [ ] 配置迁移

### 发布任务

- [ ] 版本号确定
  - [ ] 使用语义化版本
  - [ ] 初始版本：1.0.0

- [ ] 构建发布包
  ```bash
  bun run build
  bun test
  ```

- [ ] 发布到 npm
  ```bash
  npm publish
  ```

- [ ] 创建 GitHub Release
  - [ ] 发布说明
  - [ ] 变更日志
  - [ ] 下载链接

**验收标准：**
- ✅ 文档完整清晰
- ✅ 构建成功
- ✅ 发布包可用
- ✅ GitHub Release 创建

## 8.9 对齐检查清单

### 架构对齐

- [ ] LLM 只使用单个 Bash 工具
- [ ] BashRouter 正确解析命令
- [ ] 工具接收 kwargs 而不是命令行参数
- [ ] 工具返回 ToolResult 类
- [ ] 三层 Bash 架构完整

### 数据结构对齐

- [ ] 所有字段名使用 snake_case
- [ ] ToolCallStep 接口字段一致
- [ ] AgentResult 接口字段一致
- [ ] SkillMetadata 接口字段一致

### 工具对齐

- [ ] ReadTool 参数和行为一致
- [ ] WriteTool 参数和行为一致
- [ ] EditTool 参数和行为一致
- [ ] GrepTool 参数和行为一致
- [ ] GlobTool 参数和行为一致

### CLI 对齐

- [ ] 所有命令名称一致
- [ ] 所有选项名称一致
- [ ] REPL 命令一致
- [ ] 输出格式类似

### 行为对齐

- [ ] offset 使用 1-indexed
- [ ] 路径展开行为一致
- [ ] 错误消息格式一致
- [ ] Help 输出格式一致

## 8.10 风险和缓解措施

### 风险 1: 依赖兼容性问题

**描述**: 使用 latest 版本可能导致 API 不兼容

**缓解**:
- 在开发初期锁定具体版本
- 定期更新依赖并测试
- 使用 bun.lockb 锁定生产版本

### 风险 2: Bun 运行时问题

**描述**: Bun 是较新的运行时，可能存在未知 bug

**缓解**:
- 保持 Bun 版本更新
- 关注 Bun GitHub issues
- 必要时准备 Node.js 降级方案

### 风险 3: 功能对齐偏差

**描述**: TypeScript 版本可能与 Python 版本行为不一致

**缓解**:
- 系统性对比测试
- 使用自动化验证脚本
- 逐个功能点验证

### 风险 4: 性能问题

**描述**: TypeScript 版本可能性能不如 Python 版本

**缓解**:
- 性能基准测试
- 优化关键路径
- 使用 Bun 的性能优势

## 8.11 成功标准

### 功能完整性

- ✅ 所有 Python 功能完整实现
- ✅ 没有功能缺失或降级
- ✅ 新功能经过充分测试

### 质量标准

- ✅ 代码覆盖率 > 80%
- ✅ 所有测试通过
- ✅ 无严重 bug
- ✅ 性能达标

### 文档标准

- ✅ 完整的 API 文档
- ✅ 清晰的使用指南
- ✅ 详细的迁移说明

### 对齐标准

- ✅ 所有字段名与 Python 一致
- ✅ 所有 API 行为与 Python 一致
- ✅ CLI 命令和选项与 Python 一致

## 8.12 维护计划

### 版本发布

- **补丁版本** (1.0.x): Bug 修复，每 2 周
- **次要版本** (1.x.0): 新功能，每 1-2 个月
- **主要版本** (x.0.0): 破坏性变更，按需

### 依赖更新

- 每月检查依赖更新
- 安全补丁立即更新
- 主要版本更新前充分测试

### 社区支持

- GitHub Issues 响应时间 < 48 小时
- Pull Request 审查时间 < 1 周
- 每季度社区调查
