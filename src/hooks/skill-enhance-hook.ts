/**
 * Skill Enhance Hook
 *
 * Stop hook that automatically analyzes completed conversations
 * and suggests skill enhancements. Triggered when agent loop exits normally.
 *
 * @module skill-enhance-hook
 *
 * Core Exports:
 * - skillEnhanceHook: Main hook function for skill enhancement analysis
 * - HOOK_NAME: Hook registration name constant
 *
 * Internal Functions:
 * - hasTodoWriteCall: Check if TodoWrite was called in conversation (prerequisite for enhancement)
 *
 * Environment Variables:
 * - SYNAPSE_SESSIONS_DIR: Session files directory (default: ~/.synapse/sessions)
 * - SYNAPSE_META_SKILLS_DIR: Meta-skill directory (default: ~/.synapse/skills)
 * - SYNAPSE_MAX_ENHANCE_CONTEXT_CHARS: Max context chars (default: 50000)
 * - SYNAPSE_SKILL_SUBAGENT_TIMEOUT: Sub-agent execution timeout in ms (default: 300000)
 */

import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { createLogger } from '../utils/logger.ts';
import { SettingsManager } from '../config/settings-manager.ts';
import { ConversationReader } from '../skills/conversation-reader.ts';
import { AnthropicClient } from '../providers/anthropic/anthropic-client.ts';
import { BashTool } from '../tools/bash-tool.ts';
import { SubAgentManager } from '../sub-agents/sub-agent-manager.ts';
import { stopHookRegistry } from './stop-hook-registry.ts';
import { SKILL_ENHANCE_PROGRESS_TEXT } from './skill-enhance-constants.ts';
import { loadDesc } from '../utils/load-desc.js';
import type { StopHookContext, HookResult } from './types.ts';
import type { Message } from '../providers/message.ts';

const logger = createLogger('skill-enhance-hook');
const PROMPT_TEMPLATE_PATH = path.join(import.meta.dirname, 'skill-enhance-hook-prompt.md');
const SKILL_RESULT_FALLBACK = '[Skill] No enhancement needed\nReason: invalid sub-agent output format';
const SKILL_MARKER_PATTERN = /\[Skill\][\s\S]*$/m;
const SKILL_HEADER_PATTERN = /^\[Skill\]\s*(Created:|Enhanced:|No enhancement needed\b)/i;
const JSON_FENCE_PATTERN = /```(?:json)?\s*([\s\S]*?)```/i;
const RETRY_OUTPUT_CONTRACT = `
[Output Contract]
Return ONLY one final skill-enhancement result. Do not output preamble, analysis plan, or "I will analyze..." text.
Allowed outputs:
1) [Skill] Created: <skill-name>
2) [Skill] Enhanced: <skill-name>
3) [Skill] No enhancement needed
You may add one short reason line after the result.
`.trim();

/**
 * Hook registration name
 */
export const HOOK_NAME = 'skill-enhance';

/**
 * Default sub-agent timeout: 5 minutes
 */
const DEFAULT_SUBAGENT_TIMEOUT_MS = 300000;

/**
 * Get sub-agent timeout from environment variable
 */
function getSubagentTimeout(): number {
  const envValue = process.env.SYNAPSE_SKILL_SUBAGENT_TIMEOUT;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_SUBAGENT_TIMEOUT_MS;
}

/**
 * Get sessions directory path
 *
 * 在调用时读取环境变量，支持测试时动态设置
 *
 * @returns Sessions directory path
 */
function getSessionsDir(): string {
  return process.env.SYNAPSE_SESSIONS_DIR || path.join(os.homedir(), '.synapse', 'sessions');
}

/**
 * Get meta-skill directory path
 *
 * Meta-skills 位于用户的 ~/.synapse/skill 目录
 *
 * @returns Meta-skill directory path
 */
function getMetaSkillDir(): string {
  return process.env.SYNAPSE_META_SKILLS_DIR || path.join(os.homedir(), '.synapse', 'skills');
}

/**
 * Build session file path from sessionId
 *
 * @param sessionId - Session ID
 * @returns Full path to session JSONL file
 */
function buildSessionPath(sessionId: string): string {
  return path.join(getSessionsDir(), `${sessionId}.jsonl`);
}

