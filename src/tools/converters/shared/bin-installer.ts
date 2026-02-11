/**
 * Bin Installer (公共基类)
 *
 * 功能：管理 ~/.synapse/bin/ 目录中的可执行脚本安装、移除和查询。
 * 统一 MCP installer 和 Skill wrapper-generator 中的重复逻辑。
 *
 * 核心导出：
 * - BinInstaller: 提供 install / remove / removeByPrefix / ensureBinDir 等通用操作
 * - InstallResult: 安装操作结果
 * - EXECUTABLE_MODE: 可执行文件权限常量 (0o755)
 * - DEFAULT_BIN_DIR: 默认 bin 目录相对路径
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

/** 默认 bin 目录的相对路径 */
export const DEFAULT_BIN_DIR = '.synapse/bin';

/** 可执行脚本文件权限 (755) */
export const EXECUTABLE_MODE = 0o755;

/** 安装操作结果 */
export interface InstallResult {
  success: boolean;
  commandName: string;
  path: string;
  error?: string;
}

/** 要安装的脚本信息 */
export interface InstallableScript {
  /** 命令名称，如 mcp:server:tool 或 skill:name:tool */
  commandName: string;
  /** 脚本内容 */
  content: string;
  /** 安装路径（可选，默认由 BinInstaller 根据 commandName 生成） */
  targetPath?: string;
}

/**
 * BinInstaller — 管理 bin 目录中可执行脚本的安装和移除
 *
 * 提供统一的脚本文件写入、权限设置、移除操作，
 * 供 McpInstaller 和 SkillWrapperGenerator 共用。
 */
export class BinInstaller {
  private readonly binDir: string;

  constructor(homeDir: string = os.homedir()) {
    this.binDir = path.join(homeDir, DEFAULT_BIN_DIR);
  }

  /** 获取 bin 目录路径 */
  getBinDir(): string {
    return this.binDir;
  }

  /** 确保 bin 目录存在 */
  ensureBinDir(): void {
    if (!fs.existsSync(this.binDir)) {
      fs.mkdirSync(this.binDir, { recursive: true });
    }
  }

  /**
   * 安装单个脚本到 bin 目录
   *
   * 写入脚本内容并设置可执行权限。
   */
  install(script: InstallableScript): InstallResult {
    try {
      this.ensureBinDir();
      const targetPath = script.targetPath ?? path.join(this.binDir, script.commandName);
      fs.writeFileSync(targetPath, script.content, { encoding: 'utf-8' });
      fs.chmodSync(targetPath, EXECUTABLE_MODE);
      return { success: true, commandName: script.commandName, path: targetPath };
    } catch (error) {
      return {
        success: false,
        commandName: script.commandName,
        path: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** 批量安装脚本 */
  installAll(scripts: InstallableScript[]): InstallResult[] {
    return scripts.map((s) => this.install(s));
  }

  /**
   * 按命令名称移除已安装的脚本
   *
   * @returns true 表示移除成功，false 表示文件不存在
   */
  remove(commandName: string): boolean {
    const scriptPath = path.join(this.binDir, commandName);
    if (fs.existsSync(scriptPath)) {
      fs.unlinkSync(scriptPath);
      return true;
    }
    return false;
  }

  /**
   * 移除所有匹配前缀的脚本
   *
   * @param prefix - 命令名称前缀，如 "mcp:server:" 或 "skill:name:"
   * @returns 移除的脚本数量
   */
  removeByPrefix(prefix: string): number {
    if (!fs.existsSync(this.binDir)) {
      return 0;
    }
    let removed = 0;
    const files = fs.readdirSync(this.binDir);
    for (const file of files) {
      if (file.startsWith(prefix)) {
        fs.unlinkSync(path.join(this.binDir, file));
        removed++;
      }
    }
    return removed;
  }

  /** 列出 bin 目录中的所有文件名 */
  listFiles(): string[] {
    if (!fs.existsSync(this.binDir)) {
      return [];
    }
    return fs.readdirSync(this.binDir);
  }

  /** 获取文件完整路径 */
  getFilePath(fileName: string): string {
    return path.join(this.binDir, fileName);
  }
}
