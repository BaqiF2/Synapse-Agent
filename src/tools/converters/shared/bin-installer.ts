/**
 * 文件功能说明：
 * - 该文件位于 `src/tools/converters/shared/bin-installer.ts`，主要负责 bin、安装 相关实现。
 * - 模块归属 工具、转换器、shared 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `BinInstaller`
 * - `InstallResult`
 * - `InstallableScript`
 * - `DEFAULT_BIN_DIR`
 * - `EXECUTABLE_MODE`
 *
 * 作用说明：
 * - `BinInstaller`：封装该领域的核心流程与状态管理。
 * - `InstallResult`：定义模块交互的数据结构契约。
 * - `InstallableScript`：定义模块交互的数据结构契约。
 * - `DEFAULT_BIN_DIR`：提供可复用的常量配置。
 * - `EXECUTABLE_MODE`：提供可复用的常量配置。
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

  /**
   * 方法说明：初始化 BinInstaller 实例并设置初始状态。
   * @param homeDir 输入参数。
   */
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
   * @param script 输入参数。
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

  /** 批量安装脚本
   * @param scripts 集合数据。
   */
  installAll(scripts: InstallableScript[]): InstallResult[] {
    return scripts.map((s) => this.install(s));
  }

  /**
   * 按命令名称移除已安装的脚本
   *
   * @returns true 表示移除成功，false 表示文件不存在
   * @param commandName 输入参数。
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

  /** 获取文件完整路径
   * @param fileName 目标路径或文件信息。
   */
  getFilePath(fileName: string): string {
    return path.join(this.binDir, fileName);
  }
}
