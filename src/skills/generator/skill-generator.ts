/**
 * Skill Generator (Facade)
 *
 * Generates and updates SKILL.md files for skill enhancement.
 * 支持通过 LLMProvider 接口从对话历史智能生成技能。
 * F-004: 使用统一解析器 SkillDocParser.parseContent() 替代 parseSkillMdToSpec。
 *
 * @module skill-generator
 *
 * Core Exports:
 * - SkillGenerator: Class for generating skills (Facade)
 * - Re-exports: SkillSpec, ConversationMessage, ScriptDef, GenerationResult from types.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from '../../shared/file-logger.ts';
import { getSynapseSkillsDir } from '../../shared/config/paths.ts';
import type { LLMProvider, LLMResponse } from '../../types/provider.ts';
import { generateSkillMd } from '../schema/skill-template.ts';
import { SkillDocParser } from '../schema/skill-doc-parser.ts';
import type { SkillSpec, ConversationMessage, GenerationResult } from '../types.ts';
import type { SkillDoc } from '../schema/skill-doc-parser.ts';

// 从 types.ts re-export 类型，保持向后兼容
export type { SkillSpec, ScriptDef, ConversationMessage, GenerationResult } from '../types.ts';

const logger = createLogger('skill-generator');

const DEFAULT_SKILLS_DIR = getSynapseSkillsDir();

/**
 * 用于 LLM 生成技能的系统提示词（含 few-shot 示例和 chain-of-thought 引导）
 */
const SKILL_GENERATION_SYSTEM_PROMPT = `You are a skill extraction assistant. Your task is to analyze a conversation and extract a reusable skill specification.

## Think Step by Step
1. Identify the core task the user is trying to accomplish
2. Extract the key tools and commands used
3. Generalize the specific steps into reusable execution steps
4. Identify best practices from what worked well

## Output Format
Return a JSON object with these fields:
- name: kebab-case skill name (e.g., "code-review", "data-pipeline")
- description: clear description of what the skill does and when to use it (20-200 chars)
- quickStart: a brief code example showing typical usage
- executionSteps: array of specific, actionable step strings (3-10 steps)
- bestPractices: array of best practice strings derived from the conversation
- examples: array of example usage strings
- domain: one of "programming", "data", "devops", "finance", "general", "automation", "ai", "security", "other"
- version: semver string (default "1.0.0")
- tags: array of lowercase tag strings for searchability

## Few-Shot Example

Input conversation about refactoring a React component:
Output:
{
  "name": "react-refactor",
  "description": "Refactor React components for better performance and readability. Use when components are too large or have performance issues.",
  "quickStart": "Identify the component to refactor, extract sub-components, and optimize re-renders.",
  "executionSteps": [
    "Read the target component and identify responsibilities",
    "Extract reusable sub-components into separate files",
    "Add React.memo for pure components",
    "Move complex state logic to custom hooks",
    "Verify all tests still pass after refactoring"
  ],
  "bestPractices": [
    "Keep components under 200 lines",
    "Extract custom hooks for shared logic",
    "Use React.memo only for expensive renders"
  ],
  "examples": ["Refactor UserProfile into UserAvatar + UserDetails + UserActions"],
  "domain": "programming",
  "version": "1.0.0",
  "tags": ["react", "refactor", "performance"]
}

Return ONLY valid JSON, no markdown code fences or extra text.`;

/** shell 脚本权限 */
const SHELL_SCRIPT_MODE = 0o755;

/**
 * SkillGenerator - Facade，创建和更新技能文件
 *
 * F-004: updateSkill 中使用 SkillDocParser.parseContent() 替代 parseSkillMdToSpec，
 * 通过 skillDocToSpec 转换函数映射到 SkillSpec。
 */
export class SkillGenerator {
  private skillsDir: string;
  private parser: SkillDocParser;

  constructor(skillsDir: string = DEFAULT_SKILLS_DIR) {
    this.skillsDir = skillsDir;
    this.parser = new SkillDocParser();
  }

  /**
   * Generate SKILL.md content from specification
   */
  generateSkillMd(spec: SkillSpec): string {
    return generateSkillMd(spec);
  }

