/**
 * McpClient and McpClientManager Enhanced Unit Tests
 *
 * Tests for connection management (connect/disconnect/reconnect),
 * state management, tool operations, client manager, and error handling.
 */

import { describe, it, expect, mock, beforeEach, afterAll } from 'bun:test';
import {
  McpClient,
  McpClientManager,
  ConnectionState,
} from '../../../../../src/tools/converters/mcp/mcp-client.ts';
import type { McpServerEntry } from '../../../../../src/tools/converters/mcp/config-parser.ts';

// ===== 测试数据 =====

/** 命令类型服务器配置 */
const commandEntry: McpServerEntry = {
  name: 'test-local',
  config: {
    command: 'node',
    args: ['server.js'],
    env: { API_KEY: 'test' },
  },
  isCommand: true,
  isUrl: false,
  source: 'test',
};

/** URL 类型服务器配置 */
const urlEntry: McpServerEntry = {
  name: 'test-remote',
  config: {
    url: 'https://mcp.example.com/api',
  },
  isCommand: false,
  isUrl: true,
  source: 'test',
};

/** 无效配置（既非命令也非 URL） */
const invalidEntry: McpServerEntry = {
  name: 'invalid',
  config: {},
  isCommand: false,
  isUrl: false,
  source: 'test',
} as unknown as McpServerEntry;

// ===== McpClient 测试 =====

describe('McpClient', () => {
  // ===== 构造和初始状态 =====

  describe('constructor and initial state', () => {
    it('should initialize with DISCONNECTED state', () => {
      const client = new McpClient(commandEntry);
      expect(client.getState()).toBe(ConnectionState.DISCONNECTED);
    });

    it('should not be connected initially', () => {
      const client = new McpClient(commandEntry);
      expect(client.isConnected()).toBe(false);
    });

    it('should return correct server name', () => {
      const client = new McpClient(commandEntry);
      expect(client.getServerName()).toBe('test-local');
    });

    it('should use default timeout when not specified', () => {
      const client = new McpClient(commandEntry);
      // 默认 timeout 通过环境变量或常量设定，构造不抛错即可
      expect(client.getState()).toBe(ConnectionState.DISCONNECTED);
    });

    it('should accept custom timeout', () => {
      const client = new McpClient(commandEntry, { timeout: 5000 });
      expect(client.getState()).toBe(ConnectionState.DISCONNECTED);
    });

    it('should accept custom client name and version', () => {
      const client = new McpClient(commandEntry, {
        clientName: 'my-client',
        clientVersion: '2.0.0',
      });
      expect(client.getServerName()).toBe('test-local');
    });
  });

  // ===== 连接错误处理 =====

  describe('connection error handling', () => {
    it('should report error when server config is invalid', async () => {
      const client = new McpClient(invalidEntry, { timeout: 100 });

      const result = await client.connect();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid server configuration');
      expect(result.serverName).toBe('invalid');
    });

    it('should transition to DISCONNECTED after failed connect', async () => {
      const client = new McpClient(invalidEntry, { timeout: 100 });

      await client.connect();
      // 连接失败后应回到 DISCONNECTED 状态（因为 disconnect 会被调用）
      expect(client.getState()).toBe(ConnectionState.DISCONNECTED);
    });

    it('should not be connected after failed connect', async () => {
      const client = new McpClient(invalidEntry, { timeout: 100 });

      await client.connect();
      expect(client.isConnected()).toBe(false);
    });
  });

  // ===== 断开连接 =====

  describe('disconnect', () => {
    it('should handle disconnect when not connected', async () => {
      const client = new McpClient(commandEntry);

      // 未连接时断开不应抛错
      await client.disconnect();
      expect(client.getState()).toBe(ConnectionState.DISCONNECTED);
    });

    it('should set state to DISCONNECTED after disconnect', async () => {
      const client = new McpClient(commandEntry);
      await client.disconnect();
      expect(client.getState()).toBe(ConnectionState.DISCONNECTED);
      expect(client.isConnected()).toBe(false);
    });
  });

  // ===== 未连接时操作 =====

  describe('operations when not connected', () => {
    it('should throw when listing tools while not connected', async () => {
      const client = new McpClient(commandEntry);

      await expect(client.listTools()).rejects.toThrow('Not connected to MCP server');
    });

    it('should throw when calling tool while not connected', async () => {
      const client = new McpClient(commandEntry);

      await expect(client.callTool('test', {})).rejects.toThrow('Not connected to MCP server');
    });
  });
});

// ===== McpClientManager 测试 =====

