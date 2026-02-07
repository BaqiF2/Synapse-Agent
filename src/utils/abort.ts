/**
 * Abort helpers
 *
 * Shared utilities for creating/detecting AbortError and checking AbortSignal.
 */

export function createAbortError(message: string = 'Operation aborted'): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

export function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (
      error.name === 'AbortError' ||
      error.message.toLowerCase().includes('aborted')
    )
  );
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}
