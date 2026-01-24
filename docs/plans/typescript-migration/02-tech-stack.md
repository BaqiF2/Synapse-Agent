# 第二部分：技术栈选型

## ⚠️ 强制验证法则

**在本部分的实施过程中，必须严格遵循以下验证流程：**

### 1. 迁移前检查（Pre-Migration Check）
- [ ] **Python 依赖分析**：详细列出 Python 版本使用的所有依赖包及其用途
- [ ] **功能映射确认**：确认每个 Python 包在 TypeScript 生态中的对应包
- [ ] **API 兼容性评估**：评估 MiniMax API 通过 Anthropic SDK 的兼容性
- [ ] **运行时特性对比**：对比 Python 和 Bun 运行时的差异点

### 2. 迁移后检查（Post-Migration Check）
- [ ] **依赖安装验证**：确保所有依赖包可以正常安装和使用
- [ ] **API 调用测试**：验证 MiniMax API 通过 @anthropic-ai/sdk 正常工作
- [ ] **性能基准测试**：对比 Python 和 TypeScript 版本的性能指标
- [ ] **兼容性测试**：测试所有依赖包的版本兼容性

### 3. PRD 符合性检查（PRD Compliance Check）
- [ ] **工具抽象能力**：验证技术栈支持"一切工具都是 Bash"的抽象能力
- [ ] **扩展性验证**：确保技术栈支持工具转换、技能系统等扩展功能
- [ ] **CLI 交互体验**：验证终端 UI 框架满足 PRD 的交互要求
- [ ] **持久化能力**：验证文件系统操作满足"记忆载体"的要求

**❌ 未完成上述检查清单的任何一项，不得进入下一阶段**

---

## 2.1 核心技术决策

### 运行时环境

**选择：Bun (latest)**

**理由**：
1. ✅ 与 Kode-cli 保持一致
2. ✅ 启动速度更快（比 Node.js 快 4x）
3. ✅ 内置 TypeScript 支持，无需 ts-node
4. ✅ 内置测试运行器，无需 Jest
5. ✅ 更好的 API 性能
6. ✅ 原生支持 `.tsx/.ts` 文件

**配置**：
```toml
# bunfig.toml
[install]
registry = "https://registry.npmjs.org"
```

### 编程语言

**选择：TypeScript 5.9+ (latest)**

**理由**：
1. ✅ 编译时类型检查
2. ✅ 更好的 IDE 支持
3. ✅ 接口和类型定义清晰
4. ✅ 重构更安全

