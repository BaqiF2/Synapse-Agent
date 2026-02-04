import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { TerminalRenderer } from '../../../src/cli/terminal-renderer.ts';
import { todoStore } from '../../../src/tools/handlers/agent-bash/todo/todo-store.ts';

function sampleTodos() {
  return [
    { content: 'Analyze requirements', activeForm: 'Analyzing requirements', status: 'completed' as const },
    { content: 'Write implementation', activeForm: 'Writing implementation', status: 'in_progress' as const },
    { content: 'Run tests', activeForm: 'Running tests', status: 'pending' as const },
  ];
}

describe('TerminalRenderer Todo Render', () => {
  const originalConsoleLog = console.log.bind(console);

  beforeEach(() => {
    console.log = mock(() => {}) as unknown as typeof console.log;
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    todoStore.clear();
  });

  it('按状态渲染图标与文本', () => {
    const renderer = new TerminalRenderer();
    renderer.renderTodos({ items: sampleTodos(), updatedAt: new Date() });

    const calls = (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const output = calls.map((args) => String(args[0] ?? '')).join('\n');

    expect(output).toContain('✓ Analyze requirements');
    expect(output).toContain('● Writing implementation...');
    expect(output).toContain('○ Run tests');
  });

  it('状态变化触发实时重渲染', () => {
    const renderer = new TerminalRenderer();
    renderer.attachTodoStore(todoStore);

    const calls = (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    calls.length = 0;

    todoStore.update(sampleTodos());
    todoStore.update([{ content: 'Only one', activeForm: 'Doing one', status: 'pending' }]);

    const headerLines = calls
      .map((args) => String(args[0] ?? ''))
      .filter((line) => line.includes('Tasks'));

    expect(headerLines.length).toBe(2);
  });
});
