# TodoWrite 工具设计文档

## 概述

TodoWrite 是一个全量替换式的任务列表管理工具，作为 Layer 2 Agent Shell Command 实现。每次调用时传入完整的待办列表，系统用新列表完全覆盖旧列表。

### 核心特性

- **全量替换** - 非增量更新，每次传入完整列表
- **状态驱动** - 通过 status 字段推进任务：`pending` → `in_progress` → `completed`
- **双形式描述** - `content`（做什么）+ `activeForm`（正在做什么）
- **用户可见** - 任务列表实时渲染到终端
- **纯内存存储** - REPL 退出即清空

---

## 数据结构

### TodoItem

```typescript
interface TodoItem {
  /** 任务内容 - 描述做什么（祈使句） */
  content: string;

  /** 活动形式 - 描述正在做什么（现在进行时） */
  activeForm: string;

  /** 任务状态 */
  status: 'pending' | 'in_progress' | 'completed';
}
```

### TodoState

```typescript
interface TodoState {
  /** 当前任务列表 */
  items: TodoItem[];

  /** 最后更新时间戳 */
  updatedAt: Date;
}
```

### 命令输入格式

```typescript
interface TodoWriteInput {
  todos: TodoItem[];
}
```

### 示例调用

```bash
TodoWrite '{"todos":[
  {"content":"Analyze requirements","activeForm":"Analyzing requirements","status":"completed"},
  {"content":"Write implementation","activeForm":"Writing implementation","status":"in_progress"},
  {"content":"Run tests","activeForm":"Running tests","status":"pending"}
]}'
```

---

## 组件架构

### 架构图

```
┌─────────────────────────────────────────────────────────┐
│                     BashRouter                          │
│  identifyCommandType("TodoWrite ...") → AGENT_SHELL    │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│              TodoWriteHandler                           │
│  - 解析 JSON 参数                                       │
│  - 验证数据格式（Zod Schema）                           │
│  - 调用 TodoStore.update()                             │
│  - 返回执行结果                                         │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│              TodoStore（单例）                          │
│  - 内存中维护 TodoState                                 │
│  - 提供 update() / get() / clear() 方法               │
│  - 状态变化时触发 onChange 回调                         │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│           TerminalRenderer.renderTodos()               │
│  - 监听 TodoStore.onChange                             │
│  - 实时渲染任务列表到终端                               │
└─────────────────────────────────────────────────────────┘
```

### 文件结构

```
src/tools/handlers/agent-bash/
├── todo/
│   ├── index.ts           # 模块导出
│   ├── todo-write.ts      # TodoWriteHandler 处理器
│   ├── todo-store.ts      # TodoStore 单例状态管理
│   ├── todo-schema.ts     # Zod Schema 定义
│   └── todo-write.md      # 命令说明文档
├── read.ts
├── write.ts
└── ...

src/cli/
└── terminal-renderer.ts   # 新增 renderTodos() 方法
```

---

## 核心组件实现

### TodoWriteHandler

```typescript
// todo/todo-write.ts
export class TodoWriteHandler implements AgentBashHandler {
  async execute(args: string): Promise<CommandResult> {
    // 1. 解析 JSON 参数
    const jsonStr = extractJsonFromArgs(args);
    if (!jsonStr) {
      return { stdout: '', stderr: 'Usage: TodoWrite \'{"todos":[...]}\'', exitCode: 1 };
    }

    // 2. 验证 Schema
    const parseResult = TodoWriteInputSchema.safeParse(JSON.parse(jsonStr));
    if (!parseResult.success) {
      return { stdout: '', stderr: formatZodError(parseResult.error), exitCode: 1 };
    }

    // 3. 更新 TodoStore（全量替换）
    const { todos } = parseResult.data;
    todoStore.update(todos);

    // 4. 返回成功结果
    const summary = buildSummary(todos);
    return { stdout: summary, stderr: '', exitCode: 0 };
  }
}
```

### TodoStore

```typescript
// todo/todo-store.ts
type TodoChangeListener = (state: TodoState) => void;

class TodoStore {
  private state: TodoState = { items: [], updatedAt: new Date() };
  private listeners: TodoChangeListener[] = [];

  /** 全量替换任务列表 */
  update(todos: TodoItem[]): void {
    this.state = { items: todos, updatedAt: new Date() };
    this.notifyListeners();
  }

  /** 获取当前状态 */
  get(): TodoState {
    return this.state;
  }

  /** 清空任务列表 */
  clear(): void {
    this.update([]);
  }

  /** 注册变更监听器 */
  onChange(listener: TodoChangeListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach(l => l(this.state));
  }
}

// 单例导出
export const todoStore = new TodoStore();
```

### 终端渲染

渲染效果：
```
┌─ Tasks ─────────────────────────────────────────────┐
│ ✓ Analyze requirements                              │
│ ● Writing implementation...                         │
│ ○ Run tests                                         │
│ ○ Update documentation                              │
└─────────────────────────────────────────────────────┘
```

图标说明：
- `✓` = completed（灰色）
- `●` = in_progress（黄色/动态，显示 activeForm）
- `○` = pending（暗色，显示 content）

### BashRouter 集成

在 `identifyCommandType()` 中添加识别：

```typescript
if (trimmed.startsWith('TodoWrite')) {
  return CommandType.AGENT_SHELL_COMMAND;
}
```

---

## 系统提示词

新增 `src/tools/handlers/agent-bash/todo/todo-write.md`：

