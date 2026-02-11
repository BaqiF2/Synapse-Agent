/**
 * 文件功能说明：
 * - 该文件位于 `src/agent/auto-enhance-trigger.ts`，主要负责 自动、增强、触发 相关实现。
 * - 模块归属 Agent 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `AutoEnhanceTrigger`
 * - `TaskContext`
 * - `TriggerDecision`
 * - `AutoEnhanceTriggerOptions`
 *
 * 作用说明：
 * - `AutoEnhanceTrigger`：封装该领域的核心流程与状态管理。
 * - `TaskContext`：定义模块交互的数据结构契约。
 * - `TriggerDecision`：定义模块交互的数据结构契约。
 * - `AutoEnhanceTriggerOptions`：定义模块交互的数据结构契约。
 */

import * as path from 'node:path';
import * as os from 'node:os';
import { createLogger } from '../utils/logger.ts';
import { SettingsManager } from '../config/settings-manager.ts';
import { SkillEnhancer, type EnhanceResult } from '../skills/skill-enhancer.ts';

const logger = createLogger('auto-enhance-trigger');

/**
 * Default Synapse directory
 */
const DEFAULT_SYNAPSE_DIR = path.join(os.homedir(), '.synapse');

const DEFAULT_MIN_UNIQUE_TOOLS_THRESHOLD = 2;
const CLARIFICATION_KEYWORDS = ['clarif', 'mean', 'actually', 'instead'];

/**
 * 方法说明：解析输入并生成 parseThreshold 对应结构。
 * @param value 输入参数。
 * @param fallback 输入参数。
 */
