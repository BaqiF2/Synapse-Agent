/**
 * 文件功能说明：
 * - 该文件位于 `src/tools/converters/mcp/installer.ts`，主要负责 安装 相关实现。
 * - 模块归属 工具、转换器、MCP 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `McpInstaller`
 * - `InstalledTool`
 * - `SearchOptions`
 * - `SearchResult`
 *
 * 作用说明：
 * - `McpInstaller`：封装该领域的核心流程与状态管理。
 * - `InstalledTool`：定义模块交互的数据结构契约。
 * - `SearchOptions`：定义模块交互的数据结构契约。
 * - `SearchResult`：定义模块交互的数据结构契约。
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import type { GeneratedWrapper } from './wrapper-generator.js';
import { BinInstaller, type InstallResult } from '../shared/bin-installer.ts';
// 重导出 InstallResult，供外部（如 mcp/index.ts）使用
export type { InstallResult } from '../shared/bin-installer.ts';

/**
 * 已安装工具的元数据
 */
export interface InstalledTool {
  commandName: string;
  serverName: string;
  toolName: string;
  path: string;
  description?: string;
  type: 'mcp' | 'skill';
  installedAt: Date;
}

/** 搜索选项 */
export interface SearchOptions {
  pattern?: string;
  regex?: RegExp;
  serverName?: string;
  type?: 'mcp' | 'skill' | 'all';
}

/** 搜索结果 */
export interface SearchResult {
  tools: InstalledTool[];
  total: number;
  pattern: string;
}

/**
 * McpInstaller — MCP 工具安装与搜索管理器
 *
 * 委托 BinInstaller 处理文件操作（install/remove/ensureBinDir），
 * 自身负责工具元数据解析、搜索过滤和结果格式化。
 */
export class McpInstaller {
  private readonly bin: BinInstaller;

  /**
   * 方法说明：初始化 McpInstaller 实例并设置初始状态。
   * @param homeDir 输入参数。
   */
  constructor(homeDir: string = os.homedir()) {
    this.bin = new BinInstaller(homeDir);
  }

  /**
   * 方法说明：读取并返回 getBinDir 对应的数据。
   */
  public getBinDir(): string {
    return this.bin.getBinDir();
  }

  /**
   * 方法说明：执行 ensureBinDir 相关逻辑。
   */
  public ensureBinDir(): void {
    this.bin.ensureBinDir();
  }

  /** 安装单个 wrapper 脚本
   * @param wrapper 输入参数。
   */
  public install(wrapper: GeneratedWrapper): InstallResult {
    return this.bin.install({ commandName: wrapper.commandName, content: wrapper.content });
  }

  /** 批量安装 wrapper 脚本
   * @param wrappers 集合数据。
   */
  public installAll(wrappers: GeneratedWrapper[]): InstallResult[] {
    return wrappers.map((w) => this.install(w));
  }

  /** 移除指定命令名称的已安装工具
   * @param commandName 输入参数。
   */
  public remove(commandName: string): boolean {
    return this.bin.remove(commandName);
  }

  /** 移除指定服务器的所有工具
   * @param serverName 输入参数。
   */
  public removeByServer(serverName: string): number {
    const tools = this.listTools();
    let removed = 0;
    for (const tool of tools) {
      if (tool.serverName === serverName && this.bin.remove(tool.commandName)) {
        removed++;
      }
    }
    return removed;
  }

  /** 列出所有已安装工具 */
  public listTools(): InstalledTool[] {
    const files = this.bin.listFiles();
    const tools: InstalledTool[] = [];

    for (const file of files) {
      const filePath = this.bin.getFilePath(file);
      const tool = this.parseToolFromFile(filePath, file);
      if (tool) {
        tools.push(tool);
      }
    }

    tools.sort((a, b) => a.commandName.localeCompare(b.commandName));
    return tools;
  }

