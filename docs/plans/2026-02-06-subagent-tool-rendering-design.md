# SubAgent 工具调用渲染设计

## 概述

渲染 SubAgent（Task 工具）执行过程中的内部工具调用，形成清晰的父子树形结构，让用户能够看到 SubAgent 在做什么。

## 设计决策

| 决策点 | 选择 |
|--------|------|
| 渲染范围 | SubAgent 内部工具调用 |
| 树形结构 | 单层嵌套（SubAgent 为父，工具为子） |
| 运行状态 | Task 行 spinner + 计数器，当前工具闪烁 |
| 完成状态 | 保留完整树 + 状态汇总（工具数、耗时） |
| 子工具输出 | 默认隐藏，失败时展开显示 |
| 并行处理 | 顺序渲染，各自独立不交错 |
| 计数时机 | 工具开始时 +1 |

## 视觉效果

### 运行中

```
◐ Task(explore: 查找认证代码) [3 tools]
  ├─ Bash(glob src/**/*.ts)
  ├─ Bash(read src/auth/login.ts)
  └◐ Bash(grep "authenticate")    ← 闪烁动画
```

### 完成（成功）

```
✓ Task(explore: 查找认证代码) [5 tools, 2.3s]
  ├─ Bash(glob src/**/*.ts)
  ├─ Bash(read src/auth/login.ts)
  ├─ Bash(read src/auth/session.ts)
  ├─ Bash(grep "authenticate")
  └─ Bash(grep "token")
```

### 完成（部分失败）

```
✓ Task(explore: 查找认证代码) [5 tools, 2.3s]
  ├─ Bash(glob src/**/*.ts)
  ├✗ Bash(grep "[invalid")
  │   error: Invalid regex pattern
  ├─ Bash(read src/auth/login.ts)
  └─ Bash(grep "authenticate")
```

### 完成（整体失败）

```
✗ Task(explore: 查找认证代码) [3 tools, 1.2s] FAILED
  ├─ Bash(glob src/**/*.ts)
  ├─ Bash(read src/auth.ts)
  └✗ Bash(rm -rf /)
      error: Permission denied
  error: Max iterations exceeded
```

### 并行 SubAgent

```
• Task(explore: 查找认证) ⠋ [2 tools]
  ├─ Bash(glob src/**/*.ts)
  └─ Bash(read src/auth.ts)

• Task(explore: 查找配置) ⠋ [1 tool]
  └─ Bash(glob config/**/*.json)
```

## 颜色规范

| 元素 | 颜色 |
|------|------|
| Task 名称 | `chalk.yellow` |
| 工具计数/耗时 | `chalk.gray` |
| 成功状态 | `chalk.green` |
| 失败状态 | `chalk.red` |
| 进度动画 | `chalk.cyan` ↔ `chalk.gray` |

## 架构设计

### 数据流

```
TaskCommandHandler.execute()
        ↓
SubAgentManager.execute()
        ↓
AgentRunner.run()  ← 工具调用时发出事件
        ↓
TerminalRenderer  ← 接收事件并渲染
```

### 新增类型定义

```typescript
// terminal-renderer-types.ts

/** SubAgent 工具调用事件 */
export interface SubAgentToolCallEvent extends ToolCallEvent {
  /** SubAgent 实例 ID */
  subAgentId: string;
  /** SubAgent 类型 */
  subAgentType: SubAgentType;
  /** SubAgent 描述（显示用） */
  subAgentDescription: string;
}

/** SubAgent 完成事件 */
export interface SubAgentCompleteEvent {
  id: string;
  success: boolean;
  /** 总工具调用次数 */
  toolCount: number;
  /** 执行耗时（毫秒） */
  duration: number;
  /** 失败时的错误信息 */
  error?: string;
}
```

### AgentRunner 扩展

```typescript
// agent-runner.ts

export interface AgentRunnerOptions {
  // ... 现有字段

  /** 工具调用开始回调 */
  onToolStart?: (event: ToolCallEvent) => void;
  /** 工具调用结束回调 */
  onToolEnd?: (event: ToolResultEvent) => void;
}
```

### TerminalRenderer 扩展

```typescript
// terminal-renderer.ts

/** 活跃的 SubAgent 状态 */
interface ActiveSubAgent {
  id: string;
  type: SubAgentType;
  description: string;
  /** 开始时间（用于计算耗时） */
  startTime: number;
  /** 已执行的工具数 */
  toolCount: number;
  /** 子工具 ID 列表（保持顺序） */
  toolIds: string[];
  /** 当前行是否打开（用于原地更新） */
  lineOpen: boolean;
  /** 待渲染的工具事件队列（并行时使用） */
  pendingTools: ToolCallEvent[];
  /** 是否正在渲染 */
  isRendering: boolean;
}

/** 新增方法 */
renderSubAgentToolStart(event: SubAgentToolCallEvent): void;
renderSubAgentToolEnd(event: ToolResultEvent): void;
renderSubAgentComplete(event: SubAgentCompleteEvent): void;
```

### 状态机

```
PENDING → RUNNING → COMPLETED/FAILED
```

- **PENDING**: 灰色空心圆，尚无子工具
- **RUNNING**: 青色 spinner + 计数器，当前工具闪烁
- **COMPLETED**: 绿色 ✓ + 汇总信息
- **FAILED**: 红色 ✗ + 错误信息

### Depth 计算

- SubAgent 本身：`depth = 0`
- SubAgent 内部工具：`depth = 1`
- 嵌套 SubAgent（未来）：`depth = parentDepth + 1`

## 并行处理策略

多个 SubAgent 并行时，每个独立渲染自己的树：

1. 如果当前没有其他 SubAgent 在渲染 → 直接渲染
2. 如果有其他 SubAgent 在渲染 → 加入队列等待
3. 当前 SubAgent 完成后 → 触发下一个队列的渲染

不同 SubAgent 之间用空行分隔。

## 错误处理

### 子工具失败

- 显示红色 ✗
- 展开显示错误信息（最多 5 行）
- SubAgent 可能继续执行后续工具

### SubAgent 整体失败

- Task 行显示红色 ✗ 和 FAILED 标记
- 保留已执行的工具树
- 底部显示整体错误原因

### 超时

- 显示 TIMEOUT 标记
- 可选择截断过长的工具列表

### 非 TTY 环境

- 禁用所有动画
- 直接输出静态日志格式
- 保持树形结构但无颜色

## 实现检查清单

- [ ] 扩展 `terminal-renderer-types.ts` 添加新类型
- [ ] 修改 `AgentRunner` 支持工具调用回调
- [ ] 扩展 `TerminalRenderer` 添加 SubAgent 渲染方法
- [ ] 修改 `SubAgentManager` 注入渲染回调
- [ ] 添加并行渲染队列机制
- [ ] 处理非 TTY 环境
- [ ] 编写单元测试
- [ ] 编写集成测试