function parseThreshold(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

/**
 * Thresholds for triggering enhancement
 */
function getMinUniqueToolsThreshold(): number {
  return parseThreshold(process.env.SYNAPSE_MIN_ENHANCE_UNIQUE_TOOLS, DEFAULT_MIN_UNIQUE_TOOLS_THRESHOLD);
}

/**
 * Task context for enhancement decision
 */
export interface TaskContext {
  /** Total tool calls in the task */
  toolCallCount: number;
  /** Unique tools used */
  uniqueTools: string[];
  /** Number of user clarification messages */
  userClarifications: number;
  /** Skills that were loaded and used */
  skillsUsed: string[];
  /** Whether skills worked well (no issues) */
  skillsWorkedWell?: boolean;
  /** Number of scripts generated during task */
  scriptsGenerated: number;
}

/**
 * Trigger decision result
 */
export interface TriggerDecision {
  shouldTrigger: boolean;
  reason: string;
  suggestedAction?: 'create' | 'enhance' | 'none';
}

/**
 * Options for AutoEnhanceTrigger
 */
export interface AutoEnhanceTriggerOptions {
  synapseDir?: string;
}

/**
 * AutoEnhanceTrigger - Settings manager for skill auto-enhancement
 *
 * This class manages the auto-enhance feature settings. The actual
 * enhancement logic is handled by the Agent calling `skill enhance`
 * command when it identifies valuable patterns.
 *
 * Usage:
 * ```typescript
 * const trigger = new AutoEnhanceTrigger();
 * trigger.enable();
 * console.log(trigger.isEnabled()); // true
 * ```
 */
export class AutoEnhanceTrigger {
  private settings: SettingsManager;
  private enhancer: SkillEnhancer;
  private synapseDir: string;

  /**
   * Creates a new AutoEnhanceTrigger
   *
   * @param options - Configuration options
   */
  constructor(options: AutoEnhanceTriggerOptions = {}) {
    this.synapseDir = options.synapseDir ?? DEFAULT_SYNAPSE_DIR;
    this.settings = new SettingsManager(this.synapseDir);
    this.enhancer = new SkillEnhancer({
      skillsDir: path.join(this.synapseDir, 'skills'),
      conversationsDir: path.join(this.synapseDir, 'conversations'),
    });
  }

  /**
   * Check if auto-enhance is enabled
   */
  isEnabled(): boolean {
    return this.settings.isAutoEnhanceEnabled();
  }

  /**
   * Enable auto-enhance
   */
  enable(): void {
    this.settings.setAutoEnhance(true);
    logger.info('Auto-enhance enabled');
  }

  /**
   * Disable auto-enhance
   */
  disable(): void {
    this.settings.setAutoEnhance(false);
    logger.info('Auto-enhance disabled');
  }

  /**
   * Create a trigger decision result
   * @param shouldTrigger 输入参数。
   * @param reason 输入参数。
   * @param suggestedAction 输入参数。
   */
  private createDecision(
    shouldTrigger: boolean,
    reason: string,
    suggestedAction: 'create' | 'enhance' | 'none' = 'none'
  ): TriggerDecision {
    return { shouldTrigger, reason, suggestedAction };
  }

  /**
   * Determine if enhancement should be triggered
   *
   * @param context - Task context
   * @returns Trigger decision
   */
  shouldTrigger(context: TaskContext): TriggerDecision {
    if (!this.isEnabled()) {
      return this.createDecision(false, 'Auto-enhance is disabled');
    }

    const hasSkillsUsed = context.skillsUsed.length > 0;
    const uniqueToolCount = context.uniqueTools.length;
    const minUniqueTools = getMinUniqueToolsThreshold();
    const hasMultipleClarifications = context.userClarifications >= 2;
    const hasEnoughToolVariety = uniqueToolCount >= minUniqueTools;
    const meetsComplexityThreshold = hasMultipleClarifications || hasEnoughToolVariety;

    // Skills worked well - no enhancement needed
    if (hasSkillsUsed && context.skillsWorkedWell) {
      return this.createDecision(false, 'Task completed successfully with existing skills');
    }

    // Skills had issues - consider enhancement
    if (hasSkillsUsed && meetsComplexityThreshold) {
      return this.createDecision(true, 'Skills were used but may need improvement', 'enhance');
    }

    // Check complexity thresholds for new skill creation
    if (!hasEnoughToolVariety) {
      return this.createDecision(
        false,
        `Not enough tool variety (${uniqueToolCount} unique tools)`
      );
    }

    // Script generation or multiple clarifications indicate skill-worthy patterns
    if (context.scriptsGenerated > 0) {
      return this.createDecision(true, 'Scripts were generated, potential for reusable skill', 'create');
    }

    if (hasMultipleClarifications) {
      return this.createDecision(true, 'Multiple clarifications needed, workflow can be documented', 'create');
    }

    return this.createDecision(true, 'Complex task with reusable patterns detected', 'create');
  }

  /**
   * Trigger enhancement process
   *
   * @param conversationPath - Path to conversation file
   * @param context - Task context
   * @returns Enhancement result
   */
  async triggerEnhancement(
    conversationPath: string,
    context: TaskContext
  ): Promise<EnhanceResult> {
    logger.info('Triggering enhancement', { conversationPath });

    try {
      // Get max characters from settings
      const maxChars = this.settings.getMaxEnhanceContextChars();

      // Analyze conversation
      const analysis = this.enhancer.analyzeConversation(conversationPath, maxChars);

      // Get enhancement decision
      const decision = this.enhancer.shouldEnhance(analysis);

      // Override decision based on context
      if (context.skillsUsed.length > 0 && !context.skillsWorkedWell) {
        decision.suggestedAction = 'enhance';
        decision.existingSkill = context.skillsUsed[0];
      }

      // Execute enhancement
      const result = this.enhancer.enhance(analysis, decision);

      logger.info('Enhancement completed', { result });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Enhancement failed', { error });
      return {
        action: 'none',
        message: `Enhancement failed: ${message}`,
      };
    }
  }

  /**
   * Build task context from conversation turns
   *
   * @param turns - Conversation turns
   * @param skillsUsed - Skills that were used
   * @returns Task context
   */
  static buildContext(
    turns: Array<{
      role: string;
      toolCalls?: Array<{ name: string }>;
      content?: string;
    }>,
    skillsUsed: string[] = []
  ): TaskContext {
    let toolCallCount = 0;
    const toolSet = new Set<string>();
    let userClarifications = 0;
    let scriptsGenerated = 0;

    for (const turn of turns) {
      const toolCalls = turn.toolCalls ?? [];
      if (toolCalls.length > 0) {
        toolCallCount += toolCalls.length;
        for (const call of toolCalls) {
          toolSet.add(call.name);
        }
      }

      // Count clarification patterns
      if (turn.role === 'user' && turn.content) {
        const content = turn.content.toLowerCase();
        if (CLARIFICATION_KEYWORDS.some((keyword) => content.includes(keyword))) {
          userClarifications++;
        }
      }

      // Count script generation
      if (turn.role === 'assistant' && toolCalls.length > 0) {
        for (const call of toolCalls) {
          if (call.name === 'write' || call.name === 'edit') {
            scriptsGenerated++;
          }
        }
      }
    }

    return {
      toolCallCount,
      uniqueTools: Array.from(toolSet),
      userClarifications,
      skillsUsed,
      scriptsGenerated,
    };
  }
}
