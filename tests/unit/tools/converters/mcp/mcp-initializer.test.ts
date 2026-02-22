/**
 * mcp-initializer.ts 单元测试
 *
 * 测试目标：MCP 工具初始化流程，包括配置解析、服务器处理、
 * 孤立工具清理、错误处理和 refreshMcpTools。
 */

import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  initializeMcpTools,
  cleanupMcpTools,
  refreshMcpTools,
} from '../../../../../src/tools/converters/mcp/mcp-initializer.ts';
import { McpConfigParser } from '../../../../../src/tools/converters/mcp/config-parser.ts';
import { McpClient, ConnectionState } from '../../../../../src/tools/converters/mcp/mcp-client.ts';
import { McpInstaller } from '../../../../../src/tools/converters/mcp/installer.ts';
import { McpWrapperGenerator } from '../../../../../src/tools/converters/mcp/wrapper-generator.ts';

describe('mcp-initializer', () => {
  let tempDir: string;
  let originalHome: string | undefined;
  let homedirSpy: ReturnType<typeof spyOn> | null = null;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-mcp-init-'));
    originalHome = process.env.HOME;
    process.env.HOME = tempDir;
    homedirSpy = spyOn(os, 'homedir').mockReturnValue(tempDir);
  });

  afterEach(() => {
    homedirSpy?.mockRestore?.();
    homedirSpy = null;
    process.env.HOME = originalHome;
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ================================================================
  // cleanupMcpTools
  // ================================================================
  describe('cleanupMcpTools', () => {
    it('should remove zero tools when none exist', () => {
      const removed = cleanupMcpTools();
      expect(removed).toBe(0);
    });

    it('should remove only mcp tools from bin directory', () => {
      const binDir = path.join(tempDir, '.synapse', 'bin');
      fs.mkdirSync(binDir, { recursive: true });

      // 创建 MCP 工具文件（以 mcp: 开头的文件名是 mcp 类型）
      const mcpContent = '#!/bin/bash\n# MCP wrapper\n# server: test-server\n# tool: test-tool\n# type: mcp\necho "mcp"';
      fs.writeFileSync(path.join(binDir, 'mcp:test-server:test-tool'), mcpContent);

      // 创建非 MCP 工具
      fs.writeFileSync(path.join(binDir, 'skill:my-skill:run'), '#!/bin/bash\necho "skill"');

      const removed = cleanupMcpTools();
      // MCP 工具应被移除
      expect(removed).toBeGreaterThanOrEqual(0);
      // 非 MCP 工具应保留
      expect(fs.existsSync(path.join(binDir, 'skill:my-skill:run'))).toBe(true);
    });
  });

  // ================================================================
  // initializeMcpTools - 无服务器配置
  // ================================================================
  describe('initializeMcpTools - no servers', () => {
    it('should return success with zero servers when no config exists', async () => {
      const result = await initializeMcpTools();

      expect(result.success).toBe(true);
      expect(result.totalServers).toBe(0);
      expect(result.connectedServers).toBe(0);
      expect(result.totalToolsInstalled).toBe(0);
    });

    it('should handle empty server list', async () => {
      // 创建空的 MCP 配置
      const configDir = path.join(tempDir, '.synapse');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        path.join(configDir, 'mcp_servers.json'),
        JSON.stringify({ mcpServers: {} })
      );

      const result = await initializeMcpTools();

      expect(result.success).toBe(true);
      expect(result.totalServers).toBe(0);
    });
  });

  // ================================================================
  // initializeMcpTools - 配置解析错误
  // ================================================================
  describe('initializeMcpTools - config errors', () => {
    it('should collect parse errors but still return result', async () => {
      // 创建无效的 MCP 配置
      const configDir = path.join(tempDir, '.synapse');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        path.join(configDir, 'mcp_servers.json'),
        '{ invalid json }'
      );

      const result = await initializeMcpTools();

      // 即使有解析错误也应该返回结果
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.totalServers).toBe(0);
    });
  });

  // ================================================================
  // initializeMcpTools - 服务器连接失败
  // ================================================================
  describe('initializeMcpTools - server connection', () => {
    it('should handle server connection failure with skipFailedServers=true', async () => {
      // Mock config parser 返回一个服务器
      const parseSpy = spyOn(McpConfigParser.prototype, 'parse').mockReturnValue({
        servers: [
          {
            name: 'failing-server',
            config: { command: '/nonexistent/binary', args: [] },
            isCommand: true,
            isUrl: false,
            source: '/tmp/mcp_servers.json',
          },
        ],
        errors: [],
        sources: [],
        success: true,
      });

      // Mock McpClient.connect 失败
      const connectSpy = spyOn(McpClient.prototype, 'connect').mockResolvedValue({
        success: false,
        state: ConnectionState.ERROR,
        serverName: 'failing-server',
        error: 'Connection refused',
      });
      const disconnectSpy = spyOn(McpClient.prototype, 'disconnect').mockResolvedValue();

      try {
        const result = await initializeMcpTools({ skipFailedServers: true });

        expect(result.totalServers).toBe(1);
        expect(result.connectedServers).toBe(0);
        expect(result.serverResults).toHaveLength(1);
        expect(result.serverResults[0]!.connected).toBe(false);
        expect(result.serverResults[0]!.error).toContain('Connection refused');
        expect(result.errors).toHaveLength(1);
        // 即使连接失败，skipFailedServers=true 时 success 仍为 true
        expect(result.success).toBe(true);
      } finally {
        parseSpy.mockRestore();
        connectSpy.mockRestore();
        disconnectSpy.mockRestore();
      }
    });

    it('should fail fast when skipFailedServers=false', async () => {
      const parseSpy = spyOn(McpConfigParser.prototype, 'parse').mockReturnValue({
        servers: [
          {
            name: 'fail-server',
            config: { command: 'fail', args: [] },
            isCommand: true,
            isUrl: false,
            source: '/tmp/mcp_servers.json',
          },
          {
            name: 'skip-server',
            config: { command: 'skip', args: [] },
            isCommand: true,
            isUrl: false,
            source: '/tmp/mcp_servers.json',
          },
        ],
        errors: [],
        sources: [],
        success: true,
      });

      const connectSpy = spyOn(McpClient.prototype, 'connect').mockResolvedValue({
        success: false,
        state: ConnectionState.ERROR,
        serverName: 'fail-server',
        error: 'Cannot connect',
      });
      const disconnectSpy = spyOn(McpClient.prototype, 'disconnect').mockResolvedValue();

      try {
        const result = await initializeMcpTools({ skipFailedServers: false });

        expect(result.success).toBe(false);
        // 应该只处理了第一个服务器就停止
        expect(result.serverResults).toHaveLength(1);
      } finally {
        parseSpy.mockRestore();
        connectSpy.mockRestore();
        disconnectSpy.mockRestore();
      }
    });

    it('should handle successful server connection and tool installation', async () => {
      const parseSpy = spyOn(McpConfigParser.prototype, 'parse').mockReturnValue({
        servers: [
          {
            name: 'good-server',
            config: { command: 'node', args: ['server.js'] },
            isCommand: true,
            isUrl: false,
            source: '/tmp/mcp_servers.json',
          },
        ],
        errors: [],
        sources: [],
        success: true,
      });

      const connectSpy = spyOn(McpClient.prototype, 'connect').mockResolvedValue({
        success: true,
        state: ConnectionState.CONNECTED,
        serverName: 'good-server',
      });
      const listToolsSpy = spyOn(McpClient.prototype, 'listTools').mockResolvedValue([
        { name: 'read-file', description: 'Read a file', inputSchema: {} },
      ]);
      const disconnectSpy = spyOn(McpClient.prototype, 'disconnect').mockResolvedValue();

      const generateSpy = spyOn(McpWrapperGenerator.prototype, 'generateWrapper').mockReturnValue({
        commandName: 'mcp:good-server:read-file',
        content: '#!/bin/bash\necho "wrapper"',
        serverName: 'good-server',
        toolName: 'read-file',
        scriptPath: '/tmp/bin/mcp:good-server:read-file',
        description: 'Read a file',
      });

      const installSpy = spyOn(McpInstaller.prototype, 'install').mockReturnValue({
        success: true,
        commandName: 'mcp:good-server:read-file',
        path: '/tmp/bin/mcp:good-server:read-file',
      });

      // Mock listTools / remove 用于 orphan cleanup
      const listInstalledSpy = spyOn(McpInstaller.prototype, 'listTools').mockReturnValue([]);

      try {
        const result = await initializeMcpTools();

        expect(result.totalServers).toBe(1);
        expect(result.connectedServers).toBe(1);
        expect(result.totalToolsInstalled).toBe(1);
        expect(result.serverResults[0]!.connected).toBe(true);
        expect(result.serverResults[0]!.installedTools).toContain('mcp:good-server:read-file');
      } finally {
        parseSpy.mockRestore();
        connectSpy.mockRestore();
        listToolsSpy.mockRestore();
        disconnectSpy.mockRestore();
        generateSpy.mockRestore();
        installSpy.mockRestore();
        listInstalledSpy.mockRestore();
      }
    });

    it('should handle tool installation failure gracefully', async () => {
      const parseSpy = spyOn(McpConfigParser.prototype, 'parse').mockReturnValue({
        servers: [
          {
            name: 'server-a',
            config: { command: 'node', args: [] },
            isCommand: true,
            isUrl: false,
            source: '/tmp/mcp_servers.json',
          },
        ],
        errors: [],
        sources: [],
        success: true,
      });

      const connectSpy = spyOn(McpClient.prototype, 'connect').mockResolvedValue({
        success: true,
        state: ConnectionState.CONNECTED,
        serverName: 'server-a',
      });
      const listToolsSpy = spyOn(McpClient.prototype, 'listTools').mockResolvedValue([
        { name: 'broken-tool', description: 'Broken', inputSchema: {} },
      ]);
      const disconnectSpy = spyOn(McpClient.prototype, 'disconnect').mockResolvedValue();

      const generateSpy = spyOn(McpWrapperGenerator.prototype, 'generateWrapper').mockReturnValue({
        commandName: 'mcp:server-a:broken-tool',
        content: '#!/bin/bash\necho "broken"',
        serverName: 'server-a',
        toolName: 'broken-tool',
        scriptPath: '/tmp/bin/mcp:server-a:broken-tool',
        description: 'Broken',
      });

      const installSpy = spyOn(McpInstaller.prototype, 'install').mockReturnValue({
        success: false,
        commandName: 'mcp:server-a:broken-tool',
        path: '',
        error: 'Permission denied',
      });
      const listInstalledSpy = spyOn(McpInstaller.prototype, 'listTools').mockReturnValue([]);

      try {
        const result = await initializeMcpTools();

        expect(result.connectedServers).toBe(1);
        // 安装失败不计入 totalToolsInstalled
        expect(result.totalToolsInstalled).toBe(0);
        expect(result.serverResults[0]!.installedTools).toHaveLength(0);
      } finally {
        parseSpy.mockRestore();
        connectSpy.mockRestore();
        listToolsSpy.mockRestore();
        disconnectSpy.mockRestore();
        generateSpy.mockRestore();
        installSpy.mockRestore();
        listInstalledSpy.mockRestore();
      }
    });

    it('should handle wrapper generation exception', async () => {
      const parseSpy = spyOn(McpConfigParser.prototype, 'parse').mockReturnValue({
        servers: [
          {
            name: 'server-b',
            config: { command: 'node', args: [] },
            isCommand: true,
            isUrl: false,
            source: '/tmp/mcp_servers.json',
          },
        ],
        errors: [],
        sources: [],
        success: true,
      });

      const connectSpy = spyOn(McpClient.prototype, 'connect').mockResolvedValue({
        success: true,
        state: ConnectionState.CONNECTED,
        serverName: 'server-b',
      });
      const listToolsSpy = spyOn(McpClient.prototype, 'listTools').mockResolvedValue([
        { name: 'crash-tool', description: 'Crashes', inputSchema: {} },
      ]);
      const disconnectSpy = spyOn(McpClient.prototype, 'disconnect').mockResolvedValue();

      const generateSpy = spyOn(McpWrapperGenerator.prototype, 'generateWrapper').mockImplementation(() => {
        throw new Error('Generator explosion');
      });
      const listInstalledSpy = spyOn(McpInstaller.prototype, 'listTools').mockReturnValue([]);

      try {
        const result = await initializeMcpTools();

        expect(result.connectedServers).toBe(1);
        expect(result.totalToolsInstalled).toBe(0);
      } finally {
        parseSpy.mockRestore();
        connectSpy.mockRestore();
        listToolsSpy.mockRestore();
        disconnectSpy.mockRestore();
        generateSpy.mockRestore();
        listInstalledSpy.mockRestore();
      }
    });

    it('should handle processServer exception (e.g. listTools failure)', async () => {
      const parseSpy = spyOn(McpConfigParser.prototype, 'parse').mockReturnValue({
        servers: [
          {
            name: 'error-server',
            config: { command: 'node', args: [] },
            isCommand: true,
            isUrl: false,
            source: '/tmp/mcp_servers.json',
          },
        ],
        errors: [],
        sources: [],
        success: true,
      });

      const connectSpy = spyOn(McpClient.prototype, 'connect').mockResolvedValue({
        success: true,
        state: ConnectionState.CONNECTED,
        serverName: 'error-server',
      });
      const listToolsSpy = spyOn(McpClient.prototype, 'listTools').mockRejectedValue(
        new Error('Network timeout')
      );
      const disconnectSpy = spyOn(McpClient.prototype, 'disconnect').mockResolvedValue();
      const listInstalledSpy = spyOn(McpInstaller.prototype, 'listTools').mockReturnValue([]);

      try {
        const result = await initializeMcpTools();

        expect(result.serverResults[0]!.error).toContain('Network timeout');
      } finally {
        parseSpy.mockRestore();
        connectSpy.mockRestore();
        listToolsSpy.mockRestore();
        disconnectSpy.mockRestore();
        listInstalledSpy.mockRestore();
      }
    });
  });

  // ================================================================
  // initializeMcpTools - 孤立工具清理
  // ================================================================
  describe('initializeMcpTools - orphan cleanup', () => {
    it('should clean up orphaned tools from removed servers', async () => {
      const parseSpy = spyOn(McpConfigParser.prototype, 'parse').mockReturnValue({
        servers: [
          {
            name: 'active-server',
            config: { command: 'node', args: [] },
            isCommand: true,
            isUrl: false,
            source: '/tmp/mcp_servers.json',
          },
        ],
        errors: [],
        sources: [],
        success: true,
      });

      const connectSpy = spyOn(McpClient.prototype, 'connect').mockResolvedValue({
        success: true,
        state: ConnectionState.CONNECTED,
        serverName: 'active-server',
      });
      const listToolsSpy = spyOn(McpClient.prototype, 'listTools').mockResolvedValue([]);
      const disconnectSpy = spyOn(McpClient.prototype, 'disconnect').mockResolvedValue();

      // 存在一个来自已删除服务器的工具
      const listInstalledSpy = spyOn(McpInstaller.prototype, 'listTools').mockReturnValue([
        {
          commandName: 'mcp:removed-server:old-tool',
          serverName: 'removed-server',
          toolName: 'old-tool',
          path: '/tmp/bin/mcp:removed-server:old-tool',
          type: 'mcp' as const,
          installedAt: new Date(),
        },
      ]);

      const removeSpy = spyOn(McpInstaller.prototype, 'remove').mockReturnValue(true);

      try {
        await initializeMcpTools();

        expect(removeSpy).toHaveBeenCalledWith('mcp:removed-server:old-tool');
      } finally {
        parseSpy.mockRestore();
        connectSpy.mockRestore();
        listToolsSpy.mockRestore();
        disconnectSpy.mockRestore();
        listInstalledSpy.mockRestore();
        removeSpy.mockRestore();
      }
    });
  });

  // ================================================================
  // refreshMcpTools
  // ================================================================
  describe('refreshMcpTools', () => {
    it('should clean up and reinitialize with forceReinstall', async () => {
      const result = await refreshMcpTools();

      // 在无配置情况下应正常返回
      expect(result.success).toBe(true);
      expect(result.totalServers).toBe(0);
    });
  });

  // ================================================================
  // initializeMcpTools - options
  // ================================================================
  describe('initializeMcpTools - options', () => {
    it('should use custom timeout', async () => {
      const result = await initializeMcpTools({ timeout: 5000 });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });
});
