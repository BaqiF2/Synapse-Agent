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

const logger = createLogger('skill-enhance-hook');
const PROMPT_TEMPLATE_PATH = path.join(import.meta.dirname, 'skill-enhance-hook-prompt.md');

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
    prompt,
    description: 'Skill Enhancement Analysis',
  });

  return Promise.race([executionPromise, timeoutPromise]);
}

/**
 * Skill Enhancement Hook
 *
 * Analyzes completed conversations and triggers skill enhancement
 * when conditions are met:
 * 1. autoEnhance is enabled in settings
 * 2. sessionId is available (not null)
 * 3. Session file exists and is readable
 * 4. Meta-skills are available
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
    const result = await executeWithTimeout(subAgentManager, prompt, timeoutMs);

    logger.info('Skill enhancement completed', {
      sessionId: context.sessionId,
      resultLength: result.length,
    });

    return { message: result };
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
