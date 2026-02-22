import { afterEach, describe, expect, it } from 'bun:test';
import { TodoWriteHandler } from '../../../src/tools/commands/todo-handler.ts';
import { todoStore } from '../../../src/tools/commands/todo-handler.ts';

const handler = new TodoWriteHandler();

function setEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

const originalEnv = {
  SYNAPSE_TODO_MAX_ITEMS: process.env.SYNAPSE_TODO_MAX_ITEMS,
  SYNAPSE_TODO_MAX_CONTENT_LENGTH: process.env.SYNAPSE_TODO_MAX_CONTENT_LENGTH,
};

afterEach(() => {
  setEnv('SYNAPSE_TODO_MAX_ITEMS', originalEnv.SYNAPSE_TODO_MAX_ITEMS);
  setEnv('SYNAPSE_TODO_MAX_CONTENT_LENGTH', originalEnv.SYNAPSE_TODO_MAX_CONTENT_LENGTH);
  todoStore.clear();
});

describe('TodoWriteHandler', () => {
  it('缺失 JSON 参数', async () => {
    const result = await handler.execute('TodoWrite');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Missing JSON parameter');
  });

  it('无效 JSON 格式', async () => {
    const result = await handler.execute("TodoWrite '{invalid}'");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid JSON format');
  });

  it('content 必填且不可为空白', async () => {
    const result = await handler.execute(
      "TodoWrite '{\"todos\":[{\"activeForm\":\"Doing\",\"status\":\"pending\"}]}'"
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('content');
    expect(result.stderr).toContain('Required');
  });

  it('activeForm 必填且不可为空白', async () => {
    const result = await handler.execute(
      "TodoWrite '{\"todos\":[{\"content\":\"Task\",\"activeForm\":\"   \",\"status\":\"pending\"}]}'"
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('activeForm');
  });

  it('status 仅允许枚举值', async () => {
    const result = await handler.execute(
      "TodoWrite '{\"todos\":[{\"content\":\"Task\",\"activeForm\":\"Doing\",\"status\":\"done\"}]}'"
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('pending');
    expect(result.stderr).toContain('in_progress');
    expect(result.stderr).toContain('completed');
  });

  it('禁止 TodoItem 多余字段', async () => {
    const result = await handler.execute(
      "TodoWrite '{\"todos\":[{\"content\":\"Task\",\"activeForm\":\"Doing\",\"status\":\"pending\",\"extra\":\"x\"}]}'"
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('extra');
  });

  it('禁止根级别多余字段', async () => {
    const result = await handler.execute(
      "TodoWrite '{\"todos\":[{\"content\":\"Task\",\"activeForm\":\"Doing\",\"status\":\"pending\"}],\"foo\":1}'"
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('foo');
  });

  it('content 与 activeForm 长度限制', async () => {
    setEnv('SYNAPSE_TODO_MAX_CONTENT_LENGTH', '5');
    const result = await handler.execute(
      "TodoWrite '{\"todos\":[{\"content\":\"123456\",\"activeForm\":\"Doing\",\"status\":\"pending\"}]}'"
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('at most');
  });

  it('todos 数组允许为空', async () => {
    const result = await handler.execute("TodoWrite '{\"todos\":[]}'");
    expect(result.exitCode).toBe(0);
    expect(todoStore.get().items).toHaveLength(0);
  });

  it('todos 数组长度上限可被环境变量覆盖', async () => {
    setEnv('SYNAPSE_TODO_MAX_ITEMS', '2');
    const payload = {
      todos: [
        { content: 'A', activeForm: 'Doing A', status: 'pending' },
        { content: 'B', activeForm: 'Doing B', status: 'pending' },
        { content: 'C', activeForm: 'Doing C', status: 'pending' },
      ],
    };
    const result = await handler.execute(`TodoWrite ${JSON.stringify(payload)}`);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Too many items');
  });

  it('无效环境变量回退到默认值', async () => {
    setEnv('SYNAPSE_TODO_MAX_ITEMS', '0');
    // parseEnvPositiveInt 对无效值（0 不是正整数）回退到默认值 50，不再报错
    const result = await handler.execute("TodoWrite '{\"todos\":[]}'");
    expect(result.exitCode).toBe(0);
  });
});
