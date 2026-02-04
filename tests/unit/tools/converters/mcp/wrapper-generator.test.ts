import { describe, it, expect } from 'bun:test';
import { McpWrapperGenerator } from '../../../../../src/tools/converters/mcp/wrapper-generator.ts';
import type { McpToolInfo } from '../../../../../src/tools/converters/mcp/mcp-client.ts';

describe('McpWrapperGenerator', () => {
  it('should generate wrapper content with required and optional args', () => {
    const generator = new McpWrapperGenerator({ binDir: '/tmp/bin' });
    const tool: McpToolInfo = {
      name: 'echo',
      description: 'Echo tool',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Message' },
          times: { type: 'number', description: 'Times', default: 1 },
        },
        required: ['message'],
      },
    };

    const wrapper = generator.generateWrapper('server', tool);

    expect(wrapper.commandName).toBe('mcp:server:echo');
    expect(wrapper.scriptPath).toContain('/tmp/bin/mcp:server:echo');
    expect(wrapper.content).toContain('Usage: mcp:server:echo <message>');
    expect(wrapper.content).toContain('--times');
    expect(wrapper.content).toContain('Echo tool');
  });
});
