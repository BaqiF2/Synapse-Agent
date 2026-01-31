/**
 * Settings Schema
 *
 * Defines the schema and types for Synapse Agent settings.
 * Settings are persisted to ~/.synapse/settings.json.
 *
 * @module settings-schema
 *
 * Core Exports:
 * - SynapseSettingsSchema: Zod schema for settings validation
 * - SkillEnhanceSettingsSchema: Zod schema for skill enhance settings
 * - DEFAULT_SETTINGS: Default settings values
 * - SynapseSettings: TypeScript type for settings
 * - SkillEnhanceSettings: TypeScript type for skill enhance settings
 */

import { z } from 'zod';

/**
 * Default max characters for enhance context
 */
const DEFAULT_MAX_ENHANCE_CONTEXT_CHARS = parseInt(
  process.env.SYNAPSE_MAX_ENHANCE_CONTEXT_CHARS || '50000',
  10
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
  ANTHROPIC_API_KEY: z.string().min(1),
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
    ANTHROPIC_API_KEY: 'your_api_key_here',
    ANTHROPIC_BASE_URL: DEFAULT_ANTHROPIC_BASE_URL,
  },
  model: DEFAULT_MODEL,
  skillEnhance: {
    autoEnhance: false,
    maxEnhanceContextChars: DEFAULT_MAX_ENHANCE_CONTEXT_CHARS,
  },
};