  /**
   * Create a new skill
   */
  createSkill(spec: SkillSpec): GenerationResult {
    const skillDir = path.join(this.skillsDir, spec.name);

    if (fs.existsSync(skillDir)) {
      return {
        success: false,
        error: `Skill '${spec.name}' already exists`,
      };
    }

    try {
      fs.mkdirSync(skillDir, { recursive: true });

      const content = generateSkillMd(spec);
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content, 'utf-8');

      if (spec.scripts && spec.scripts.length > 0) {
        const scriptsDir = path.join(skillDir, 'scripts');
        fs.mkdirSync(scriptsDir, { recursive: true });

        for (const script of spec.scripts) {
          fs.writeFileSync(
            path.join(scriptsDir, script.name),
            script.content,
            'utf-8'
          );
          if (script.name.endsWith('.sh')) {
            fs.chmodSync(path.join(scriptsDir, script.name), SHELL_SCRIPT_MODE);
          }
        }
      }

      logger.info('Skill created', { name: spec.name, path: skillDir });

      return { success: true, path: skillDir };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to create skill', { name: spec.name, error });
      return { success: false, error: message };
    }
  }

  /**
   * Update an existing skill
   *
   * F-004: 使用 SkillDocParser.parseContent() 替代 parseSkillMdToSpec
   */
  updateSkill(name: string, updates: Partial<SkillSpec>): GenerationResult {
    const skillDir = path.join(this.skillsDir, name);
    const skillMdPath = path.join(skillDir, 'SKILL.md');

    if (!fs.existsSync(skillMdPath)) {
      return {
        success: false,
        error: `Skill '${name}' not found`,
      };
    }

    try {
      const existingContent = fs.readFileSync(skillMdPath, 'utf-8');
      // F-004: 使用统一解析器替代 parseSkillMdToSpec
      const skillDoc = this.parser.parseContent(existingContent, skillMdPath, name);
      const existingSpec = skillDocToSpec(skillDoc);

      const mergedSpec: SkillSpec = {
        ...existingSpec,
        ...updates,
        name,
      };

      const content = generateSkillMd(mergedSpec);
      fs.writeFileSync(skillMdPath, content, 'utf-8');

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

      return { success: true, path: skillDir };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to update skill', { name, error });
      return { success: false, error: message };
    }
  }

  /**
   * 通过 LLMProvider 从对话历史智能生成技能规格
   */
  async generateFromConversation(
    provider: LLMProvider,
    conversationHistory: ConversationMessage[],
  ): Promise<SkillSpec> {
    const messages = conversationHistory.map((msg) => ({
      role: msg.role,
      content: [{ type: 'text' as const, text: msg.content }],
    }));

    messages.push({
      role: 'user',
      content: [{
        type: 'text' as const,
        text: 'Based on the conversation above, extract a reusable skill specification as JSON.',
      }],
    });

    logger.info('Generating skill from conversation via LLMProvider', {
      provider: provider.name,
      messageCount: conversationHistory.length,
    });

    const stream = provider.generate({
      systemPrompt: SKILL_GENERATION_SYSTEM_PROMPT,
      messages,
    });

    const response: LLMResponse = await stream.result;
    const textContent = response.content.find((c) => c.type === 'text');

    if (!textContent || textContent.type !== 'text') {
      throw new Error('LLM response did not contain text content');
    }

    return parseSkillSpecFromLLM(textContent.text);
  }
}

/**
 * F-004: 将 SkillDoc（统一解析器输出）转换为 SkillSpec（生成器输入）
 *
 * 映射关系：
 * - SkillDoc.usageScenarios → SkillSpec.quickStart（如果 quickStart 缺失则回退到 usageScenarios）
 * - SkillDoc.bestPractices → SkillSpec.bestPractices
 */
function skillDocToSpec(doc: SkillDoc): SkillSpec {
  return {
    name: doc.name,
    description: doc.description ?? '',
    quickStart: doc.quickStart ?? doc.usageScenarios ?? '',
    executionSteps: doc.executionSteps,
    bestPractices: doc.bestPractices ?? [],
    examples: doc.examples,
    domain: doc.domain,
    version: doc.version,
    author: doc.author,
    tags: doc.tags,
  };
}

/**
 * 从 LLM 响应文本中解析 SkillSpec
 *
 * 支持带有 markdown code fence 的 JSON 格式。
 * 原位于 skill-md-parser-compat.ts，合并到此文件以减少文件数。
 *
 * @param text - LLM 响应文本
 * @returns 解析后的 SkillSpec
 * @throws 当 name 字段缺失或无效时
 */
export function parseSkillSpecFromLLM(text: string): SkillSpec {
  let jsonStr = text.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch && fenceMatch[1]) {
    jsonStr = fenceMatch[1].trim();
  }

  const parsed = JSON.parse(jsonStr);

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
