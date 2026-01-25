/**
 * Skill Converters Module
 *
 * This module provides tools for discovering, parsing, and converting
 * Skill scripts into Bash-compatible commands.
 *
 * @module skill
 *
 * Core Exports:
 * - SkillStructure: Manages skill directory structure
 * - DocstringParser: Parses script docstrings into metadata
 * - SkillWrapperGenerator: Generates Bash wrapper scripts for skills
 */

export {
  SkillStructure,
  SkillMetadataSchema,
  ScriptMetadataSchema,
  ScriptParamSchema,
  SUPPORTED_EXTENSIONS,
  SKILL_DOMAINS,
  type SkillMetadata,
  type ScriptMetadata,
  type ScriptParam,
  type SkillDomain,
  type SupportedExtension,
  type SkillEntry,
} from './skill-structure.js';

export {
  DocstringParser,
  parseDocstring,
} from './docstring-parser.js';

export {
  SkillWrapperGenerator,
  type GeneratedSkillWrapper,
  type SkillInstallResult,
} from './wrapper-generator.js';
