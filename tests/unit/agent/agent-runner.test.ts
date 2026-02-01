/**
 * Agent Runner Tests
 *
 * Tests for the refactored Agent Loop implementation using step().
 */

import { describe, expect, it, mock, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  AgentRunner,
  type AgentRunnerOptions,
} from '../../../src/agent/agent-runner.ts';
import { CallableToolset } from '../../../src/tools/toolset.ts';
import { ToolOk, ToolError } from '../../../src/tools/callable-tool.ts';
import type { CallableTool, ToolReturnValue } from '../../../src/tools/callable-tool.ts';
import { createTextMessage, type Message } from '../../../src/providers/message.ts';
import { BashToolSchema } from '../../../src/tools/bash-tool-schema.ts';
import type { AnthropicClient } from '../../../src/providers/anthropic/anthropic-client.ts';
import type { StreamedMessagePart } from '../../../src/providers/anthropic/anthropic-types.ts';
import { Logger } from '../../../src/utils/logger.ts';
import { Session } from '../../../src/agent/session.ts';

function createMockCallableTool(handler: (args: unknown) => Promise<ToolReturnValue>): CallableTool<unknown> {
  return {
    name: 'Bash',
    description: 'Mock bash tool',
    paramsSchema: {} as any,
    toolDefinition: BashToolSchema,
    call: handler,
  } as unknown as CallableTool<unknown>;
}

function createMockClient(responses: StreamedMessagePart[][]): AnthropicClient {
  let callIndex = 0;
  return {
    generate: mock(() => {
      const parts = responses[callIndex++] || [{ type: 'text', text: 'Default' }];
      return Promise.resolve({
        id: `msg_${callIndex}`,
        usage: { inputOther: 100, output: 50, inputCacheRead: 0, inputCacheCreation: 0 },
        async *[Symbol.asyncIterator]() {
          for (const part of parts) yield part;
        },
      });
    }),
  } as unknown as AnthropicClient;
}

describe('AgentRunner', () => {
  describe('run', () => {
    it('should process user message and return response (no tools)', async () => {
      const client = createMockClient([[{ type: 'text', text: 'Hello!' }]]);
      const toolset = new CallableToolset([createMockCallableTool(() =>
        Promise.resolve(ToolOk({ output: '' }))
      )]);

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
      });

      const response = await runner.run('Hi');

      expect(response).toBe('Hello!');
    });

    it('should execute tools and continue loop', async () => {
      const client = createMockClient([
        [
          { type: 'text', text: 'Running' },
          { type: 'tool_call', id: 'c1', name: 'Bash', input: { command: 'ls' } },
        ],
        [{ type: 'text', text: 'Done!' }],
      ]);

      const toolHandler = mock(() =>
        Promise.resolve(ToolOk({ output: 'file.txt' }))
      );
      const toolset = new CallableToolset([createMockCallableTool(toolHandler)]);

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
      });

      const response = await runner.run('List files');

      expect(response).toBe('Done!');
      expect(toolHandler).toHaveBeenCalled();
    });

    it('should call onMessagePart callback', async () => {
      const parts: StreamedMessagePart[] = [];
      const client = createMockClient([[{ type: 'text', text: 'Hi' }]]);
      const toolset = new CallableToolset([createMockCallableTool(() =>
        Promise.resolve(ToolOk({ output: '' }))
      )]);

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        onMessagePart: (p) => {
          parts.push(p);
        },
      });

      await runner.run('Hello');

      expect(parts.length).toBeGreaterThan(0);
    });

    it('should log tool failure details', async () => {
      const originalWarn = Logger.prototype.warn;
      const originalInfo = Logger.prototype.info;
      const originalError = Logger.prototype.error;
      const warnSpy = mock(() => {});

      Logger.prototype.warn = warnSpy as unknown as Logger['warn'];
      Logger.prototype.info = mock(() => {}) as unknown as Logger['info'];
      Logger.prototype.error = mock(() => {}) as unknown as Logger['error'];

      try {
        const client = createMockClient([
          [{ type: 'tool_call', id: 'c1', name: 'Bash', input: { command: 'fail' } }],
          [{ type: 'text', text: 'Done!' }],
        ]);

        const toolset = new CallableToolset([createMockCallableTool(() =>
          Promise.resolve(ToolError({
            message: 'boom',
            output: 'bad-output',
            brief: 'bad-brief',
            extras: { code: 500 },
          }))
        )]);

        const runner = new AgentRunner({
          client,
          systemPrompt: 'Test',
          toolset,
        });

        await runner.run('Fail');

        expect(warnSpy).toHaveBeenCalled();
        const [message, data] = warnSpy.mock.calls[0] ?? [];
        expect(message).toContain('Tool execution failed');
        expect(data).toEqual(expect.objectContaining({
          errors: [
            expect.objectContaining({
              toolCallId: 'c1',
              message: 'boom',
              brief: 'bad-brief',
              output: 'bad-output',
              extras: { code: 500 },
            }),
          ],
        }));
      } finally {
        Logger.prototype.warn = originalWarn;
        Logger.prototype.info = originalInfo;
        Logger.prototype.error = originalError;
      }
    });

    it('should stop after consecutive tool failures', async () => {
      const client = createMockClient([
        [{ type: 'tool_call', id: 'c1', name: 'Bash', input: { command: 'fail' } }],
        [{ type: 'tool_call', id: 'c2', name: 'Bash', input: { command: 'fail' } }],
      ]);

      const toolset = new CallableToolset([createMockCallableTool(() =>
        Promise.resolve(ToolError({ message: 'error', output: 'error' }))
      )]);

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        maxConsecutiveToolFailures: 2,
      });

      const response = await runner.run('Fail');

      expect(response).toContain('Consecutive tool execution failures');
      const history = runner.getHistory();
      expect(history).toHaveLength(5);
      expect(history.at(-1)?.role).toBe('tool');
    });

    it('should maintain history across calls', async () => {
      const client = createMockClient([
        [{ type: 'text', text: 'First' }],
        [{ type: 'text', text: 'Second' }],
      ]);
      const toolset = new CallableToolset([createMockCallableTool(() =>
        Promise.resolve(ToolOk({ output: '' }))
      )]);

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
      });

      await runner.run('One');
      const response = await runner.run('Two');

      expect(response).toBe('Second');
      expect(runner.getHistory()).toHaveLength(4); // 2 user + 2 assistant
    });
  });
});

