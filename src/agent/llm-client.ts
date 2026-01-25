/**
 * LLM 客户端实现
 *
 * 功能：封装 Minimax API 调用，支持流式响应和工具调用
 *
 * 核心导出：
 * - LlmClient: LLM 客户端类，用于与 Minimax API 交互
 * - LlmMessage: 消息类型定义
 * - LlmResponse: 响应类型定义
 */

import Anthropic from '@anthropic-ai/sdk';

// Environment variables
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || 'https://api.minimaxi.chat/v1';
const MODEL = process.env.MODEL || 'minimax-2.1';
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS || '4096', 10);

// Type definitions
export type LlmMessage = Anthropic.MessageParam;

export interface LlmToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LlmResponse {
  content: string;
  toolCalls: LlmToolCall[];
  stopReason: string | null;
}

/**
 * LLM Client for interacting with Minimax API
 */
export class LlmClient {
  private client: Anthropic;

  constructor() {
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }

    this.client = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
      baseURL: ANTHROPIC_BASE_URL,
    });
  }

  /**
   * Send a message to the LLM and get a response
   */
  async sendMessage(
    messages: LlmMessage[],
    systemPrompt: string,
    tools?: Anthropic.Tool[]
  ): Promise<LlmResponse> {
    try {
      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages,
        tools: tools || [],
      });

      // Parse response
      const textContent: string[] = [];
      const toolCalls: LlmToolCall[] = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          textContent.push(block.text);
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          });
        }
      }

      return {
        content: textContent.join('\n'),
        toolCalls,
        stopReason: response.stop_reason,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`LLM API call failed: ${error.message}`);
      }
      throw new Error('LLM API call failed with unknown error');
    }
  }

  /**
   * Stream a message to the LLM (for future streaming support)
   */
  async *streamMessage(
    messages: LlmMessage[],
    systemPrompt: string,
    tools?: Anthropic.Tool[]
  ): AsyncGenerator<string> {
    try {
      const stream = await this.client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages,
        tools: tools || [],
        stream: true,
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield event.delta.text;
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`LLM streaming failed: ${error.message}`);
      }
      throw new Error('LLM streaming failed with unknown error');
    }
  }
}
