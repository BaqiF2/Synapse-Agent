/**
 * 文件功能说明：
 * - 该文件位于 `src/utils/abort.ts`，主要负责 中断 相关实现。
 * - 模块归属 utils 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `createAbortError`
 * - `isAbortError`
 * - `throwIfAborted`
 *
 * 作用说明：
 * - `createAbortError`：用于创建并返回新对象/实例。
 * - `isAbortError`：用于条件判断并返回布尔结果。
 * - `throwIfAborted`：提供该模块的核心能力。
 * @param message 消息内容。
 */

export function createAbortError(message: string = 'Operation aborted'): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

/**
 * 方法说明：判断 isAbortError 对应条件是否成立。
 * @param error 错误对象。
 */
export function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (
      error.name === 'AbortError' ||
      error.message.toLowerCase().includes('aborted')
    )
  );
}

/**
 * 方法说明：执行 throwIfAborted 相关逻辑。
 * @param signal 取消信号。
 */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}
