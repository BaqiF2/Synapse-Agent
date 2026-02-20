/**
 * Skill Enhance Hook — 在 Agent 对话正常结束时自动分析对话历史并建议技能增强。
 *
 * 合并自: skill-enhance-hook.ts + skill-enhance-constants.ts
 *         + skill-enhance-meta-loader.ts + skill-enhance-result-parser.ts
 *
 * 核心导出:
 * - skillEnhanceHook: 技能增强分析的主 hook 函数
 * - HOOK_NAME: Hook 注册名称常量
 * - SKILL_ENHANCE_PROGRESS_TEXT: 进度提示文本常量
 * - isSkillEnhanceCommand: 判断命令是否为 skill enhance 命令
 * - normalizeSkillEnhanceResult: 标准化结果文本
 * - buildRetryPrompt: 构建重试 prompt
 * - SKILL_RESULT_FALLBACK: 兜底结果常量
 * - ParsedSkillResult: 解析后的结果接口
 * - SkillExecutionResult: 执行结果接口
 * - MetaSkillContent: meta-skill 内容容器接口
 * - loadMetaSkills: 加载 meta-skill 文件
 * - buildEnhancePrompt: 构建增强 prompt
 *
 * 环境变量:
 * - SYNAPSE_SESSIONS_DIR: 会话文件目录（默认: ~/.synapse/sessions）
 * - SYNAPSE_MAX_ENHANCE_CONTEXT_CHARS: 最大上下文字符数（默认: 50000）
 * - SYNAPSE_SKILL_SUBAGENT_TIMEOUT: Sub-agent 执行超时时间（默认: 300000ms）
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { createLogger } from '../../shared/file-logger.ts';
import { loadDesc } from '../../shared/load-desc.js';
import { SettingsManager } from '../../shared/config/settings-manager.ts';
import { getSynapseSessionsDir, getSynapseSkillsDir } from '../../shared/config/paths.ts';
import { ConversationReader } from '../../skills/generator/conversation-reader.ts';
import { AnthropicClient } from '../../providers/anthropic/anthropic-client.ts';
import { BashTool } from '../../tools/bash-tool.ts';
import { SubAgentManager } from '../sub-agents/sub-agent-manager.ts';
import { loadSandboxConfig } from '../../shared/sandbox/sandbox-config.ts';
import { stopHookRegistry, type StopHookContext, type HookResult } from './hook-registry.ts';
import type { Message } from '../../providers/message.ts';

const logger = createLogger('skill-enhance-hook');

// ========== 常量 ==========

/** Hook 注册名称 */
export const HOOK_NAME = 'skill-enhance';

/** 技能增强进度提示文本 */
export const SKILL_ENHANCE_PROGRESS_TEXT = 'Analyzing skill enhancement...';

const SKILL_ENHANCE_COMMAND_PATTERN = /^task:skill:enhance(?:\s|$)/i;

/** 默认 sub-agent 超时: 5 分钟 */
const DEFAULT_SUBAGENT_TIMEOUT_MS = 300000;

/** 首次失败输出的最大截断长度 */
const MAX_PREVIOUS_OUTPUT_LENGTH = 500;

/** 兜底结果常量 */
export const SKILL_RESULT_FALLBACK = '[Skill] No enhancement needed\nReason: invalid sub-agent output format';

/** 重试输出格式契约 */
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

const PROMPT_TEMPLATE_PATH = path.join(import.meta.dirname, 'skill-enhance-hook-prompt.md');
const SKILL_MARKER_PATTERN = /\[Skill\][\s\S]*$/m;
const SKILL_HEADER_PATTERN = /^\[Skill\]\s*(Created:|Enhanced:|No enhancement needed\b)/i;
const JSON_FENCE_PATTERN = /```(?:json)?\s*([\s\S]*?)```/i;

// ========== 类型 ==========

/** 解析后的 skill 结果 */
export interface ParsedSkillResult {
  action: 'create' | 'enhance' | 'skip';
  skillName?: string;
  reason?: string;
}

/** 执行结果（包含 raw 和 normalized） */
export interface SkillExecutionResult {
  raw: string;
  normalized: string | null;
}

/** Meta-skill 内容容器 */
export interface MetaSkillContent {
  skillCreator: string | null;
  skillEnhance: string | null;
}

// ========== 工具函数: 命令检测 ==========

/** 判断命令是否为 skill enhance 命令 */
export function isSkillEnhanceCommand(command: string): boolean {
  return SKILL_ENHANCE_COMMAND_PATTERN.test(command.trim());
}

// ========== 工具函数: 结果解析 ==========

function sanitizeReason(reason: string | undefined): string | undefined {
  if (!reason) return;
  const normalized = reason.trim().replace(/\s+/g, ' ');
  return normalized || undefined;
}

