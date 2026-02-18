/**
 * 错误类型 单元测试 — 验证统一错误类型体系的正确性。
 * 测试目标: 各错误类型的实例化、属性赋值、继承关系。
 */

import { describe, expect, it } from 'bun:test';
import {
  SynapseError,
  AuthenticationError,
  TimeoutError,
  RateLimitError,
  ModelNotFoundError,
  ContextLengthError,
  StreamInterruptedError,
  FileNotFoundError,
  PermissionError,
  ConfigurationError,
} from '../../../src/common/errors.ts';

describe('SynapseError', () => {
  it('should create a base error with code', () => {
    const err = new SynapseError('test error', 'TEST_CODE');
    expect(err.message).toBe('test error');
    expect(err.code).toBe('TEST_CODE');
    expect(err.name).toBe('SynapseError');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('AuthenticationError', () => {
  it('should include provider name', () => {
    const err = new AuthenticationError('anthropic');
    expect(err.provider).toBe('anthropic');
    expect(err.code).toBe('AUTHENTICATION_ERROR');
    expect(err.message).toContain('anthropic');
    expect(err).toBeInstanceOf(SynapseError);
  });
});

describe('TimeoutError', () => {
  it('should include timeout duration', () => {
    const err = new TimeoutError(30000);
    expect(err.timeoutMs).toBe(30000);
    expect(err.code).toBe('TIMEOUT_ERROR');
    expect(err.message).toContain('30000');
  });
});

describe('RateLimitError', () => {
  it('should include retry after duration', () => {
    const err = new RateLimitError(5000);
    expect(err.retryAfterMs).toBe(5000);
    expect(err.code).toBe('RATE_LIMIT_ERROR');
  });

  it('should handle undefined retryAfterMs', () => {
    const err = new RateLimitError();
    expect(err.retryAfterMs).toBeUndefined();
    expect(err.message).toContain('Rate limit');
  });
});

describe('ModelNotFoundError', () => {
  it('should include model name', () => {
    const err = new ModelNotFoundError('gpt-5-turbo');
    expect(err.model).toBe('gpt-5-turbo');
    expect(err.code).toBe('MODEL_NOT_FOUND_ERROR');
  });
});

describe('ContextLengthError', () => {
  it('should include actual and max tokens', () => {
    const err = new ContextLengthError(150000, 128000);
    expect(err.actualTokens).toBe(150000);
    expect(err.maxTokens).toBe(128000);
    expect(err.code).toBe('CONTEXT_LENGTH_ERROR');
    expect(err.message).toContain('150000');
    expect(err.message).toContain('128000');
  });
});

describe('StreamInterruptedError', () => {
  it('should include partial content', () => {
    const err = new StreamInterruptedError('partial data');
    expect(err.partialContent).toBe('partial data');
    expect(err.code).toBe('STREAM_INTERRUPTED_ERROR');
  });
});

describe('FileNotFoundError', () => {
  it('should include file path', () => {
    const err = new FileNotFoundError('/tmp/missing.txt');
    expect(err.filePath).toBe('/tmp/missing.txt');
    expect(err.code).toBe('FILE_NOT_FOUND_ERROR');
  });
});

describe('PermissionError', () => {
  it('should include resource', () => {
    const err = new PermissionError('/etc/passwd');
    expect(err.resource).toBe('/etc/passwd');
    expect(err.code).toBe('PERMISSION_ERROR');
  });
});

describe('ConfigurationError', () => {
  it('should include message', () => {
    const err = new ConfigurationError('Missing API key');
    expect(err.message).toBe('Missing API key');
    expect(err.code).toBe('CONFIGURATION_ERROR');
  });
});

describe('Error hierarchy', () => {
  it('all errors should be instanceof SynapseError and Error', () => {
    const errors = [
      new AuthenticationError('test'),
      new TimeoutError(1000),
      new RateLimitError(),
      new ModelNotFoundError('test'),
      new ContextLengthError(1, 2),
      new StreamInterruptedError(),
      new FileNotFoundError('/test'),
      new PermissionError('/test'),
      new ConfigurationError('test'),
    ];

    for (const err of errors) {
      expect(err).toBeInstanceOf(SynapseError);
      expect(err).toBeInstanceOf(Error);
    }
  });
});
