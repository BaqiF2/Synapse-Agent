import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { McpInstaller } from '../../../../../src/tools/converters/mcp/installer.ts';

function makeWrapper(commandName: string, description?: string) {
  const descLine = description ? `* Description: ${description}` : '';
  return {
    commandName,
    content: `#!/usr/bin/env node\n${descLine}\nconsole.log('ok');\n`,
  };
}

describe('McpInstaller', () => {
  let homeDir: string;
  let installer: McpInstaller;

  beforeEach(() => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-home-'));
    installer = new McpInstaller(homeDir);
  });

  afterEach(() => {
    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  it('should install wrapper and list tools', () => {
    const wrapper = makeWrapper('mcp:test:echo', 'Echo tool');
    const result = installer.install(wrapper);

    expect(result.success).toBe(true);
    expect(fs.existsSync(result.path)).toBe(true);

    const tools = installer.listTools();
    expect(tools.length).toBe(1);
    expect(tools[0]?.commandName).toBe('mcp:test:echo');
    expect(tools[0]?.description).toBe('Echo tool');
  });

  it('should filter by type and server', () => {
    installer.install(makeWrapper('mcp:alpha:tool'));
    installer.install(makeWrapper('skill:beta:run'));

    const mcpOnly = installer.search({ type: 'mcp' });
    expect(mcpOnly.total).toBe(1);

    const byServer = installer.search({ serverName: 'beta' });
    expect(byServer.total).toBe(1);
    expect(byServer.tools[0]?.commandName).toBe('skill:beta:run');
  });

  it('should remove tool', () => {
    installer.install(makeWrapper('mcp:remove:tool'));

    expect(installer.remove('mcp:remove:tool')).toBe(true);
    expect(installer.listTools().length).toBe(0);
  });

  it('should format search results', () => {
    installer.install(makeWrapper('mcp:test:echo'));

    const result = installer.search({ pattern: 'mcp:test:*' });
    const output = installer.formatSearchResult(result);

    expect(output).toContain('Found 1 tool');
    expect(output).toContain('MCP Tools');
  });
});