/**
 * 解析 JSON 格式的 skill 结果
 *
 * 支持纯 JSON 和 ```json 围栏格式
 */
export function parseSkillResultJson(raw: string): ParsedSkillResult | null {
  const text = raw.trim();
  if (!text) return null;

  const candidates = [text];
  const fencedJson = text.match(JSON_FENCE_PATTERN)?.[1];
  if (fencedJson) {
    candidates.unshift(fencedJson.trim());
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const action = typeof parsed.action === 'string' ? parsed.action.toLowerCase() : '';
      if (action !== 'create' && action !== 'enhance' && action !== 'skip') continue;

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
  if (!trimmed) return null;

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

// ========== 工具函数: Meta-Skill 加载 ==========

/**
 * 获取 meta-skill 目录路径
 */
export function getMetaSkillDir(): string {
  return getSynapseSkillsDir();
}

/**
 * 加载单个 meta-skill 的内容
 */
function loadMetaSkillContent(skillName: string): string | null {
  const metaSkillDir = getMetaSkillDir();
  const skillMdPath = path.join(metaSkillDir, skillName, 'SKILL.md');

  try {
    if (!fs.existsSync(skillMdPath)) {
      logger.warn('Meta-skill SKILL.md not found', { skillName, path: skillMdPath });
      return null;
    }
    return fs.readFileSync(skillMdPath, 'utf-8');
  } catch (error) {
    logger.error('Failed to read meta-skill', {
      skillName,
      path: skillMdPath,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * 加载所有必需的 meta-skills
 *
 * @returns Meta-skill 内容，任一必需 skill 缺失时返回 null
 */
export function loadMetaSkills(): MetaSkillContent | null {
  const skillCreator = loadMetaSkillContent('skill-creator');
  const skillEnhance = loadMetaSkillContent('skill-enhance');

  if (!skillCreator || !skillEnhance) {
    return null;
  }

  return { skillCreator, skillEnhance };
}

/**
 * 基于会话历史和 meta-skill 内容构建增强 prompt
 */
export function buildEnhancePrompt(compactedHistory: string, metaSkills: MetaSkillContent): string {
  return loadDesc(PROMPT_TEMPLATE_PATH, {
    COMPACTED_HISTORY: compactedHistory,
    META_SKILL_CREATOR: metaSkills.skillCreator || '',
    META_SKILL_ENHANCE: metaSkills.skillEnhance || '',
  });
}

// ========== 内部辅助 ==========

function getSubagentTimeout(): number {
  const envValue = process.env.SYNAPSE_SKILL_SUBAGENT_TIMEOUT;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_SUBAGENT_TIMEOUT_MS;
}

function buildSessionPath(sessionId: string): string {
  return path.join(getSynapseSessionsDir(), `${sessionId}.jsonl`);
}

async function executeWithTimeout(
  subAgentManager: SubAgentManager,
  prompt: string,
  timeoutMs: number
): Promise<string> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error('execution timeout'));
    }, timeoutMs);
  });

  const executionPromise = subAgentManager.execute('skill', {
    action: 'enhance',
    prompt,
    description: 'Skill Enhancement Analysis',
  });

  return Promise.race([executionPromise, timeoutPromise]);
}

async function executeAndNormalize(
  subAgentManager: SubAgentManager,
  prompt: string,
  timeoutMs: number
): Promise<SkillExecutionResult> {
  const raw = await executeWithTimeout(subAgentManager, prompt, timeoutMs);
  return {
    raw,
    normalized: normalizeSkillEnhanceResult(raw),
  };
}

/**
 * 检测会话中是否调用过 TodoWrite
 *
 * TodoWrite 是 Agent Shell Command，通过 Bash 工具路由，
 * 因此需要解析 Bash 工具的 arguments 来检测。
 */
function hasTodoWriteCall(messages: readonly Message[]): boolean {
  for (const message of messages) {
    if (message.role !== 'assistant' || !message.toolCalls) continue;

    for (const toolCall of message.toolCalls) {
      if (toolCall.name !== 'Bash') continue;

      try {
        const args = JSON.parse(toolCall.arguments) as { command?: string };
        if (typeof args.command === 'string' && args.command.trimStart().startsWith('TodoWrite')) {
          return true;
        }
      } catch {
        // 忽略 JSON 解析失败的情况
      }
    }
  }
  return false;
}

// ========== 主 Hook 函数 ==========

/**
 * Skill Enhancement Hook
 *
 * 分析已完成的对话并在条件满足时触发技能增强：
 * 1. autoEnhance 已启用
 * 2. sessionId 可用
 * 3. 对话中调用过 TodoWrite
 * 4. 会话文件存在且可读
 * 5. Meta-skills 可用
 */
