/**
 * Skill Validator - 技能验证层
 *
 * 对生成的技能规格进行结构验证和语义验证，确保质量达标。
 * 支持同步结构验证和异步语义验证（通过 LLMProvider）。
 *
 * @module skill-validator
 *
 * Core Exports:
 * - SkillValidator: 技能验证器类
 * - ValidationResult: 验证结果类型
 * - ValidationIssue: 验证问题条目类型
 * - ValidationSeverity: 严重程度枚举
 */

import { createLogger } from '../utils/logger.ts';
import { SKILL_DOMAINS, type SkillDomain } from './skill-schema.ts';
import type { SkillSpec } from './skill-generator.ts';
import type { LLMProvider, LLMResponse } from '../providers/types.ts';

const logger = createLogger('skill-validator');

/** 名称的 kebab-case 正则 */
const KEBAB_CASE_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
/** 描述最短长度 */
const MIN_DESCRIPTION_LENGTH = 10;
/** 描述最大长度 */
const MAX_DESCRIPTION_LENGTH = 500;
/** 名称最大长度 */
const MAX_NAME_LENGTH = 50;
/** 执行步骤建议最小数量 */
const MIN_EXECUTION_STEPS = 1;
/** 语义验证的系统提示词 */
const SEMANTIC_VALIDATION_PROMPT = `You are a skill quality reviewer. Analyze the given skill specification and identify quality issues.
Return a JSON array of issues, each with:
- field: the problematic field name
- message: description of the issue
- severity: "error" | "warning" | "info"

Focus on:
1. Description clarity and completeness
2. Execution steps logical coherence
3. Best practices relevance
4. Overall skill usefulness

Return ONLY valid JSON array, no markdown code fences or extra text. Return [] if no issues found.`;

/** 验证严重程度 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/** 单个验证问题 */
export interface ValidationIssue {
  field: string;
  message: string;
  severity: ValidationSeverity;
}

/** 验证结果 */
export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

/**
 * SkillValidator - 技能结构/语义验证器
 *
 * 使用方式：
 * ```typescript
 * const validator = new SkillValidator();
 * const structResult = validator.validateStructure(spec);
 * const semanticResult = await validator.validateSemantics(spec, provider);
 * ```
 */
export class SkillValidator {
  /**
   * 结构验证 — 同步，检查必填字段、格式、长度等
   */
  validateStructure(spec: SkillSpec): ValidationResult {
    const issues: ValidationIssue[] = [];

    // 名称验证
    if (!spec.name) {
      issues.push({ field: 'name', message: 'Name is required', severity: 'error' });
    } else {
      if (!KEBAB_CASE_PATTERN.test(spec.name)) {
        issues.push({
          field: 'name',
          message: 'Name must be kebab-case (e.g., "my-skill")',
          severity: 'error',
        });
      }
      if (spec.name.length > MAX_NAME_LENGTH) {
        issues.push({
          field: 'name',
          message: `Name must be ${MAX_NAME_LENGTH} characters or less`,
          severity: 'error',
        });
      }
    }

    // 描述验证
    if (!spec.description) {
      issues.push({ field: 'description', message: 'Description is required', severity: 'error' });
    } else {
      if (spec.description.length < MIN_DESCRIPTION_LENGTH) {
        issues.push({
          field: 'description',
          message: `Description too short (min ${MIN_DESCRIPTION_LENGTH} characters)`,
          severity: 'warning',
        });
      }
      if (spec.description.length > MAX_DESCRIPTION_LENGTH) {
        issues.push({
          field: 'description',
          message: `Description too long (max ${MAX_DESCRIPTION_LENGTH} characters)`,
          severity: 'warning',
        });
      }
    }

    // 执行步骤验证
    if (!spec.executionSteps || spec.executionSteps.length < MIN_EXECUTION_STEPS) {
      issues.push({
        field: 'executionSteps',
        message: `At least ${MIN_EXECUTION_STEPS} execution step is recommended`,
        severity: 'warning',
      });
    }

    // 域验证
    if (spec.domain && !SKILL_DOMAINS.includes(spec.domain as SkillDomain)) {
      issues.push({
        field: 'domain',
        message: `Invalid domain "${spec.domain}". Valid: ${SKILL_DOMAINS.join(', ')}`,
        severity: 'error',
      });
    }

    // 版本格式验证
    if (spec.version && !/^\d+\.\d+\.\d+$/.test(spec.version)) {
      issues.push({
        field: 'version',
        message: 'Version should follow semver format (e.g., "1.0.0")',
        severity: 'warning',
      });
    }

    // 标签验证
    if (spec.tags) {
      for (const tag of spec.tags) {
        if (tag.includes(' ')) {
          issues.push({
            field: 'tags',
            message: `Tag "${tag}" should not contain spaces`,
            severity: 'warning',
          });
        }
      }
    }

    // 空执行步骤内容检测
    if (spec.executionSteps) {
      const emptySteps = spec.executionSteps.filter(s => !s.trim());
      if (emptySteps.length > 0) {
        issues.push({
          field: 'executionSteps',
          message: `${emptySteps.length} execution step(s) are empty`,
          severity: 'warning',
        });
      }
    }

    const hasErrors = issues.some(i => i.severity === 'error');
    return { valid: !hasErrors, issues };
  }

