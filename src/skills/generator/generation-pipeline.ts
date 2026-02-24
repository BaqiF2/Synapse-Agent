/**
 * Skill Generation Pipeline - 带验证的技能生成流水线
 *
 * 将 SkillGenerator + SkillValidator 组合为带自动修复反馈循环的流水线：
 * 生成 → 验证 → 如果失败则修复 → 再验证（最多 N 轮）。
 *
 * @module generation-pipeline
 *
 * Core Exports:
 * - SkillGenerationPipeline: 带验证反馈循环的技能生成器
 * - PipelineResult: 流水线执行结果类型
 * - PipelineOptions: 流水线配置选项类型
 */

import { createLogger } from '../../shared/file-logger.ts';
import { parseEnvPositiveInt } from '../../shared/env.ts';
import type { SkillSpec, ConversationMessage } from '../types.ts';
import type { SkillGenerator } from './skill-generator.ts';
import { SkillValidator, type ValidationResult, type ValidationIssue } from './skill-validator.ts';
import type { LLMProvider, LLMResponse } from '../../types/provider.ts';

const logger = createLogger('skill-generation-pipeline');

/** 最大自动修复轮次（默认 2） */
const DEFAULT_MAX_FIX_ROUNDS = 2;
const MAX_FIX_ROUNDS = parseEnvPositiveInt(
  process.env.SYNAPSE_SKILL_MAX_FIX_ROUNDS,
  DEFAULT_MAX_FIX_ROUNDS,
);

/** 用于修复技能的 LLM 系统提示词 */
const SKILL_FIX_SYSTEM_PROMPT = `You are a skill specification fixer. Given a skill specification and a list of validation issues, fix the specification to address ALL issues.
Return the COMPLETE fixed skill specification as JSON with ALL original fields preserved.
Only modify the fields that have issues. Keep all other fields unchanged.
Return ONLY valid JSON, no markdown code fences or extra text.`;

/** 流水线执行结果 */
export interface PipelineResult {
  /** 最终的技能规格（可能已修复） */
  spec: SkillSpec;
  /** 最终验证结果 */
  validation: ValidationResult;
  /** 修复轮次数（0 = 一次通过） */
  fixRounds: number;
  /** 是否最终通过验证 */
  passed: boolean;
  /** 各轮次的统计信息 */
  stats: PipelineStats;
}

/** 流水线统计 */
export interface PipelineStats {
  totalIssuesFound: number;
  totalIssuesFixed: number;
  errorCount: number;
  warningCount: number;
}

/** 流水线配置 */
export interface PipelineOptions {
  /** 最大修复轮次 */
  maxFixRounds?: number;
  /** 是否执行语义验证（需要 LLMProvider） */
  enableSemanticValidation?: boolean;
}

/**
 * SkillGenerationPipeline - 带验证反馈循环的技能生成器
 */
export class SkillGenerationPipeline {
  private generator: SkillGenerator;
  private validator: SkillValidator;
  private maxFixRounds: number;

  constructor(
    generator: SkillGenerator,
    options: PipelineOptions = {},
  ) {
    this.generator = generator;
    this.validator = new SkillValidator();
    this.maxFixRounds = options.maxFixRounds ?? MAX_FIX_ROUNDS;
  }

  /**
   * 从对话历史生成技能并通过验证
   */
  async generateWithValidation(
    provider: LLMProvider,
    conversationHistory: ConversationMessage[],
    options?: PipelineOptions,
  ): Promise<PipelineResult> {
    const maxRounds = options?.maxFixRounds ?? this.maxFixRounds;
    const enableSemantic = options?.enableSemanticValidation ?? false;

    logger.info('Pipeline: generating initial skill spec');
    let spec = await this.generator.generateFromConversation(provider, conversationHistory);

    return this.validateAndFix(spec, provider, maxRounds, enableSemantic);
  }

