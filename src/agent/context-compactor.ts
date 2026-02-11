/**
 * 文件功能说明：
 * - 该文件位于 `src/agent/context-compactor.ts`，主要负责 上下文、压缩 相关实现。
 * - 模块归属 Agent 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `ContextCompactor`
 * - `CompactOptions`
 * - `CompactResult`
 *
 * 作用说明：
 * - `ContextCompactor`：封装该领域的核心流程与状态管理。
 * - `CompactOptions`：定义模块交互的数据结构契约。
 * - `CompactResult`：定义模块交互的数据结构契约。
 */

import * as fs from 'node:fs';
import path from 'node:path';
import type { LLMClient } from '../providers/llm-client.ts';
import { countMessageTokens } from '../utils/token-counter.ts';
import { createLogger } from '../utils/logger.ts';
import { loadDesc } from '../utils/load-desc.ts';
import { generate } from '../providers/generate.ts';
import { createTextMessage, extractText, type Message } from '../providers/message.ts';
import type { OffloadStorage } from './offload-storage.ts';

const OFFLOAD_REFERENCE_PREFIX = 'Tool result is at:';
const COMPRESSED_HISTORY_PREFIX = '[Compressed History]\n\n';
const DEFAULT_PRESERVE_COUNT = 5;
const DEFAULT_TARGET_TOKENS = 8000;
const DEFAULT_RETRY_COUNT = 3;
const SUMMARY_PROMPT_PATH = path.join(import.meta.dirname, 'prompts', 'compact-summary.md');
const logger = createLogger('context-compactor');

export interface CompactOptions {
  targetTokens?: number;
  preserveCount?: number;
  model?: string;
  retryCount?: number;
}

export interface CompactResult {
  messages: Message[];
  previousTokens: number;
  currentTokens: number;
  freedTokens: number;
  preservedCount: number;
  deletedFiles: string[];
  success: boolean;
}

export class ContextCompactor {
  /**
   * 方法说明：初始化 ContextCompactor 实例并设置初始状态。
   * @param storage 输入参数。
   * @param client 输入参数。
   * @param options 配置参数。
   */
  constructor(
    private readonly storage: OffloadStorage,
    private readonly client: LLMClient,
    private readonly options: CompactOptions = {}
  ) {}

  /**
   * 方法说明：执行 compact 相关逻辑。
   * @param messages 消息内容。
   */
  async compact(messages: Message[]): Promise<CompactResult> {
    const previousTokens = countMessageTokens(messages);
    const preserveCount = this.getPreserveCount();
    if (messages.length <= preserveCount) {
      return {
        messages: [...messages],
        previousTokens,
        currentTokens: previousTokens,
        freedTokens: 0,
        preservedCount: Math.min(messages.length, preserveCount),
        deletedFiles: [],
        success: true,
      };
    }

    const { toCompress, toPreserve } = this.splitMessages(messages);
    if (toCompress.length === 0) {
      return {
        messages: [...messages],
        previousTokens,
        currentTokens: previousTokens,
        freedTokens: 0,
        preservedCount: toPreserve.length,
        deletedFiles: [],
        success: true,
      };
    }

    try {
      const restoredMessages = await this.restoreOffloadedContent(toCompress);
      const summary = await this.generateSummary(restoredMessages);
      const compressedMessages = this.buildCompressedHistory(summary, toPreserve);
      const retainedOffloadFiles = this.collectReferencedOffloadFiles(toPreserve);
      const deletedFiles = await this.cleanupOffloadedFiles(retainedOffloadFiles);
      const currentTokens = countMessageTokens(compressedMessages);

      return {
        messages: compressedMessages,
        previousTokens,
        currentTokens,
        freedTokens: previousTokens - currentTokens,
        preservedCount: toPreserve.length,
        deletedFiles,
        success: true,
      };
    } catch (error) {
      logger.error('Context compaction failed, keeping original history', { error });
      return {
        messages: [...messages],
        previousTokens,
        currentTokens: previousTokens,
        freedTokens: 0,
        preservedCount: toPreserve.length,
        deletedFiles: [],
        success: false,
      };
    }
  }

  /**
   * 方法说明：读取并返回 getPreserveCount 对应的数据。
   */
  private getPreserveCount(): number {
    return this.options.preserveCount ?? DEFAULT_PRESERVE_COUNT;
  }

  /**
   * 方法说明：读取并返回 getTargetTokens 对应的数据。
   */
  private getTargetTokens(): number {
    return this.options.targetTokens ?? DEFAULT_TARGET_TOKENS;
  }

  /**
   * 方法说明：读取并返回 getRetryCount 对应的数据。
   */
  private getRetryCount(): number {
    return this.options.retryCount ?? DEFAULT_RETRY_COUNT;
  }

  /**
   * 方法说明：执行 splitMessages 相关逻辑。
   * @param messages 消息内容。
   */
  private splitMessages(messages: Message[]): { toCompress: Message[]; toPreserve: Message[] } {
    const preserveCount = this.getPreserveCount();
    const splitIndex = Math.max(0, messages.length - preserveCount);

    return {
      toCompress: messages.slice(0, splitIndex),
      toPreserve: messages.slice(splitIndex),
    };
  }

