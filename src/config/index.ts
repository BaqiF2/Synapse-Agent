/**
 * 文件功能说明：
 * - 该文件位于 `src/config/index.ts`，主要负责 索引 相关实现。
 * - 模块归属 配置 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `SettingsManager`
 * - `SynapseSettingsSchema`
 * - `SkillEnhanceSettingsSchema`
 * - `DEFAULT_SETTINGS`
 * - `SynapseSettings`
 * - `SkillEnhanceSettings`
 * - `loadPricing`
 * - `getPricing`
 * - `calculateCost`
 * - `DEFAULT_PRICING_PATH`
 * - `ModelPricing`
 * - `PricingConfig`
 * - `getSynapseHome`
 * - `getSynapseSkillsDir`
 * - `getSynapseSessionsDir`
 * - `getSynapseBinDir`
 * - `getSynapseLogDir`
 *
 * 作用说明：
 * - `SettingsManager`：聚合并对外暴露其它模块的能力。
 * - `SynapseSettingsSchema`：聚合并对外暴露其它模块的能力。
 * - `SkillEnhanceSettingsSchema`：聚合并对外暴露其它模块的能力。
 * - `DEFAULT_SETTINGS`：聚合并对外暴露其它模块的能力。
 * - `SynapseSettings`：聚合并对外暴露其它模块的能力。
 * - `SkillEnhanceSettings`：聚合并对外暴露其它模块的能力。
 * - `loadPricing`：聚合并对外暴露其它模块的能力。
 * - `getPricing`：聚合并对外暴露其它模块的能力。
 * - `calculateCost`：聚合并对外暴露其它模块的能力。
 * - `DEFAULT_PRICING_PATH`：聚合并对外暴露其它模块的能力。
 * - `ModelPricing`：聚合并对外暴露其它模块的能力。
 * - `PricingConfig`：聚合并对外暴露其它模块的能力。
 * - `getSynapseHome`：聚合并对外暴露其它模块的能力。
 * - `getSynapseSkillsDir`：聚合并对外暴露其它模块的能力。
 * - `getSynapseSessionsDir`：聚合并对外暴露其它模块的能力。
 * - `getSynapseBinDir`：聚合并对外暴露其它模块的能力。
 * - `getSynapseLogDir`：聚合并对外暴露其它模块的能力。
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
