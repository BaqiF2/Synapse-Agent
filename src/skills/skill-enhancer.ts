/**
 * Skill Enhancer
 *
 * Analyzes conversation history and generates or enhances skills.
 * 支持通过 LLMProvider 接口进行智能技能增强。
 *
 * @module skill-enhancer
 *
 * Core Exports:
 * - SkillEnhancer: Main skill enhancement class
 * - EnhanceDecision: Enhancement decision type
 * - ConversationAnalysis: Analysis result type
 */

import * as path from 'node:path';
import * as os from 'node:os';
import { createLogger } from '../utils/logger.ts';
import { parseEnvPositiveInt } from '../utils/env.ts';
import { ConversationReader, type ConversationTurn, type ConversationSummary } from './conversation-reader.ts';
import { SkillGenerator, type SkillSpec } from './skill-generator.ts';
import { SkillLoader } from './skill-loader.ts';
import type { LLMProvider, LLMResponse } from '../providers/types.ts';

const logger = createLogger('skill-enhancer');

const DEFAULT_MIN_TOOL_CALLS = 3;
const DEFAULT_MIN_UNIQUE_TOOLS = 2;

/**
 * 用于 LLM 增强技能的系统提示词
 */
const SKILL_ENHANCE_SYSTEM_PROMPT = `You are a skill enhancement assistant. Given an existing skill specification, improve it with better descriptions, more execution steps, and better practices.
Return the enhanced fields as JSON with these optional fields:
- description: improved description
- executionSteps: improved array of step strings
- bestPractices: improved array of best practice strings

Return ONLY valid JSON, no markdown code fences or extra text.`;

/**
 * Minimum tool calls to consider enhancement
 */
function getMinToolCalls(): number {
  return parseEnvPositiveInt(process.env.SYNAPSE_MIN_ENHANCE_TOOL_CALLS, DEFAULT_MIN_TOOL_CALLS);
}

/**
 * Minimum unique tools to consider enhancement
 */
function getMinUniqueTools(): number {
  return parseEnvPositiveInt(process.env.SYNAPSE_MIN_ENHANCE_UNIQUE_TOOLS, DEFAULT_MIN_UNIQUE_TOOLS);
}

/**
 * Conversation analysis result
 */
export interface ConversationAnalysis {
  summary: ConversationSummary;
  toolSequence: string[];
  turns: ConversationTurn[];
}

/**
 * Enhancement decision
 */
export interface EnhanceDecision {
  shouldEnhance: boolean;
  reason: string;
  suggestedAction: 'create' | 'enhance' | 'none';
  suggestedSkillName?: string;
  existingSkill?: string;
}

/**
 * Enhancement result
 */
export interface EnhanceResult {
  action: 'created' | 'enhanced' | 'none';
  skillName?: string;
  message: string;
  path?: string;
}

/**
 * Options for SkillEnhancer
 */
export interface SkillEnhancerOptions {
  skillsDir?: string;
  conversationsDir?: string;
  homeDir?: string;
}

/**
 * SkillEnhancer - Analyzes conversations and generates skills
 *
 * Usage:
 * ```typescript
 * const enhancer = new SkillEnhancer();
 * const analysis = enhancer.analyzeConversation('/path/to/session.jsonl');
 * const decision = enhancer.shouldEnhance(analysis);
 * if (decision.shouldEnhance) {
 *   const result = enhancer.enhance(analysis, decision);
 * }
 * ```
 */
export class SkillEnhancer {
  private reader: ConversationReader;
  private generator: SkillGenerator;
  private loader: SkillLoader;
  private skillsDir: string;

  /**
   * Creates a new SkillEnhancer
   *
   * @param options - Configuration options
   */
  constructor(options: SkillEnhancerOptions = {}) {
    const homeDir = options.homeDir ?? os.homedir();
    const synapseDir = path.join(homeDir, '.synapse');

    this.skillsDir = options.skillsDir ?? path.join(synapseDir, 'skills');

    this.reader = new ConversationReader();
    this.generator = new SkillGenerator(this.skillsDir);
    this.loader = new SkillLoader(homeDir);
  }

  /**
   * Analyze a conversation file
   *
   * @param conversationPath - Path to conversation JSONL file
   * @param maxChars - Maximum characters to analyze (optional, counted from end)
   * @returns Conversation analysis
   */
  analyzeConversation(conversationPath: string, maxChars?: number): ConversationAnalysis {
    const turns = maxChars
      ? this.reader.readTruncated(conversationPath, maxChars)
      : this.reader.read(conversationPath);

    const summary = this.reader.summarize(turns);
    const toolSequence = this.reader.extractToolSequence(turns);

    return {
      summary,
      toolSequence,
      turns,
    };
  }

  /**
   * Determine if conversation should trigger enhancement
   *
   * @param analysis - Conversation analysis
   * @returns Enhancement decision
   */
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

    // Look for patterns
    const hasPattern = this.detectPattern(toolSequence);

    // Check for existing skill match
    const existingSkill = this.findMatchingSkill(analysis);

    if (existingSkill) {
      return {
        shouldEnhance: true,
        reason: 'Found potential improvements for existing skill',
        suggestedAction: 'enhance',
        existingSkill,
      };
    }

