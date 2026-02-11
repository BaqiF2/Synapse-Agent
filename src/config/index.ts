/**
 * Configuration Module
 *
 * Exports settings management utilities for Synapse Agent.
 *
 * @module config
 *
 * Core Exports:
 * - SettingsManager: Class for reading and writing settings
 * - SynapseSettings: TypeScript type for settings
 * - DEFAULT_SETTINGS: Default settings values
 * - getSynapseHome/getSynapseSkillsDir/getSynapseSessionsDir: 路径常量函数
 */

export {
  SettingsManager,
} from './settings-manager.ts';

export {
  SynapseSettingsSchema,
  SkillEnhanceSettingsSchema,
  DEFAULT_SETTINGS,
  type SynapseSettings,
  type SkillEnhanceSettings,
} from './settings-schema.ts';

export {
  loadPricing,
  getPricing,
  calculateCost,
  DEFAULT_PRICING_PATH,
  type ModelPricing,
  type PricingConfig,
} from './pricing.ts';

export {
  getSynapseHome,
  getSynapseSkillsDir,
  getSynapseSessionsDir,
  getSynapseBinDir,
  getSynapseLogDir,
} from './paths.ts';
