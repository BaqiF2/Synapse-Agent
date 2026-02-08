import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { SubAgentManager } from '../../../src/sub-agents/sub-agent-manager.ts';
import { BashTool } from '../../../src/tools/bash-tool.ts';
import type { AnthropicClient } from '../../../src/providers/anthropic/anthropic-client.ts';
import type { StreamedMessagePart } from '../../../src/providers/anthropic/anthropic-types.ts';
import type { SubAgentCompleteEvent } from '../../../src/cli/terminal-renderer-types.ts';
import type { Message } from '../../../src/providers/message.ts';

function createMockClient(responses: StreamedMessagePart[][]): AnthropicClient {
  let callIndex = 0;
  return {
    modelName: 'claude-sonnet-4-20250514',
    generate: () => {
      const parts = responses[callIndex++] || [{ type: 'text', text: 'Default' }];
      return Promise.resolve({
        id: `msg_${callIndex}`,
        usage: { inputOther: 1, output: 1, inputCacheRead: 0, inputCacheCreation: 0 },
        async *[Symbol.asyncIterator]() {
          for (const part of parts) yield part;
        },
      });
    },
  } as unknown as AnthropicClient;
}

function extractTextContent(message: Message | undefined): string {
  if (!message) {
    return '';
  }
  return message.content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join(' ');
}

function createParallelToolClient(): AnthropicClient {
  let sequence = 0;

  return {
    generate: (_systemPrompt: string, messages: readonly Message[]) => {
      sequence++;
      const userPrompt = extractTextContent(messages.find((message) => message.role === 'user'));
      const token = userPrompt.includes('alpha') ? 'ALPHA' : 'BETA';
      const toolMessage = messages.find((message) => message.role === 'tool');

      const parts: StreamedMessagePart[] = toolMessage
        ? [{ type: 'text', text: `done:${token}:${extractTextContent(toolMessage)}` }]
        : [{
            type: 'tool_call',
            id: `tc-${token}-${sequence}`,
            name: 'Bash',
            input: { command: `sleep 0.4; printf ${token}` },
          }];

      return Promise.resolve({
        id: `msg-${token}-${sequence}`,
        usage: { inputOther: 1, output: 1, inputCacheRead: 0, inputCacheCreation: 0 },
        async *[Symbol.asyncIterator]() {
          for (const part of parts) {
            yield part;
          }
        },
      });
    },
  } as unknown as AnthropicClient;
}

function createPromptCaptureClient(capture: { userText?: string }): AnthropicClient {
  return {
    generate: (_systemPrompt: string, messages: readonly Message[]) => {
      const userPrompt = extractTextContent(messages.find((message) => message.role === 'user'));
      capture.userText = userPrompt;

      return Promise.resolve({
        id: 'msg-capture',
        usage: { inputOther: 1, output: 1, inputCacheRead: 0, inputCacheCreation: 0 },
        async *[Symbol.asyncIterator]() {
          yield { type: 'text', text: 'captured' } satisfies StreamedMessagePart;
        },
      });
    },
  } as unknown as AnthropicClient;
}

