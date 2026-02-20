/**
 * Skill Enhancer (Facade)
 *
 * 分析对话历史，生成或增强技能。支持 LLMProvider 智能增强。
 * 内部委托 skill-analysis（模式检测）和 skill-spec-builder（规格构建）。
 *
 * @module skill-enhancer
 * Core Exports:
 * - SkillEnhancer: Facade 类
 * - ConversationAnalysis / EnhanceDecision / EnhanceResult / SkillEnhancerOptions: 类型
 */

import * as path from 'node:path';
import * as os from 'node:os';
import { createLogger } from '../utils/logger.ts';
import { parseEnvPositiveInt } from '../utils/env.ts';
import { ConversationReader, type ConversationTurn, type ConversationSummary } from './conversation-reader.ts';
import { SkillGenerator, type SkillSpec } from './skill-generator.ts';
import { SkillLoader } from './skill-loader.ts';
import type { LLMProvider, LLMResponse } from '../providers/types.ts';
import { detectPattern, findMatchingSkill, suggestSkillName } from './skill-analysis.ts';
import { buildSkillSpec, generateUpdates, parseEnhancementsFromLLM } from './skill-spec-builder.ts';

const logger = createLogger('skill-enhancer');
const DEFAULT_MIN_TOOL_CALLS = 3;
const DEFAULT_MIN_UNIQUE_TOOLS = 2;

/** LLM 增强技能的系统提示词（含 chain-of-thought 引导） */
const SKILL_ENHANCE_SYSTEM_PROMPT = `You are a skill enhancement assistant. Given an existing skill specification, improve it.

## Think Step by Step
1. Analyze the current skill's strengths and weaknesses
2. Improve the description to be clearer and more actionable
3. Refine execution steps to be more specific and logical
4. Add relevant best practices based on the skill's domain

## Output Format
Return the enhanced fields as JSON with these optional fields:
- description: improved description (20-200 chars, clear and actionable)
- executionSteps: improved array of step strings (3-10 specific steps)
- bestPractices: improved array of best practice strings

Only include fields you are improving. Preserve fields that are already good.
Return ONLY valid JSON, no markdown code fences or extra text.`;

function getMinToolCalls(): number {
  return parseEnvPositiveInt(process.env.SYNAPSE_MIN_ENHANCE_TOOL_CALLS, DEFAULT_MIN_TOOL_CALLS);
}

function getMinUniqueTools(): number {
  return parseEnvPositiveInt(process.env.SYNAPSE_MIN_ENHANCE_UNIQUE_TOOLS, DEFAULT_MIN_UNIQUE_TOOLS);
}

/** Conversation analysis result */
export interface ConversationAnalysis {
  summary: ConversationSummary;
  toolSequence: string[];
  turns: ConversationTurn[];
}

/** Enhancement decision */
export interface EnhanceDecision {
  shouldEnhance: boolean;
  reason: string;
  suggestedAction: 'create' | 'enhance' | 'none';
  suggestedSkillName?: string;
  existingSkill?: string;
}

/** Enhancement result */
export interface EnhanceResult {
  action: 'created' | 'enhanced' | 'none';
  skillName?: string;
  message: string;
  path?: string;
}

/** Options for SkillEnhancer */
export interface SkillEnhancerOptions {
  skillsDir?: string;
  conversationsDir?: string;
  homeDir?: string;
}

/** SkillEnhancer - Facade，内部委托 skill-analysis + skill-spec-builder */
export class SkillEnhancer {
  private reader: ConversationReader;
  private generator: SkillGenerator;
  private loader: SkillLoader;
  private skillsDir: string;

  constructor(options: SkillEnhancerOptions = {}) {
    const homeDir = options.homeDir ?? os.homedir();
    const synapseDir = path.join(homeDir, '.synapse');

    this.skillsDir = options.skillsDir ?? path.join(synapseDir, 'skills');

    this.reader = new ConversationReader();
    this.generator = new SkillGenerator(this.skillsDir);
    this.loader = new SkillLoader(homeDir);
  }

  analyzeConversation(conversationPath: string, maxChars?: number): ConversationAnalysis {
    const turns = maxChars
      ? this.reader.readTruncated(conversationPath, maxChars)
      : this.reader.read(conversationPath);

    const summary = this.reader.summarize(turns);
    const toolSequence = this.reader.extractToolSequence(turns);

    return { summary, toolSequence, turns };
  }

