/**
 * Session 上下文管理模块
 *
 * 功能：管理会话的 offload 目录（卸载文件存储目录）、
 *       上下文相关的文件系统操作。
 *
 * 核心导出：
 * - SessionContext: 会话上下文管理类
 */

import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

// ===== SessionContext 类 =====

/**
 * 管理单个会话的 offload 目录和上下文文件操作
 */
export class SessionContext {
  private readonly sessionsDir: string;
  private readonly sessionId: string;

  constructor(sessionsDir: string, sessionId: string) {
    this.sessionsDir = sessionsDir;
    this.sessionId = sessionId;
  }

  /**
   * 会话级别的目录路径（存放 offload 子目录等）
   */
  get offloadSessionDir(): string {
    return path.join(this.sessionsDir, this.sessionId);
  }

  /**
   * 卸载文件存储目录路径
   */
  get offloadDirPath(): string {
    return path.join(this.offloadSessionDir, 'offloaded');
  }

  /**
   * 统计卸载文件数量
   */
  countOffloadedFiles(): number {
    if (!fs.existsSync(this.offloadDirPath)) {
      return 0;
    }

    try {
      const entries = fs.readdirSync(this.offloadDirPath, { withFileTypes: true });
      return entries.filter((entry) => entry.isFile()).length;
    } catch {
      return 0;
    }
  }

  /**
   * 清除 offload 目录（包括会话级目录）
   */
  async clearOffloadDirectory(): Promise<void> {
    try {
      await fsp.rm(this.offloadSessionDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}
