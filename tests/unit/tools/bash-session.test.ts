/**
 * BashSession Tests
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { BashSession } from '../../../src/tools/bash-session.ts';

describe('BashSession', () => {
  let session: BashSession;

  beforeEach(() => {
    session = new BashSession();
  });

  afterEach(() => {
    session.cleanup();
  });

  it('should execute command and return stdout', async () => {
    const result = await session.execute('echo hello');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('hello');
  });

  it('should return non-zero exit code for failing command', async () => {
    const result = await session.execute('false');

    expect(result.exitCode).toBe(1);
  });

  it('should reset state after restart', async () => {
    await session.execute('export SYNAPSE_TEST_VAR=works');
    const before = await session.execute('echo $SYNAPSE_TEST_VAR');
    expect(before.stdout).toBe('works');

    await session.restart();

    const after = await session.execute('echo $SYNAPSE_TEST_VAR');
    expect(after.stdout).toBe('');
  });
});
