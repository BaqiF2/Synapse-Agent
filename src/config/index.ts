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
