import { describe, expect, it } from 'bun:test';
import { getValueType } from '../../../src/utils/common-util.ts';

describe('getValueType', () => {
  it('should return null for null value', () => {
    expect(getValueType(null)).toBe('null');
  });

  it('should return array for array value', () => {
    expect(getValueType([1, 2, 3])).toBe('array');
  });

  it('should return typeof result for primitive values', () => {
    expect(getValueType(1)).toBe('number');
    expect(getValueType('x')).toBe('string');
    expect(getValueType(false)).toBe('boolean');
    expect(getValueType(undefined)).toBe('undefined');
  });
});