/**
 * Meta-skill content container
 */
interface MetaSkillContent {
  skillCreator: string | null;
  skillEnhance: string | null;
}

/**
 * Load meta-skill content from user directory
 *
 * @param skillName - Meta-skill name (e.g., 'skill-creator', 'skill-enhance')
 * @returns Raw content of SKILL.md or null if not found
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
 * Load all required meta-skills
 *
 * @returns Meta-skill content or null if any required skill is missing
 */
function loadMetaSkills(): MetaSkillContent | null {
  const skillCreator = loadMetaSkillContent('skill-creator');
  const skillEnhance = loadMetaSkillContent('skill-enhance');

  if (!skillCreator || !skillEnhance) {
    return null;
  }

  return { skillCreator, skillEnhance };
}

/**
 * Build the skill enhancement prompt
 *
 * @param compactedHistory - Compacted conversation history
 * @param metaSkills - Meta-skill content
 * @returns Full prompt for skill sub-agent
 */
function buildEnhancePrompt(compactedHistory: string, metaSkills: MetaSkillContent): string {
  return loadDesc(PROMPT_TEMPLATE_PATH, {
    COMPACTED_HISTORY: compactedHistory,
    META_SKILL_CREATOR: metaSkills.skillCreator || '',
    META_SKILL_ENHANCE: metaSkills.skillEnhance || '',
  });
}

/**
 * Execute sub-agent with timeout
 *
 * @param subAgentManager - SubAgentManager instance
 * @param prompt - Enhancement prompt
 * @param timeoutMs - Timeout in milliseconds
 * @returns Sub-agent result or error message
 */
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

interface ParsedSkillResult {
  action: 'create' | 'enhance' | 'skip';
  skillName?: string;
  reason?: string;
}

interface SkillExecutionResult {
  raw: string;
  normalized: string | null;
}

function sanitizeReason(reason: string | undefined): string | undefined {
  if (!reason) {
    return;
  }
  const normalized = reason.trim().replace(/\s+/g, ' ');
  return normalized || undefined;
}

function parseSkillResultJson(raw: string): ParsedSkillResult | null {
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

function formatParsedSkillResult(parsed: ParsedSkillResult): string {
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

function normalizeSkillEnhanceResult(rawResult: string): string | null {
  const trimmed = rawResult.trim();
  if (!trimmed) {
    return null;
  }

  const skillMarkerMatch = trimmed.match(SKILL_MARKER_PATTERN);
  if (skillMarkerMatch?.[0]) {
    const candidate = skillMarkerMatch[0].trimStart();
    const firstLine = candidate.split('\n')[0] ?? '';
    if (SKILL_HEADER_PATTERN.test(firstLine)) {
      return candidate;
    }
  }

  const parsed = parseSkillResultJson(trimmed);
  if (parsed) {
    return formatParsedSkillResult(parsed);
  }

  return null;
}

function buildRetryPrompt(prompt: string): string {
  return `${prompt}\n\n${RETRY_OUTPUT_CONTRACT}`;
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
 * Check if TodoWrite was called in the conversation
 *
 * 遍历所有 assistant 消息的 toolCalls，检测是否有 TodoWrite 调用。
 * TodoWrite 是 Agent Shell Command，通过 Bash 工具路由，
 * 因此需要解析 Bash 工具的 arguments 来检测。
 *
 * @param messages - Conversation messages
 * @returns true if TodoWrite was called at least once
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

/**
 * Skill Enhancement Hook
 *
 * Analyzes completed conversations and triggers skill enhancement
 * when conditions are met:
 * 1. autoEnhance is enabled in settings
 * 2. sessionId is available (not null)
 * 3. TodoWrite was called at least once in the conversation
 * 4. Session file exists and is readable
 * 5. Meta-skills are available
 *
 * @param context - Stop hook context containing session info and messages
 * @returns Hook result with message, or void if skipped
 */
export async function skillEnhanceHook(context: StopHookContext): Promise<HookResult | void> {
  const settings = new SettingsManager();

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
    // 创建必要的组件
    const client = new AnthropicClient();
    const bashTool = new BashTool({ llmClient: client });
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

    const retryPrompt = buildRetryPrompt(prompt);
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
