/**
 * Unit Tests - BashTool Error Hint
 *
 * Tests for --help hint injection on command failure.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { BashTool } from '../../../src/tools/bash-tool.ts';

describe('BashTool Error Hint', () => {
  let bashTool: BashTool;

  beforeAll(() => {
    bashTool = new BashTool();
  });

  afterAll(() => {
    bashTool.cleanup();
  });

  test('should include --help hint when command fails', async () => {
    // 执行一个会失败的命令
    const result = await bashTool.call({ command: 'git comit -m "test"' });

    expect(result.isError).toBe(true);
    expect(result.message).toContain('--help');
    expect(result.message).toContain('git');
  });

  test('should include --help hint for mcp command failure', async () => {
    // mcp 命令失败
    const result = await bashTool.call({ command: 'mcp:nonexistent:tool' });

    expect(result.isError).toBe(true);
    expect(result.message).toContain('--help');
    expect(result.message).toContain('mcp:nonexistent:tool');
  });

  test('should NOT include --help hint when command succeeds', async () => {
    const result = await bashTool.call({ command: 'echo "success"' });

    expect(result.isError).toBe(false);
    expect(result.message || '').not.toContain('Hint:');
  });
});