  /** 搜索已安装工具
   * @param options 配置参数。
   */
  public search(options: SearchOptions = {}): SearchResult {
    let filtered = this.listTools();

    if (options.type && options.type !== 'all') {
      filtered = filtered.filter((t) => t.type === options.type);
    }
    if (options.serverName) {
      filtered = filtered.filter((t) => t.serverName === options.serverName);
    }

    const pattern = options.pattern || options.regex?.source || '*';

    if (options.regex) {
      filtered = filtered.filter(
        (t) =>
          options.regex!.test(t.commandName) ||
          options.regex!.test(t.toolName) ||
          (t.description && options.regex!.test(t.description)),
      );
    } else if (options.pattern && options.pattern !== '*') {
      const regex = this.patternToRegex(options.pattern);
      filtered = filtered.filter(
        (t) =>
          regex.test(t.commandName) ||
          regex.test(t.toolName) ||
          (t.description && regex.test(t.description)),
      );
    }

    return { tools: filtered, total: filtered.length, pattern };
  }

  /** 格式化搜索结果
   * @param result 输入参数。
   */
  public formatSearchResult(result: SearchResult): string {
    if (result.total === 0) {
      return `No tools found matching pattern: ${result.pattern}`;
    }

    const lines: string[] = [];
    lines.push(`Found ${result.total} tool${result.total > 1 ? 's' : ''}:\n`);

    const mcpTools = result.tools.filter((t) => t.type === 'mcp');
    const skillTools = result.tools.filter((t) => t.type === 'skill');

    if (mcpTools.length > 0) {
      lines.push('MCP Tools:');
      for (const tool of mcpTools) {
        lines.push(`  ${tool.commandName}`);
        if (tool.description) lines.push(`    ${tool.description}`);
      }
      if (skillTools.length > 0) lines.push('');
    }

    if (skillTools.length > 0) {
      lines.push('Skill Tools:');
      for (const tool of skillTools) {
        lines.push(`  ${tool.commandName}`);
        if (tool.description) lines.push(`    ${tool.description}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 方法说明：读取并返回 getPathExportCommand 对应的数据。
   */
  public getPathExportCommand(): string {
    return `export PATH="${this.bin.getBinDir()}:$PATH"`;
  }

  /**
   * 方法说明：判断 isBinDirInPath 对应条件是否成立。
   */
  public isBinDirInPath(): boolean {
    const pathEnv = process.env.PATH || '';
    return pathEnv.split(':').includes(this.bin.getBinDir());
  }

  // -- 私有方法 --

  /** 从文件名解析工具元数据
   * @param filePath 目标路径或文件信息。
   * @param fileName 目标路径或文件信息。
   */
  private parseToolFromFile(filePath: string, fileName: string): InstalledTool | null {
    try {
      let type: 'mcp' | 'skill';
      let serverName: string;
      let toolName: string;

      if (fileName.startsWith('mcp:')) {
        type = 'mcp';
        const parts = fileName.slice(4).split(':');
        if (parts.length < 2) return null;
        serverName = parts[0] ?? '';
        if (!serverName) return null;
        toolName = parts.slice(1).join(':');
      } else if (fileName.startsWith('skill:')) {
        type = 'skill';
        const parts = fileName.slice(6).split(':');
        if (parts.length < 2) return null;
        serverName = parts[0] ?? '';
        if (!serverName) return null;
        toolName = parts.slice(1).join(':');
      } else {
        return null;
      }

      // 提取脚本中的描述信息
      let description: string | undefined;
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const descMatch = content.match(/\* Description: (.+)/);
        if (descMatch) description = descMatch[1];
      } catch {
        // 忽略读取错误
      }

      const stats = fs.statSync(filePath);
      return { commandName: fileName, serverName, toolName, path: filePath, description, type, installedAt: stats.mtime };
    } catch {
      return null;
    }
  }

  /** 将 glob 模式转为正则表达式
   * @param pattern 输入参数。
   */
  private patternToRegex(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`, 'i');
  }
}

export default McpInstaller;
