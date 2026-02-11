/**
 * Skill Generator
 *
 * Generates and updates SKILL.md files for skill enhancement.
 *
 * @module skill-generator
 *
 * Core Exports:
 * - SkillGenerator: Class for generating skills
 * - SkillSpec: Skill specification type
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from '../utils/logger.ts';
import { getSynapseSkillsDir } from '../config/paths.ts';

const logger = createLogger('skill-generator');

/**
 * Default skills directory
 */
const DEFAULT_SKILLS_DIR = getSynapseSkillsDir();

/**
 * Script definition
 */
export interface ScriptDef {
  name: string;
  content: string;
}

/**
 * Skill specification for generation
 */
export interface SkillSpec {
  name: string;
  description: string;
  quickStart: string;
  executionSteps: string[];
  bestPractices: string[];
  examples: string[];
  domain?: string;
  version?: string;
  author?: string;
  tags?: string[];
  scripts?: ScriptDef[];
}

/**
 * Generation result
 */
export interface GenerationResult {
  success: boolean;
  path?: string;
  error?: string;
}

/** YAML 特殊字符：含冒号、引号、井号等需要引号包裹 */
const YAML_SPECIAL_CHARS = /[:#'"{}[\]|>&*!?@`]/;

/**
 * 包裹 YAML 值：当值包含特殊字符时用双引号包裹，内部双引号转义
 */
function yamlSafeValue(value: string): string {
  if (!YAML_SPECIAL_CHARS.test(value)) {
    return value;
  }
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

/**
 * SkillGenerator - Creates and updates skill files
 *
 * Usage:
 * ```typescript
 * const generator = new SkillGenerator();
 * const result = generator.createSkill(spec);
 * ```
 */
export class SkillGenerator {
  private skillsDir: string;

  /**
   * Creates a new SkillGenerator
   *
   * @param skillsDir - Skills directory path
   */
  constructor(skillsDir: string = DEFAULT_SKILLS_DIR) {
    this.skillsDir = skillsDir;
  }

  /**
   * Generate SKILL.md content from specification
   *
   * @param spec - Skill specification
   * @returns SKILL.md content
   */
  generateSkillMd(spec: SkillSpec): string {
    const lines: string[] = [];

    // YAML frontmatter
    lines.push('---');
    lines.push(`name: ${yamlSafeValue(spec.name)}`);
    lines.push(`description: ${yamlSafeValue(spec.description)}`);
    if (spec.domain) lines.push(`domain: ${yamlSafeValue(spec.domain)}`);
    if (spec.version) lines.push(`version: ${yamlSafeValue(spec.version)}`);
    if (spec.author) lines.push(`author: ${yamlSafeValue(spec.author)}`);
    if (spec.tags && spec.tags.length > 0) {
      lines.push(`tags: ${spec.tags.map(t => yamlSafeValue(t)).join(', ')}`);
    }
    lines.push('---');
    lines.push('');

    // Title (convert kebab-case to Title Case)
    const title = spec.name
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    lines.push(`# ${title}`);
    lines.push('');

    // Quick Start
    if (spec.quickStart) {
      lines.push('## Quick Start');
      lines.push('');
      lines.push(spec.quickStart);
      lines.push('');
    }

    // Execution Steps
    if (spec.executionSteps.length > 0) {
      lines.push('## Execution Steps');
      lines.push('');
      for (let i = 0; i < spec.executionSteps.length; i++) {
        lines.push(`${i + 1}. ${spec.executionSteps[i]}`);
      }
      lines.push('');
    }

    // Best Practices
    if (spec.bestPractices.length > 0) {
      lines.push('## Best Practices');
      lines.push('');
      for (const practice of spec.bestPractices) {
        lines.push(`- ${practice}`);
      }
      lines.push('');
    }

    // Examples
    if (spec.examples.length > 0) {
      lines.push('## Examples');
      lines.push('');
      for (const example of spec.examples) {
        lines.push(example);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Create a new skill
   *
   * @param spec - Skill specification
   * @returns Generation result
   */
  createSkill(spec: SkillSpec): GenerationResult {
    const skillDir = path.join(this.skillsDir, spec.name);

    // Check if skill already exists
    if (fs.existsSync(skillDir)) {
      return {
        success: false,
        error: `Skill '${spec.name}' already exists`,
      };
    }

    try {
      // Create skill directory
      fs.mkdirSync(skillDir, { recursive: true });

      // Write SKILL.md
      const content = this.generateSkillMd(spec);
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content, 'utf-8');

      // Create scripts if provided
      if (spec.scripts && spec.scripts.length > 0) {
        const scriptsDir = path.join(skillDir, 'scripts');
        fs.mkdirSync(scriptsDir, { recursive: true });

        for (const script of spec.scripts) {
          fs.writeFileSync(
            path.join(scriptsDir, script.name),
            script.content,
            'utf-8'
          );
          // Make executable if shell script
          if (script.name.endsWith('.sh')) {
            fs.chmodSync(path.join(scriptsDir, script.name), 0o755);
          }
        }
      }

      logger.info('Skill created', { name: spec.name, path: skillDir });

      return {
        success: true,
        path: skillDir,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to create skill', { name: spec.name, error });
      return {
        success: false,
        error: message,
      };
    }
  }

  /**
   * Update an existing skill
   *
   * @param name - Skill name
   * @param updates - Partial specification with updates
   * @returns Generation result
   */
  updateSkill(name: string, updates: Partial<SkillSpec>): GenerationResult {
    const skillDir = path.join(this.skillsDir, name);
    const skillMdPath = path.join(skillDir, 'SKILL.md');

    // Check if skill exists
    if (!fs.existsSync(skillMdPath)) {
      return {
        success: false,
        error: `Skill '${name}' not found`,
      };
    }

    try {
      // Read existing content
      const existingContent = fs.readFileSync(skillMdPath, 'utf-8');
      const existingSpec = this.parseSkillMd(existingContent, name);

      // Merge updates
      const mergedSpec: SkillSpec = {
        ...existingSpec,
        ...updates,
        name, // Preserve original name
      };

      // Generate new content
      const content = this.generateSkillMd(mergedSpec);
      fs.writeFileSync(skillMdPath, content, 'utf-8');

      // Update scripts if provided
      if (updates.scripts && updates.scripts.length > 0) {
        const scriptsDir = path.join(skillDir, 'scripts');
        fs.mkdirSync(scriptsDir, { recursive: true });

        for (const script of updates.scripts) {
          fs.writeFileSync(
            path.join(scriptsDir, script.name),
            script.content,
            'utf-8'
          );
        }
      }

      logger.info('Skill updated', { name, path: skillDir });

      return {
        success: true,
        path: skillDir,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to update skill', { name, error });
      return {
        success: false,
        error: message,
      };
    }
  }

  /**
   * Parse existing SKILL.md to extract specification
   */
  private parseSkillMd(content: string, name: string): SkillSpec {
    const spec: SkillSpec = {
      name,
      description: '',
      quickStart: '',
      executionSteps: [],
      bestPractices: [],
      examples: [],
    };

    // Parse frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch && frontmatterMatch[1]) {
      const lines = frontmatterMatch[1].split('\n');
      for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.slice(0, colonIndex).trim();
          const value = line.slice(colonIndex + 1).trim();

          if (key === 'description') spec.description = value;
          if (key === 'domain') spec.domain = value;
          if (key === 'version') spec.version = value;
          if (key === 'author') spec.author = value;
          if (key === 'tags') spec.tags = value.split(',').map(t => t.trim());
        }
      }
    }

    // Parse Quick Start section
    const quickStartMatch = content.match(/## Quick Start\n\n([\s\S]*?)(?=\n## |$)/);
    if (quickStartMatch && quickStartMatch[1]) {
      spec.quickStart = quickStartMatch[1].trim();
    }

    // Parse Execution Steps
    const stepsMatch = content.match(/## Execution Steps\n\n([\s\S]*?)(?=\n## |$)/);
    if (stepsMatch && stepsMatch[1]) {
      const stepLines = stepsMatch[1].split('\n').filter(l => l.match(/^\d+\./));
      spec.executionSteps = stepLines.map(l => l.replace(/^\d+\.\s*/, ''));
    }

    // Parse Best Practices
    const practicesMatch = content.match(/## Best Practices\n\n([\s\S]*?)(?=\n## |$)/);
    if (practicesMatch && practicesMatch[1]) {
      const practiceLines = practicesMatch[1].split('\n').filter(l => l.startsWith('-'));
      spec.bestPractices = practiceLines.map(l => l.replace(/^-\s*/, ''));
    }

    // Parse Examples
    const examplesMatch = content.match(/## Examples\n\n([\s\S]*?)$/);
    if (examplesMatch && examplesMatch[1]) {
      spec.examples = [examplesMatch[1].trim()];
    }

    return spec;
  }
}