export async function skillEnhanceHook(context: StopHookContext): Promise<HookResult | void> {
  const settings = SettingsManager.getInstance();

  // Step 1: 检查是否启用自动增强
  if (!settings.isAutoEnhanceEnabled()) {
    logger.debug('Auto-enhance disabled, skipping skill enhancement');
    return;
  }

  // Step 2: 检查 sessionId 是否存在
  if (!context.sessionId) {
    logger.warn('Enhancement skipped: session not found');
    return { message: 'Enhancement skipped: session not found' };
  }

  // Step 2.5: 检查是否调用过 TodoWrite
  if (!hasTodoWriteCall(context.messages)) {
    logger.debug('No TodoWrite call found, skipping skill enhancement');
    return;
  }

  // Step 3: 读取并压缩会话历史
  const sessionPath = buildSessionPath(context.sessionId);
  const reader = new ConversationReader();
  const maxChars = settings.getMaxEnhanceContextChars();

  let compactedHistory: string;
  try {
    const turns = reader.readTruncated(sessionPath, maxChars);
    compactedHistory = reader.compact(turns);
    logger.debug('Session history compacted', {
      sessionId: context.sessionId,
      turnsCount: turns.length,
      compactedLength: compactedHistory.length,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to read session', { error: errorMessage, sessionPath });
    return { message: `Enhancement failed: failed to read session - ${errorMessage}` };
  }

  // 如果压缩后的历史为空，跳过增强
  if (!compactedHistory) {
    logger.debug('Empty conversation history, skipping enhancement');
    return { message: 'Enhancement skipped: empty conversation' };
  }

  // Step 4: 加载 meta-skills
  const metaSkills = loadMetaSkills();
  if (!metaSkills) {
    logger.error('Meta-skills not found');
    return { message: 'Enhancement failed: meta-skills not found' };
  }

  logger.debug('Meta-skills loaded', {
    skillCreatorLength: metaSkills.skillCreator?.length || 0,
    skillEnhanceLength: metaSkills.skillEnhance?.length || 0,
  });

  // Step 5: 构建 prompt 并执行 skill sub-agent
  const prompt = buildEnhancePrompt(compactedHistory, metaSkills);
  const timeoutMs = getSubagentTimeout();

  logger.info('Executing skill sub-agent', {
    sessionId: context.sessionId,
    promptLength: prompt.length,
    timeoutMs,
  });
  await context.onProgress?.(SKILL_ENHANCE_PROGRESS_TEXT);

  try {
    // 创建必要的组件（SubAgent 为内部组件，禁用沙箱避免不必要的隔离失败）
    const client = new AnthropicClient({ settings: SettingsManager.getInstance().getLlmConfig() });
    const bashTool = new BashTool({
      sandboxConfig: { ...loadSandboxConfig(), enabled: false },
    });
    const subAgentManager = new SubAgentManager({
      client,
      bashTool,
    });

    // 执行 sub-agent（带超时）
    const firstExecution = await executeAndNormalize(subAgentManager, prompt, timeoutMs);
    if (firstExecution.normalized) {
      logger.info('Skill enhancement completed', {
        sessionId: context.sessionId,
        resultLength: firstExecution.normalized.length,
        retried: false,
      });
      return { message: firstExecution.normalized };
    }

    logger.warn('Skill enhancement returned invalid output format, retrying once', {
      sessionId: context.sessionId,
      resultLength: firstExecution.raw.length,
    });

    const retryPrompt = buildRetryPrompt(prompt, firstExecution.raw);
    const retryExecution = await executeAndNormalize(subAgentManager, retryPrompt, timeoutMs);
    if (retryExecution.normalized) {
      logger.info('Skill enhancement completed after retry', {
        sessionId: context.sessionId,
        resultLength: retryExecution.normalized.length,
        retried: true,
      });
      return { message: retryExecution.normalized };
    }

    logger.warn('Skill enhancement output invalid after retry, using fallback message', {
      sessionId: context.sessionId,
      firstResultLength: firstExecution.raw.length,
      retryResultLength: retryExecution.raw.length,
    });
    return { message: SKILL_RESULT_FALLBACK };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage === 'execution timeout') {
      logger.error('Skill sub-agent execution timeout', { sessionId: context.sessionId, timeoutMs });
      return { message: 'Enhancement failed: execution timeout' };
    }

    logger.error('Skill sub-agent execution failed', {
      sessionId: context.sessionId,
      error: errorMessage,
    });
    return { message: `Enhancement failed: ${errorMessage}` };
  }
}

// 模块加载时自动注册 Hook
stopHookRegistry.register(HOOK_NAME, skillEnhanceHook);

logger.debug(`Stop hook '${HOOK_NAME}' registered`);
