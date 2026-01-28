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
 * Main settings schema
 */
export const SynapseSettingsSchema = z.object({
  /** Settings version */
  version: z.string().default('1.0.0'),
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
  version: '1.0.0',
  skillEnhance: {
    autoEnhance: false,
    maxEnhanceContextChars: DEFAULT_MAX_ENHANCE_CONTEXT_CHARS,
  },
};
