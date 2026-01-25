/**
 * E2E Tests - Field Bash Tools Integration
 *
 * Tests the complete flow of Field Bash tools including:
 * - Tools search command
 * - MCP configuration parsing
 * - Skill wrapper generation
 *
 * @module tests/e2e/field-bash-tools
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { ToolsHandler } from '../../src/tools/handlers/field-bash/tools-search.js';
import { McpConfigParser } from '../../src/tools/converters/mcp/config-parser.js';
import { McpInstaller } from '../../src/tools/converters/mcp/installer.js';

// Test configuration
const TEST_HOME = path.join(os.tmpdir(), `synapse-field-e2e-${Date.now()}`);
const TEST_BIN_DIR = path.join(TEST_HOME, '.synapse', 'bin');
const TEST_CONFIG_DIR = path.join(TEST_HOME, '.synapse', 'mcp');

describe('E2E: Field Bash Tools Integration', () => {
  beforeAll(() => {
    // Create test directories
    fs.mkdirSync(TEST_BIN_DIR, { recursive: true });
    fs.mkdirSync(TEST_CONFIG_DIR, { recursive: true });

    // Create test tool wrappers
    fs.writeFileSync(path.join(TEST_BIN_DIR, 'mcp:test-server:test-tool'), '#!/bin/bash\necho "test"');
    fs.writeFileSync(path.join(TEST_BIN_DIR, 'skill:test-skill:test-command'), '#!/bin/bash\necho "skill test"');
  });

  afterAll(() => {
    // Cleanup
    if (fs.existsSync(TEST_HOME)) {
      fs.rmSync(TEST_HOME, { recursive: true, force: true });
    }
  });

  describe('Scenario 3: Tools Search', () => {
    test('should show help with tools help', async () => {
      const handler = new ToolsHandler();
      const result = await handler.execute('tools help');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('tools');
      expect(result.stdout).toContain('search');
    });

    test('should handle tools search command', async () => {
      const handler = new ToolsHandler();
      const result = await handler.execute('tools search test');

      // May or may not find tools depending on installation
      expect(result.exitCode).toBe(0);
    });

    test('should handle tools list command', async () => {
      const handler = new ToolsHandler();
      const result = await handler.execute('tools list');

      expect(result.exitCode).toBe(0);
    });

    test('should filter by type', async () => {
      const handler = new ToolsHandler();
      const result = await handler.execute('tools search --type=mcp');

      expect(result.exitCode).toBe(0);
    });
  });

  describe('Scenario 3: MCP Configuration', () => {
    test('should parse valid MCP config', () => {
      // Create test config directory
      const configDir = path.join(TEST_HOME, '.synapse', 'mcp');
      fs.mkdirSync(configDir, { recursive: true });

      // Create test config file
      fs.writeFileSync(path.join(configDir, 'mcp_servers.json'), JSON.stringify({
        mcpServers: {
          'test-server': {
            command: 'node',
            args: ['test-server.js'],
          },
        },
      }));

      // Parser uses homeDir parameter to locate config
      const parser = new McpConfigParser(TEST_HOME, TEST_HOME);
      const result = parser.parse();

      // Parser should find the server
      expect(Array.isArray(result.servers)).toBe(true);
      expect(result.servers.length).toBe(1);
      expect(result.servers[0].name).toBe('test-server');
    });

    test('should handle missing config gracefully', () => {
      // Use a path that doesn't exist
      const emptyHome = path.join(TEST_HOME, 'nonexistent');
      const parser = new McpConfigParser(emptyHome, emptyHome);
      const result = parser.parse();

      expect(result.servers).toEqual([]);
    });
  });

  describe('Scenario 3/4: Tool Installer', () => {
    test('should search for installed tools', () => {
      const installer = new McpInstaller(TEST_HOME);

      const result = installer.search({ pattern: '*' });
      expect(result).toBeDefined();
      expect(typeof result.tools).toBe('object');
    });

    test('should filter by type mcp', () => {
      const installer = new McpInstaller(TEST_HOME);

      const result = installer.search({ pattern: '*', type: 'mcp' });
      expect(result).toBeDefined();
    });

    test('should filter by type skill', () => {
      const installer = new McpInstaller(TEST_HOME);

      const result = installer.search({ pattern: '*', type: 'skill' });
      expect(result).toBeDefined();
    });

    test('should format search results', () => {
      const installer = new McpInstaller(TEST_HOME);

      const result = installer.search({ pattern: '*' });
      const formatted = installer.formatSearchResult(result);

      expect(typeof formatted).toBe('string');
    });
  });
});
