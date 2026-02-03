import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { McpConfigParser } from '../../src/tools/converters/mcp/config-parser.ts';

function writeConfig(filePath: string) {
  const config = {
    mcpServers: {
      local: { command: 'node', args: ['server.js'] },
      remote: { url: 'https://example.com/mcp' },
    },
  };
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');
}

describe('IT: MCP config parser flow', () => {
  let tempDir: string;
  let homeDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-mcp-'));
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-home-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  it('should parse config from cwd and return servers', () => {
    const configPath = path.join(tempDir, 'mcp_servers.json');
    writeConfig(configPath);

    const parser = new McpConfigParser(tempDir, homeDir);
    const result = parser.parse();

    expect(result.success).toBe(true);
    expect(result.servers.length).toBe(2);
  });

  it('should report errors for invalid config', () => {
    const configPath = path.join(tempDir, 'mcp_servers.json');
    fs.writeFileSync(configPath, '{invalid json', 'utf-8');

    const parser = new McpConfigParser(tempDir, homeDir);
    const result = parser.parse();

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
