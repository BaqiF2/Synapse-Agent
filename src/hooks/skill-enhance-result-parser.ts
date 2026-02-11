/**
 * 文件功能说明：
 * - 该文件位于 `src/hooks/skill-enhance-result-parser.ts`，主要负责 技能、增强、result、解析 相关实现。
 * - 模块归属 Hook 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `parseSkillResultJson`
 * - `formatParsedSkillResult`
 * - `normalizeSkillEnhanceResult`
 * - `buildRetryPrompt`
 * - `ParsedSkillResult`
 * - `SkillExecutionResult`
 * - `SKILL_RESULT_FALLBACK`
 * - `RETRY_OUTPUT_CONTRACT`
 *
 * 作用说明：
 * - `parseSkillResultJson`：用于解析输入并转换为结构化数据。
 * - `formatParsedSkillResult`：用于格式化输出内容。
 * - `normalizeSkillEnhanceResult`：提供该模块的核心能力。
 * - `buildRetryPrompt`：用于构建并产出目标内容。
 * - `ParsedSkillResult`：定义模块交互的数据结构契约。
 * - `SkillExecutionResult`：定义模块交互的数据结构契约。
 * - `SKILL_RESULT_FALLBACK`：提供可复用的常量配置。
 * - `RETRY_OUTPUT_CONTRACT`：提供可复用的常量配置。
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

/**
 * 方法说明：执行 sanitizeReason 相关逻辑。
 * @param reason 输入参数。
 */
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
 * @param raw 输入参数。
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
 * @param parsed 输入参数。
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
 * @param rawResult 输入参数。
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
 * @param prompt 输入参数。
 * @param previousOutput 输入参数。
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