    if (hasPattern) {
      const suggestedName = this.suggestSkillName(analysis);
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

  /**
   * Generate skill specification from analysis
   *
   * @param analysis - Conversation analysis
   * @param name - Skill name
   * @returns Skill specification
   */
  generateSkillSpec(analysis: ConversationAnalysis, name: string): SkillSpec {
    const { summary, toolSequence, turns } = analysis;

    // Extract user intent from first turn
    const firstUserTurn = turns.find(t => t.role === 'user');
    const intent = firstUserTurn?.content || 'Complete the task';

    // Generate description
    const description = `${intent}. Uses ${summary.uniqueTools.join(', ')} tools.`;

    // Generate quick start from tool sequence
    const quickStart = this.generateQuickStart(toolSequence);

    // Generate execution steps
    const executionSteps = this.generateExecutionSteps(turns);

    // Generate best practices
    const bestPractices = this.generateBestPractices(analysis);

    return {
      name,
      description,
      quickStart,
      executionSteps,
      bestPractices,
      examples: [],
      domain: 'general',
      version: '1.0.0',
    };
  }

  /**
   * Execute enhancement
   *
   * @param analysis - Conversation analysis
   * @param decision - Enhancement decision
   * @returns Enhancement result
   */
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

  /**
   * 通过 LLMProvider 增强已有技能
   *
   * @param provider - LLM Provider 实例
   * @param skill - 需要增强的技能规格
   * @returns 增强后的技能规格
   */
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

    const enhancements = this.parseEnhancementsFromLLM(textContent.text);

    // 合并增强结果到原始技能
    return {
      ...skill,
      description: enhancements.description ?? skill.description,
      executionSteps: enhancements.executionSteps ?? skill.executionSteps,
      bestPractices: enhancements.bestPractices ?? skill.bestPractices,
    };
  }

  /**
   * 从 LLM 响应文本中解析增强字段
   */
  private parseEnhancementsFromLLM(text: string): Partial<SkillSpec> {
    // 尝试提取 JSON（处理可能的 markdown code fences）
    let jsonStr = text.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenceMatch && fenceMatch[1]) {
      jsonStr = fenceMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);

    return {
      description: typeof parsed.description === 'string' ? parsed.description : undefined,
      executionSteps: Array.isArray(parsed.executionSteps) ? parsed.executionSteps : undefined,
      bestPractices: Array.isArray(parsed.bestPractices) ? parsed.bestPractices : undefined,
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
    const updates = this.generateUpdates(analysis);
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

  /**
   * Detect repeating patterns in tool sequence
   */
  private detectPattern(sequence: string[]): boolean {
    if (sequence.length < 4) return false;

    // Look for repeating subsequences
    for (let len = 2; len <= Math.floor(sequence.length / 2); len++) {
      const pattern = sequence.slice(0, len);
      let matches = 0;

      for (let i = len; i <= sequence.length - len; i += len) {
        const sub = sequence.slice(i, i + len);
        if (sub.every((v, j) => v === pattern[j])) {
          matches++;
        }
      }

      if (matches >= 1) return true;
    }

    return false;
  }

  /**
   * Find matching existing skill
   */
  private findMatchingSkill(analysis: ConversationAnalysis): string | null {
    const { summary } = analysis;

    try {
      // Search for skills that use similar tools
      const allSkills = this.loader.loadAllLevel1();

      for (const skill of allSkills) {
        // Check if skill tools overlap with used tools
        const skillTools = skill.tools.map(t => t.split(':').pop() || t);
        const overlap = summary.uniqueTools.filter(t => skillTools.includes(t));

        if (overlap.length >= Math.floor(summary.uniqueTools.length * 0.5)) {
          return skill.name;
        }
      }
    } catch (error) {
      // Skills directory may not exist yet
      logger.debug('Could not load existing skills', { error });
    }

    return null;
  }

  /**
   * Suggest skill name from analysis
   */
  private suggestSkillName(analysis: ConversationAnalysis): string {
    const { turns } = analysis;

    // Extract keywords from user turns
    const userContent = turns
      .filter(t => t.role === 'user')
      .map(t => t.content)
      .join(' ')
      .toLowerCase();

    // Simple keyword extraction
    const words = userContent.split(/\s+/).filter(w => w.length > 3);
    const wordFreq = new Map<string, number>();

    for (const word of words) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }

    // Get top words
    const sorted = Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([word]) => word);

    if (sorted.length === 0) return `task-${Date.now()}`;
    if (sorted.length === 1) return `${sorted[0]}-task`;
    return `${sorted[0]}-${sorted[1]}`;
  }

  /**
   * Generate quick start section
   */
  private generateQuickStart(toolSequence: string[]): string {
    const uniqueTools = [...new Set(toolSequence)];
    const lines = ['```bash'];

    for (const tool of uniqueTools.slice(0, 5)) {
      lines.push(`${tool} <args>`);
    }

    lines.push('```');
    return lines.join('\n');
  }

  /**
   * Generate execution steps from turns
   */
  private generateExecutionSteps(turns: ConversationTurn[]): string[] {
    const steps: string[] = [];

    for (const turn of turns) {
      if (turn.role === 'assistant' && turn.toolCalls) {
        for (const call of turn.toolCalls) {
          steps.push(`Use ${call.name} to process data`);
        }
      }
    }

    return [...new Set(steps)].slice(0, 10);
  }

  /**
   * Generate best practices from analysis
   */
  private generateBestPractices(analysis: ConversationAnalysis): string[] {
    const practices: string[] = [];

    if (analysis.summary.toolCalls > 5) {
      practices.push('Break complex tasks into smaller steps');
    }

    if (analysis.summary.uniqueTools.length > 3) {
      practices.push('Verify intermediate results before proceeding');
    }

    return practices;
  }

  /**
   * Generate updates for existing skill
   */
  private generateUpdates(analysis: ConversationAnalysis): Partial<SkillSpec> {
    return {
      executionSteps: this.generateExecutionSteps(analysis.turns),
      bestPractices: this.generateBestPractices(analysis),
    };
  }
}

// Default export
export default SkillEnhancer;