  /**
   * 对已有 SkillSpec 执行验证和修复流水线
   */
  async validateAndFix(
    spec: SkillSpec,
    provider: LLMProvider,
    maxRounds: number = this.maxFixRounds,
    enableSemantic: boolean = false,
  ): Promise<PipelineResult> {
    let currentSpec = spec;
    let fixRounds = 0;
    let totalIssuesFound = 0;
    let totalIssuesFixed = 0;

    for (let round = 0; round <= maxRounds; round++) {
      const validation = enableSemantic
        ? await this.validator.validate(currentSpec, provider)
        : this.validator.validateStructure(currentSpec);

      const errors = validation.issues.filter(i => i.severity === 'error');
      totalIssuesFound += validation.issues.length;

      if (validation.valid) {
        logger.info('Pipeline: validation passed', { round, issues: validation.issues.length });
        return this.buildResult(currentSpec, validation, fixRounds, true, totalIssuesFound, totalIssuesFixed);
      }

      if (round === maxRounds) {
        logger.warn('Pipeline: max fix rounds reached', { round, errors: errors.length });
        return this.buildResult(currentSpec, validation, fixRounds, false, totalIssuesFound, totalIssuesFixed);
      }

      logger.info('Pipeline: attempting fix', { round: round + 1, errors: errors.length });
      const previousIssueCount = errors.length;
      currentSpec = await this.fixSpec(currentSpec, validation.issues, provider);
      fixRounds++;

      const afterValidation = this.validator.validateStructure(currentSpec);
      const afterErrors = afterValidation.issues.filter(i => i.severity === 'error');
      totalIssuesFixed += Math.max(0, previousIssueCount - afterErrors.length);
    }

    // 不应到达这里，但防御性返回
    const finalValidation = this.validator.validateStructure(currentSpec);
    return this.buildResult(currentSpec, finalValidation, fixRounds, finalValidation.valid, totalIssuesFound, totalIssuesFixed);
  }

  /** 通过 LLM 修复存在问题的 SkillSpec */
  private async fixSpec(
    spec: SkillSpec,
    issues: ValidationIssue[],
    provider: LLMProvider,
  ): Promise<SkillSpec> {
    const specJson = JSON.stringify(spec, null, 2);
    const issuesText = issues
      .map(i => `[${i.severity}] ${i.field}: ${i.message}`)
      .join('\n');

    const messages = [
      {
        role: 'user' as const,
        content: [{
          type: 'text' as const,
          text: `Current skill specification:\n\n${specJson}\n\nValidation issues to fix:\n${issuesText}\n\nPlease return the fixed specification as complete JSON.`,
        }],
      },
    ];

    try {
      const stream = provider.generate({
        systemPrompt: SKILL_FIX_SYSTEM_PROMPT,
        messages,
      });

      const response: LLMResponse = await stream.result;
      const textContent = response.content.find(c => c.type === 'text');

      if (!textContent || textContent.type !== 'text') {
        logger.warn('Fix attempt: no text response from LLM');
        return spec;
      }

      return this.parseFixedSpec(textContent.text, spec);
    } catch (error) {
      logger.error('Fix attempt failed', { error });
      return spec;
    }
  }

  /** 解析 LLM 修复后的 SkillSpec */
  private parseFixedSpec(text: string, fallback: SkillSpec): SkillSpec {
    try {
      let jsonStr = text.trim();
      const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (fenceMatch && fenceMatch[1]) {
        jsonStr = fenceMatch[1].trim();
      }

      const parsed = JSON.parse(jsonStr);

      return {
        name: typeof parsed.name === 'string' ? parsed.name : fallback.name,
        description: typeof parsed.description === 'string' ? parsed.description : fallback.description,
        quickStart: typeof parsed.quickStart === 'string' ? parsed.quickStart : fallback.quickStart,
        executionSteps: Array.isArray(parsed.executionSteps) ? parsed.executionSteps : fallback.executionSteps,
        bestPractices: Array.isArray(parsed.bestPractices) ? parsed.bestPractices : fallback.bestPractices,
        examples: Array.isArray(parsed.examples) ? parsed.examples : fallback.examples,
        domain: parsed.domain || fallback.domain,
        version: parsed.version || fallback.version,
        author: parsed.author || fallback.author,
        tags: Array.isArray(parsed.tags) ? parsed.tags : fallback.tags,
        scripts: fallback.scripts,
      };
    } catch {
      logger.debug('Failed to parse fixed spec from LLM');
      return fallback;
    }
  }

  /** 构建流水线结果 */
  private buildResult(
    spec: SkillSpec,
    validation: ValidationResult,
    fixRounds: number,
    passed: boolean,
    totalIssuesFound: number,
    totalIssuesFixed: number,
  ): PipelineResult {
    const errorCount = validation.issues.filter(i => i.severity === 'error').length;
    const warningCount = validation.issues.filter(i => i.severity === 'warning').length;

    return {
      spec,
      validation,
      fixRounds,
      passed,
      stats: { totalIssuesFound, totalIssuesFixed, errorCount, warningCount },
    };
  }
}
