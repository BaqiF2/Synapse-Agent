import { getEncoding } from 'js-tiktoken';
import type { Message } from '../types/message.ts';
import { createLogger } from './file-logger.ts';

const logger = createLogger('token-counter');
const DEFAULT_ENCODING = 'cl100k_base';
const FALLBACK_CHARS_PER_TOKEN = 4;

type TokenCounterImpl = (text: string) => number;

let tokenCounterImpl: TokenCounterImpl | null = null;

function createDefaultTokenCounter(): TokenCounterImpl {
  const encoding = getEncoding(DEFAULT_ENCODING);
  return function countWithEncoding(text: string): number {
    return encoding.encode(text).length;
  };
}

function getTokenCounter(): TokenCounterImpl {
  if (!tokenCounterImpl) {
    tokenCounterImpl = createDefaultTokenCounter();
  }
  return tokenCounterImpl;
}

function fallbackTokenEstimate(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  return Math.ceil(text.length / FALLBACK_CHARS_PER_TOKEN);
}

function serializeMessage(message: Message): string {
  return JSON.stringify(message);
}

export function countTokens(text: string): number {
  if (text.length === 0) {
    return 0;
  }

  try {
    return getTokenCounter()(text);
  } catch (error) {
    logger.warn('Token counting failed, fallback to char estimation', { error });
    return fallbackTokenEstimate(text);
  }
}

export function countMessageTokens(messages: readonly Message[]): number {
  if (messages.length === 0) {
    return 0;
  }

  return messages.reduce((total, message) => total + countTokens(serializeMessage(message)), 0);
}

export function setTokenCounterForTesting(
  overrides: { countTokensImpl?: TokenCounterImpl | null } = {}
): () => void {
  const previous = tokenCounterImpl;
  tokenCounterImpl = overrides.countTokensImpl ?? null;
  return function restoreTokenCounter(): void {
    tokenCounterImpl = previous;
  };
}