```markdown
## TodoWrite - Task List Management

A full-replacement task list tool for creating and managing structured task lists in the current session. Helps track progress, organize complex tasks, and demonstrate thoroughness to the user.

### Usage

TodoWrite '{"todos":[...]}'

### Parameters

Each todo item requires:
- content (string): Task description in imperative form, e.g., "Write unit tests"
- activeForm (string): Present continuous form, e.g., "Writing unit tests"
- status (string): One of "pending", "in_progress", or "completed"

### When to Use

1. Complex multi-step tasks - When a task requires 3 or more distinct steps
2. Non-trivial and complex tasks - Tasks that require careful planning
3. User explicitly requests a todo list
4. User provides multiple tasks at once
5. After receiving new instructions - Immediately capture user requirements as todos
6. When starting a task - Mark it as in_progress BEFORE beginning work
7. After completing a task - Mark it as completed immediately

### When NOT to Use

1. Single, straightforward task
2. Trivial task where tracking provides no benefit
3. Task can be completed in less than 3 trivial steps
4. Purely conversational or informational requests

### Task States

- pending: Task not yet started
- in_progress: Currently working on (limit to ONE at any time)
- completed: Task finished successfully

### Management Rules

- Update task status in real-time as you work
- Mark tasks complete IMMEDIATELY after finishing (don't batch completions)
- Exactly ONE task must be in_progress at any time (not less, not more)
- Complete current tasks before starting new ones
- Remove tasks that are no longer relevant from the list entirely

### Completion Requirements

ONLY mark a task as completed when you have FULLY accomplished it. Keep as in_progress if:
- Tests are failing
- Implementation is partial
- You encountered unresolved errors
- You hit blockers that need resolution

### Example

TodoWrite '{"todos":[
  {"content":"Analyze requirements","activeForm":"Analyzing requirements","status":"completed"},
  {"content":"Write implementation","activeForm":"Writing implementation","status":"in_progress"},
  {"content":"Run tests","activeForm":"Running tests","status":"pending"}
]}'

Returns: Todo list updated: 1 completed, 1 in_progress, 1 pending
```

---

## 输入验证规则

### 字段验证

**content**：
- 必填，非空字符串
- 最大长度：200 字符
- 不允许仅空白字符

**activeForm**：
- 必填，非空字符串
- 最大长度：200 字符

**status**：
- 必填，枚举值：`pending` | `in_progress` | `completed`

**todos 数组**：
- 允许空数组（清空任务列表）
- 最大长度：50 项

### 错误处理

**JSON 解析失败**：
```
Error: Invalid JSON format
Usage: TodoWrite '{"todos":[{"content":"...","activeForm":"...","status":"pending"}]}'
```

**Schema 验证失败**：
```
Error: Validation failed
- todos[0].content: Required
- todos[1].status: Expected 'pending' | 'in_progress' | 'completed', received 'done'
```

**空参数**：
```
Error: Missing JSON parameter
Usage: TodoWrite '{"todos":[...]}'
```

### 帮助命令

```bash
TodoWrite -h
TodoWrite --help
# 输出命令说明文档
```

---

## 使用流程

```
┌─────────────────────────────────────────────────────────┐
│ 收到用户任务                                            │
└────────────────────────┬────────────────────────────────┘
                         ↓
              ┌──────────┴──────────┐
              │ 任务复杂度判断       │
              └──────────┬──────────┘
           ┌─────────────┼─────────────┐
           ↓             ↓             ↓
      ≥3步骤        <3步骤且简单    用户明确要求
      或复杂             ↓             ↓
           ↓        直接执行      使用 TodoWrite
      使用 TodoWrite  不使用           ↓
           ↓             │             │
           └─────────────┴─────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 分解任务为多个 Todo 项，全部标记 pending                │
│ 调用 TodoWrite 创建列表                                 │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 将第一项标记为 in_progress                              │
│ 执行任务                                                │
└────────────────────────┬────────────────────────────────┘
                         ↓
              ┌──────────┴──────────┐
              │ 任务完成?            │
              └──────────┬──────────┘
           ┌─────────────┼─────────────┐
           ↓             ↓             ↓
          是         遇到阻塞      发现新任务
           ↓             ↓             ↓
    标记 completed  保持 in_progress  添加新项
           ↓        创建阻塞任务    到列表
           ↓             ↓             ↓
           └─────────────┴─────────────┘
                         ↓
              ┌──────────┴──────────┐
              │ 还有 pending 任务?   │
              └──────────┬──────────┘
                    ┌────┴────┐
                    ↓         ↓
                   是        否
                    ↓         ↓
           下一项标记为    全部完成
           in_progress
```

---

## 测试用例

### 正常流程

1. 创建任务列表 → 验证返回摘要正确
2. 更新任务状态 → 验证全量替换生效
3. 清空列表 → 验证空数组处理

### 错误处理

4. 无效 JSON → 验证错误提示
5. 缺失必填字段 → 验证 Schema 错误
6. 无效 status 值 → 验证枚举校验

### 边界情况

7. 空数组 → 验证清空行为
8. 超长 content → 验证长度限制
9. 50+ 项数组 → 验证最大长度限制

### 渲染集成

10. 状态变化 → 验证 onChange 触发
11. 终端渲染 → 验证图标和颜色正确

---

## 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `TODO_MAX_ITEMS` | 50 | 任务列表最大项数 |
| `TODO_MAX_CONTENT_LENGTH` | 200 | content/activeForm 最大字符数 |
