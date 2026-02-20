/**
 * 配置管理子模块
 *
 * 提供设置管理、定价、路径常量和版本信息。
 *
 * @module shared/config
 *
 * Core Exports:
 * - SettingsManager: 设置管理器
 * - SynapseSettingsSchema / DEFAULT_SETTINGS: 设置 Zod schema 和默认值
 * - loadPricing / getPricing / calculateCost: 定价管理
 * - getSynapseHome / getSynapseSkillsDir / getSynapseSessionsDir: 路径常量
 * - getVersion: 版本号
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

export {
  getProjectVersion,
} from './version.ts';
