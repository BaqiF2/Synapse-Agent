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
import { SubAgentManager } from '../sub-agents/sub-agent-manager.ts';
import { loadSandboxConfig } from '../../shared/sandbox/sandbox-config.ts';
import { stopHookRegistry, type StopHookContext, type HookResult } from './hook-registry.ts';
import type { Message } from '../../types/message.ts';

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
const ERROR_TEXT_PATTERN = /\b(error|failed|failure|exception|timeout|stderr|exit code)\b/i;
const CLARIFICATION_CLASSIFIER_SYSTEM_PROMPT = [
  'You are a strict classifier.',
  'Given user turns from one completed task, count how many turns are clarification/correction turns.',
  'Clarification/correction means refining, correcting, or changing previous requirements.',
  'Return ONLY JSON: {"clarification_count": <non-negative integer>}.',
].join(' ');

const TRIGGER_PROFILE_THRESHOLDS = {
  conservative: 3,
  neutral: 2,
  aggressive: 1,
} as const;

const TRIGGER_SIGNAL_WEIGHTS = {
  toolCalls: 1,
  uniqueTools: 1,
  errorRecovered: 2,
  writeOrEdit: 1,
  clarifications: 1,
} as const;

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

export type TriggerProfile = keyof typeof TRIGGER_PROFILE_THRESHOLDS;

export type TriggerReasonCode =
  | 'AUTO_ENHANCE_OFF'
  | 'SESSION_NOT_FOUND'
  | 'LOW_SCORE'
  | 'SCORE_REACHED';

export interface TriggerSignals {
  toolCallCount: number;
  uniqueToolCount: number;
  hasErrorRecovered: boolean;
  hasWriteOrEdit: boolean;
  userClarificationCount: number;
}

export interface TriggerDecision {
  shouldTrigger: boolean;
  totalScore: number;
  threshold: number;
  signalHits: string[];
  reasonCode: TriggerReasonCode;
  profile: TriggerProfile;
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
 * 解析文本消息内容
 */
function extractTextContent(message: Message): string {
  return message.content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map(part => part.text)
    .join('\n')
    .trim();
}

function parseBashCommand(argumentsText: string): string | null {
  try {
    const args = JSON.parse(argumentsText) as { command?: string };
    if (typeof args.command === 'string') {
      return args.command.trim();
    }
  } catch {
    // ignore parse errors and fall back to other signals
  }
  return null;
}

function isWriteOrEditCommand(command: string): boolean {
  return /^(write|edit)\b/i.test(command.trimStart());
}

function parseClarificationCount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const candidates = [trimmed];
  const fenced = trimmed.match(JSON_FENCE_PATTERN)?.[1];
  if (fenced) {
    candidates.unshift(fenced.trim());
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as { clarification_count?: unknown };
      if (typeof parsed.clarification_count === 'number' && Number.isFinite(parsed.clarification_count)) {
        return Math.max(0, Math.floor(parsed.clarification_count));
      }
    } catch {
      continue;
    }
  }

  return null;
}

function detectLooseErrorRecovery(messages: readonly Message[]): boolean {
  let hasSeenError = false;
  for (const message of messages) {
    if (message.role !== 'tool') continue;
    const text = extractTextContent(message);
    if (!text) continue;
    const isError = ERROR_TEXT_PATTERN.test(text);
    if (isError) {
      hasSeenError = true;
      continue;
    }
    if (hasSeenError) {
      return true;
    }
  }
  return false;
}

