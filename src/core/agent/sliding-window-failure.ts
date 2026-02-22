/**
 * 滑动窗口失败检测机制 — 使用环形缓冲区记录最近 N 次工具调用的成功/失败，
 * 替代"连续失败计数 + 即时重置"的旧策略。
 *
 * 核心导出:
 * - SlidingWindowFailureDetector: 滑动窗口失败检测器，基于环形缓冲区算法
 * - FailureCategory: 失败分类类型，用于区分可计数/不可计数的失败
 * - NON_COUNTABLE_CATEGORIES: 不计入窗口的失败分类集合
 * - DEFAULT_WINDOW_SIZE: 默认窗口大小
 * - DEFAULT_FAILURE_THRESHOLD: 默认失败阈值
 */

/** 失败分类类型 — 用于区分真正失败与不可计数的失败（如用户权限拒绝） */
export type FailureCategory = 'permission_denied' | 'countable';

/** 不计入窗口的失败分类 */
const NON_COUNTABLE_CATEGORIES: ReadonlySet<FailureCategory> = new Set([
  'permission_denied',
]);

/** 默认窗口大小 */
const DEFAULT_WINDOW_SIZE = parseInt(process.env.SYNAPSE_FAILURE_WINDOW_SIZE || '10', 10);

/** 默认失败阈值 */
const DEFAULT_FAILURE_THRESHOLD = parseInt(process.env.SYNAPSE_FAILURE_THRESHOLD || '3', 10);

/** 滑动窗口配置 */
export interface SlidingWindowConfig {
  /** 窗口大小 — 记录最近 N 次工具调用 */
  windowSize?: number;
  /** 失败阈值 — 窗口内失败次数达到此值时触发退出 */
  failureThreshold?: number;
}

/**
 * 滑动窗口失败检测器 — 基于环形缓冲区算法。
 *
 * 使用固定大小的数组作为环形缓冲区，记录最近 N 次工具调用的成功/失败。
 * 当窗口内失败次数达到阈值时，判定应终止循环。
 */
export class SlidingWindowFailureDetector {
  /** 环形缓冲区 — 存储每次调用是否为失败（true=失败） */
  private readonly buffer: boolean[];
  /** 窗口大小 */
  private readonly windowSize: number;
  /** 失败阈值 */
  private readonly failureThreshold: number;
  /** 写入指针 — 指向下一个写入位置 */
  private writeIndex: number;
  /** 缓冲区中的有效数据量（未填满时小于 windowSize） */
  private count: number;
  /** 当前窗口中的失败计数 — 增量维护，避免每次全量扫描 */
  private failureCount: number;

  constructor(config?: SlidingWindowConfig) {
    this.windowSize = config?.windowSize ?? DEFAULT_WINDOW_SIZE;
    this.failureThreshold = config?.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.buffer = new Array<boolean>(this.windowSize).fill(false);
    this.writeIndex = 0;
    this.count = 0;
    this.failureCount = 0;
  }

  /**
   * 记录一次工具调用结果。
   *
   * @param isFailure - 工具是否执行失败
   * @param category - 失败分类，默认为 'countable'；不可计数的分类（如 permission_denied）不计入窗口
   */
  record(isFailure: boolean, category: FailureCategory = 'countable'): void {
    // 不可计数的失败不计入窗口
    if (isFailure && NON_COUNTABLE_CATEGORIES.has(category)) {
      return;
    }

    // 如果窗口已满，移出最旧的记录
    if (this.count >= this.windowSize) {
      const oldValue = this.buffer[this.writeIndex];
      if (oldValue) {
        this.failureCount--;
      }
    }

    // 写入新记录
    this.buffer[this.writeIndex] = isFailure;
    if (isFailure) {
      this.failureCount++;
    }

    // 更新指针和计数
    this.writeIndex = (this.writeIndex + 1) % this.windowSize;
    if (this.count < this.windowSize) {
      this.count++;
    }
  }

  /** 获取当前窗口内的失败次数 */
  getFailureCount(): number {
    return this.failureCount;
  }

  /** 判断是否应终止循环 — 窗口内失败数达到阈值时返回 true */
  shouldStop(): boolean {
    return this.failureCount >= this.failureThreshold;
  }

  /** 获取终止原因 — 达到阈值时返回 'failure_threshold'，否则返回 null */
  getStopReason(): 'failure_threshold' | null {
    return this.shouldStop() ? 'failure_threshold' : null;
  }
}

export { NON_COUNTABLE_CATEGORIES };
