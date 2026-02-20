/**
 * TodoReminderStrategy — TodoList 的 System Reminder 引导策略。
 * 当 Agent 连续多轮未更新 TodoList 且存在未完成任务时，生成 System Reminder 文本，
 * 注入到下一轮的 messages 中引导 LLM 关注未完成任务。
 *
 * 核心导出:
 * - TodoReminderStrategy: 维护 turn 计数、监听 TodoStore 变更、生成 reminder 文本
 * - TodoReminderResult: check() 方法的返回值，包含是否需要 remind 及 reminder 文本
 * - TodoReminderOptions: 策略配置选项
 */

// core 模块不直接依赖 tools 模块 — 使用最小接口代替具体类型
/** TodoList 任务项最小接口 */
export interface TodoItemLike {
  content: string;
  status: string;
}

/** TodoList 状态最小接口 */
export interface TodoStateLike {
  items: TodoItemLike[];
}

/** TodoStore 最小接口 — 通过依赖注入传入实际实现 */
export interface TodoStoreLike {
  get(): TodoStateLike;
  onChange(listener: (state: TodoStateLike) => void): () => void;
}

// 默认阈值：连续多少轮未更新 TodoList 时触发 reminder
const DEFAULT_STALE_THRESHOLD_TURNS = parseInt(
  process.env.SYNAPSE_TODO_STALE_THRESHOLD || '10',
  10,
);

/** 策略配置选项 */
export interface TodoReminderOptions {
  /** 连续多少轮未更新 TodoList 时触发 reminder */
  staleThresholdTurns?: number;
}

/** check() 方法的返回值 */
export interface TodoReminderResult {
  /** 是否需要注入 reminder */
  shouldRemind: boolean;
  /** reminder 文本内容（仅在 shouldRemind 为 true 时有值） */
  reminder?: string;
  /** 不强制 loop 继续 — 始终为 undefined，LLM 可自主决定 */
  forceLoop?: boolean;
}

/**
 * TodoList System Reminder 引导策略。
 *
 * 使用方式：
 * 1. 创建实例并传入 TodoStore
 * 2. 每轮结束后调用 recordTurn() 递增计数
 * 3. 每轮开始前调用 check() 判断是否需要注入 reminder
 * 4. TodoStore 变更时自动通过 onChange 监听器重置计数
 */
export class TodoReminderStrategy {
  private _turnsSinceLastUpdate = 0;
  private readonly staleThresholdTurns: number;
  private readonly store: TodoStoreLike;
  private readonly unsubscribe: () => void;

  constructor(store: TodoStoreLike, options?: TodoReminderOptions) {
    this.store = store;
    this.staleThresholdTurns = options?.staleThresholdTurns ?? DEFAULT_STALE_THRESHOLD_TURNS;

    // 通过 TodoStore 的 onChange 监听器检测更新并重置计数
    // 注意: onChange 会立即调用一次 listener，我们需要忽略这次初始调用
    let isInitialCall = true;
    this.unsubscribe = store.onChange(() => {
      if (isInitialCall) {
        isInitialCall = false;
        return;
      }
      this._turnsSinceLastUpdate = 0;
    });
  }

  /** 当前距上次 TodoList 更新的轮数 */
  get turnsSinceLastUpdate(): number {
    return this._turnsSinceLastUpdate;
  }

  /** 记录一轮执行完成，递增计数 */
  recordTurn(): void {
    this._turnsSinceLastUpdate++;
  }

  /**
   * 检查是否需要注入 System Reminder。
   *
   * 判断逻辑：
   * 1. TodoList 为空 → 跳过，不注入
   * 2. 无未完成任务（全部 completed）→ 跳过，不注入
   * 3. turnsSinceLastUpdate >= staleThresholdTurns → 注入 reminder
   */
  check(): TodoReminderResult {
    const state = this.store.get();

    // TodoList 为空时跳过检查
    if (state.items.length === 0) {
      return { shouldRemind: false };
    }

    // 筛选未完成任务
    const incompleteTasks = state.items.filter(
      (item: TodoItemLike) => item.status !== 'completed',
    );

    // 无未完成任务时不注入
    if (incompleteTasks.length === 0) {
      return { shouldRemind: false };
    }

    // 未达阈值时不注入
    if (this._turnsSinceLastUpdate < this.staleThresholdTurns) {
      return { shouldRemind: false };
    }

    // 生成 reminder 文本
    const todoList = incompleteTasks
      .map((item: TodoItemLike) => `- [${item.status}] ${item.content}`)
      .join('\n');

    const reminder =
      `[System Reminder] You have incomplete tasks that haven't been updated for ${this._turnsSinceLastUpdate} turns:\n` +
      `${todoList}\n` +
      `Please review and continue working on them, or mark them as completed if done.`;

    return {
      shouldRemind: true,
      reminder,
    };
  }

  /** 销毁策略实例，取消 TodoStore 监听 */
  dispose(): void {
    this.unsubscribe();
  }
}
