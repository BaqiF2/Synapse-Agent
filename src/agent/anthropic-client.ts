/**
 * Anthropic LLM Client
 *
 * Wrapper for Anthropic API with support for streaming, prompt caching,
 * extended thinking, and token usage tracking.
 *
 * Core Exports:
 * - AnthropicClient: Main client class for Anthropic API
 * - GenerationKwargs: Generation parameters interface
 */

import Anthropic from '@anthropic-ai/sdk';
import { SettingsManager } from '../config/settings-manager.ts';
import type { ThinkingEffort } from './anthropic-types.ts';
import { AnthropicStreamedMessage } from './anthropic-streamed-message.ts';

const DEFAULT_MAX_TOKENS = parseInt(process.env.MAX_TOKENS || '4096', 10);

/**
 * Generation parameters
 */
export interface GenerationKwargs {
  maxTokens: number;
  temperature?: number;
  topK?: number;
  topP?: number;
  thinking?: Anthropic.ThinkingConfigParam;
  toolChoice?: Anthropic.ToolChoice;
}

/**
 * Client configuration
 */
interface ClientConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  stream: boolean;
  generationKwargs: GenerationKwargs;
}

/**
 * Anthropic API client with streaming and caching support
 */
export class AnthropicClient {
  static readonly name = 'anthropic';

  private readonly client: Anthropic;
  private readonly config: ClientConfig;

  constructor(options?: { stream?: boolean }) {
    const settings = new SettingsManager();
    const { apiKey, baseURL, model } = settings.getLlmConfig();

    this.client = new Anthropic({ apiKey, baseURL });
    this.config = {
      apiKey,
      baseURL,
      model,
      stream: options?.stream ?? true,
      generationKwargs: {
        maxTokens: DEFAULT_MAX_TOKENS,
      },
    };
  }

  /**
   * Private constructor for creating copies with updated config
   */
  private static fromConfig(client: Anthropic, config: ClientConfig): AnthropicClient {
    const instance = Object.create(AnthropicClient.prototype) as AnthropicClient;
    Object.defineProperty(instance, 'client', { value: client, writable: false });
    Object.defineProperty(instance, 'config', { value: config, writable: false });
    return instance;
  }

  get modelName(): string {
    return this.config.model;
  }

  get thinkingEffort(): ThinkingEffort | null {
    const thinking = this.config.generationKwargs.thinking;
    if (!thinking) return null;
    if (thinking.type === 'disabled') return 'off';
    const budget = thinking.budget_tokens;
    if (budget <= 1024) return 'low';
    if (budget <= 4096) return 'medium';
    return 'high';
  }

  /**
   * Create a new client with thinking configured
   */
  withThinking(effort: ThinkingEffort): AnthropicClient {
    const thinkingConfig = this.mapThinkingEffort(effort);
    return this.withGenerationKwargs({ thinking: thinkingConfig });
  }

  /**
   * Create a new client with updated generation kwargs
   */
  withGenerationKwargs(kwargs: Partial<GenerationKwargs>): AnthropicClient {
    const newConfig: ClientConfig = {
      ...this.config,
      generationKwargs: { ...this.config.generationKwargs, ...kwargs },
    };
    return AnthropicClient.fromConfig(this.client, newConfig);
  }

  private mapThinkingEffort(effort: ThinkingEffort): Anthropic.ThinkingConfigParam {
    switch (effort) {
      case 'off':
        return { type: 'disabled' };
      case 'low':
        return { type: 'enabled', budget_tokens: 1024 };
      case 'medium':
        return { type: 'enabled', budget_tokens: 4096 };
      case 'high':
        return { type: 'enabled', budget_tokens: 32000 };
    }
  }

  /**
   * Generate a response from the LLM
   */
  async generate(
    systemPrompt: string,
    messages: Anthropic.MessageParam[],
    tools: Anthropic.Tool[]
  ): Promise<AnthropicStreamedMessage> {
    // Will be implemented in next task
    throw new Error('generate() not yet implemented');
  }
}
