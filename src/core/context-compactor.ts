import * as fs from 'node:fs';
import path from 'node:path';
import type { LLMClient } from '../providers/llm-client.ts';
import { countMessageTokens } from '../shared/token-counter.ts';
import { createLogger } from '../shared/file-logger.ts';
import { loadDesc } from '../shared/load-desc.ts';
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
  constructor(
    private readonly storage: OffloadStorage,
    private readonly client: LLMClient,
    private readonly options: CompactOptions = {}
  ) {}

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

  private getPreserveCount(): number {
    return this.options.preserveCount ?? DEFAULT_PRESERVE_COUNT;
  }

  private getTargetTokens(): number {
    return this.options.targetTokens ?? DEFAULT_TARGET_TOKENS;
  }

  private getRetryCount(): number {
    return this.options.retryCount ?? DEFAULT_RETRY_COUNT;
  }

  private splitMessages(messages: Message[]): { toCompress: Message[]; toPreserve: Message[] } {
    const preserveCount = this.getPreserveCount();
    const splitIndex = Math.max(0, messages.length - preserveCount);

    return {
      toCompress: messages.slice(0, splitIndex),
      toPreserve: messages.slice(splitIndex),
    };
  }

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

  private buildCompressedHistory(summary: string, preserved: Message[]): Message[] {
    const summaryMessage = createTextMessage('user', `${COMPRESSED_HISTORY_PREFIX}${summary}`);
    return [summaryMessage, ...preserved];
  }

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

  private loadSummaryPrompt(targetTokens: number): string {
    return loadDesc(SUMMARY_PROMPT_PATH, { TARGET_TOKENS: String(targetTokens) });
  }

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

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private extractOffloadFilepath(text: string): string | null {
    const trimmed = text.trim();
    if (!trimmed.startsWith(OFFLOAD_REFERENCE_PREFIX)) {
      return null;
    }

    const filepath = trimmed.slice(OFFLOAD_REFERENCE_PREFIX.length).trim();
    return filepath.length > 0 ? filepath : null;
  }
}
