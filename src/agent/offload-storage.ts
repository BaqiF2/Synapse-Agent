/**
 * 文件功能说明：
 * - 该文件位于 `src/agent/offload-storage.ts`，主要负责 卸载、存储 相关实现。
 * - 模块归属 Agent 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `OffloadStorage`
 *
 * 作用说明：
 * - `OffloadStorage`：封装该领域的核心流程与状态管理。
 */

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const OFFLOADED_DIR_NAME = 'offloaded';

/**
 * 方法说明：判断 isJsonLike 对应条件是否成立。
 * @param content 输入参数。
 */
function isJsonLike(content: string): boolean {
  try {
    JSON.parse(content);
    return true;
  } catch {
    return false;
  }
}

/**
 * 方法说明：标准化 normalizeExtension 相关数据。
 * @param extension 输入参数。
 */
function normalizeExtension(extension: string): string {
  const trimmed = extension.trim();
  const withoutDot = trimmed.startsWith('.') ? trimmed.slice(1) : trimmed;
  return withoutDot || 'txt';
}

/**
 * 方法说明：执行 toErrorMessage 相关逻辑。
 * @param error 错误对象。
 */
function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class OffloadStorage {
  /**
   * 方法说明：初始化 OffloadStorage 实例并设置初始状态。
   * @param sessionDir 输入参数。
   */
  constructor(private readonly sessionDir: string) {}

  /**
   * 方法说明：读取并返回 getOffloadedDirPath 对应的数据。
   */
  getOffloadedDirPath(): string {
    return path.join(this.sessionDir, OFFLOADED_DIR_NAME);
  }

  /**
   * 方法说明：执行 listFiles 相关逻辑。
   */
  listFiles(): string[] {
    const offloadDir = this.getOffloadedDirPath();
    if (!fs.existsSync(offloadDir)) {
      return [];
    }

    const entries = fs.readdirSync(offloadDir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => path.join(offloadDir, entry.name));
  }

  /**
   * 方法说明：删除 remove 对应数据。
   * @param filepath 目标路径或文件信息。
   */
  remove(filepath: string): void {
    fs.unlinkSync(filepath);
  }

  /**
   * 方法说明：执行 save 相关逻辑。
   * @param content 输入参数。
   * @param extension 输入参数。
   */
  save(content: string, extension?: string): string {
    const extensionName = extension ? normalizeExtension(extension) : this.detectExtension(content);
    const filename = `${randomUUID()}.${extensionName}`;
    const filepath = path.join(this.getOffloadedDirPath(), filename);

    try {
      fs.mkdirSync(path.dirname(filepath), { recursive: true });
      fs.writeFileSync(filepath, content, 'utf-8');
      return filepath;
    } catch (error) {
      throw new Error(`Failed to save offloaded content: ${toErrorMessage(error)}`);
    }
  }

  /**
   * 方法说明：执行 detectExtension 相关逻辑。
   * @param content 输入参数。
   */
  private detectExtension(content: string): string {
    return isJsonLike(content) ? 'json' : 'txt';
  }
}
