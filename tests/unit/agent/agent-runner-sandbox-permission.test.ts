import { describe, expect, it, mock } from 'bun:test';
import { AgentRunner } from '../../../src/core/agent-runner.ts';
import type { Toolset } from '../../../src/tools/toolset.ts';
import { ToolOk, asCancelablePromise } from '../../../src/tools/callable-tool.ts';
import type { StreamedMessagePart } from '../../../src/providers/anthropic/anthropic-types.ts';
import type { AnthropicClient } from '../../../src/providers/anthropic/anthropic-client.ts';

const MockBashToolDef = {
  name: 'Bash',
  description: 'Mock bash tool',
  input_schema: { type: 'object' as const, properties: { command: { type: 'string' } }, required: ['command'] },
};

function createMockClient(responses: StreamedMessagePart[][]): AnthropicClient {
  let callIndex = 0;
  return {
    modelName: 'claude-sonnet-4-20250514',
    generate: mock(() => {
      const parts = responses[callIndex++] || [{ type: 'text', text: 'Done' }];
      return Promise.resolve({
        id: `msg_${callIndex}`,
        usage: { inputOther: 10, output: 10, inputCacheRead: 0, inputCacheCreation: 0 },
        async *[Symbol.asyncIterator]() {
          for (const part of parts) {
            yield part;
          }
        },
      });
    }),
  } as unknown as AnthropicClient;
}

function createBlockedToolset() {
  const executeUnsandboxed = mock(async () => ({
    stdout: 'unsandboxed-output',
    stderr: '',
    exitCode: 0,
    blocked: false,
  }));
  const allowSession = mock(async () => {});
  const allowPermanent = mock(async () => {});
  const retryCall = mock(async () => ToolOk({ output: 'retry-ok' }));

  const bashTool = {
    executeUnsandboxed,
    allowSession,
    allowPermanent,
    call: retryCall,
  };

  const handle = mock((toolCall: { id: string }) => asCancelablePromise(Promise.resolve({
    toolCallId: toolCall.id,
    returnValue: ToolOk({
      output: '',
      message: 'deny file-read',
      extras: {
        type: 'sandbox_blocked',
        resource: '~/.ssh/id_rsa',
      },
    }),
  })));

  const toolset: Toolset = {
    tools: [MockBashToolDef],
    handle,
    getTool: (name: string) => (name === 'Bash' ? bashTool : undefined) as any,
  };

  return { toolset, executeUnsandboxed, allowSession, allowPermanent, retryCall };
}

describe('AgentRunner sandbox permission flow', () => {
  it('sandbox_blocked 会中断并返回 requires_permission', async () => {
    const client = createMockClient([[
      { type: 'tool_call', id: 'call-1', name: 'Bash', input: { command: 'cat ~/.ssh/id_rsa' } },
    ]]);
    const { toolset } = createBlockedToolset();
    const runner = new AgentRunner({
      client,
      systemPrompt: 'test',
      toolset,
      enableStopHooks: false,
    });

    const result = await runner.step('读取密钥');

    expect(result.status).toBe('requires_permission');
    if (result.status === 'requires_permission') {
      expect(result.permission.type).toBe('sandbox_access');
      expect(result.permission.resource).toBe('~/.ssh/id_rsa');
      expect(result.permission.options).toEqual(['allow_once', 'allow_session', 'allow_permanent', 'deny']);
    }
  });

  it('allow_once 会走无沙盒执行路径', async () => {
    const client = createMockClient([[
      { type: 'tool_call', id: 'call-1', name: 'Bash', input: { command: 'cat ~/.ssh/id_rsa' } },
    ]]);
    const { toolset, executeUnsandboxed } = createBlockedToolset();
    const runner = new AgentRunner({
      client,
      systemPrompt: 'test',
      toolset,
      enableStopHooks: false,
    });

    await runner.step('读取密钥');
    const output = await runner.resolveSandboxPermission('allow_once');

    expect(executeUnsandboxed).toHaveBeenCalledWith('cat ~/.ssh/id_rsa', process.cwd());
    expect(output).toContain('unsandboxed-output');
  });

  it('allow_session 会添加会话白名单并重试命令', async () => {
    const client = createMockClient([[
      { type: 'tool_call', id: 'call-1', name: 'Bash', input: { command: 'cat ~/.ssh/id_rsa' } },
    ]]);
    const { toolset, allowSession, retryCall } = createBlockedToolset();
    const runner = new AgentRunner({
      client,
      systemPrompt: 'test',
      toolset,
      enableStopHooks: false,
    });

    await runner.step('读取密钥');
    const output = await runner.resolveSandboxPermission('allow_session');

    expect(allowSession).toHaveBeenCalledWith('~/.ssh', process.cwd());
    expect(retryCall).toHaveBeenCalledWith({ command: 'cat ~/.ssh/id_rsa' });
    expect(output).toContain('retry-ok');
  });

  it('allow_permanent 会写入永久授权并重试命令', async () => {
    const client = createMockClient([[
      { type: 'tool_call', id: 'call-1', name: 'Bash', input: { command: 'cat ~/.ssh/id_rsa' } },
    ]]);
    const { toolset, allowPermanent, retryCall } = createBlockedToolset();
    const runner = new AgentRunner({
      client,
      systemPrompt: 'test',
      toolset,
      enableStopHooks: false,
    });

    await runner.step('读取密钥');
    await runner.resolveSandboxPermission('allow_permanent');

    expect(allowPermanent).toHaveBeenCalledWith('~/.ssh', process.cwd());
    expect(retryCall).toHaveBeenCalledWith({ command: 'cat ~/.ssh/id_rsa' });
  });

  it('deny 会返回拒绝信息', async () => {
    const client = createMockClient([[
      { type: 'tool_call', id: 'call-1', name: 'Bash', input: { command: 'cat ~/.ssh/id_rsa' } },
    ]]);
    const { toolset, allowSession, allowPermanent, executeUnsandboxed } = createBlockedToolset();
    const runner = new AgentRunner({
      client,
      systemPrompt: 'test',
      toolset,
      enableStopHooks: false,
    });

    await runner.step('读取密钥');
    const output = await runner.resolveSandboxPermission('deny');

    expect(output).toContain('User denied access to ~/.ssh/id_rsa');
    expect(allowSession).toHaveBeenCalledTimes(0);
    expect(allowPermanent).toHaveBeenCalledTimes(0);
    expect(executeUnsandboxed).toHaveBeenCalledTimes(0);
  });
});
