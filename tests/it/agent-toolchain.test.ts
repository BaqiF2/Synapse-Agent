import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AgentRunner } from '../../src/agent/agent-runner.ts';
import { CallableToolset } from '../../src/tools/toolset.ts';
import { ReadHandler } from '../../src/tools/handlers/agent-bash/read.ts';
import { ToolOk } from '../../src/tools/callable-tool.ts';
import type { CallableTool } from '../../src/tools/callable-tool.ts';
import type { AnthropicClient } from '../../src/providers/anthropic/anthropic-client.ts';
import type { StreamedMessagePart } from '../../src/providers/anthropic/anthropic-types.ts';

function createReadTool(): CallableTool<{ command: string }> {
  const handler = new ReadHandler();
  return {
    name: 'Bash',
    description: 'Read tool wrapper',
    paramsSchema: {} as any,
    toolDefinition: { name: 'Bash', description: 'mock', input_schema: { type: 'object', properties: {} } } as any,
    call: (args: { command: string }) => handler.execute(args.command).then((result) =>
      result.exitCode === 0
        ? ToolOk({ output: result.stdout })
        : { isError: true, output: result.stdout, message: result.stderr, brief: result.stderr }
    ),
  } as CallableTool<{ command: string }>;
}

function createMockClient(partsList: StreamedMessagePart[][]): AnthropicClient {
  let callIndex = 0;
  return {
    generate: mock(() => {
      const parts = partsList[callIndex++] || [{ type: 'text', text: 'Default' }];
      return Promise.resolve({
        id: `msg_${callIndex}`,
        usage: { inputOther: 1, output: 1, inputCacheRead: 0, inputCacheCreation: 0 },
        async *[Symbol.asyncIterator]() {
          for (const part of parts) yield part;
        },
      });
    }),
  } as unknown as AnthropicClient;
}

describe('IT: Agent Toolchain', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-agent-it-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should execute tool call and return final response', async () => {
    const filePath = path.join(tempDir, 'sample.txt');
    fs.writeFileSync(filePath, 'hello', 'utf-8');

    const client = createMockClient([
      [
        { type: 'text', text: 'Reading' },
        { type: 'tool_call', id: 'c1', name: 'Bash', input: { command: `read ${filePath}` } },
      ],
      [{ type: 'text', text: 'Done' }],
    ]);

    const toolset = new CallableToolset([createReadTool()]);
    const runner = new AgentRunner({
      client,
      systemPrompt: 'Test',
      toolset,
      enableStopHooks: false,
    });

    const response = await runner.run('read file');

    expect(response).toBe('Done');
    expect(runner.getHistory().length).toBeGreaterThan(0);
  });
});
