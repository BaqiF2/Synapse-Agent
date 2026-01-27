/**
 * Auto Enhance Trigger
 *
 * Manages automatic skill enhancement triggering based on task completion.
 * Analyzes task context (tool usage, complexity, user clarifications) to
 * determine if the conversation should trigger skill creation or enhancement.
 *
 * @module auto-enhance-trigger
 *
 * Core Exports:
 * - AutoEnhanceTrigger: Main trigger class that evaluates task context
 * - TaskContext: Interface for task metadata used in enhancement decisions
 * - TriggerDecision: Result type containing trigger decision and reason
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

/**
 * Thresholds for triggering enhancement
 */
const MIN_TOOL_CALLS_THRESHOLD = parseInt(
  process.env.SYNAPSE_AUTO_ENHANCE_MIN_TOOLS || '5',
  10
);
const MIN_UNIQUE_TOOLS_THRESHOLD = parseInt(
  process.env.SYNAPSE_AUTO_ENHANCE_MIN_UNIQUE || '2',
  10
);

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
 * AutoEnhanceTrigger - Manages automatic skill enhancement
 *
 * Evaluates task completion context to determine if the conversation
 * should trigger skill creation or enhancement. Uses configurable
 * thresholds for tool calls, unique tools, and other complexity metrics.
 *
 * Usage:
 * ```typescript
 * const trigger = new AutoEnhanceTrigger();
 * trigger.enable();
 *
 * // After task completion
 * const decision = trigger.shouldTrigger(context);
 * if (decision.shouldTrigger) {
 *   const result = await trigger.triggerEnhancement(convPath, context);
 * }
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
   * Determine if enhancement should be triggered
   *
   * @param context - Task context
   * @returns Trigger decision
   */
  shouldTrigger(context: TaskContext): TriggerDecision {
    // Check if auto-enhance is enabled
    if (!this.isEnabled()) {
      return {
        shouldTrigger: false,
        reason: 'Auto-enhance is disabled',
        suggestedAction: 'none',
      };
    }

    // Check if skills were used and worked well
    if (context.skillsUsed.length > 0 && context.skillsWorkedWell) {
      return {
        shouldTrigger: false,
        reason: 'Task completed successfully with existing skills',
        suggestedAction: 'none',
      };
    }

    // Check if skills were used but had issues (potential enhancement)
    if (context.skillsUsed.length > 0 && !context.skillsWorkedWell) {
      if (context.userClarifications >= 2 || context.toolCallCount >= MIN_TOOL_CALLS_THRESHOLD) {
        return {
          shouldTrigger: true,
          reason: 'Skills were used but may need improvement',
          suggestedAction: 'enhance',
        };
      }
    }

    // Check complexity thresholds for new skill creation
    if (context.toolCallCount < MIN_TOOL_CALLS_THRESHOLD) {
      return {
        shouldTrigger: false,
        reason: `Task too simple (${context.toolCallCount} tool calls, need ${MIN_TOOL_CALLS_THRESHOLD}+)`,
        suggestedAction: 'none',
      };
    }

    if (context.uniqueTools.length < MIN_UNIQUE_TOOLS_THRESHOLD) {
      return {
        shouldTrigger: false,
        reason: `Not enough tool variety (${context.uniqueTools.length} unique tools)`,
        suggestedAction: 'none',
      };
    }

    // Check for script generation (indicates complex workflow)
    if (context.scriptsGenerated > 0) {
      return {
        shouldTrigger: true,
        reason: 'Scripts were generated, potential for reusable skill',
        suggestedAction: 'create',
      };
    }

    // Check for multiple user clarifications
    if (context.userClarifications >= 2) {
      return {
        shouldTrigger: true,
        reason: 'Multiple clarifications needed, workflow can be documented',
        suggestedAction: 'create',
      };
    }

    // Default: trigger based on complexity
    return {
      shouldTrigger: true,
      reason: 'Complex task with reusable patterns detected',
      suggestedAction: 'create',
    };
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
      // Get max tokens from settings
      const maxTokens = this.settings.getMaxEnhanceContextTokens();

      // Analyze conversation
      const analysis = this.enhancer.analyzeConversation(conversationPath, maxTokens);

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
      if (turn.toolCalls) {
        toolCallCount += turn.toolCalls.length;
        for (const call of turn.toolCalls) {
          toolSet.add(call.name);
        }
      }

      // Count clarification patterns
      if (turn.role === 'user' && turn.content) {
        const content = turn.content.toLowerCase();
        if (
          content.includes('clarif') ||
          content.includes('mean') ||
          content.includes('actually') ||
          content.includes('instead')
        ) {
          userClarifications++;
        }
      }

      // Count script generation
      if (turn.role === 'assistant' && turn.toolCalls) {
        for (const call of turn.toolCalls) {
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

// Default export
export default AutoEnhanceTrigger;
