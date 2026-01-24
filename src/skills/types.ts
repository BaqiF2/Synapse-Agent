/**
 * Skill system types and schemas.
 *
 * Defines data structures for the skill system:
 * - SkillMetadata: Basic skill information (name, description, path, domain)
 * - Skill: Complete skill including content, references, and scripts
 *
 * Uses Zod for runtime type validation and alignment with Python version.
 *
 * Core exports:
 * - SkillMetadataSchema: Zod schema for skill metadata
 * - SkillMetadata: TypeScript type for skill metadata
 * - Skill: Interface for complete skill data
 */

import { z } from 'zod';

/**
 * Zod schema for skill metadata validation.
 *
 * Validates the frontmatter of SKILL.md files.
 * All fields use snake_case to align with Python version.
 */
export const SkillMetadataSchema = z.object({
  /** Skill name (unique identifier) */
  name: z.string().min(1, 'Skill name is required'),

  /** Short description of what the skill does */
  description: z.string().min(1, 'Skill description is required'),

  /** Absolute path to the skill directory */
  path: z.string(),

  /** Optional domain/category for organization */
  domain: z.string().nullable(),
});

/**
 * Skill metadata type inferred from Zod schema.
 *
 * Contains basic information about a skill extracted from frontmatter.
 */
export type SkillMetadata = z.infer<typeof SkillMetadataSchema>;

/**
 * Complete skill data structure.
 *
 * Represents a fully loaded skill with all associated files.
 * Aligns with Python version structure.
 */
export interface Skill {
  /** Basic skill metadata from frontmatter */
  metadata: SkillMetadata;

  /** Main skill content (SKILL.md body after frontmatter) */
  content: string;

  /** Contents of referenced files (REFERENCE.md, etc.) */
  references: string[];

  /** Paths to associated script files */
  scripts: string[];
}
