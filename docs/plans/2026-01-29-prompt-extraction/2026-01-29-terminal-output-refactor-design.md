# 终端输出重构设计方案

## 概述

重构终端输出模块，实现工具调用和 SubAgent 调用过程的树状结构显示。

## 需求总结

| 需求项 | 决策 |
|--------|------|
| 输出详细程度 | 简洁模式，结果截断至100字符 |
| 层级表示符号 | Unicode 树形符号（├─、└─、│） |
| SubAgent 显示 | 完全展开，显示内部每个工具调用及结果 |
| 错误显示 | 红色高亮 + 错误摘要 |
| 工具名称格式 | 统一 `Bash(命令)` 格式 |
| 显示时机 | 追加模式（开始时显示 ⏳，完成后新行显示 ✓/✗） |

## 输出示例

### 普通工具调用

```
• Bash(bun test) ⏳
• Bash(bun test) ✓
└─ PASS src/test.ts (3 tests passed)...
```

### 工具调用失败

```
• Bash(invalid-cmd) ⏳
• Bash(invalid-cmd) ✗
└─ Error: command not found: invalid-cmd
```

### SubAgent 嵌套调用

```
• Skill(enhance conversation)
│ ├─ Bash(read /path/to/file.ts) ⏳
│ ├─ Bash(read /path/to/file.ts) ✓
│ │  └─ 文件内容前100字符...
│ ├─ Bash(grep "pattern" *.ts) ⏳
│ ├─ Bash(grep "pattern" *.ts) ✓
│ │  └─ 搜索结果前100字符...
│ ├─ Bash(edit /path/to/file.ts) ⏳
│ └─ Bash(edit /path/to/file.ts) ✓
│    └─ 编辑完成
└─ [完成]
```

## 架构设计

### 模块结构

```
src/cli/
├── terminal-renderer.ts        # 终端渲染器核心
├── terminal-renderer-types.ts  # 类型定义
├── tree-builder.ts             # 树状结构构建器
└── repl.ts                     # 修改：集成新渲染器
```

### 职责划分

| 模块 | 职责 |
|------|------|
| TerminalRenderer | 管理输出状态、处理工具调用事件、协调显示 |
| TreeBuilder | 构建树状结构、管理层级关系、生成 Unicode 符号 |
| repl.ts | 调用渲染器，传递工具调用事件 |

## 详细设计

### 1. 类型定义 (terminal-renderer-types.ts)

```typescript
export interface ToolCallEvent {
  id: string;              // 唯一标识，用于更新状态
  command: string;         // 命令内容
  parentId?: string;       // SubAgent 父级 ID（嵌套时使用）
  depth: number;           // 嵌套深度（0=顶层，1=SubAgent内部）
}

export interface ToolResultEvent {
  id: string;
  success: boolean;
  output: string;          // 将截断至100字符
}

export interface SubAgentEvent {
  id: string;
  name: string;            // 如 "enhance conversation"
}
```

### 2. TreeBuilder (tree-builder.ts)

```typescript
const TREE_SYMBOLS = {
  BRANCH: '├─',      // 中间节点
  LAST: '└─',        // 最后节点
  VERTICAL: '│',     // 垂直连接线
  SPACE: '  ',       // 缩进空格
};

class TreeBuilder {
  // 生成前缀符号
  getPrefix(depth: number, isLast: boolean): string;

  // 生成结果行前缀（比工具行多一层缩进）
  getResultPrefix(depth: number, isLast: boolean): string;

  // 截断文本至指定长度
  truncate(text: string, maxLength: number): string;
}
```

### 3. TerminalRenderer (terminal-renderer.ts)

```typescript
const STATUS_ICONS = {
  PENDING: '⏳',    // 执行中
  SUCCESS: '✓',    // 成功
  FAILURE: '✗',    // 失败
};

const COLORS = {
  toolName: chalk.yellow,       // Bash(xxx) 黄色
  pending: chalk.gray,          // ⏳ 灰色
  success: chalk.green,         // ✓ 绿色
  failure: chalk.red,           // ✗ 红色
  output: chalk.gray,           // 结果内容 灰色
  errorOutput: chalk.red,       // 错误内容 红色
  treeSymbol: chalk.gray,       // 树形符号 灰色
  bullet: chalk.cyan,           // • 青色
};

class TerminalRenderer {
  private treeBuilder: TreeBuilder;

  // 工具开始执行时调用
  renderToolStart(event: ToolCallEvent): void;

  // 工具执行完成时调用
  renderToolEnd(event: ToolResultEvent): void;

  // SubAgent 开始时调用
  renderSubAgentStart(event: SubAgentEvent): void;

  // SubAgent 结束时调用
  renderSubAgentEnd(id: string): void;
}
```

## 集成方案

### 修改 agent-runner.ts

增强 `ToolCallInfo` 接口：

```typescript
interface ToolCallInfo {
  id: string;           // 新增：唯一ID
  name: string;
  input: Record<string, unknown>;
  success: boolean;
  output: string;
  agentTag: string;
  depth: number;        // 新增：嵌套深度
  parentId?: string;    // 新增：父级ID
}
```

### 修改 repl.ts

替换现有回调：

```typescript
const renderer = new TerminalRenderer();

// 工具开始
onToolStart: (info) => {
  renderer.renderToolStart(info);
},

// 工具完成
onToolEnd: (info) => {
  renderer.renderToolEnd(info);
},
```

### 修改 skill-sub-agent.ts

传递 `depth` 和 `parentId` 给内部工具调用。

## 实现顺序

1. 创建类型定义 `terminal-renderer-types.ts`
2. 实现 `tree-builder.ts`
3. 实现 `terminal-renderer.ts`
4. 修改 `agent-runner.ts` 增强接口
5. 修改 `skill-sub-agent.ts` 传递嵌套信息
6. 修改 `repl.ts` 集成渲染器
7. 测试验证

## 文件清单

### 新增文件

| 文件 | 预估行数 | 说明 |
|------|----------|------|
| `src/cli/terminal-renderer-types.ts` | ~40 | 类型定义 |
| `src/cli/tree-builder.ts` | ~80 | 树状结构生成 |
| `src/cli/terminal-renderer.ts` | ~150 | 终端渲染器核心 |

### 修改文件

| 文件 | 说明 |
|------|------|
| `src/agent/agent-runner.ts` | 增强 ToolCallInfo 接口 |
| `src/agent/skill-sub-agent.ts` | 传递嵌套层级信息 |
| `src/cli/repl.ts` | 集成新渲染器 |

## 常量配置

| 常量 | 值 | 说明 |
|------|-----|------|
| MAX_OUTPUT_LENGTH | 100 | 工具输出最大截断长度 |
| STATUS_PENDING | ⏳ | 执行中状态图标 |
| STATUS_SUCCESS | ✓ | 成功状态图标 |
| STATUS_FAILURE | ✗ | 失败状态图标 |
