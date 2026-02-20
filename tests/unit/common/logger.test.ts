/**
 * Logger 单元测试 — 验证日志基础设施的核心功能。
 * 测试目标: createLogger / createChildLogger / withCorrelationId。
 */

import { describe, expect, it } from 'bun:test';
import { createLogger, createChildLogger, withCorrelationId, getCorrelationId } from '../../../src/shared/logger.ts';

describe('createLogger', () => {
  it('should create a logger instance', () => {
    const logger = createLogger({ level: 'silent' });
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('should create a logger with custom name', () => {
    const logger = createLogger({ name: 'test-logger', level: 'silent' });
    expect(logger).toBeDefined();
  });
});

describe('createChildLogger', () => {
  it('should create a child logger with module context', () => {
    const parent = createLogger({ level: 'silent' });
    const child = createChildLogger(parent, 'core.agent-loop');
    expect(child).toBeDefined();
    expect(typeof child.info).toBe('function');
  });
});

describe('withCorrelationId', () => {
  it('should set and retrieve correlation ID within context', () => {
    const testId = 'corr-test-123';

    withCorrelationId(testId, () => {
      const retrieved = getCorrelationId();
      expect(retrieved).toBe(testId);
    });
  });

  it('should return undefined outside of context', () => {
    const id = getCorrelationId();
    expect(id).toBeUndefined();
  });

  it('should support nested contexts', () => {
    withCorrelationId('outer-id', () => {
      expect(getCorrelationId()).toBe('outer-id');

      withCorrelationId('inner-id', () => {
        expect(getCorrelationId()).toBe('inner-id');
      });

      // 外层上下文恢复
      expect(getCorrelationId()).toBe('outer-id');
    });
  });
});
