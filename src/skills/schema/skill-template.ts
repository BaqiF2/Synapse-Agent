/**
 * Skill Template - SKILL.md 模板生成
 *
 * 负责从 SkillSpec 生成 SKILL.md 的 Markdown 文本，包含 YAML frontmatter、
 * 执行步骤、最佳实践等章节。
 *
 * @module skill-template
 *
 * Core Exports:
 * - generateSkillMd: 从 SkillSpec 生成 SKILL.md 内容
 * - yamlSafeValue: YAML 值安全包裹函数
 */

import type { SkillSpec } from '../types.ts';

/** YAML 特殊字符：含冒号、引号、井号等需要引号包裹 */
const YAML_SPECIAL_CHARS = /[:#'"{}[\]|>&*!?@`]/;

/**
 * 包裹 YAML 值：当值包含特殊字符时用双引号包裹，内部双引号转义
 *
 * @param value - 原始值
 * @returns 安全的 YAML 值
 */
export function yamlSafeValue(value: string): string {
  if (!YAML_SPECIAL_CHARS.test(value)) {
    return value;
  }
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

/**
 * 从 SkillSpec 生成完整的 SKILL.md 内容
 *
 * 包含 YAML frontmatter、标题、Quick Start、Execution Steps、
 * Best Practices、Examples 等章节。
 *
 * @param spec - 技能规格
 * @returns SKILL.md 的 Markdown 文本
 */
export function generateSkillMd(spec: SkillSpec): string {
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

  // 标题（kebab-case → Title Case）
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
