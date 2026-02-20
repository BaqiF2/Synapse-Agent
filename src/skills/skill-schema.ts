/**
 * Skill Schema and Parser (Facade)
 *
 * This module defines the schema for SKILL.md files and provides
 * parsing utilities to extract structured metadata from skill documents.
 * 内部解析逻辑委托给 skill-schema-utils 子模块。
 *
 * @module skill-schema
 *
 * Core Exports:
 * - SkillDocSchema: Zod schema for skill document metadata
 * - SkillDocParser: Parser for SKILL.md files
 * - parseSkillMd: Parse a SKILL.md file into structured metadata
 * - SKILL_DOMAINS: 可用的技能领域列表
 * - SkillDoc: 技能文档类型
 * - SkillDomain: 技能领域类型
 */

import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  PATTERNS,
  extractFrontmatter,
  applyFrontmatter,
  normalizeSection,
  setKeyValue,
  parseSectionContent,
} from './skill-schema-utils.ts';

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
  name: z.string(),
  title: z.string().optional(),
  domain: z.enum(SKILL_DOMAINS).default('general'),
  description: z.string().optional(),
  version: z.string().default('1.0.0'),
  tags: z.array(z.string()).default([]),
  author: z.string().optional(),
  usageScenarios: z.string().optional(),
  toolDependencies: z.array(z.string()).default([]),
  executionSteps: z.array(z.string()).default([]),
  examples: z.array(z.string()).default([]),
  skillPath: z.string(),
  mdPath: z.string(),
  rawContent: z.string().optional(),
});

export type SkillDoc = z.infer<typeof SkillDocSchema>;

/**
 * SkillDocParser - Facade，解析 SKILL.md 为结构化元数据
 *
 * 内部委托解析逻辑给 skill-schema-utils
 */
export class SkillDocParser {
  /**
   * Parses a SKILL.md file
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
   */
  public parseContent(content: string, mdPath: string, skillName: string): SkillDoc {
    const { bodyContent, frontmatter } = extractFrontmatter(content);
    const lines = bodyContent.split('\n');
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
    applyFrontmatter(result, frontmatter);

    let currentSection: string | null = null;
    let inCodeBlock = false;
    let codeBlockContent: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const trimmed = line.trim();

      // 处理代码块
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

      // 解析 h1 标题
      const h1Match = PATTERNS.h1Header.exec(trimmed);
      if (h1Match) {
        const title = h1Match[1];
        if (title) {
          result.title = title.trim();
        }
        continue;
      }

      // 解析 h2 章节
      const h2Match = PATTERNS.h2Header.exec(trimmed);
      if (h2Match) {
        const section = h2Match[1];
        if (section) {
          currentSection = normalizeSection(section);
        }
        continue;
      }

      // 解析 key-value 对
      const kvMatch = PATTERNS.keyValue.exec(trimmed);
      if (kvMatch) {
        const key = kvMatch[1];
        const value = kvMatch[2];
        if (key && value) {
          setKeyValue(result, key.trim().toLowerCase(), value.trim());
        }
        continue;
      }

      // 解析章节内容
      if (currentSection) {
        parseSectionContent(result, currentSection, trimmed);
      }
    }

    return SkillDocSchema.parse(result);
  }
}

/**
 * Parses a SKILL.md file into structured metadata
 */
export function parseSkillMd(mdPath: string, skillName: string): SkillDoc | null {
  const parser = new SkillDocParser();
  return parser.parse(mdPath, skillName);
}

// Default export
export default SkillDocParser;
