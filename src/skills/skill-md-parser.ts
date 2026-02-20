/**
 * Skill Md Parser - 解析已有 SKILL.md 文件为 SkillSpec
 *
 * 从 SKILL.md 文件内容中提取 frontmatter、Quick Start、Execution Steps、
 * Best Practices、Examples 等信息，还原为 SkillSpec 结构。
 * 同时包含从 LLM 响应解析 SkillSpec 的逻辑。
 *
 * @module skill-md-parser
 *
 * Core Exports:
 * - parseSkillMdToSpec: 从 SKILL.md 内容解析为 SkillSpec
 * - parseSkillSpecFromLLM: 从 LLM 响应文本解析 SkillSpec
 */

import type { SkillSpec } from './skill-generator.ts';

/**
 * 从 SKILL.md 内容解析还原为 SkillSpec
 *
 * 解析 frontmatter（description, domain, version, author, tags）
 * 和正文章节（Quick Start, Execution Steps, Best Practices, Examples）
 *
 * @param content - SKILL.md 文件内容
 * @param name - 技能名称
 * @returns 解析后的 SkillSpec
 */
export function parseSkillMdToSpec(content: string, name: string): SkillSpec {
  const spec: SkillSpec = {
    name,
    description: '',
    quickStart: '',
    executionSteps: [],
    bestPractices: [],
    examples: [],
  };

  // 解析 frontmatter
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

  // 解析 Quick Start
  const quickStartMatch = content.match(/## Quick Start\n\n([\s\S]*?)(?=\n## |$)/);
  if (quickStartMatch && quickStartMatch[1]) {
    spec.quickStart = quickStartMatch[1].trim();
  }

  // 解析 Execution Steps
  const stepsMatch = content.match(/## Execution Steps\n\n([\s\S]*?)(?=\n## |$)/);
  if (stepsMatch && stepsMatch[1]) {
    const stepLines = stepsMatch[1].split('\n').filter(l => l.match(/^\d+\./));
    spec.executionSteps = stepLines.map(l => l.replace(/^\d+\.\s*/, ''));
  }

  // 解析 Best Practices
  const practicesMatch = content.match(/## Best Practices\n\n([\s\S]*?)(?=\n## |$)/);
  if (practicesMatch && practicesMatch[1]) {
    const practiceLines = practicesMatch[1].split('\n').filter(l => l.startsWith('-'));
    spec.bestPractices = practiceLines.map(l => l.replace(/^-\s*/, ''));
  }

  // 解析 Examples
  const examplesMatch = content.match(/## Examples\n\n([\s\S]*?)$/);
  if (examplesMatch && examplesMatch[1]) {
    spec.examples = [examplesMatch[1].trim()];
  }

  return spec;
}

/**
 * 从 LLM 响应文本中解析 SkillSpec
 *
 * 支持带有 markdown code fence 的 JSON 格式
 *
 * @param text - LLM 响应文本
 * @returns 解析后的 SkillSpec
 * @throws 当 name 字段缺失或无效时
 */
export function parseSkillSpecFromLLM(text: string): SkillSpec {
  // 尝试提取 JSON（处理可能的 markdown code fences）
  let jsonStr = text.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch && fenceMatch[1]) {
    jsonStr = fenceMatch[1].trim();
  }

  const parsed = JSON.parse(jsonStr);

  // 验证必须字段
  if (!parsed.name || typeof parsed.name !== 'string') {
    throw new Error('Invalid skill spec: missing or invalid "name" field');
  }

  return {
    name: parsed.name,
    description: parsed.description || '',
    quickStart: parsed.quickStart || '',
    executionSteps: Array.isArray(parsed.executionSteps) ? parsed.executionSteps : [],
    bestPractices: Array.isArray(parsed.bestPractices) ? parsed.bestPractices : [],
    examples: Array.isArray(parsed.examples) ? parsed.examples : [],
    domain: parsed.domain,
    version: parsed.version,
    author: parsed.author,
    tags: Array.isArray(parsed.tags) ? parsed.tags : undefined,
  };
}
