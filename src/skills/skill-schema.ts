/**
 * Skill Schema and Parser
 *
 * This module defines the schema for SKILL.md files and provides
 * parsing utilities to extract structured metadata from skill documents.
 *
 * @module skill-schema
 *
 * Core Exports:
 * - SkillDocSchema: Zod schema for skill document metadata
 * - SkillDocParser: Parser for SKILL.md files
 * - parseSkillMd: Parse a SKILL.md file into structured metadata
 */

import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Skill domain categories
 */
export const SKILL_DOMAINS = [
  'programming',
  'data',
  'devops',
  'finance',
  'general',
  'automation',
  'ai',
  'security',
  'other',
] as const;

export type SkillDomain = (typeof SKILL_DOMAINS)[number];

/**
 * Schema for skill document metadata extracted from SKILL.md
 */
export const SkillDocSchema = z.object({
  /** Skill name (directory name) */
  name: z.string(),
  /** Human-readable title from h1 header */
  title: z.string().optional(),
  /** Skill domain */
  domain: z.enum(SKILL_DOMAINS).default('general'),
  /** Brief description */
  description: z.string().optional(),
  /** Version string */
  version: z.string().default('1.0.0'),
  /** Tags for searchability */
  tags: z.array(z.string()).default([]),
  /** Author name */
  author: z.string().optional(),
  /** Usage scenarios text */
  usageScenarios: z.string().optional(),
  /** Tool dependencies (mcp:*, skill:* commands) */
  toolDependencies: z.array(z.string()).default([]),
  /** Execution steps */
  executionSteps: z.array(z.string()).default([]),
  /** Example usage */
  examples: z.array(z.string()).default([]),
  /** Full path to the skill directory */
  skillPath: z.string(),
  /** Full path to the SKILL.md file */
  mdPath: z.string(),
  /** Raw markdown content */
  rawContent: z.string().optional(),
});

export type SkillDoc = z.infer<typeof SkillDocSchema>;

/**
 * Regex patterns for parsing SKILL.md
 */