export function collectTriggerSignals(
  messages: readonly Message[],
  userClarificationCount: number = 0
): TriggerSignals {
  let toolCallCount = 0;
  const uniqueTools = new Set<string>();
  let hasWriteOrEdit = false;

  for (const message of messages) {
    if (message.role !== 'assistant' || !message.toolCalls) continue;

    for (const toolCall of message.toolCalls) {
      toolCallCount++;
      uniqueTools.add(toolCall.name.toLowerCase());

      const toolName = toolCall.name.toLowerCase();
      if (toolName === 'write' || toolName === 'edit') {
        hasWriteOrEdit = true;
      }

      if (toolName === 'bash') {
        const command = parseBashCommand(toolCall.arguments);
        if (command && isWriteOrEditCommand(command)) {
          hasWriteOrEdit = true;
        }
      }
    }
  }

  return {
    toolCallCount,
    uniqueToolCount: uniqueTools.size,
    hasErrorRecovered: detectLooseErrorRecovery(messages),
    hasWriteOrEdit,
    userClarificationCount: Math.max(0, Math.floor(userClarificationCount)),
  };
}

export function resolveTriggerProfile(raw: unknown): TriggerProfile {
  if (raw === 'conservative' || raw === 'neutral' || raw === 'aggressive') {
    return raw;
  }
  return 'conservative';
}

export function evaluateTriggerDecision(
  messages: readonly Message[],
  profile: TriggerProfile,
  userClarificationCount: number = 0
): TriggerDecision {
  const signals = collectTriggerSignals(messages, userClarificationCount);
  const signalHits: string[] = [];
  let totalScore = 0;

  if (signals.toolCallCount >= 3) {
    totalScore += TRIGGER_SIGNAL_WEIGHTS.toolCalls;
    signalHits.push('TOOL_CALLS_GTE_3');
  }
  if (signals.uniqueToolCount >= 2) {
    totalScore += TRIGGER_SIGNAL_WEIGHTS.uniqueTools;
    signalHits.push('UNIQUE_TOOLS_GTE_2');
  }
  if (signals.hasErrorRecovered) {
    totalScore += TRIGGER_SIGNAL_WEIGHTS.errorRecovered;
    signalHits.push('ERROR_RECOVERED');
  }
  if (signals.hasWriteOrEdit) {
    totalScore += TRIGGER_SIGNAL_WEIGHTS.writeOrEdit;
    signalHits.push('HAS_WRITE_OR_EDIT');
  }
  if (signals.userClarificationCount >= 2) {
    totalScore += TRIGGER_SIGNAL_WEIGHTS.clarifications;
    signalHits.push('USER_CLARIFICATIONS_GTE_2');
  }

  const threshold = TRIGGER_PROFILE_THRESHOLDS[profile];
  const shouldTrigger = totalScore >= threshold;
  return {
    shouldTrigger,
    totalScore,
    threshold,
    signalHits,
    reasonCode: shouldTrigger ? 'SCORE_REACHED' : 'LOW_SCORE',
    profile,
  };
}

function collectUserTurns(messages: readonly Message[]): string[] {
  const turns: string[] = [];
  for (const message of messages) {
    if (message.role !== 'user') continue;
    const text = extractTextContent(message);
    if (!text) continue;
    turns.push(text);
  }
  return turns;
}

