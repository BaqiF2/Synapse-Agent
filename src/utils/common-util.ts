/**
 * 方法说明：返回输入值的类型名称，并对 null/array 做显式区分。
 * @param value 输入值。
 */
export function getValueType(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value;
}