const PATTERNS = {
  /** Match **Key**: Value or **Key**: Value */
  keyValue: /^\*\*([^*]+)\*\*\s*[:：]\s*(.+)$/,
  /** Match h1 header # Title */
  h1Header: /^#\s+(.+)$/,
  /** Match h2 header ## Section */
  h2Header: /^##\s+(.+)$/,
  /** Match list item - item or * item */
  listItem: /^[-*]\s+(.+)$/,
  /** Match numbered list 1. item */
  numberedItem: /^\d+\.\s+(.+)$/,
  /** Match code block start ```language */
  codeBlockStart: /^```(\w*)$/,
  /** Match code block end ``` */
  codeBlockEnd: /^```$/,
};

/**
 * SkillDocParser
 *
 * Parses SKILL.md files into structured metadata.
 * Supports the following format:
 *
 * ```markdown
 * # Skill Title
 *
 * **Domain**: programming
 * **Version**: 1.0.0
 * **Description**: Brief description
 * **Tags**: tag1, tag2, tag3
 * **Author**: Author Name
 *
 * ## Usage Scenarios
 * Description of typical use cases...
 *
 * ## Tool Dependencies
 * - skill:pdf-editor:extract_text
 * - mcp:filesystem:read_file
 *
 * ## Execution Steps
 * 1. Step 1
 * 2. Step 2
 *
 * ## Examples
 * ```bash
 * example command
 * ```
 * ```
 */
export class SkillDocParser {
  /**
   * Parses a SKILL.md file
   *
   * @param mdPath - Path to the SKILL.md file
   * @param skillName - Name of the skill (directory name)
   * @returns Parsed skill document or null if parsing fails
   */
  public parse(mdPath: string, skillName: string): SkillDoc | null {
    if (!fs.existsSync(mdPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(mdPath, 'utf-8');
      return this.parseContent(content, mdPath, skillName);
    } catch {
      return null;
    }
  }

  /**
   * Parses SKILL.md content string
   *
   * @param content - Markdown content
   * @param mdPath - Path to the SKILL.md file
   * @param skillName - Name of the skill
   * @returns Parsed skill document
   */
  public parseContent(content: string, mdPath: string, skillName: string): SkillDoc {
    const lines = content.split('\n');
    const skillPath = path.dirname(mdPath);

    const result: Partial<SkillDoc> = {
      name: skillName,
      skillPath,
      mdPath,
      rawContent: content,
      tags: [],
      toolDependencies: [],
      executionSteps: [],
      examples: [],
    };

    let currentSection: string | null = null;
    let inCodeBlock = false;
    let codeBlockContent: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const trimmed = line.trim();

      // Handle code blocks
      if (PATTERNS.codeBlockStart.test(trimmed)) {
        inCodeBlock = true;
        codeBlockContent = [];
        continue;
      }

      if (inCodeBlock) {
        if (PATTERNS.codeBlockEnd.test(trimmed)) {
          inCodeBlock = false;
          if (currentSection === 'examples' && codeBlockContent.length > 0) {
            result.examples!.push(codeBlockContent.join('\n'));
          }
          codeBlockContent = [];
        } else {
          codeBlockContent.push(line);
        }
        continue;
      }

      // Parse h1 header (title)
      const h1Match = PATTERNS.h1Header.exec(trimmed);
      if (h1Match) {
        const title = h1Match[1];
        if (title) {
          result.title = title.trim();
        }
        continue;
      }

      // Parse h2 header (section)
      const h2Match = PATTERNS.h2Header.exec(trimmed);
      if (h2Match) {
        const section = h2Match[1];
        if (section) {
          currentSection = this.normalizeSection(section);
        }
        continue;
      }

      // Parse key-value pairs
      const kvMatch = PATTERNS.keyValue.exec(trimmed);
      if (kvMatch) {
        const key = kvMatch[1];
        const value = kvMatch[2];
        if (key && value) {
          this.setKeyValue(result, key.trim().toLowerCase(), value.trim());
        }
        continue;
      }

      // Parse section content
      if (currentSection) {
        this.parseSectionContent(result, currentSection, trimmed);
      }
    }

    return SkillDocSchema.parse(result);
  }

  /**
   * Normalizes a section name
   */
  private normalizeSection(section: string): string {
    const normalized = section.toLowerCase().trim();

    // Map common variations
    const mappings: Record<string, string> = {
      'usage scenarios': 'usageScenarios',
      'usage': 'usageScenarios',
      '使用场景': 'usageScenarios',
      'tool dependencies': 'toolDependencies',
      'dependencies': 'toolDependencies',
      '工具依赖': 'toolDependencies',
      'execution steps': 'executionSteps',
      'steps': 'executionSteps',
      '执行流程': 'executionSteps',
      'examples': 'examples',
      '示例': 'examples',
      'tools': 'tools',
      '工具': 'tools',
    };

    return mappings[normalized] || normalized;
  }

  /**
   * Sets a key-value pair in the result
   */
  private setKeyValue(result: Partial<SkillDoc>, key: string, value: string): void {
    switch (key) {
      case 'domain':
      case '领域':
        if (SKILL_DOMAINS.includes(value as SkillDomain)) {
          result.domain = value as SkillDomain;
        }
        break;

      case 'version':
      case '版本':
        result.version = value;
        break;

      case 'description':
      case '描述':
        result.description = value;
        break;

      case 'tags':
      case '标签':
        result.tags = value.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
        break;

      case 'author':
      case '作者':
        result.author = value;
        break;
    }
  }

  /**
   * Parses content within a section
   */
  private parseSectionContent(
    result: Partial<SkillDoc>,
    section: string,
    line: string
  ): void {
    if (!line) return;

    // Parse list items
    const listMatch = PATTERNS.listItem.exec(line);
    const numberedMatch = PATTERNS.numberedItem.exec(line);
    const item = listMatch?.[1] || numberedMatch?.[1];

    switch (section) {
      case 'usageScenarios':
        if (!result.usageScenarios) {
          result.usageScenarios = line;
        } else {
          result.usageScenarios += '\n' + line;
        }
        break;

      case 'toolDependencies':
        if (item) {
          // Extract tool reference (mcp:* or skill:*)
          const toolRef = item.match(/((?:mcp|skill):[^\s]+)/);
          const toolRefValue = toolRef?.[1];
          if (toolRefValue) {
            result.toolDependencies!.push(toolRefValue);
          } else {
            result.toolDependencies!.push(item.trim());
          }
        }
        break;

      case 'executionSteps':
        if (item) {
          result.executionSteps!.push(item.trim());
        }
        break;

      case 'tools':
        // Parse tool references from tools section
        if (item) {
          const toolRef = item.match(/`([^`]+)`/);
          const toolRefValue = toolRef?.[1];
          if (toolRefValue) {
            result.toolDependencies!.push(toolRefValue);
          }
        }
        break;
    }
  }
}

/**
 * Parses a SKILL.md file into structured metadata
 *
 * @param mdPath - Path to the SKILL.md file
 * @param skillName - Name of the skill (directory name)
 * @returns Parsed skill document or null if parsing fails
 */
export function parseSkillMd(mdPath: string, skillName: string): SkillDoc | null {
  const parser = new SkillDocParser();
  return parser.parse(mdPath, skillName);
}

// Default export
export default SkillDocParser;
