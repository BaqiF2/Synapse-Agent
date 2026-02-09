/**
 * Skill Enhance 结果解析器
 *
 * 功能：解析和标准化 skill sub-agent 返回的结果文本，
 *       支持纯文本 [Skill] 标记格式和 JSON 格式两种解析方式。
 *
 * 核心导出：
 * - normalizeSkillEnhanceResult: 标准化 skill 增强结果为统一格式
 * - parseSkillResultJson: 解析 JSON 格式的 skill 结果
 * - formatParsedSkillResult: 将解析后的结果格式化为标准文本
 * - buildRetryPrompt: 构建重试 prompt（附加输出契约和首次失败上下文）
 * - SKILL_RESULT_FALLBACK: 兜底结果常量
 * - RETRY_OUTPUT_CONTRACT: 重试时附加的输出格式要求
 * - ParsedSkillResult: 解析后的 skill 结果接口
 * - SkillExecutionResult: 执行结果接口（包含 raw 和 normalized）
 */

// ===== 常量 =====

export const SKILL_RESULT_FALLBACK = '[Skill] No enhancement needed\nReason: invalid sub-agent output format';
const SKILL_MARKER_PATTERN = /\[Skill\][\s\S]*$/m;
const SKILL_HEADER_PATTERN = /^\[Skill\]\s*(Created:|Enhanced:|No enhancement needed\b)/i;
const JSON_FENCE_PATTERN = /```(?:json)?\s*([\s\S]*?)```/i;

export const RETRY_OUTPUT_CONTRACT = `
[Output Contract]
Return ONLY one final skill-enhancement result. Do not output preamble, analysis plan, or "I will analyze..." text.
Allowed outputs:
1) [Skill] Created: <skill-name>
2) [Skill] Enhanced: <skill-name>
3) [Skill] No enhancement needed
You may add one short reason line after the result.

Example of CORRECT output:
[Skill] No enhancement needed
Reason: The conversation involved a simple one-step file read with no reusable pattern.

Example of INCORRECT output (DO NOT produce this):
我来分析这个对话，看看是否需要创建或增强技能。
`.trim();

// ===== 类型 =====

export interface ParsedSkillResult {
  action: 'create' | 'enhance' | 'skip';
  skillName?: string;
  reason?: string;
}

export interface SkillExecutionResult {
  raw: string;
  normalized: string | null;
}

// ===== 内部工具函数 =====

function sanitizeReason(reason: string | undefined): string | undefined {
  if (!reason) {
    return;
  }
  const normalized = reason.trim().replace(/\s+/g, ' ');
  return normalized || undefined;
}

// ===== 导出函数 =====

/**
 * 解析 JSON 格式的 skill 结果
 *
 * 支持纯 JSON 和 ```json 围栏格式
 */
export function parseSkillResultJson(raw: string): ParsedSkillResult | null {
  const text = raw.trim();
  if (!text) {
    return null;
  }

  const candidates = [text];
  const fencedJson = text.match(JSON_FENCE_PATTERN)?.[1];
  if (fencedJson) {
    candidates.unshift(fencedJson.trim());
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const action = typeof parsed.action === 'string' ? parsed.action.toLowerCase() : '';
      if (action !== 'create' && action !== 'enhance' && action !== 'skip') {
        continue;
      }

      const skillName = typeof parsed.skill_name === 'string' ? parsed.skill_name.trim() : undefined;
      const reason = typeof parsed.reason === 'string' ? sanitizeReason(parsed.reason) : undefined;
      return { action, skillName, reason };
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * 将解析后的结果格式化为标准 [Skill] 文本
 */
export function formatParsedSkillResult(parsed: ParsedSkillResult): string {
  const reasonSuffix = parsed.reason ? `\nReason: ${parsed.reason}` : '';
  if (parsed.action === 'create') {
    const skillName = parsed.skillName || 'unknown-skill';
    return `[Skill] Created: ${skillName}${reasonSuffix}`;
  }
  if (parsed.action === 'enhance') {
    const skillName = parsed.skillName || 'unknown-skill';
    return `[Skill] Enhanced: ${skillName}${reasonSuffix}`;
  }
  return `[Skill] No enhancement needed${reasonSuffix}`;
}

/**
 * 标准化 skill 增强结果
 *
 * 优先匹配 [Skill] 标记格式，其次尝试 JSON 解析
 *
 * @returns 标准化后的结果字符串，无法解析时返回 null
 */
export function normalizeSkillEnhanceResult(rawResult: string): string | null {
  const trimmed = rawResult.trim();
  if (!trimmed) {
    return null;
  }

  // 优先匹配 [Skill] 标记格式
  const skillMarkerMatch = trimmed.match(SKILL_MARKER_PATTERN);
  if (skillMarkerMatch?.[0]) {
    const candidate = skillMarkerMatch[0].trimStart();
    const firstLine = candidate.split('\n')[0] ?? '';
    if (SKILL_HEADER_PATTERN.test(firstLine)) {
      return candidate;
    }
  }

  // 尝试 JSON 格式解析
  const parsed = parseSkillResultJson(trimmed);
  if (parsed) {
    return formatParsedSkillResult(parsed);
  }

  return null;
}

/**
 * 首次失败输出的最大截断长度
 */
const MAX_PREVIOUS_OUTPUT_LENGTH = 500;

/**
 * 构建重试 prompt，附加输出格式契约和首次失败上下文
 */
export function buildRetryPrompt(prompt: string, previousOutput: string): string {
  const truncated = previousOutput.length > MAX_PREVIOUS_OUTPUT_LENGTH
    ? previousOutput.slice(0, MAX_PREVIOUS_OUTPUT_LENGTH) + '...(truncated)'
    : previousOutput;

  const previousAttemptBlock = `
[Previous Attempt Failed]
Your previous output was NOT in the required format. Do NOT repeat this mistake.
Previous invalid output:
"""
${truncated}
"""
`.trim();

  return `${prompt}\n\n${previousAttemptBlock}\n\n${RETRY_OUTPUT_CONTRACT}`;
}
