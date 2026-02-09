import { describe, expect, it, mock } from 'bun:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import { BashSession } from '../../../src/tools/bash-session.ts';

interface SpawnCall {
  command: string;
  args: readonly string[];
}

interface SpawnStubResult {
  session: BashSession;
  calls: SpawnCall[];
  cleanup: () => void;
}

function createProcessStub(output: { stdout?: string; stderr?: string; exitCode?: number } = {}): ChildProcess {
  const emitter = new EventEmitter() as ChildProcess;
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const kill = mock((_signal?: NodeJS.Signals | number) => true);

  emitter.stdin = stdin;
  emitter.stdout = stdout;
  emitter.stderr = stderr;
  emitter.kill = kill;

  stdin.on('data', () => {
    const stdoutText = output.stdout ?? 'test';
    const stderrText = output.stderr ?? '';
    const exitCode = output.exitCode ?? 0;
    setTimeout(() => {
      if (stderrText) {
        stderr.write(stderrText);
      }
      stdout.write(`${stdoutText}\n___SYNAPSE_EXIT_CODE___${exitCode}___SYNAPSE_COMMAND_END___\n`);
    }, 0);
  });

  return emitter;
}

function createSessionWithSpawnStub(shellCommand?: string): SpawnStubResult {
  const calls: SpawnCall[] = [];
  const processStub = createProcessStub();
  const session = new BashSession({
    shellCommand,
    spawnProcess: (command, args, _options) => {
      calls.push({ command, args });
      return processStub;
    },
  });

  return {
    session,
    calls,
    cleanup: () => session.cleanup(),
  };
}

describe('BashSession shellCommand', () => {
  it('默认 shellCommand 为 /bin/bash', () => {
    const { session, cleanup } = createSessionWithSpawnStub();
    try {
      expect(session.shellCommand).toBe('/bin/bash');
    } finally {
      cleanup();
    }
  });

  it('自定义 shellCommand 会解析为 spawn(cmd,args) 并追加 --norc/--noprofile', () => {
    const { cleanup, calls } = createSessionWithSpawnStub('sandbox-exec -f /tmp/test.sb /bin/bash');
    try {
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({
        command: 'sandbox-exec',
        args: ['-f', '/tmp/test.sb', '/bin/bash', '--norc', '--noprofile'],
      });
    } finally {
      cleanup();
    }
  });

  it('自定义 shellCommand 下 execute 的标记检测与返回逻辑保持可用', async () => {
    const processStub = createProcessStub({ stdout: 'hello', exitCode: 0 });
    const session = new BashSession({
      shellCommand: 'sandbox-exec -f /tmp/test.sb /bin/bash',
      spawnProcess: () => processStub,
    });

    try {
      const result = await session.execute('echo hello');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('hello');
    } finally {
      session.cleanup();
    }
  });
});
