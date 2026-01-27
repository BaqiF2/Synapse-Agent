/**
 * Skill Enhancer
 *
 * Analyzes conversation history and generates or enhances skills.
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
import { ConversationReader, type ConversationTurn, type ConversationSummary } from './conversation-reader.ts';
import { SkillGenerator, type SkillSpec } from './skill-generator.ts';
import { SkillLoader } from './skill-loader.ts';

const logger = createLogger('skill-enhancer');

/**
 * Minimum tool calls to consider enhancement
 */
const MIN_TOOL_CALLS = parseInt(process.env.SYNAPSE_MIN_ENHANCE_TOOL_CALLS || '3', 10);

/**
 * Minimum unique tools to consider enhancement
 */
const MIN_UNIQUE_TOOLS = parseInt(process.env.SYNAPSE_MIN_ENHANCE_UNIQUE_TOOLS || '2', 10);

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
   * @param maxTokens - Maximum tokens to analyze (optional)
   * @returns Conversation analysis
   */
  analyzeConversation(conversationPath: string, maxTokens?: number): ConversationAnalysis {
    const turns = maxTokens
      ? this.reader.readTruncated(conversationPath, maxTokens)
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

    // Check minimum complexity thresholds
    if (summary.toolCalls < MIN_TOOL_CALLS) {
      return {
        shouldEnhance: false,
        reason: `Task too simple (${summary.toolCalls} tool calls, need ${MIN_TOOL_CALLS}+)`,
        suggestedAction: 'none',
      };
    }

    if (summary.uniqueTools.length < MIN_UNIQUE_TOOLS) {
      return {
        shouldEnhance: false,
        reason: `Not enough tool variety (${summary.uniqueTools.length} unique, need ${MIN_UNIQUE_TOOLS}+)`,
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
    const updates = this.generateUpdates(analysis, skillName);
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

    if (sorted.length >= 2) {
      return `${sorted[0]}-${sorted[1]}`;
    } else if (sorted.length === 1) {
      return `${sorted[0]}-task`;
    }

    return `task-${Date.now()}`;
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
  private generateUpdates(analysis: ConversationAnalysis, _skillName: string): Partial<SkillSpec> {
    return {
      executionSteps: this.generateExecutionSteps(analysis.turns),
      bestPractices: this.generateBestPractices(analysis),
    };
  }
}

// Default export
export default SkillEnhancer;
