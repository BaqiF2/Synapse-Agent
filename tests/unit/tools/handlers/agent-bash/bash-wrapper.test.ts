import { describe, it, expect, mock } from 'bun:test';
import type { BashSession } from '../../../../../src/tools/bash-session.ts';
import { BashWrapperHandler } from '../../../../../src/tools/handlers/agent-bash/bash-wrapper.ts';

describe('BashWrapperHandler', () => {
  it('should show help when extra spaces are used with --help', async () => {
    const session = { execute: mock(async () => ({ stdout: 'ok', stderr: '', exitCode: 0 })) } as unknown as BashSession;
    const handler = new BashWrapperHandler(session);

    const result = await handler.execute('bash   --help');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('USAGE:');
    expect(result.stdout).toContain('bash <command>');
    expect(session.execute).not.toHaveBeenCalled();
  });
});
