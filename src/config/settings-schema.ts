/**
 * 文件功能说明：
 * - 该文件位于 `src/config/settings-schema.ts`，主要负责 设置、结构/校验 相关实现。
 * - 模块归属 配置 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `SkillEnhanceSettings`
 * - `LlmEnvSettings`
 * - `SynapseSettings`
 * - `SkillEnhanceSettingsSchema`
 * - `LlmEnvSettingsSchema`
 * - `SynapseSettingsSchema`
 * - `DEFAULT_SETTINGS`
 *
 * 作用说明：
 * - `SkillEnhanceSettings`：声明类型别名，约束输入输出类型。
 * - `LlmEnvSettings`：声明类型别名，约束输入输出类型。
 * - `SynapseSettings`：声明类型别名，约束输入输出类型。
 * - `SkillEnhanceSettingsSchema`：提供可复用的模块级变量/常量。
 * - `LlmEnvSettingsSchema`：提供可复用的模块级变量/常量。
 * - `SynapseSettingsSchema`：提供可复用的模块级变量/常量。
 * - `DEFAULT_SETTINGS`：提供可复用的常量配置。
 */

import { z } from 'zod';
import { parseEnvPositiveInt } from '../utils/env.ts';

/**
 * Default max characters for enhance context
 */
const DEFAULT_MAX_ENHANCE_CONTEXT_CHARS = parseEnvPositiveInt(
  process.env.SYNAPSE_MAX_ENHANCE_CONTEXT_CHARS,
  50000
);

/**
 * Default Anthropic base URL
 */
const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com';

/**
 * Default model name
 */
const DEFAULT_MODEL = 'claude-sonnet-4-5';

/**
 * Skill enhance settings schema
 */
export const SkillEnhanceSettingsSchema = z.object({
  /** Whether auto-enhance is enabled */
  autoEnhance: z.boolean().default(false),
  /** Maximum characters to include in enhance context */
  maxEnhanceContextChars: z.number().positive().default(DEFAULT_MAX_ENHANCE_CONTEXT_CHARS),
});

export type SkillEnhanceSettings = z.infer<typeof SkillEnhanceSettingsSchema>;

/**
 * LLM environment settings schema
 */
export const LlmEnvSettingsSchema = z.object({
  // 允许空字符串作为默认值，实际验证应在 Provider 初始化时进行
  ANTHROPIC_API_KEY: z.string().default(''),
  ANTHROPIC_BASE_URL: z.string().url().default(DEFAULT_ANTHROPIC_BASE_URL),
});

export type LlmEnvSettings = z.infer<typeof LlmEnvSettingsSchema>;

/**
 * Main settings schema
 */
export const SynapseSettingsSchema = z.object({
  /** LLM environment settings */
  env: LlmEnvSettingsSchema,
  /** LLM model name */
  model: z.string().min(1).default(DEFAULT_MODEL),
  /** Skill enhance settings */
  skillEnhance: SkillEnhanceSettingsSchema.default({
    autoEnhance: false,
    maxEnhanceContextChars: DEFAULT_MAX_ENHANCE_CONTEXT_CHARS,
  }),
});

export type SynapseSettings = z.infer<typeof SynapseSettingsSchema>;

/**
 * Default settings
 */
export const DEFAULT_SETTINGS: SynapseSettings = {
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
    ANTHROPIC_BASE_URL: DEFAULT_ANTHROPIC_BASE_URL,
  },
  model: DEFAULT_MODEL,
  skillEnhance: {
    autoEnhance: false,
    maxEnhanceContextChars: DEFAULT_MAX_ENHANCE_CONTEXT_CHARS,
  },
};