  /**
   * 语义验证 — 异步，通过 LLM 检查描述清晰度、逻辑一致性等
   */
  async validateSemantics(
    spec: SkillSpec,
    provider: LLMProvider,
  ): Promise<ValidationResult> {
    logger.info('Running semantic validation via LLMProvider', {
      provider: provider.name,
      skillName: spec.name,
    });

    const specJson = JSON.stringify(spec, null, 2);
    const messages = [
      {
        role: 'user' as const,
        content: [{
          type: 'text' as const,
          text: `Please review this skill specification for quality issues:\n\n${specJson}`,
        }],
      },
    ];

    try {
      const stream = provider.generate({
        systemPrompt: SEMANTIC_VALIDATION_PROMPT,
        messages,
      });

      const response: LLMResponse = await stream.result;
      const textContent = response.content.find(c => c.type === 'text');

      if (!textContent || textContent.type !== 'text') {
        logger.warn('Semantic validation: no text response from LLM');
        return { valid: true, issues: [] };
      }

      const issues = this.parseLLMValidationResponse(textContent.text);
      const hasErrors = issues.some(i => i.severity === 'error');
      return { valid: !hasErrors, issues };
    } catch (error) {
      logger.error('Semantic validation failed', { error });
      // 语义验证失败不阻塞流程
      return { valid: true, issues: [] };
    }
  }

  /**
   * 综合验证 — 先结构验证，通过后进行语义验证
   */
  async validate(
    spec: SkillSpec,
    provider?: LLMProvider,
  ): Promise<ValidationResult> {
    const structResult = this.validateStructure(spec);

    // 结构验证有 error 则直接返回
    if (!structResult.valid) {
      return structResult;
    }

    // 如果有 provider，进行语义验证
    if (provider) {
      const semanticResult = await this.validateSemantics(spec, provider);
      return {
        valid: structResult.valid && semanticResult.valid,
        issues: [...structResult.issues, ...semanticResult.issues],
      };
    }

    return structResult;
  }

  /** 解析 LLM 验证响应 */
  private parseLLMValidationResponse(text: string): ValidationIssue[] {
    try {
      let jsonStr = text.trim();
      const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (fenceMatch && fenceMatch[1]) {
        jsonStr = fenceMatch[1].trim();
      }

      const parsed = JSON.parse(jsonStr);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .filter((item: unknown) =>
          item && typeof item === 'object' &&
          'field' in (item as Record<string, unknown>) &&
          'message' in (item as Record<string, unknown>)
        )
        .map((item: Record<string, unknown>) => ({
          field: String(item.field),
          message: String(item.message),
          severity: (['error', 'warning', 'info'].includes(String(item.severity))
            ? String(item.severity) as ValidationSeverity
            : 'warning'),
        }));
    } catch {
      logger.debug('Failed to parse LLM validation response');
      return [];
    }
  }
}