describe('AgentRunner with Session', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(
      os.tmpdir(),
      `synapse-runner-test-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
    );
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should create session on first run', async () => {
    const client = createMockClient([[{ type: 'text', text: 'Hello!' }]]);
    const toolset = new CallableToolset([createMockCallableTool(() =>
      Promise.resolve(ToolOk({ output: '' }))
    )]);

    const runner = new AgentRunner({
      client,
      systemPrompt: 'Test',
      toolset,
      sessionsDir: testDir,
    });

    await runner.run('Hi');

    const sessionId = runner.getSessionId();
    expect(sessionId).toMatch(/^session-/);

    const sessions = await Session.list({ sessionsDir: testDir });
    expect(sessions.length).toBe(1);
  });

  it('should persist messages to session', async () => {
    const client = createMockClient([[{ type: 'text', text: 'Hello!' }]]);
    const toolset = new CallableToolset([createMockCallableTool(() =>
      Promise.resolve(ToolOk({ output: '' }))
    )]);

    const runner = new AgentRunner({
      client,
      systemPrompt: 'Test',
      toolset,
      sessionsDir: testDir,
    });

    await runner.run('Hi');

    const sessionId = runner.getSessionId();
    const session = await Session.find(sessionId!, { sessionsDir: testDir });
    const history = await session!.loadHistory();

    expect(history.length).toBe(2); // user + assistant
  });

  it('should restore history when resuming session', async () => {
    const client = createMockClient([
      [{ type: 'text', text: 'First' }],
      [{ type: 'text', text: 'Second' }],
    ]);
    const toolset = new CallableToolset([createMockCallableTool(() =>
      Promise.resolve(ToolOk({ output: '' }))
    )]);

    // 第一个 runner
    const runner1 = new AgentRunner({
      client,
      systemPrompt: 'Test',
      toolset,
      sessionsDir: testDir,
    });
    await runner1.run('Message 1');
    const sessionId = runner1.getSessionId();

    // 第二个 runner 恢复会话
    const runner2 = new AgentRunner({
      client,
      systemPrompt: 'Test',
      toolset,
      sessionId,
      sessionsDir: testDir,
    });
    await runner2.run('Message 2');

    // 验证历史已合并
    expect(runner2.getHistory().length).toBe(4); // 2 from first + 2 from second
  });
});
