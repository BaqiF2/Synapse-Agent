# Todo 固定底部显示设计

## 概述

解决 TodoWrite 工具渲染的任务列表随终端日志滚动的问题，使 Todo 区域固定显示在终端底部。

## 设计决策

| 项目 | 决策 |
|------|------|
| 方案 | ANSI 滚动区域控制 |
| 布局 | 滚动区 → 输入行 → Todo 固定区（底部） |
| 固定区高度 | 最大 8 行 |
| 溢出处理 | 按优先级截断 + "...and N more" |
| 空列表 | 完全隐藏固定区 |
| resize | 自动重绘 |
| 非 TTY | 降级为普通输出 |
| 最小终端高度 | 12 行 |

## 终端布局

```
┌─────────────────────────────────┐
│     滚动区域（日志输出）          │
│     • Bash(git status)          │
│     Agent> 正在执行...           │
├─────────────────────────────────┤
│  You> [用户输入]                 │  ← 滚动区最后一行
├─────────────────────────────────┤
│  ▌ Tasks                        │  ← 固定区（最大 8 行）
│  ▌  ● Doing something...        │     使用左侧着色块设计
│  ▌  ○ Pending task              │
└─────────────────────────────────┘
```

## 核心架构

### 新增模块

```
src/cli/
└── fixed-bottom-renderer.ts   # 固定底部区域管理器
```

### 模块关系

```
TerminalRenderer（保持不变，负责工具调用渲染）
       ↓ 输出到滚动区域
FixedBottomRenderer（新增，管理分区）
       ↓ 监听
TodoStore（保持不变）
```

### 关键 ANSI 序列

| 序列 | 作用 |
|------|------|
| `\x1b[{top};{bottom}r` | 设置滚动区域范围 |
| `\x1b[{row};{col}H` | 光标定位到固定区域 |
| `\x1b[K` | 清除当前行 |
| `\x1b[s` / `\x1b[u` | 保存/恢复光标位置 |

## 状态与生命周期

### FixedBottomRenderer 状态

```typescript
interface FixedBottomState {
  enabled: boolean;        // 是否启用固定区域
  totalRows: number;       // 终端总行数
  fixedHeight: number;     // 当前固定区高度（0-8）
  todoItems: TodoItem[];   // 当前任务列表
}
```

### 生命周期

| 阶段 | 触发条件 | 行为 |
|------|----------|------|
| 初始化 | REPL 启动 | 获取终端尺寸，初始状态 `enabled=true, fixedHeight=0` |
| 激活 | TodoStore 变为非空 | 计算高度，设置滚动区域，渲染 Todo |
| 更新 | TodoStore 状态变化 | 重新计算高度，必要时调整滚动区域，重绘 Todo |
| 停用 | TodoStore 变为空 | 重置滚动区域为全屏，清除固定区 |
| 重排 | 终端 resize | 重新获取尺寸，重新设置滚动区域和固定区 |
| 销毁 | REPL 退出 | 重置滚动区域，恢复终端状态 |

## 渲染流程

### 滚动区域计算示例

```
终端高度 = 24 行
固定区高度 = 4 行（1 行标题 + 3 个任务）
滚动区域 = 第 1 行到第 20 行（24 - 4 = 20）
输入行位置 = 第 20 行（滚动区最后一行）
固定区位置 = 第 21-24 行
```

### Todo 渲染流程

1. 保存当前光标位置
2. 移动光标到固定区起始行
3. 清除整个固定区（逐行 `\x1b[K`）
4. 一次性写入完整的 Todo 块（标题行 + 所有任务行）
5. 恢复光标位置

> Todo 逻辑为全局替换，每次 `TodoStore.update()` 触发时直接全量重绘固定区，无需差异对比。

### 高度计算规则

- 标题行占 1 行（`▌ Tasks`）
- 每个任务占 1 行
- 溢出提示占 1 行（如有）
- 总高度 = min(1 + 任务数 + 溢出行, 8)

### 溢出处理

```
最大显示任务数 = 8 - 1(标题) - 1(溢出提示) = 6 个
实际限制为 5 个以保留空间
若任务数 > 5：
  按优先级排序显示前 5 个
  最后一行显示 "...and {N} more"
```

### 任务显示优先级

从高到低排序，空间不足时从低优先级开始截断：

1. `in_progress` - 进行中
2. `pending` - 待处理
3. `completed` - 已完成

## 边界情况处理

| 场景 | 处理方式 |
|------|----------|
| 非 TTY 环境（如管道输出） | 禁用固定区，回退到 `console.log()` 行为 |
| 终端高度过小（< 12 行） | 禁用固定区，回退普通输出 |
| 任务为空 | 重置滚动区域为全屏，不渲染固定区 |
| 快速连续更新 | 直接覆盖渲染，无需节流 |
| REPL 退出 | 重置滚动区域，清除固定区，恢复终端默认状态 |
| resize 到更小 | 重新计算，必要时截断更多任务 |
| resize 到更大 | 重新计算，可能显示更多任务（仍受 8 行上限） |

## 接口设计

### FixedBottomRenderer

```typescript
interface FixedBottomRendererOptions {
  maxHeight?: number;           // 默认 8
  minTerminalHeight?: number;   // 默认 12
}

class FixedBottomRenderer {
  constructor(options?: FixedBottomRendererOptions);

  // 绑定 TodoStore，返回取消订阅函数
  attachTodoStore(store: TodoStore): () => void;

  // 手动触发重绘
  refresh(): void;

  // 清理资源，恢复终端状态
  dispose(): void;
}
```

### 集成点修改

**`src/cli/repl.ts`**：

```typescript
// 替换原有的 attachTodoStore 调用
const fixedRenderer = new FixedBottomRenderer();
fixedRenderer.attachTodoStore(todoStore);

// REPL 退出时
fixedRenderer.dispose();
```

**`src/cli/terminal-renderer.ts`**：

- 移除 `attachTodoStore()` 方法
- 移除 `renderTodos()` 方法
- 移除 `todoUnsubscribe` 属性
- 其余保持不变

## 测试场景

1. **基本渲染**：TodoStore 更新时，固定区正确显示任务列表
2. **空列表**：任务清空时，固定区消失，滚动区扩展
3. **溢出截断**：超过 5 个任务时，按优先级显示并显示溢出提示
4. **resize 处理**：终端大小变化时，正确重绘布局
5. **非 TTY 降级**：管道输出时，回退到普通 console.log
6. **终端过小**：高度 < 12 行时，禁用固定区
7. **生命周期**：REPL 退出时，终端状态正确恢复
