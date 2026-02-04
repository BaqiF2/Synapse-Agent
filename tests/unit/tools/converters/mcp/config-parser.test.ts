import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { McpConfigParser } from '../../../../../src/tools/converters/mcp/config-parser.ts';

function writeConfig(filePath: string, servers: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({ mcpServers: servers }, null, 2), 'utf-8');
}

describe('McpConfigParser', () => {
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

  it('should merge configs with cwd taking priority', () => {
    const homeConfig = path.join(homeDir, '.synapse', 'mcp', 'mcp_servers.json');
    const cwdConfig = path.join(tempDir, 'mcp_servers.json');

    writeConfig(homeConfig, {
      server: { url: 'https://home.example.com' },
      shared: { url: 'https://home.shared.com' },
    });
    writeConfig(cwdConfig, {
      shared: { url: 'https://cwd.shared.com' },
    });

    const parser = new McpConfigParser(tempDir, homeDir);
    const result = parser.parse();

    const shared = result.servers.find((s) => s.name === 'shared');
    expect(shared?.config).toEqual({ url: 'https://cwd.shared.com' });
    expect(result.servers.some((s) => s.name === 'server')).toBe(true);
  });

  it('should return command and url servers', () => {
    const cwdConfig = path.join(tempDir, 'mcp_servers.json');
    writeConfig(cwdConfig, {
      local: { command: 'node', args: ['server.js'] },
      remote: { url: 'https://example.com' },
    });

    const parser = new McpConfigParser(tempDir, homeDir);

    expect(parser.getCommandServers().length).toBe(1);
    expect(parser.getUrlServers().length).toBe(1);
  });

  it('should create example config when missing', () => {
    const parser = new McpConfigParser(tempDir, homeDir);

    const createdPath = parser.createExampleConfig();

    expect(createdPath).not.toBeNull();
    expect(createdPath && fs.existsSync(createdPath)).toBe(true);
  });
});