  /**
   * 方法说明：执行 restoreOffloadedContent 相关逻辑。
   * @param messages 消息内容。
   */
  private async restoreOffloadedContent(messages: Message[]): Promise<Message[]> {
    return messages.map((message) => {
      if (message.role !== 'tool') {
        return message;
      }

      const textPart = message.content.find(
        (part): part is { type: 'text'; text: string } => part.type === 'text'
      );

      if (!textPart) {
        return message;
      }

      const filepath = this.extractOffloadFilepath(textPart.text);
      if (!filepath) {
        return message;
      }

      const normalizedPath = this.normalizeOffloadedFilepath(filepath);
      if (!normalizedPath) {
        logger.warn('Skipping offload restore for out-of-scope path', { filepath });
        return message;
      }

      try {
        const content = fs.readFileSync(normalizedPath, 'utf-8');
        return {
          ...message,
          content: [{ type: 'text', text: content }],
        };
      } catch {
        return {
          ...message,
          content: [{ type: 'text', text: `[Content unavailable: ${filepath}]` }],
        };
      }
    });
  }

  /**
   * 方法说明：构建 buildCompressedHistory 对应内容。
   * @param summary 输入参数。
   * @param preserved 输入参数。
   */
  private buildCompressedHistory(summary: string, preserved: Message[]): Message[] {
    const summaryMessage = createTextMessage('user', `${COMPRESSED_HISTORY_PREFIX}${summary}`);
    return [summaryMessage, ...preserved];
  }

  /**
   * 方法说明：执行 generateSummary 相关逻辑。
   * @param messages 消息内容。
   */
  private async generateSummary(messages: Message[]): Promise<string> {
    const targetTokens = this.getTargetTokens();
    const retryCount = this.getRetryCount();
    const systemPrompt = this.loadSummaryPrompt(targetTokens);

    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        const maxTokens = Math.max(Math.ceil(targetTokens * 1.2), 1);
        const summaryClient = this.createSummaryClient(maxTokens);
        const result = await generate(summaryClient, systemPrompt, [], messages);
        return extractText(result.message, '\n');
      } catch (error) {
        logger.warn(`Compact summary attempt ${attempt} failed`, { error });
        if (attempt >= retryCount) {
          throw error;
        }
        await this.delay(100 * attempt);
      }
    }

    throw new Error('unreachable');
  }

  /**
   * 方法说明：创建并返回 createSummaryClient 对应结果。
   * @param maxTokens 集合数据。
   */
  private createSummaryClient(maxTokens: number): LLMClient {
    let summaryClient = this.client;
    const compactModel = this.options.model?.trim();

    if (
      compactModel &&
      compactModel !== this.client.modelName &&
      'withModel' in summaryClient &&
      typeof summaryClient.withModel === 'function'
    ) {
      summaryClient = summaryClient.withModel(compactModel);
    }

    if (
      'withGenerationKwargs' in summaryClient &&
      typeof summaryClient.withGenerationKwargs === 'function'
    ) {
      summaryClient = summaryClient.withGenerationKwargs({ maxTokens });
    }

    return summaryClient;
  }

  /**
   * 方法说明：加载 loadSummaryPrompt 相关资源。
   * @param targetTokens 集合数据。
   */
  private loadSummaryPrompt(targetTokens: number): string {
    return loadDesc(SUMMARY_PROMPT_PATH, { TARGET_TOKENS: String(targetTokens) });
  }

  /**
   * 方法说明：执行 collectReferencedOffloadFiles 相关逻辑。
   * @param messages 消息内容。
   */
  private collectReferencedOffloadFiles(messages: readonly Message[]): Set<string> {
    const preservedFiles = new Set<string>();

    for (const message of messages) {
      if (message.role !== 'tool') {
        continue;
      }

      for (const contentPart of message.content) {
        if (contentPart.type !== 'text') {
          continue;
        }

        const filepath = this.extractOffloadFilepath(contentPart.text);
        if (!filepath) {
          continue;
        }

        const normalizedPath = this.normalizeOffloadedFilepath(filepath);
        if (normalizedPath) {
          preservedFiles.add(normalizedPath);
        }
      }
    }

    return preservedFiles;
  }

  /**
   * 方法说明：标准化 normalizeOffloadedFilepath 相关数据。
   * @param filepath 目标路径或文件信息。
   */
  private normalizeOffloadedFilepath(filepath: string): string | null {
    const offloadedDir = path.resolve(this.storage.getOffloadedDirPath());
    const resolvedPath = path.resolve(filepath);
    const relativePath = path.relative(offloadedDir, resolvedPath);

    if (
      relativePath.length === 0 ||
      relativePath === '.' ||
      relativePath.startsWith('..') ||
      path.isAbsolute(relativePath)
    ) {
      return null;
    }

    return resolvedPath;
  }

  /**
   * 方法说明：执行 cleanupOffloadedFiles 相关逻辑。
   * @param retainedFiles 目标路径或文件信息。
   */
  private async cleanupOffloadedFiles(retainedFiles: ReadonlySet<string> = new Set()): Promise<string[]> {
    const files = this.storage.listFiles();
    const deleted: string[] = [];

    for (const file of files) {
      if (retainedFiles.has(path.resolve(file))) {
        continue;
      }

      try {
        this.storage.remove(file);
        deleted.push(file);
      } catch (error) {
        logger.warn('Failed to delete offloaded file during compact cleanup', { file, error });
      }
    }

    return deleted;
  }

  /**
   * 方法说明：执行 delay 相关逻辑。
   * @param ms 集合数据。
   */
  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 方法说明：执行 extractOffloadFilepath 相关逻辑。
   * @param text 输入参数。
   */
  private extractOffloadFilepath(text: string): string | null {
    const trimmed = text.trim();
    if (!trimmed.startsWith(OFFLOAD_REFERENCE_PREFIX)) {
      return null;
    }

    const filepath = trimmed.slice(OFFLOAD_REFERENCE_PREFIX.length).trim();
    return filepath.length > 0 ? filepath : null;
  }
}
