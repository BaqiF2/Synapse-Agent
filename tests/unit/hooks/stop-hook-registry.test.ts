/**
 * StopHookRegistry Tests
 *
 * 测试 StopHookRegistry 的注册、查询、LIFO 执行、错误隔离和全局单例。
 */

import { describe, expect, it, beforeEach } from 'bun:test';
import { StopHookRegistry, stopHookRegistry } from '../../../src/core/hooks/stop-hook-registry.ts';
import type { StopHookContext, HookResult } from '../../../src/core/hooks/types.ts';

// 创建测试用 context
function createTestContext(overrides: Partial<StopHookContext> = {}): StopHookContext {
  return {
    sessionId: 'test-session',
    cwd: '/tmp/test',
    messages: [],
    finalResponse: 'Test response',
    ...overrides,
  };
}

describe('StopHookRegistry - Hook 注册与管理', () => {
  it('注册单个 Hook', () => {
    const registry = new StopHookRegistry();
    const hookFunction = async () => ({ message: 'ok' });

    registry.register('skill-enhance', hookFunction);

    expect(registry.has('skill-enhance')).toBe(true);
  });

  it('注册多个 Hook', () => {
    const registry = new StopHookRegistry();

    registry.register('hook-a', async () => {});
    registry.register('hook-b', async () => {});
    registry.register('hook-c', async () => {});

    expect(registry.getRegisteredHooks()).toEqual(['hook-a', 'hook-b', 'hook-c']);
  });

  it('重复名称注册覆盖', async () => {
    const registry = new StopHookRegistry();
    const context = createTestContext();

    registry.register('test', async () => ({ message: 'result1' }));
    registry.register('test', async () => ({ message: 'result2' }));

    const results = await registry.executeAll(context);

    // 只有 hook2 被执行
    expect(results).toHaveLength(1);
    expect(results[0]?.message).toBe('result2');
  });
});

describe('StopHookRegistry - LIFO 执行顺序', () => {
  it('Hook 按 LIFO 顺序执行', async () => {
    const registry = new StopHookRegistry();
    const context = createTestContext();
    const executionOrder: string[] = [];

    registry.register('hook-first', async () => {
      executionOrder.push('first');
    });
    registry.register('hook-second', async () => {
      executionOrder.push('second');
    });
    registry.register('hook-third', async () => {
      executionOrder.push('third');
    });

    await registry.executeAll(context);

    expect(executionOrder).toEqual(['third', 'second', 'first']);
  });
});

describe('StopHookRegistry - 错误隔离', () => {
  it('单个 Hook 失败不影响其他 Hook', async () => {
    const registry = new StopHookRegistry();
    const context = createTestContext();

    registry.register('hook-success-1', async () => ({ message: 'success1' }));
    registry.register('hook-fail', async () => {
      throw new Error('Hook failed');
    });
    registry.register('hook-success-2', async () => ({ message: 'success2' }));

    const results = await registry.executeAll(context);

    // LIFO 顺序：success-2, fail (被捕获), success-1
    expect(results).toHaveLength(2);
    expect(results[0]?.message).toBe('success2');
    expect(results[1]?.message).toBe('success1');
  });
});

describe('StopHookRegistry - 全局单例导出', () => {
  it('导出全局单例实例', async () => {
    // 从同一模块的两次导入应该是同一个引用
    const { stopHookRegistry: registry2 } = await import('../../../src/core/hooks/stop-hook-registry.ts');

    expect(stopHookRegistry).toBe(registry2);
  });

  it('从 hooks/index 导入 StopHookRegistry', async () => {
    const {
      StopHookRegistry: ImportedClass,
      stopHookRegistry: importedInstance,
    } = await import('../../../src/core/hooks/index.ts');

    expect(ImportedClass).toBeDefined();
    expect(importedInstance).toBeDefined();
    expect(importedInstance).toBeInstanceOf(ImportedClass);
  });
});
