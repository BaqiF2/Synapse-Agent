/**
 * LLM Provider 类型定义 — 统一导出自 src/types/。
 *
 * 此文件现已成为兼容层，所有类型定义已迁移至 src/types/ 统一类型层。
 * providers 内部模块仍可通过 './types' 或 '../types' 引用。
 *
 * 核心导出:
 * - LLMProvider: Provider 统一接口（等同于 LLMProviderLike）
 * - EmbeddingProvider: Embedding 能力接口
 * - isEmbeddingProvider: 类型守卫函数
 * - GenerateParams / LLMStream / LLMStreamChunk / LLMResponse 等 LLM 协议类型
 */

export type {
  LLMProvider,
  LLMProviderLike,
  EmbeddingProvider,
  GenerateParams,
  LLMProviderMessage,
  LLMProviderContentBlock,
  LLMToolDefinition,
  LLMStream,
  LLMStreamChunk,
  LLMResponse,
  LLMResponseContentBlock,
} from '../types/provider.ts';

export { isEmbeddingProvider } from '../types/provider.ts';
