import { createLogger } from '../shared/file-logger.ts';
import { countMessageTokens } from '../shared/token-counter.ts';
import type { Message } from '../providers/message.ts';
import type { OffloadStorage } from './offload-storage.ts';

const logger = createLogger('context-manager');
const OFFLOAD_REFERENCE_PREFIX = 'Tool result is at:';

function extractTextContent(message: Message): string {
  const textParts = message.content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text);

  if (textParts.length === 0) {
    return JSON.stringify(message.content);
  }

  return textParts.join('\n');
}

function replaceToolMessageContent(message: Message, filepath: string): Message {
  return {
    ...message,
    content: [{ type: 'text', text: `${OFFLOAD_REFERENCE_PREFIX} ${filepath}` }],
  };
}

export interface ContextManagerOptions {
  offloadThreshold: number;
  scanRatio: number;
  minChars: number;
}

export interface OffloadResult {
  messages: Message[];
  offloadedCount: number;
  previousTokens: number;
  currentTokens: number;
  freedTokens: number;
  stillExceedsThreshold: boolean;
}

export class ContextManager {
  constructor(
    private readonly storage: OffloadStorage,
    private readonly options: ContextManagerOptions
  ) {}

  offloadIfNeeded(messages: readonly Message[]): OffloadResult {
    const previousTokens = countMessageTokens(messages);

    if (previousTokens < this.options.offloadThreshold) {
      return {
        messages: [...messages],
        offloadedCount: 0,
        previousTokens,
        currentTokens: previousTokens,
        freedTokens: 0,
        stillExceedsThreshold: false,
      };
    }

    return this.performOffload(messages, previousTokens);
  }

  private performOffload(messages: readonly Message[], previousTokens: number): OffloadResult {
    const scanEndIndex = Math.floor(messages.length * this.options.scanRatio);
    let offloadedCount = 0;

    const nextMessages = messages.map((message, index) => {
      if (index >= scanEndIndex || message.role !== 'tool') {
        return message;
      }

      const content = extractTextContent(message);
      if (content.length <= this.options.minChars || this.isAlreadyOffloaded(content)) {
        return message;
      }

      try {
        const filepath = this.storage.save(content);
        offloadedCount += 1;
        return replaceToolMessageContent(message, filepath);
      } catch (error) {
        logger.warn('Failed to offload tool message, skipping message', { error });
        return message;
      }
    });

    const currentTokens = countMessageTokens(nextMessages);
    return {
      messages: nextMessages,
      offloadedCount,
      previousTokens,
      currentTokens,
      freedTokens: previousTokens - currentTokens,
      stillExceedsThreshold: currentTokens >= this.options.offloadThreshold,
    };
  }

  private isAlreadyOffloaded(content: string): boolean {
    return content.trimStart().startsWith(OFFLOAD_REFERENCE_PREFIX);
  }
}
