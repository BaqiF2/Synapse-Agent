/**
 * Skill Enhance Hook
 *
 * 功能：在 Agent 对话正常结束时自动分析对话历史并建议技能增强。
 *       结果解析逻辑见 skill-enhance-result-parser.ts，
 *       meta-skill 加载逻辑见 skill-enhance-meta-loader.ts。
 *
 * 核心导出：
 * - skillEnhanceHook: 技能增强分析的主 hook 函数
 * - HOOK_NAME: Hook 注册名称常量
 *
 * 环境变量：
 * - SYNAPSE_SESSIONS_DIR: 会话文件目录（默认: ~/.synapse/sessions）
 * - SYNAPSE_MAX_ENHANCE_CONTEXT_CHARS: 最大上下文字符数（默认: 50000）
 * - SYNAPSE_SKILL_SUBAGENT_TIMEOUT: Sub-agent 执行超时时间（默认: 300000ms）
 */

import * as path from 'node:path';
import { createLogger } from '../utils/logger.ts';
import { SettingsManager } from '../config/settings-manager.ts';
import { getSynapseSessionsDir } from '../config/paths.ts';
import { ConversationReader } from '../skills/conversation-reader.ts';
import { AnthropicClient } from '../providers/anthropic/anthropic-client.ts';
import { BashTool } from '../tools/bash-tool.ts';
import { SubAgentManager } from '../sub-agents/sub-agent-manager.ts';
import { stopHookRegistry } from './stop-hook-registry.ts';
import { SKILL_ENHANCE_PROGRESS_TEXT } from './skill-enhance-constants.ts';
import {
  normalizeSkillEnhanceResult,
  buildRetryPrompt,
  SKILL_RESULT_FALLBACK,
  type SkillExecutionResult,
} from './skill-enhance-result-parser.ts';
import { loadMetaSkills, buildEnhancePrompt } from './skill-enhance-meta-loader.ts';
import type { StopHookContext, HookResult } from './types.ts';
import type { Message } from '../providers/message.ts';

const logger = createLogger('skill-enhance-hook');

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
 * Build session file path from sessionId
 *
 * @param sessionId - Session ID
 * @returns Full path to session JSONL file
 */
function buildSessionPath(sessionId: string): string {
  return path.join(getSynapseSessionsDir(), `${sessionId}.jsonl`);
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
    // 创建必要的组件
    const client = new AnthropicClient({ settings: SettingsManager.getInstance().getLlmConfig() });
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
