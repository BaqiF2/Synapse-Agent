/**
 * TodoStore - in-memory task list store
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

  constructor(clock: Clock = () => new Date()) {
    this.clock = clock;
    this.state = { items: [], updatedAt: this.clock() };
  }

  /** 全量替换任务列表 */
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

  /** 注册变更监听器 */
  onChange(listener: TodoChangeListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

// 单例导出
export const todoStore = new TodoStore();
