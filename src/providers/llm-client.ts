/**
 * LLM Client Interface — 兼容层
 *
 * 接口定义已迁移至 src/types/llm-client.ts，此文件保留 re-export 保持向后兼容。
 * providers 内部模块仍可通过此路径引用。
 *
 * 核心导出：
 * - LLMStreamedMessage: Provider 无关的流式响应接口
 * - LLMClient: Provider 无关的 LLM 客户端接口
 * - LLMGenerateOptions: 生成选项
 * - ThinkingEffort: 思维努力级别类型
 */

// 从共享类型层 re-export 所有类型
export type {
  LLMClient,
  LLMStreamedMessage,
  LLMGenerateOptions,
  ThinkingEffort,
} from '../types/llm-client.ts';

// 保留对 GenerationKwargs 的 re-export，供 providers 内部使用
export type { GenerationKwargs } from './anthropic/anthropic-types.ts';