async function inferClarificationCountWithLlm(
  messages: readonly Message[],
  settings: SettingsManager
): Promise<number> {
  const userTurns = collectUserTurns(messages);
  if (userTurns.length < 2) {
    return 0;
  }

  const prompt = [
    'User turns (ordered):',
    ...userTurns.map((turn, idx) => `[${idx + 1}] ${turn}`),
    '',
    'Count clarification/correction turns only.',
    'Return JSON only.',
  ].join('\n');

  try {
    const { AnthropicClient } = await import('../../providers/anthropic/anthropic-client.ts');
    const { generate } = await import('../../providers/generate.ts');

    const client = new AnthropicClient({ settings: settings.getLlmConfig() }).withThinking('off');
    const result = await generate(
      client,
      CLARIFICATION_CLASSIFIER_SYSTEM_PROMPT,
      [],
      [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      {}
    );
    const raw = extractTextContent(result.message);
    const parsed = parseClarificationCount(raw);
    return parsed ?? 0;
  } catch (error) {
    logger.warn('Failed to infer clarification count with LLM, fallback to 0', {
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

export async function evaluateTriggerDecisionWithLlm(
  messages: readonly Message[],
  profile: TriggerProfile,
  settings: SettingsManager
): Promise<TriggerDecision> {
  const baseDecision = evaluateTriggerDecision(messages, profile, 0);

  if (baseDecision.shouldTrigger) {
    return baseDecision;
  }

  const clarificationWeight = TRIGGER_SIGNAL_WEIGHTS.clarifications;
  const couldFlipByClarification = baseDecision.totalScore + clarificationWeight >= baseDecision.threshold;
  if (!couldFlipByClarification) {
    return baseDecision;
  }

  const clarificationCount = await inferClarificationCountWithLlm(messages, settings);
  return evaluateTriggerDecision(messages, profile, clarificationCount);
}

// ========== 主 Hook 函数 ==========

/**
 * Skill Enhancement Hook
 *
 * 分析已完成的对话并在条件满足时触发技能增强：
 * 1. autoEnhance 已启用
 * 2. sessionId 可用
 * 3. 评分模型达到阈值
 * 4. 会话文件存在且可读
 * 5. Meta-skills 可用
 */
export async function skillEnhanceHook(context: StopHookContext): Promise<HookResult | void> {
  const settings = SettingsManager.getInstance();

  // Step 1: 检查是否启用自动增强
  if (!settings.isAutoEnhanceEnabled()) {
    logger.debug('Auto-enhance disabled, skipping skill enhancement', { reasonCode: 'AUTO_ENHANCE_OFF' });
    return;
  }

  // Step 2: 检查 sessionId 是否存在
  if (!context.sessionId) {
    logger.warn('Enhancement skipped: session not found', { reasonCode: 'SESSION_NOT_FOUND' });
    return { message: 'Enhancement skipped: session not found' };
  }

  // Step 2.5: 基于评分模型决定是否触发增强
  const profile = resolveTriggerProfile(settings.getEnhanceTriggerProfile());
  const decision = await evaluateTriggerDecisionWithLlm(context.messages, profile, settings);
  logger.info('Skill enhancement trigger decision', {
    sessionId: context.sessionId,
    reasonCode: decision.reasonCode,
    totalScore: decision.totalScore,
    threshold: decision.threshold,
    signalHits: decision.signalHits,
    profile: decision.profile,
  });

  if (!decision.shouldTrigger) {
    logger.debug('Skill enhancement skipped due to low score', {
      sessionId: context.sessionId,
      reasonCode: decision.reasonCode,
      totalScore: decision.totalScore,
      threshold: decision.threshold,
      signalHits: decision.signalHits,
    });
    return;
  }

  // Step 3: 读取并压缩会话历史
  const sessionPath = buildSessionPath(context.sessionId);
  // 动态导入 ConversationReader，避免 core → skills 的静态依赖
  const { ConversationReader } = await import('../../skills/generator/conversation-reader.ts');
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
    // 动态导入 AnthropicClient 和 BashTool，避免 core → providers/tools 的静态依赖
    const { AnthropicClient } = await import('../../providers/anthropic/anthropic-client.ts');
    const { BashTool } = await import('../../tools/bash-tool.ts');
    const { createSubAgentToolsetFactory } = await import('../../tools/sub-agent-toolset-factory.ts');
    const { generate } = await import('../../providers/generate.ts');
    const { createPreloadedAgentRunnerFactory } = await import('./agent-runner-factory.ts');

    const client = new AnthropicClient({ settings: SettingsManager.getInstance().getLlmConfig() });
    const bashTool = new BashTool({
      sandboxConfig: { ...loadSandboxConfig(), enabled: false },
    });
    const agentRunnerFactory = await createPreloadedAgentRunnerFactory({
      client,
      generateFn: generate,
    });
    const subAgentManager = new SubAgentManager({
      client,
      bashTool,
      toolsetFactory: createSubAgentToolsetFactory(),
      generateFn: generate,
      agentRunnerFactory,
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
