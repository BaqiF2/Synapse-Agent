import { describe, it, expect } from 'bun:test';
import { McpClient, ConnectionState } from '../../../../../src/tools/converters/mcp/mcp-client.ts';
import type { McpServerEntry } from '../../../../../src/tools/converters/mcp/config-parser.ts';

const invalidEntry = {
  name: 'invalid',
  config: {},
  isCommand: false,
  isUrl: false,
  source: 'inline',
} as unknown as McpServerEntry;

describe('McpClient', () => {
  it('should report error when server config is invalid', async () => {
    const client = new McpClient(invalidEntry, { timeout: 10 });

    const result = await client.connect();

    expect(result.success).toBe(false);
    expect(result.state).toBe(ConnectionState.DISCONNECTED);
    expect(result.error).toContain('Invalid server configuration');
  });
});