describe('SubAgentManager', () => {
  let bashTool: BashTool;

  beforeEach(() => {
    bashTool = new BashTool();
  });

  afterEach(() => {
    bashTool.cleanup();
  });

  it('should execute task successfully', async () => {
    const client = createMockClient([[{ type: 'text', text: 'Hello!' }]]);
    const manager = new SubAgentManager({ client, bashTool });

    const result = await manager.execute('general', { prompt: 'Hi', description: 'Test' });
    expect(result).toBe('Hello!');
  });

  it('should execute multiple tasks', async () => {
    const client = createMockClient([
      [{ type: 'text', text: 'First!' }],
      [{ type: 'text', text: 'Second!' }],
    ]);
    const manager = new SubAgentManager({ client, bashTool });

    const first = await manager.execute('general', { prompt: 'Hi', description: 'Test 1' });
    expect(first).toBe('First!');

    const second = await manager.execute('general', { prompt: 'Hi again', description: 'Test 2' });
    expect(second).toBe('Second!');
  });

  it('should trigger onComplete callback', async () => {
    const client = createMockClient([[{ type: 'text', text: 'Done!' }]]);
    const completedEvents: SubAgentCompleteEvent[] = [];

    const manager = new SubAgentManager({
      client,
      bashTool,
      onComplete: (event) => completedEvents.push(event),
    });

    await manager.execute('general', { prompt: 'Hi', description: 'Test' });

    expect(completedEvents.length).toBe(1);
    const event = completedEvents[0]!;
    expect(event.success).toBe(true);
    expect(event.toolCount).toBe(0);
    expect(typeof event.duration).toBe('number');
  });

  it('should forward usage through onUsage callback', async () => {
    const client = createMockClient([[{ type: 'text', text: 'Done!' }]]);
    const usageEvents: Array<{ model: string; usage: unknown }> = [];

    const manager = new SubAgentManager({
      client,
      bashTool,
      onUsage: (usage, model) => {
        usageEvents.push({ usage, model });
      },
    });

    await manager.execute('general', { prompt: 'Hi', description: 'Usage test' });

    expect(usageEvents).toHaveLength(1);
    expect(usageEvents[0]?.model).toBe('claude-sonnet-4-20250514');
    expect(usageEvents[0]?.usage).toEqual({
      inputOther: 1,
      output: 1,
      inputCacheRead: 0,
      inputCacheCreation: 0,
    });
  });

  it('should shutdown and cleanup', async () => {
    const client = createMockClient([[{ type: 'text', text: 'Hello!' }]]);
    const manager = new SubAgentManager({ client, bashTool });

    await manager.execute('general', { prompt: 'Hi', description: 'Test' });

    // shutdown should not throw
    expect(() => manager.shutdown()).not.toThrow();
  });

  it('should isolate bash execution for parallel sub-agent tasks', async () => {
    const client = createParallelToolClient();
    const manager = new SubAgentManager({ client, bashTool });

    const [alphaResult, betaResult] = await Promise.all([
      manager.execute('general', { prompt: 'alpha', description: 'Alpha task' }),
      manager.execute('general', { prompt: 'beta', description: 'Beta task' }),
    ]);

    expect(alphaResult).toContain('done:ALPHA:ALPHA');
    expect(betaResult).toContain('done:BETA:BETA');
  });

  it('should abort execution when signal is aborted', async () => {
    const client = createMockClient([
      [{ type: 'tool_call', id: 'abort-call', name: 'Bash', input: { command: 'sleep 2' } }],
    ]);
    const completedEvents: SubAgentCompleteEvent[] = [];
    const manager = new SubAgentManager({
      client,
      bashTool,
      onComplete: (event) => completedEvents.push(event),
    });
    const controller = new AbortController();

    const execution = manager.execute(
      'general',
      { prompt: 'abort test', description: 'Abort test' },
      { signal: controller.signal }
    );
    setTimeout(() => controller.abort(), 20);

    await expect(execution).rejects.toMatchObject({ name: 'AbortError' });
    expect(completedEvents).toHaveLength(1);
    expect(completedEvents[0]?.success).toBe(false);
    expect(completedEvents[0]?.error).toBeString();
  });

  it('should not prepend skill-search instruction for skill enhance sub-agent', async () => {
    const capture: { userText?: string } = {};
    const client = createPromptCaptureClient(capture);
    const manager = new SubAgentManager({ client, bashTool });

    const prompt = 'Only analyze this enhancement context';
    const result = await manager.execute('skill', {
      action: 'enhance',
      prompt,
      description: 'Skill Enhancement Analysis',
    });

    expect(result).toBe('captured');
    expect(capture.userText).toBe(prompt);
    expect(capture.userText).not.toContain('Skill Search Priority');
    expect(capture.userText).not.toContain('task:skill:search');
  });
});
