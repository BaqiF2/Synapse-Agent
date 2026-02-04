import { describe, expect, it } from 'bun:test';
import { TodoStore, type TodoItem } from '../../../src/tools/handlers/agent-bash/todo/todo-store.ts';

describe('TodoStore', () => {
  it('update 全量替换任务列表并刷新更新时间', () => {
    const times = [new Date('2024-01-01T00:00:00Z'), new Date('2024-01-01T00:00:10Z')];
    const store = new TodoStore(() => times.shift() ?? new Date());

    store.update([
      { content: 'A', activeForm: 'Doing A', status: 'pending' },
    ]);

    const state = store.get();
    expect(state.items).toHaveLength(1);
    expect(state.items[0]?.content).toBe('A');
    expect(state.updatedAt.toISOString()).toBe('2024-01-01T00:00:10.000Z');
  });

  it('clear 清空任务列表', () => {
    const times = [
      new Date('2024-01-01T00:00:00Z'),
      new Date('2024-01-01T00:00:05Z'),
      new Date('2024-01-01T00:00:10Z'),
    ];
    const store = new TodoStore(() => times.shift() ?? new Date());

    store.update([
      { content: 'A', activeForm: 'Doing A', status: 'pending' },
      { content: 'B', activeForm: 'Doing B', status: 'pending' },
    ]);

    store.clear();

    const state = store.get();
    expect(state.items).toHaveLength(0);
    expect(state.updatedAt.toISOString()).toBe('2024-01-01T00:00:10.000Z');
  });

  it('onChange 注册后立即回调当前状态', () => {
    const store = new TodoStore(() => new Date('2024-01-01T00:00:00Z'));

    let calls = 0;
    let lastState = store.get();

    store.onChange((state) => {
      calls += 1;
      lastState = state;
    });

    expect(calls).toBe(1);
    expect(lastState).toBe(store.get());
  });

  it('update 即使传入相同列表也会触发通知', () => {
    const store = new TodoStore(() => new Date('2024-01-01T00:00:00Z'));
    const items: TodoItem[] = [
      { content: 'A', activeForm: 'Doing A', status: 'pending' },
    ];

    store.update(items);

    let calls = 0;
    const unsubscribe = store.onChange(() => {
      calls += 1;
    });

    calls = 0;
    store.update(items);

    unsubscribe();

    expect(calls).toBeGreaterThan(0);
  });

  it('取消订阅后不再接收通知', () => {
    const store = new TodoStore(() => new Date('2024-01-01T00:00:00Z'));
    let calls = 0;

    const unsubscribe = store.onChange(() => {
      calls += 1;
    });

    calls = 0;
    unsubscribe();
    store.update([
      { content: 'A', activeForm: 'Doing A', status: 'pending' },
    ]);

    expect(calls).toBe(0);
  });
});
