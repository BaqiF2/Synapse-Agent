/**
 * Skill Sub-Agent Type Definitions
 *
 * Defines types and schemas for the Skill Sub-Agent system.
 *
 * @module skill-sub-agent-types
 *
 * Core Exports:
 * - SkillMetadata: Skill metadata stored in memory
 * - SkillSearchResult: Search result format
 * - SkillSubAgentCommand: Command types for sub-agent
 */

import { z } from 'zod';

/**
 * Skill metadata stored in sub-agent memory
 */
export const SkillMetadataSchema = z.object({
  /** Skill name (identifier) */
  name: z.string(),
  /** Brief description */
  description: z.string(),
  /** SKILL.md body content (lazy loaded) */
  body: z.string(),
  /** Full path to SKILL.md */
  path: z.string(),
  /** Skill directory path */
  dir: z.string(),
  /** Skill type (e.g., 'meta' for meta skills) */
  type: z.string().optional(),
});

export type SkillMetadata = z.infer<typeof SkillMetadataSchema>;

/**
 * Individual skill match in search result
 */
export const SkillMatchSchema = z.object({
  name: z.string(),
  description: z.string(),
});

export type SkillMatch = z.infer<typeof SkillMatchSchema>;

/**
 * Search result returned by sub-agent
 */
export const SkillSearchResultSchema = z.object({
  matched_skills: z.array(SkillMatchSchema),
});

export type SkillSearchResult = z.infer<typeof SkillSearchResultSchema>;

/**
 * Enhance result returned by sub-agent
 */
export const SkillEnhanceResultSchema = z.object({
  action: z.enum(['created', 'enhanced', 'none']),
  skillName: z.string().optional(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type SkillEnhanceResult = z.infer<typeof SkillEnhanceResultSchema>;

/**
 * Evaluate result returned by sub-agent
 */
export const SkillEvaluateResultSchema = z.object({
  action: z.enum(['evaluated', 'none']),
  skillName: z.string().optional(),
  message: z.string(),
  scores: z.object({
    clarity: z.number(),
    completeness: z.number(),
    usability: z.number(),
    accuracy: z.number(),
    efficiency: z.number(),
  }).optional(),
  overallScore: z.number().optional(),
});

export type SkillEvaluateResult = z.infer<typeof SkillEvaluateResultSchema>;

/**
 * Command types for sub-agent
 */
export const SkillSubAgentCommandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('search'),
    query: z.string(),
  }),
  z.object({
    type: z.literal('enhance'),
    conversationPath: z.string(),
  }),
  z.object({
    type: z.literal('shutdown'),
  }),
]);

export type SkillSubAgentCommand = z.infer<typeof SkillSubAgentCommandSchema>;

/**
 * Sub-agent response wrapper
 */
export const SkillSubAgentResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
});

export type SkillSubAgentResponse = z.infer<typeof SkillSubAgentResponseSchema>;
