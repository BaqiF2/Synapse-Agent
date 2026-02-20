/**
 * Skill Enhancer (re-export shim)
 * 实际实现已迁移到 generator/skill-enhancer.ts
 */
export {
  SkillEnhancer,
  type ConversationAnalysis,
  type EnhanceDecision,
  type EnhanceResult,
  type SkillEnhancerOptions,
} from './generator/skill-enhancer.ts';

export { SkillEnhancer as default } from './generator/skill-enhancer.ts';
