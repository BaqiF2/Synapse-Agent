/**
 * Skill Doc Schema - SKILL.md 解析工具函数、类型定义与 Zod schema
 *
 * 包含 SKILL_DOMAINS 常量、SkillDocSchema（Zod）、SkillDoc 类型，
 * 以及 frontmatter 解析、引号剥离、section 规范化、key-value/section 内容解析。
 * 新增 quickStart 和 bestPractices 字段支持。
 *
 * @module skill-doc-schema
 * Core Exports:
 * - SKILL_DOMAINS: 可用的技能领域列表
 * - SkillDomain: 技能领域类型
 * - SkillDocSchema: Zod schema for skill document metadata
 * - SkillDoc: 技能文档类型（从 SkillDocSchema 推导）
 * - extractFrontmatter: 从 Markdown 内容中提取 YAML frontmatter
 * - applyFrontmatter: 将 frontmatter 映射到 SkillDoc
 * - normalizeSection: 规范化章节名称（支持中英文映射）
 * - setKeyValue: 设置 key-value 到 SkillDoc
 * - parseSectionContent: 解析章节内容
 * - stripWrappingQuotes: 剥离首尾引号
 * - PATTERNS: Markdown 解析用正则模式集
 */

import { z } from 'zod';

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

/** Regex patterns for parsing SKILL.md */
export const PATTERNS = {
  keyValue: /^\*\*([^*]+)\*\*\s*[:：]\s*(.+)$/,
  h1Header: /^#\s+(.+)$/,
  h2Header: /^##\s+(.+)$/,
  listItem: /^[-*]\s+(.+)$/,
  numberedItem: /^\d+\.\s+(.+)$/,
  codeBlockStart: /^```(\w*)$/,
  codeBlockEnd: /^```$/,
};

/** 从 Markdown 内容中提取 YAML frontmatter */
export function extractFrontmatter(
  content: string,
): { bodyContent: string; frontmatter: Record<string, string | string[]> } {
  const normalized = content.replace(/^\uFEFF/, '');
  if (!normalized.startsWith('---')) {
    return { bodyContent: content, frontmatter: {} };
  }

  const lines = normalized.split(/\r?\n/);
  if ((lines[0] ?? '').trim() !== '---') {
    return { bodyContent: content, frontmatter: {} };
  }

  let frontmatterEnd = -1;
  for (let i = 1; i < lines.length; i++) {
    if ((lines[i] ?? '').trim() === '---') {
      frontmatterEnd = i;
      break;
    }
  }

  if (frontmatterEnd === -1) {
    return { bodyContent: content, frontmatter: {} };
  }

  const frontmatterContent = lines.slice(1, frontmatterEnd).join('\n');
  const bodyContent = lines.slice(frontmatterEnd + 1).join('\n');

  return {
    bodyContent,
    frontmatter: parseFrontmatter(frontmatterContent),
  };
}

/**
 * 解析 frontmatter 的 key/value
 */
function parseFrontmatter(frontmatterContent: string): Record<string, string | string[]> {
  const metadata: Record<string, string | string[]> = {};
  const lines = frontmatterContent.split('\n');
  let currentListKey: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const listItemMatch = trimmed.match(/^-\s+(.+)$/);
    if (listItemMatch && currentListKey) {
      const item = stripWrappingQuotes((listItemMatch[1] ?? '').trim());
      if (!item) continue;
      const existing = metadata[currentListKey];
      if (Array.isArray(existing)) {
        existing.push(item);
      } else {
        metadata[currentListKey] = [item];
      }
      continue;
    }

    const keyValueMatch = trimmed.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!keyValueMatch) {
      currentListKey = null;
      continue;
    }

    const key = (keyValueMatch[1] ?? '').toLowerCase();
    const rawValue = (keyValueMatch[2] ?? '').trim();
    if (!key) {
      currentListKey = null;
      continue;
    }

    if (!rawValue) {
      metadata[key] = [];
      currentListKey = key;
      continue;
    }

    currentListKey = null;
    if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      metadata[key] = parseFrontmatterListValue(rawValue);
    } else {
      metadata[key] = stripWrappingQuotes(rawValue);
    }
  }

  return metadata;
}

/** 解析 frontmatter 中的数组值（如 [a, b, c]） */
function parseFrontmatterListValue(rawValue: string): string[] {
  const inner = rawValue.slice(1, -1).trim();
  if (!inner) return [];
  return inner
    .split(',')
    .map((item) => stripWrappingQuotes(item.trim()))
    .filter(Boolean);
}

/** 剥离首尾引号 */
export function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith('\'') && trimmed.endsWith('\''))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/** 将 frontmatter 映射到 SkillDoc */
export function applyFrontmatter(
  result: Partial<SkillDoc>,
  frontmatter: Record<string, string | string[]>,
): void {
  const domain = frontmatter.domain;
  if (typeof domain === 'string' && SKILL_DOMAINS.includes(domain as SkillDomain)) {
    result.domain = domain as SkillDomain;
  }

  const version = frontmatter.version;
  if (typeof version === 'string' && version) {
    result.version = version;
  }

  const description = frontmatter.description;
  if (typeof description === 'string' && description) {
    result.description = description;
  }

  const author = frontmatter.author;
  if (typeof author === 'string' && author) {
    result.author = author;
  }

  const tags = frontmatter.tags;
  if (Array.isArray(tags)) {
    result.tags = tags.map((tag) => tag.trim()).filter(Boolean);
  } else if (typeof tags === 'string' && tags) {
    result.tags = tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean);
  }
}

/** 规范化章节名称（支持中英文映射） */
export function normalizeSection(section: string): string {
  const normalized = section.toLowerCase().trim();

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
    // F-004: 新增 quickStart 和 bestPractices 映射
    'quick start': 'quickStart',
    'quickstart': 'quickStart',
    '快速开始': 'quickStart',
    'best practices': 'bestPractices',
    'bestpractices': 'bestPractices',
    '最佳实践': 'bestPractices',
  };

  return mappings[normalized] || normalized;
}

/** 设置 key-value 到 SkillDoc（支持中英文 key） */
export function setKeyValue(result: Partial<SkillDoc>, key: string, value: string): void {
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

/** 解析章节内容（列表项、工具引用等） */
export function parseSectionContent(
  result: Partial<SkillDoc>,
  section: string,
  line: string
): void {
  if (!line) return;

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
      if (item) {
        const toolRef = item.match(/`([^`]+)`/);
        const toolRefValue = toolRef?.[1];
        if (toolRefValue) {
          result.toolDependencies!.push(toolRefValue);
        }
      }
      break;

    // F-004: 新增 quickStart 章节解析
    case 'quickStart':
      if (!result.quickStart) {
        result.quickStart = line;
      } else {
        result.quickStart += '\n' + line;
      }
      break;

    // F-004: 新增 bestPractices 章节解析
    case 'bestPractices':
      if (item) {
        result.bestPractices!.push(item.trim());
      }
      break;

    // examples 章节：列表项和纯文本行均作为示例
    case 'examples':
      if (item) {
        result.examples!.push(item.trim());
      } else {
        result.examples!.push(line);
      }
      break;
  }
}