  shouldEnhance(analysis: ConversationAnalysis): EnhanceDecision {
    const { summary, toolSequence } = analysis;

    const minToolCalls = getMinToolCalls();
    if (summary.toolCalls < minToolCalls) {
      return {
        shouldEnhance: false,
        reason: `Task too simple (${summary.toolCalls} tool calls, need ${minToolCalls}+)`,
        suggestedAction: 'none',
      };
    }

    const minUniqueTools = getMinUniqueTools();
    if (summary.uniqueTools.length < minUniqueTools) {
      return {
        shouldEnhance: false,
        reason: `Not enough tool variety (${summary.uniqueTools.length} unique, need ${minUniqueTools}+)`,
        suggestedAction: 'none',
      };
    }

    // 委托模式检测
    const hasPattern = detectPattern(toolSequence);

    // 委托技能匹配
    const existingSkill = findMatchingSkill(analysis, this.loader);

    if (existingSkill) {
      return {
        shouldEnhance: true,
        reason: 'Found potential improvements for existing skill',
        suggestedAction: 'enhance',
        existingSkill,
      };
    }

    if (hasPattern) {
      const suggestedName = suggestSkillName(analysis);
      return {
        shouldEnhance: true,
        reason: 'Detected reusable pattern in tool usage',
        suggestedAction: 'create',
        suggestedSkillName: suggestedName,
      };
    }

    return {
      shouldEnhance: false,
      reason: 'No significant patterns detected',
      suggestedAction: 'none',
    };
  }

  generateSkillSpec(analysis: ConversationAnalysis, name: string): SkillSpec {
    return buildSkillSpec(analysis, name);
  }

  enhance(analysis: ConversationAnalysis, decision: EnhanceDecision): EnhanceResult {
    if (!decision.shouldEnhance || decision.suggestedAction === 'none') {
      return { action: 'none', message: decision.reason };
    }

    if (decision.suggestedAction === 'create' && decision.suggestedSkillName) {
      return this.createNewSkill(analysis, decision.suggestedSkillName);
    }

    if (decision.suggestedAction === 'enhance' && decision.existingSkill) {
      return this.enhanceExistingSkill(analysis, decision.existingSkill);
    }

    return { action: 'none', message: 'No action taken' };
  }

  /** 通过 LLMProvider 增强已有技能 */
  async enhanceWithProvider(
    provider: LLMProvider,
    skill: SkillSpec,
  ): Promise<SkillSpec> {
    logger.info('Enhancing skill via LLMProvider', {
      provider: provider.name,
      skillName: skill.name,
    });

    const skillJson = JSON.stringify(skill, null, 2);
    const messages = [
      {
        role: 'user' as const,
        content: [{
          type: 'text' as const,
          text: `Here is the current skill specification:\n\n${skillJson}\n\nPlease enhance this skill with improved descriptions, more detailed execution steps, and better practices.`,
        }],
      },
    ];

    const stream = provider.generate({
      systemPrompt: SKILL_ENHANCE_SYSTEM_PROMPT,
      messages,
    });

    const response: LLMResponse = await stream.result;
    const textContent = response.content.find((c) => c.type === 'text');

    if (!textContent || textContent.type !== 'text') {
      throw new Error('LLM response did not contain text content');
    }

    // 委托 LLM 响应解析
    const enhancements = parseEnhancementsFromLLM(textContent.text);
    return {
      ...skill,
      description: enhancements.description ?? skill.description,
      executionSteps: enhancements.executionSteps ?? skill.executionSteps,
      bestPractices: enhancements.bestPractices ?? skill.bestPractices,
    };
  }

  /**
   * Create a new skill from analysis
   */
  private createNewSkill(analysis: ConversationAnalysis, skillName: string): EnhanceResult {
    const spec = this.generateSkillSpec(analysis, skillName);
    const result = this.generator.createSkill(spec);

    if (result.success) {
      return {
        action: 'created',
        skillName,
        message: `Created new skill: ${skillName}`,
        path: result.path,
      };
    }

    return { action: 'none', message: `Failed to create skill: ${result.error}` };
  }

  /**
   * Enhance an existing skill
   */
  private enhanceExistingSkill(analysis: ConversationAnalysis, skillName: string): EnhanceResult {
    const updates = generateUpdates(analysis);
    const result = this.generator.updateSkill(skillName, updates);

    if (result.success) {
      return {
        action: 'enhanced',
        skillName,
        message: `Enhanced skill: ${skillName}`,
        path: result.path,
      };
    }

    return { action: 'none', message: `Failed to enhance skill: ${result.error}` };
  }
}

// Default export
export default SkillEnhancer;
