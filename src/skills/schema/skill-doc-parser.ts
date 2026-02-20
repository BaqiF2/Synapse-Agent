/**
 * Skill Doc Parser - SKILL.md 统一解析器
 *
 * 定义 SkillDoc 的 Zod schema 并提供 SKILL.md 解析能力。
 * 内部解析逻辑委托给 skill-doc-schema 子模块。
 * F-004: 新增 quickStart 和 bestPractices 字段支持。
 *
 * @module skill-doc-parser
 *
 * Core Exports:
 * - SkillDocSchema: Zod schema for skill document metadata
 * - SkillDocParser: 统一 SKILL.md 解析器
 * - parseSkillMd: 解析 SKILL.md 文件的便捷函数
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
} from './skill-doc-schema.ts';

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
 * F-004: 新增 quickStart 和 bestPractices 字段
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
  // F-004: 新增字段
  quickStart: z.string().optional(),
  bestPractices: z.array(z.string()).default([]),
});

export type SkillDoc = z.infer<typeof SkillDocSchema>;

/**
 * SkillDocParser - 统一 SKILL.md 解析器
 *
 * 逐行状态机解析，支持 Zod 校验、中英文章节映射、代码块追踪。
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
      bestPractices: [],
    };
    applyFrontmatter(result, frontmatter);

    let currentSection: string | null = null;
    let inCodeBlock = false;
    let codeBlockContent: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const trimmed = line.trim();

      // 处理代码块
      if (inCodeBlock) {
        if (PATTERNS.codeBlockEnd.test(trimmed)) {
          inCodeBlock = false;
          if (currentSection === 'examples' && codeBlockContent.length > 0) {
            result.examples!.push(codeBlockContent.join('\n'));
          } else if (currentSection === 'quickStart' && codeBlockContent.length > 0) {
            // Quick Start 章节中的代码块追加到 quickStart 字段
            const codeStr = codeBlockContent.join('\n');
            if (!result.quickStart) {
              result.quickStart = codeStr;
            } else {
              result.quickStart += '\n' + codeStr;
            }
          }
          codeBlockContent = [];
        } else {
          codeBlockContent.push(line);
        }
        continue;
      }

      // 代码块开始（仅在非代码块状态下检测）
      if (PATTERNS.codeBlockStart.test(trimmed)) {
        inCodeBlock = true;
        codeBlockContent = [];
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
