/**
 * 本地文件操作实现 — 基于 Node.js fs/promises 实现 FileOperations 接口。
 * 提供文件读写、编辑、存在检查、目录列表和内容搜索的本地文件系统操作。
 *
 * 核心导出:
 * - LocalFileOperations: FileOperations 接口的本地实现
 */

import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { FileNotFoundError } from '../../shared/errors.ts';
import type {
  FileOperations,
  FileEdit,
  SearchOptions,
  SearchResult,
} from './types.ts';

/** 内容搜索默认最大结果数 */
const DEFAULT_MAX_SEARCH_RESULTS = parseInt(
  process.env.SYNAPSE_MAX_SEARCH_RESULTS ?? '100',
  10,
);

/**
 * LocalFileOperations — 基于本地文件系统的 FileOperations 实现。
 * 使用 Node.js fs/promises API，Bun 完全兼容。
 */
export class LocalFileOperations implements FileOperations {
  /**
   * 读取文件内容
   * @throws FileNotFoundError 文件不存在时抛出
   */
  async readFile(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        throw new FileNotFoundError(filePath);
      }
      throw error;
    }
  }

  /**
   * 写入文件内容，自动创建父目录
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    const parentDir = path.dirname(filePath);
    // 确保父目录存在
    if (!fsSync.existsSync(parentDir)) {
      await fs.mkdir(parentDir, { recursive: true });
    }
    await fs.writeFile(filePath, content, 'utf-8');
  }

  /**
   * 编辑文件：按顺序应用多个文本替换
   * @returns 替换后的完整文件内容
   */
  async editFile(filePath: string, edits: FileEdit[]): Promise<string> {
    let content = await this.readFile(filePath);
    for (const edit of edits) {
      content = content.replace(edit.oldText, edit.newText);
    }
    await this.writeFile(filePath, content);
    return content;
  }

  /**
   * 检查文件是否存在
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 列出匹配指定 glob 模式的文件。
   * 当模式不含通配符时，作为目录路径读取其下所有文件。
   */
  async listFiles(pattern: string): Promise<string[]> {
    // 简单实现：若无通配符则视为目录读取
    const hasWildcard = /[*?[\]{}]/.test(pattern);
    if (!hasWildcard) {
      try {
        const entries = await fs.readdir(pattern);
        return entries.map((entry) => path.join(pattern, entry));
      } catch {
        return [];
      }
    }
    // 含通配符时使用 Bun.Glob (Bun 内置)
    const glob = new Bun.Glob(pattern);
    const results: string[] = [];
    for await (const match of glob.scan('.')) {
      results.push(match);
    }
    return results;
  }

  /**
   * 在文件中搜索内容
   */
  async searchContent(
    pattern: string,
    options?: SearchOptions,
  ): Promise<SearchResult[]> {
    const maxResults = options?.maxResults ?? DEFAULT_MAX_SEARCH_RESULTS;
    const caseSensitive = options?.caseSensitive ?? true;
    const flags = caseSensitive ? '' : 'i';
    const regex = new RegExp(pattern, flags);
    const results: SearchResult[] = [];

    // 确定要搜索的文件列表
    const filePattern = options?.filePattern ?? '.';
    const files = await this.listFiles(filePattern);

    for (const file of files) {
      if (results.length >= maxResults) break;
      try {
        const content = await this.readFile(file);
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (results.length >= maxResults) break;
          const line = lines[i]!;
          if (regex.test(line)) {
            results.push({
              filePath: file,
              lineNumber: i + 1,
              lineContent: line,
            });
          }
        }
      } catch {
        // 跳过无法读取的文件
      }
    }

    return results;
  }
}

/** 类型守卫：判断是否为 Node.js 系统错误 */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
