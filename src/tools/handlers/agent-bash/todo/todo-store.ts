/**
 * 文件功能说明：
 * - 该文件位于 `src/tools/handlers/agent-bash/todo/todo-store.ts`，主要负责 待办、store 相关实现。
 * - 模块归属 工具、处理器、Agent、Bash、待办 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `TodoStore`
 * - `TodoItem`
 * - `TodoState`
 * - `TodoStatus`
 * - `TodoChangeListener`
 * - `todoStore`
 *
 * 作用说明：
 * - `TodoStore`：封装该领域的核心流程与状态管理。
 * - `TodoItem`：定义模块交互的数据结构契约。
 * - `TodoState`：定义模块交互的数据结构契约。
 * - `TodoStatus`：声明类型别名，约束输入输出类型。
 * - `TodoChangeListener`：声明类型别名，约束输入输出类型。
 * - `todoStore`：提供可复用的模块级变量/常量。
 */

export type TodoStatus = 'pending' | 'in_progress' | 'completed';

export interface TodoItem {
  /** 任务内容 - 描述做什么（祈使句） */
  content: string;
  /** 活动形式 - 描述正在做什么（现在进行时） */
  activeForm: string;
  /** 任务状态 */
  status: TodoStatus;
}

export interface TodoState {
  /** 当前任务列表 */
  items: TodoItem[];
  /** 最后更新时间戳 */
  updatedAt: Date;
}

export type TodoChangeListener = (state: TodoState) => void;

type Clock = () => Date;

export class TodoStore {
  private state: TodoState;
  private listeners: Set<TodoChangeListener> = new Set();
  private clock: Clock;

  /**
   * 方法说明：初始化 TodoStore 实例并设置初始状态。
   * @param clock 输入参数。
   */
  constructor(clock: Clock = () => new Date()) {
    this.clock = clock;
    this.state = { items: [], updatedAt: this.clock() };
  }

  /** 全量替换任务列表
   * @param todos 集合数据。
   */
  update(todos: TodoItem[]): void {
    this.state = { items: todos, updatedAt: this.clock() };
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

  /** 注册变更监听器
   * @param listener 集合数据。
   */
  onChange(listener: TodoChangeListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 方法说明：执行 notifyListeners 相关逻辑。
   */
  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

// 单例导出
export const todoStore = new TodoStore();