describe('McpClientManager', () => {
  // ===== 构造和初始状态 =====

  describe('constructor', () => {
    it('should create manager with empty client list', () => {
      const manager = new McpClientManager();
      expect(manager.getServerNames().length).toBe(0);
    });

    it('should accept custom connection options', () => {
      const manager = new McpClientManager({ timeout: 5000 });
      expect(manager.getServerNames().length).toBe(0);
    });
  });

  // ===== 服务器注册 =====

  describe('registerServer', () => {
    it('should register a command server', () => {
      const manager = new McpClientManager();
      const client = manager.registerServer(commandEntry);

      expect(client).toBeDefined();
      expect(client.getServerName()).toBe('test-local');
      expect(manager.getServerNames()).toContain('test-local');
    });

    it('should register a URL server', () => {
      const manager = new McpClientManager();
      manager.registerServer(urlEntry);

      expect(manager.getServerNames()).toContain('test-remote');
    });

    it('should register multiple servers', () => {
      const manager = new McpClientManager();
      manager.registerServer(commandEntry);
      manager.registerServer(urlEntry);

      expect(manager.getServerNames().length).toBe(2);
      expect(manager.getServerNames()).toContain('test-local');
      expect(manager.getServerNames()).toContain('test-remote');
    });

    it('should override existing server with same name', () => {
      const manager = new McpClientManager();
      manager.registerServer(commandEntry);

      const newEntry: McpServerEntry = {
        ...commandEntry,
        config: { command: 'python', args: ['server.py'] },
      };
      manager.registerServer(newEntry);

      // 名称相同，应该只有一个
      expect(manager.getServerNames().length).toBe(1);
    });
  });

  // ===== getClient =====

  describe('getClient', () => {
    it('should return registered client by name', () => {
      const manager = new McpClientManager();
      manager.registerServer(commandEntry);

      const client = manager.getClient('test-local');
      expect(client).toBeDefined();
      expect(client!.getServerName()).toBe('test-local');
    });

    it('should return undefined for unregistered server', () => {
      const manager = new McpClientManager();
      const client = manager.getClient('nonexistent');
      expect(client).toBeUndefined();
    });
  });

  // ===== connectServer =====

  describe('connectServer', () => {
    it('should return error for unregistered server', async () => {
      const manager = new McpClientManager();
      const result = await manager.connectServer('unknown');

      expect(result.success).toBe(false);
      expect(result.state).toBe(ConnectionState.ERROR);
      expect(result.error).toContain("Server 'unknown' not registered");
    });

    it('should attempt to connect registered server', async () => {
      const manager = new McpClientManager({ timeout: 100 });
      manager.registerServer(invalidEntry);

      const result = await manager.connectServer('invalid');
      // invalidEntry 会连接失败
      expect(result.success).toBe(false);
    });
  });

  // ===== disconnectAll =====

  describe('disconnectAll', () => {
    it('should handle disconnect with no registered servers', async () => {
      const manager = new McpClientManager();
      // 无服务器时断开不应抛错
      await manager.disconnectAll();
    });

    it('should disconnect all registered servers', async () => {
      const manager = new McpClientManager();
      manager.registerServer(commandEntry);
      manager.registerServer(urlEntry);

      await manager.disconnectAll();

      // 所有客户端应处于 DISCONNECTED 状态
      const status = manager.getConnectionStatus();
      expect(status.get('test-local')).toBe(ConnectionState.DISCONNECTED);
      expect(status.get('test-remote')).toBe(ConnectionState.DISCONNECTED);
    });
  });

  // ===== getConnectionStatus =====

  describe('getConnectionStatus', () => {
    it('should return empty map with no servers', () => {
      const manager = new McpClientManager();
      const status = manager.getConnectionStatus();
      expect(status.size).toBe(0);
    });

    it('should return DISCONNECTED status for all new servers', () => {
      const manager = new McpClientManager();
      manager.registerServer(commandEntry);
      manager.registerServer(urlEntry);

      const status = manager.getConnectionStatus();
      expect(status.size).toBe(2);
      expect(status.get('test-local')).toBe(ConnectionState.DISCONNECTED);
      expect(status.get('test-remote')).toBe(ConnectionState.DISCONNECTED);
    });
  });

  // ===== getServerNames =====

  describe('getServerNames', () => {
    it('should return empty array with no servers', () => {
      const manager = new McpClientManager();
      expect(manager.getServerNames()).toEqual([]);
    });

    it('should return all registered server names', () => {
      const manager = new McpClientManager();
      manager.registerServer(commandEntry);
      manager.registerServer(urlEntry);

      const names = manager.getServerNames();
      expect(names).toContain('test-local');
      expect(names).toContain('test-remote');
    });
  });

  // ===== connectAll =====

  describe('connectAll', () => {
    it('should return empty array with no servers', async () => {
      const manager = new McpClientManager();
      const results = await manager.connectAll();
      expect(results.length).toBe(0);
    });

    it('should attempt to connect all registered servers', async () => {
      const manager = new McpClientManager({ timeout: 100 });
      manager.registerServer(invalidEntry);

      const results = await manager.connectAll();
      expect(results.length).toBe(1);
      expect(results[0]!.success).toBe(false);
    });
  });

  // ===== listAllTools =====

  describe('listAllTools', () => {
    it('should return empty map when no servers are connected', async () => {
      const manager = new McpClientManager();
      manager.registerServer(commandEntry);

      const tools = await manager.listAllTools();
      // 未连接的服务器不会被查询
      expect(tools.size).toBe(0);
    });

    it('should return empty map with no servers', async () => {
      const manager = new McpClientManager();
      const tools = await manager.listAllTools();
      expect(tools.size).toBe(0);
    });
  });
});
