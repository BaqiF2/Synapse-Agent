/**
 * 方法说明：读取并返回错误信息文本。
 * @param error 错误对象。
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
