/**
 * E2E Tests - Task Command Recursion Guard
 *
 * 验证 task:general 子代理内部无法再次调用 task:* 命令。
 */

import { describe, it, expect, afterEach } from 'bun:test';
import { BashTool } from '../../src/tools/bash-tool.ts';
import type { ISubAgentExecutor } from '../../src/core/sub-agents/sub-agent-types.ts';

describe('E2E: Task Command Recursion Guard', () => {
  let bashTool: BashTool | null = null;

  afterEach(() => {
    if (bashTool) {
      bashTool.cleanup();
      bashTool = null;
    }
  });

  it('should block nested task:* calls inside task:general sub-agent', async () => {
    // 创建一个 mock executor，模拟 SubAgent 执行成功
    const mockExecutor: ISubAgentExecutor = {
      execute: async () => 'General task finished without nested task execution.',
      shutdown: () => {},
    };

    bashTool = new BashTool({ subAgentExecutor: mockExecutor });

    const result = await bashTool.call({
      command: 'task:general --prompt "analyze route" --description "guard recursion"',
    });

    expect(result.isError).toBe(false);
    expect(result.output).toContain('General task finished without nested task execution.');
  });
});