**配置**：
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "types": ["bun-types"]
  }
}
```

## 2.2 依赖包选择

### AI/LLM 集成

**@anthropic-ai/sdk (latest)**
- 用途：MiniMax API 调用（通过兼容模式）
- 配置：
  ```typescript
  ANTHROPIC_API_KEY={minimax api key}
  ANTHROPIC_BASE_URL=https://api.minimaxi.com/anthropic
  MODEL=MiniMax-M2
  ```

### CLI 框架

**commander (latest)**
- 用途：命令行参数解析
- 特性：子命令支持、选项解析、帮助生成

**@commander-js/extra-typings (latest)**
- 用途：Commander 类型增强
- 特性：更好的 TypeScript 类型推导

### 终端 UI

**ink (latest)**
- 用途：React for CLI，构建交互式终端界面
- 特性：组件化开发、状态管理

**@inkjs/ui (latest)**
- 用途：Ink UI 组件库
- 特性：预制组件、样式系统

**chalk (latest)**
- 用途：终端颜色输出
- 特性：链式调用、256 色支持

**cli-table3 (latest)**
- 用途：终端表格展示
- 特性：边框样式、列宽控制

**figures (latest)**
- 用途：Unicode 符号
- 特性：跨平台符号支持

### Markdown & 代码高亮

**marked (latest)**
- 用途：Markdown 解析
- 特性：可扩展渲染器

**cli-highlight (latest)**
- 用途：终端代码语法高亮
- 特性：多语言支持、主题定制

### 工具类库

**glob (latest)**
- 用途：文件模式匹配
- 特性：递归搜索、性能优化

**minimatch (latest)**
- 用途：Glob 模式匹配
- 特性：与 glob 配合使用

**shell-quote (latest)**
- 用途：Shell 命令解析（类似 Python shlex）
- 特性：引号处理、转义支持

**js-yaml (latest)**
- 用途：YAML 解析（技能 frontmatter）
- 特性：安全解析、类型推导

**zod (latest)**
- 用途：运行时类型验证和 schema 定义
- 特性：类型推导、错误消息

**dotenv (latest)**
- 用途：环境变量管理
- 特性：.env 文件加载

**nanoid (latest)**
- 用途：唯一 ID 生成
- 特性：更小、更安全

### 开发工具

**prettier (latest)**
- 用途：代码格式化
- 配置：
  ```json
  {
    "semi": true,
    "singleQuote": true,
    "tabWidth": 2
  }
  ```

**eslint (latest)**
- 用途：代码检查
- 配置：使用 TypeScript ESLint 插件

**@typescript-eslint/eslint-plugin (latest)**
**@typescript-eslint/parser (latest)**
- 用途：TypeScript 代码检查

**@types/node (latest)**
- 用途：Node.js 类型定义

**@types/cli-table3 (latest)**
**@types/js-yaml (latest)**
- 用途：第三方库类型定义

## 2.3 依赖版本策略

### 使用 latest 版本

**理由**：
1. ✅ 获取最新功能和性能改进
2. ✅ 获取最新安全补丁
3. ✅ 避免已知 bug

**安装方式**：
```bash
bun add <package>@latest
```

**package.json 配置**：
```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "latest",
    "chalk": "latest",
    "commander": "latest",
    ...
  }
}
```

### 锁定版本

在生产环境使用 `bun.lockb` 锁定具体版本，确保可重现构建。

## 2.4 Python → TypeScript 依赖映射

| Python 包 | TypeScript 包 | 用途 |
|----------|--------------|-----|
| anthropic | @anthropic-ai/sdk | LLM API |
| click | commander | CLI 框架 |
| rich | ink + chalk | 终端 UI |
| pyyaml | js-yaml | YAML 解析 |
| python-dotenv | dotenv | 环境变量 |
| ruff | eslint + prettier | 代码检查/格式化 |
| pytest | bun test | 测试框架 |

## 2.5 完整依赖列表

### 生产依赖

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "latest",
    "@commander-js/extra-typings": "latest",
    "@inkjs/ui": "latest",
    "chalk": "latest",
    "cli-highlight": "latest",
    "cli-table3": "latest",
    "commander": "latest",
    "dotenv": "latest",
    "figures": "latest",
    "glob": "latest",
    "ink": "latest",
    "js-yaml": "latest",
    "marked": "latest",
    "minimatch": "latest",
    "nanoid": "latest",
    "shell-quote": "latest",
    "zod": "latest"
  }
}
```

### 开发依赖

```json
{
  "devDependencies": {
    "@types/bun": "latest",
    "@types/cli-table3": "latest",
    "@types/js-yaml": "latest",
    "@types/node": "latest",
    "@typescript-eslint/eslint-plugin": "latest",
    "@typescript-eslint/parser": "latest",
    "eslint": "latest",
    "prettier": "latest",
    "typescript": "latest"
  }
}
```

## 2.6 环境要求

### 最低版本

- **Bun**: >= 1.0.0
- **Node.js**: >= 20.0.0（如果使用 Node.js 运行时）
- **TypeScript**: >= 5.0.0

### 推荐版本

- **Bun**: latest stable
- **TypeScript**: latest stable

## 2.7 构建与发布

### 构建脚本

```json
{
  "scripts": {
    "dev": "bun run src/entrypoints/cli.tsx",
    "build": "bun build src/entrypoints/cli.tsx --outdir dist --target bun",
    "start": "bun run dist/entrypoints/cli.js",
    "test": "bun test",
    "format": "prettier --write \"src/**/*.{ts,tsx}\"",
    "lint": "eslint src --ext .ts,.tsx"
  }
}
```

### 入口配置

```json
{
  "bin": {
    "synapse": "./dist/entrypoints/cli.js"
  },
  "type": "module"
}
```

## 2.8 关键技术对比

### Bun vs Node.js

| 特性 | Bun | Node.js |
|-----|-----|---------|
| 启动速度 | ⚡️ 极快 | 🐌 较慢 |
| TypeScript | ✅ 原生支持 | ❌ 需要 ts-node |
| 测试 | ✅ 内置 | ❌ 需要 Jest |
| 包管理 | ✅ 内置 | ❌ 需要 npm/pnpm |
| 生态 | ⚠️ 较新 | ✅ 成熟 |

### ink vs blessed

| 特性 | ink | blessed |
|-----|-----|---------|
| 开发模式 | ✅ React 组件 | ❌ 命令式 |
| 类型支持 | ✅ TypeScript 原生 | ⚠️ 需要 @types |
| 学习曲线 | ✅ 熟悉 React 即可 | ⚠️ 需要学习 API |
| 维护状态 | ✅ 活跃 | ⚠️ 不活跃 |
