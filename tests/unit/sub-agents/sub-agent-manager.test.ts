import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SubAgentManager } from '../../../src/core/sub-agents/sub-agent-manager.ts';
import { BashTool } from '../../../src/tools/bash-tool.ts';
import { createSubAgentToolsetFactory } from '../../../src/tools/sub-agent-toolset-factory.ts';
import { generate } from '../../../src/providers/generate.ts';
import { AgentRunner } from '../../../src/core/agent/agent-runner.ts';
import type { AnthropicClient } from '../../../src/providers/anthropic/anthropic-client.ts';
import type { StreamedMessagePart } from '../../../src/providers/anthropic/anthropic-types.ts';
import type { SubAgentCompleteEvent } from '../../../src/cli/terminal-renderer-types.ts';
import type { Message } from '../../../src/providers/message.ts';
import type { AgentRunnerCreateParams } from '../../../src/core/sub-agents/sub-agent-types.ts';
import type { Toolset } from '../../../src/types/toolset.ts';

/**
 * 创建包含必需工厂函数的 SubAgentManager 选项
 */
function createManagerOptions(base: { client: AnthropicClient; bashTool: BashTool; [key: string]: unknown }) {
  return {
    ...base,
    toolsetFactory: createSubAgentToolsetFactory(),
    generateFn: generate,
    agentRunnerFactory: (params: AgentRunnerCreateParams) =>
      new AgentRunner({
        client: base.client,
        systemPrompt: params.systemPrompt,
        toolset: params.toolset as Toolset,
        generateFn: generate,
        maxIterations: params.maxIterations,
        enableStopHooks: params.enableStopHooks,
        enableSkillSearchInstruction: params.enableSkillSearchInstruction,
        onToolCall: params.onToolCall,
        onToolResult: params.onToolResult,
        onUsage: params.onUsage,
      }),
  };
}

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
  let tempSynapseHome: string;
  const previousSynapseHome = process.env.SYNAPSE_HOME;

  beforeEach(() => {
    tempSynapseHome = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-sub-agent-test-'));
    process.env.SYNAPSE_HOME = tempSynapseHome;
    fs.writeFileSync(
      path.join(tempSynapseHome, 'sandbox.json'),
      JSON.stringify({
        enabled: false,
        provider: 'local',
        policy: {
          filesystem: {
            whitelist: [],
            blacklist: [],
          },
          network: {
            allowNetwork: false,
          },
        },
        providerOptions: {},
      }),
      'utf-8'
    );
    bashTool = new BashTool();
  });

  afterEach(() => {
    bashTool.cleanup();
    if (previousSynapseHome === undefined) {
      delete process.env.SYNAPSE_HOME;
    } else {
      process.env.SYNAPSE_HOME = previousSynapseHome;
    }
    fs.rmSync(tempSynapseHome, { recursive: true, force: true });
  });

  it('should execute task successfully', async () => {
    const client = createMockClient([[{ type: 'text', text: 'Hello!' }]]);
    const manager = new SubAgentManager(createManagerOptions({ client, bashTool }));

    const result = await manager.execute('general', { prompt: 'Hi', description: 'Test' });
    expect(result).toBe('Hello!');
  });

  it('should execute multiple tasks', async () => {
    const client = createMockClient([
      [{ type: 'text', text: 'First!' }],
      [{ type: 'text', text: 'Second!' }],
    ]);
    const manager = new SubAgentManager(createManagerOptions({ client, bashTool }));

    const first = await manager.execute('general', { prompt: 'Hi', description: 'Test 1' });
    expect(first).toBe('First!');

    const second = await manager.execute('general', { prompt: 'Hi again', description: 'Test 2' });
    expect(second).toBe('Second!');
  });

  it('should trigger onComplete callback', async () => {
    const client = createMockClient([[{ type: 'text', text: 'Done!' }]]);
    const completedEvents: SubAgentCompleteEvent[] = [];

    const manager = new SubAgentManager(createManagerOptions({
      client,
      bashTool,
      onComplete: (event: SubAgentCompleteEvent) => completedEvents.push(event),
    }));

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

    const manager = new SubAgentManager(createManagerOptions({
      client,
      bashTool,
      onUsage: (usage: unknown, model: string) => {
        usageEvents.push({ usage, model });
      },
    }));

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
    const manager = new SubAgentManager(createManagerOptions({ client, bashTool }));

    await manager.execute('general', { prompt: 'Hi', description: 'Test' });

    // shutdown should not throw
    expect(() => manager.shutdown()).not.toThrow();
  });

  it('should isolate bash execution for parallel sub-agent tasks', async () => {
    const client = createParallelToolClient();
    const manager = new SubAgentManager(createManagerOptions({ client, bashTool }));

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
    const manager = new SubAgentManager(createManagerOptions({
      client,
      bashTool,
      onComplete: (event: SubAgentCompleteEvent) => completedEvents.push(event),
    }));
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
    const manager = new SubAgentManager(createManagerOptions({ client, bashTool }));

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
