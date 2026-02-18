/**
 * EventStream 实现 — 异步可迭代的事件流。
 * 支持事件迭代消费和 .result 获取最终结果，支持 AbortSignal 中止。
 *
 * 核心导出:
 * - EventStream: 异步事件流类
 * - createEventStream: 创建 EventStream 的工厂函数
 * - EventStreamOptions: 创建选项（含 AbortSignal）
 */

import type { AgentEvent, AgentResult } from './types.ts';

/** EventStream 创建选项 */
export interface EventStreamOptions {
  /** 中止信号，触发后流自动终止并产生 error 事件 */
  signal?: AbortSignal;
}

/**
 * 异步可迭代的事件流。
 * 实现 AsyncIterable<AgentEvent> 协议，同时通过 .result 获取最终结果。
 *
 * 注意：此实现仅支持单个消费者。如果多个消费者同时迭代，
 * 后注册的等待回调会覆盖先注册的，导致前一个消费者挂起。
 * 这是设计意图 —— 每个 EventStream 实例对应一个 Agent 执行上下文。
 */
export class EventStream implements AsyncIterable<AgentEvent> {
  private readonly _events: AgentEvent[] = [];
  private _resolve!: (value: AgentResult) => void;
  private _reject!: (reason: Error) => void;
  private _done = false;
  private _waitResolve: (() => void) | null = null;

  /** 最终结果的 Promise */
  public readonly result: Promise<AgentResult>;

  constructor(options?: EventStreamOptions) {
    this.result = new Promise<AgentResult>((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });

    // AbortSignal 支持
    if (options?.signal) {
      this._setupAbortSignal(options.signal);
    }
  }

  /** 推送事件到流中 */
  emit(event: AgentEvent): void {
    if (this._done) return;
    this._events.push(event);
    // 唤醒等待中的消费者
    if (this._waitResolve) {
      this._waitResolve();
      this._waitResolve = null;
    }
  }

  /** 标记流结束，设置最终结果 */
  complete(result: AgentResult): void {
    if (this._done) return;
    this._done = true;
    this._resolve(result);
    // 唤醒等待中的消费者
    if (this._waitResolve) {
      this._waitResolve();
      this._waitResolve = null;
    }
  }

  /** 标记流异常结束 */
  error(err: Error): void {
    if (this._done) return;
    this._done = true;
    this._reject(err);
    // 唤醒等待中的消费者
    if (this._waitResolve) {
      this._waitResolve();
      this._waitResolve = null;
    }
  }

  /** 实现 AsyncIterable 协议 */
  async *[Symbol.asyncIterator](): AsyncIterator<AgentEvent> {
    let index = 0;

    while (true) {
      // 如果有未消费的事件，立即返回
      if (index < this._events.length) {
        yield this._events[index]!;
        index++;
        continue;
      }

      // 如果流已结束且所有事件都已消费，退出
      if (this._done) {
        break;
      }

      // 等待新事件或流结束
      await new Promise<void>((resolve) => {
        this._waitResolve = resolve;
      });
    }
  }

  /** 设置 AbortSignal 监听，中止时发射 error 事件并终止流 */
  private _setupAbortSignal(signal: AbortSignal): void {
    // 如果信号已经被中止，立即处理
    if (signal.aborted) {
      this._handleAbort();
      return;
    }

    // 监听中止事件
    signal.addEventListener('abort', () => {
      this._handleAbort();
    }, { once: true });
  }

  /** 处理中止：发射 error 事件并终止流 */
  private _handleAbort(): void {
    if (this._done) return;

    // 发射 error 事件，标记为中止
    const abortError = new Error('Operation aborted by AbortSignal');
    this.emit({
      type: 'error',
      error: abortError,
      recoverable: false,
    });

    // 终止流
    this.error(abortError);
  }
}

/**
 * 创建 EventStream 的工厂函数。
 * 返回事件流实例供消费者迭代，同时返回 emit/complete/error 方法供生产者使用。
 */
export function createEventStream(options?: EventStreamOptions): {
  stream: EventStream;
  emit: (event: AgentEvent) => void;
  complete: (result: AgentResult) => void;
  error: (err: Error) => void;
} {
  const stream = new EventStream(options);
  return {
    stream,
    emit: (event) => stream.emit(event),
    complete: (result) => stream.complete(result),
    error: (err) => stream.error(err),
  };
}
