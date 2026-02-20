/**
 * AgentConfig 验证模式 — 基于 Zod 的 AgentConfig 运行时验证。
 * 提供 schema 定义与 validateAgentConfig 验证函数，确保配置完整性和工具名唯一性。
 *
 * 核心导出:
 * - AgentConfigSchema: AgentConfig 的 Zod 验证 schema
 * - validateAgentConfig: 完整验证（Zod + 业务规则），通过后返回配置，失败抛出 ConfigurationError
 */

import { z } from 'zod';
import { ConfigurationError } from '../shared/index.ts';

// 最小正整数阈值
const MIN_POSITIVE_INT = 1;

/**
 * AgentConfig 的 Zod 验证 schema。
 * 使用 z.object + passthrough 以允许接口字段（provider/tools）通过验证。
 */
export const AgentConfigSchema = z.object({
  /** LLM 提供者（运行时类型为 LLMProviderLike 接口，Zod 层只做存在性检查） */
  provider: z.object({
    name: z.string(),
    model: z.string(),
    generate: z.function(),
  }).passthrough(),
  /** 工具集合 */
  tools: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      inputSchema: z.record(z.string(), z.unknown()),
      execute: z.function(),
    }).passthrough(),
  ),
  /** 系统提示词 */
  systemPrompt: z.string().min(MIN_POSITIVE_INT),
  /** 最大迭代次数 */
  maxIterations: z.number().int().min(MIN_POSITIVE_INT),
  /** 连续失败阈值 */
  maxConsecutiveFailures: z.number().int().min(MIN_POSITIVE_INT),
  /** 上下文窗口大小 */
  contextWindow: z.number().int().min(MIN_POSITIVE_INT),
  /** 中止信号（可选） */
  abortSignal: z.instanceof(AbortSignal).optional(),
});

/**
 * 检测工具名是否有重复。
 * 如有重复，抛出 ConfigurationError 并列出冲突工具名。
 */
function checkDuplicateToolNames(tools: Array<{ name: string }>): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const tool of tools) {
    if (seen.has(tool.name)) {
      duplicates.add(tool.name);
    }
    seen.add(tool.name);
  }

  if (duplicates.size > 0) {
    const names = Array.from(duplicates).join(', ');
    throw new ConfigurationError(
      `Duplicate tool names detected: ${names}`,
    );
  }
}

/**
 * 完整验证 AgentConfig（Zod 结构 + 业务规则）。
 * 通过后返回原始配置，失败抛出 ConfigurationError。
 */
export function validateAgentConfig(config: unknown): void {
  // 1. Zod 结构验证
  const parseResult = AgentConfigSchema.safeParse(config);
  if (!parseResult.success) {
    const issues = parseResult.error.issues
      .map((i) =>
        `${i.path.join('.')}: ${i.message}`,
      )
      .join('; ');
    throw new ConfigurationError(`Invalid AgentConfig: ${issues}`);
  }

  // 2. 业务规则：工具名唯一性
  const parsed = parseResult.data;
  checkDuplicateToolNames(parsed.tools);
}
