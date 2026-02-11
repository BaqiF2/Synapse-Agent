/**
 * REPL 命令处理器
 *
 * 功能：处理 REPL 中的特殊命令（/ 前缀）、Shell 命令（! 前缀）、
 *       技能增强命令和会话恢复交互。
 *
 * 核心导出：
 * - executeShellCommand: 执行 Shell 命令
 * - handleSpecialCommand: 处理 / 前缀的特殊命令
 * - handleSigint: 处理 Ctrl+C 信号
 * - formatStreamText: 格式化流式输出文本
 * - ReplState: REPL 状态接口
 * - SigintHandlerOptions: SIGINT 处理选项接口
 */

import type * as readline from 'node:readline';
import { spawn } from 'node:child_process';
import chalk from 'chalk';

import type { AgentRunner } from '../agent/agent-runner.ts';
import { Session, type SessionInfo } from '../agent/session.ts';
import { formatCostOutput } from '../agent/session-usage.ts';
import { extractText } from '../providers/message.ts';
import { SettingsManager } from '../config/settings-manager.ts';
import { SKILL_ENHANCE_PROGRESS_TEXT } from '../hooks/skill-enhance-constants.ts';
import {
  showHelp,
  showContextStats,
  showToolsList,
  showSkillsList,
  showSkillEnhanceHelp,
  printSectionHeader,
} from './repl-display.ts';

// ===== 常量 =====

const BRIGHT_PROGRESS_START = '\x1b[1;93m';
const BRIGHT_PROGRESS_END = '\x1b[0m';
const ORIGINAL_USER_REQUEST_MARKER = 'Original user request:';
const SESSION_PREVIEW_MAX_LENGTH = 50;

// ===== 类型 =====

export interface ReplState {
  isProcessing: boolean;
}

export interface SigintHandlerOptions {
  state: ReplState;
  promptUser: () => void;
  interruptCurrentTurn: () => void;
  clearCurrentInput?: () => void;
}

type ResumeSessionHandler = (sessionId: string) => void | Promise<void>;

export interface SpecialCommandOptions {
  skipExit?: boolean;
  onResumeSession?: ResumeSessionHandler;
  getCurrentSessionId?: () => string | null;
}

// ===== 内部工具函数 =====

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

/**
 * 格式化相对时间
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

/**
 * 格式化会话首日日期（YYYY-MM-DD）
 */
function formatFirstChatDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return 'unknown';
  }
  return date.toISOString().slice(0, 10);
}

function normalizeSingleLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function truncatePreview(text: string, maxLength: number = SESSION_PREVIEW_MAX_LENGTH): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 3)}...`;
}

function extractOriginalUserRequest(rawText: string): string {
  const markerIndex = rawText.lastIndexOf(ORIGINAL_USER_REQUEST_MARKER);
  if (markerIndex === -1) {
    return rawText;
  }

  const extracted = rawText
    .slice(markerIndex + ORIGINAL_USER_REQUEST_MARKER.length)
    .trim();

  return extracted || rawText;
}

function sanitizeTitleFallback(title?: string): string {
  const normalized = normalizeSingleLine(title || '');
  if (!normalized) {
    return '(untitled)';
  }

  if (normalized.toLowerCase().includes('skill search priority')) {
    return '(untitled)';
  }

  return truncatePreview(normalized);
}

async function resolveSessionPreview(session: SessionInfo): Promise<string> {
  const fallback = sanitizeTitleFallback(session.title);

  try {
    const loadedSession = await Session.find(session.id);
    if (!loadedSession) {
      return fallback;
    }

    const history = await loadedSession.loadHistory();
    const firstUserMessage = history.find((message) => message.role === 'user');
    if (!firstUserMessage) {
      return fallback;
    }

    const rawUserText = extractText(firstUserMessage, '\n');
    const originalRequest = extractOriginalUserRequest(rawUserText);
    const normalized = normalizeSingleLine(originalRequest);
    if (!normalized) {
      return fallback;
    }

    return truncatePreview(normalized);
  } catch {
    return fallback;
  }
}

async function buildSessionPreviewMap(sessions: SessionInfo[]): Promise<Map<string, string>> {
  const previewEntries = await Promise.all(
    sessions.map(async (session) => [session.id, await resolveSessionPreview(session)] as const)
  );

  return new Map(previewEntries);
}

function resolveSessionIdFromSelection(
  selection: string,
  sessions: SessionInfo[]
): string | undefined {
  const numericSelection = Number.parseInt(selection, 10);
  const sessionByIndex = sessions[numericSelection - 1];

  if (!Number.isNaN(numericSelection) && numericSelection >= 1 && sessionByIndex) {
    return sessionByIndex.id;
  }

  const matchedSession = sessions.find(
    (session) => session.id === selection || session.id.startsWith(selection)
  );
  return matchedSession?.id;
}

function filterResumableSessions(
  sessions: SessionInfo[],
  currentSessionId: string | null
): SessionInfo[] {
  return sessions.filter(
    (session) => session.messageCount > 0 && session.id !== currentSessionId
  );
}

// ===== 导出函数 =====

export function formatStreamText(text: string): string {
  if (
    text.includes(SKILL_ENHANCE_PROGRESS_TEXT) &&
    (process.stdout as { isTTY?: boolean }).isTTY
  ) {
    return `${BRIGHT_PROGRESS_START}${text}${BRIGHT_PROGRESS_END}`;
  }
  return text;
}

export function handleSigint(options: SigintHandlerOptions): void {
  const { state, promptUser, interruptCurrentTurn, clearCurrentInput } = options;

  if (state.isProcessing) {
    interruptCurrentTurn();
    state.isProcessing = false;
  } else {
    // 空闲时 Ctrl+C 仅清空当前输入并回到提示符，不触发退出确认。
    clearCurrentInput?.();
  }

  promptUser();
}

/**
 * Execute a shell command directly (for ! prefix)
 * Streams output to the terminal in real-time
 *
 * @param command - The shell command to execute (without the ! prefix)
 * @returns Promise that resolves when the command completes
 */
export async function executeShellCommand(command: string): Promise<number> {
  return new Promise((resolve) => {
    // 使用 spawn 创建子进程来执行传入的命令
    const child = spawn(command, {
      shell: true,
      stdio: ['inherit', 'inherit', 'inherit'],
    });
    // 监听子进程的错误事件
    child.on('error', (error) => {
      console.error(chalk.red(`Shell command error: ${error.message}`));
      resolve(1);
    });
    // 监听子进程的退出事件
    child.on('exit', (code) => {
      const exitCode = code ?? 0;
      if (exitCode !== 0) {
        console.log(chalk.gray(`Exit code: ${exitCode}`));
      }
      resolve(exitCode);
    });
  });
}

/**
 * Handle special REPL commands (/ prefix)
 *
 * @param command - The command (with / prefix)
 * @param rl - Readline interface
 * @param agentRunner - Optional agent runner for context access
 * @param options - Optional settings for testing
 * @returns true if command was handled, false otherwise
 */
export async function handleSpecialCommand(
  command: string,
  rl: readline.Interface,
  agentRunner?: AgentRunner | null,
  options?: SpecialCommandOptions
): Promise<boolean> {
  const cmd = command.toLowerCase().trim();
  const parts = command.trim().split(/\s+/);

  switch (cmd) {
    case '/exit':
    case '/quit':
    case '/q':
      console.log(chalk.yellow('\nGoodbye!\n'));
      rl.close();
      if (!options?.skipExit) {
        process.exit(0);
      }
      return true;

    case '/help':
    case '/h':
    case '/?':
      showHelp();
      return true;

    case '/clear':
      if (agentRunner) {
        agentRunner.clearSession().catch((err) => {
          console.error(chalk.red(`Failed to clear session: ${err.message}`));
        });
      }
      console.log(chalk.green('\nConversation history cleared.\n'));
      return true;

    case '/cost': {
      if (!agentRunner) {
        console.log(chalk.yellow('\nCost stats unavailable in this context.\n'));
        return true;
      }

      const usage = agentRunner.getSessionUsage();
      if (!usage) {
        console.log(chalk.yellow('\nNo active session.\n'));
        return true;
      }

      console.log(chalk.cyan(`\n${formatCostOutput(usage)}\n`));
      return true;
    }

    case '/context': {
      if (!agentRunner) {
        console.log(chalk.yellow('\nContext stats unavailable in this context.\n'));
        return true;
      }

      const stats = agentRunner.getContextStats();
      if (!stats) {
        console.log(chalk.yellow('\nNo active session.\n'));
        return true;
      }

      showContextStats(stats);
      return true;
    }

    case '/compact': {
      if (!agentRunner || typeof agentRunner.forceCompact !== 'function') {
        console.log(chalk.yellow('\nCompact unavailable in this context.\n'));
        return true;
      }

      try {
        const compactResult = await agentRunner.forceCompact();
        if (!compactResult.success) {
          console.log(chalk.red('\n❌ 压缩失败，保持原历史不变\n'));
          return true;
        }

        if (compactResult.freedTokens <= 0) {
          console.log(chalk.yellow('\n✅ 无需压缩：历史消息较短或已足够精简\n'));
          return true;
        }

        console.log(
          chalk.green(
            `\n✅ 压缩完成：${compactResult.previousTokens.toLocaleString()} → ${compactResult.currentTokens.toLocaleString()} tokens`
          )
        );
        console.log(
          chalk.green(
            `释放 ${compactResult.freedTokens.toLocaleString()} tokens，删除 ${compactResult.deletedFiles.length} 个卸载文件\n`
          )
        );
      } catch (error: unknown) {
        console.log(chalk.red(`\n❌ 压缩失败：${getErrorMessage(error)}\n`));
      }

      return true;
    }

    case '/model': {
      if (!agentRunner) {
        console.log(chalk.yellow('\nModel info unavailable in this context.\n'));
        return true;
      }

      console.log(chalk.cyan(`\nCurrent model: ${agentRunner.getModelName()}\n`));
      return true;
    }

    case '/tools':
      showToolsList();
      return true;

    case '/skill:list':
      showSkillsList();
      return true;

    default:
      if (cmd.startsWith('/skill:')) {
        return handleSlashSkillCommand(command, agentRunner);
      }

      // /resume 命令
      if (cmd === '/resume' || cmd.startsWith('/resume ')) {
        const args = parts.slice(1);
        if (options?.onResumeSession) {
          const currentSessionId = options.getCurrentSessionId?.() ?? null;
          await handleResumeCommand(args, rl, options.onResumeSession, currentSessionId);
        } else {
          console.log(chalk.yellow('\nResume not available in this context.\n'));
        }
        return true;
      }

      if (parts[0]?.toLowerCase() === '/skill') {
        handleSkillEnhanceCommand(parts.slice(1), agentRunner);
        return true;
      }

      if (cmd.startsWith('/')) {
        console.log(chalk.red(`\nUnknown command: ${cmd}`));
        console.log(chalk.gray('Type /help for available commands.\n'));
        return true;
      }
      return false;
  }
}

async function handleSlashSkillCommand(command: string, agentRunner?: AgentRunner | null): Promise<boolean> {
  if (!agentRunner) {
    console.log(chalk.yellow('\nSkill slash commands unavailable in this context.\n'));
    return true;
  }

  try {
    const normalized = command.trim().slice(1);
    const output = await agentRunner.executeBashCommand(normalized);
    console.log(output ? `\n${output}\n` : '\n');
  } catch (error) {
    console.log(chalk.red(`\nSkill command failed: ${getErrorMessage(error)}\n`));
  }

  return true;
}

/**
 * Handle /skill enhance commands
 */
function handleSkillEnhanceCommand(args: string[], _agentRunner?: AgentRunner | null): void {
  const subcommand = args[0]?.toLowerCase();

  if (subcommand !== 'enhance') {
    console.log(chalk.red(`\nUnknown skill command: ${subcommand || '(none)'}`));
    console.log(chalk.gray('Available commands:'));
    console.log(chalk.gray('  /skill enhance         Show auto-enhance status'));
    console.log(chalk.gray('  /skill enhance --on    Enable auto-enhance'));
    console.log(chalk.gray('  /skill enhance --off   Disable auto-enhance'));
    console.log(chalk.gray('  /skill enhance -h      Show help\n'));
    return;
  }

  const enhanceArgs = args.slice(1);
  const settingsManager = SettingsManager.getInstance();

  if (enhanceArgs.includes('-h') || enhanceArgs.includes('--help')) {
    showSkillEnhanceHelp();
    return;
  }

  if (enhanceArgs.includes('--on')) {
    settingsManager.setAutoEnhance(true);
    console.log(chalk.green('\nAuto skill enhance enabled.'));
    console.log(chalk.gray('Skills will be automatically enhanced after task completion.'));
    console.log(chalk.gray('Note: This will consume additional tokens.\n'));
    console.log(chalk.gray('Use /skill enhance --off to disable.\n'));
    return;
  }

  if (enhanceArgs.includes('--off')) {
    settingsManager.setAutoEnhance(false);
    console.log(chalk.yellow('\nAuto skill enhance disabled.\n'));
    return;
  }

  if (enhanceArgs.length > 0) {
    console.log(chalk.red(`\nUnknown command: /skill enhance ${enhanceArgs.join(' ')}`));
    console.log(chalk.gray('Type /help for available commands.\n'));
    return;
  }

  // No flags — show current status
  const isEnabled = settingsManager.isAutoEnhanceEnabled();
  printSectionHeader('Skill Auto-Enhance Status');
  console.log();
  console.log(
    chalk.white('  Status: ') +
      (isEnabled ? chalk.green('Enabled') : chalk.yellow('Disabled'))
  );
  console.log();
  console.log(chalk.gray('Commands:'));
  console.log(chalk.gray('  /skill enhance --on              Enable auto-enhance'));
  console.log(chalk.gray('  /skill enhance --off             Disable auto-enhance'));
  console.log(chalk.gray('  /skill enhance -h                Show help'));
  console.log();
}

/**
 * Handle /resume command
 */
async function handleResumeCommand(
  args: string[],
  rl: readline.Interface,
  onSessionSelected: ResumeSessionHandler,
  currentSessionId: string | null
): Promise<void> {
  async function loadResumableSessions(): Promise<SessionInfo[]> {
    const sessions = await Session.list();
    return filterResumableSessions(sessions, currentSessionId);
  }

  if (args.includes('--last')) {
    console.log(chalk.red('\nInvalid option: --last'));
    console.log(chalk.gray('Use /resume --latest instead.\n'));
    return;
  }

  // /resume --latest
  if (args.includes('--latest')) {
    const sessions = await loadResumableSessions();
    const latest = sessions[0];
    if (!latest) {
      console.log(chalk.yellow('\nNo previous sessions found.\n'));
      return;
    }
    console.log(chalk.green(`\n✓ Resuming session: ${latest.id}\n`));
    await onSessionSelected(latest.id);
    return;
  }

  // /resume <session-id>
  const firstArg = args[0];
  if (args.length > 0 && firstArg && !firstArg.startsWith('-')) {
    const sessionId = firstArg;
    if (sessionId === currentSessionId) {
      await onSessionSelected(sessionId);
      return;
    }

    const session = await Session.find(sessionId);
    if (!session) {
      console.log(chalk.red(`\nSession not found: ${sessionId}\n`));
      return;
    }
    console.log(chalk.green(`\n✓ Resuming session: ${session.id}\n`));
    await onSessionSelected(session.id);
    return;
  }

  // /resume (interactive list)
  const sessions = await loadResumableSessions();

  if (sessions.length === 0) {
    console.log(chalk.yellow('\nNo previous sessions found.\n'));
    return;
  }

  const displayCount = 10;
  const displaySessions = sessions.slice(0, displayCount);
  const previewBySessionId = await buildSessionPreviewMap(displaySessions);

  console.log(chalk.cyan('\nRecent Sessions:'));
  displaySessions.forEach((s, i) => {
    const preview = previewBySessionId.get(s.id) || '(untitled)';
    const time = formatRelativeTime(s.updatedAt);
    const firstChatDate = formatFirstChatDate(s.createdAt);
    const idShort = s.id.substring(0, 20);
    console.log(chalk.gray(`  ${i + 1}. `) + chalk.white(`[${idShort}] `) +
      chalk.gray(`first chat: ${firstChatDate} `) +
      chalk.white(preview) + chalk.gray(` (${time})`));
  });
  console.log();

  await new Promise<void>((resolve) => {
    rl.question(
      chalk.yellow('Enter number or session ID to resume (or press Enter to cancel): '),
      async (answer) => {
        const trimmed = answer.trim();
        if (!trimmed) {
          console.log(chalk.gray('Cancelled.\n'));
          resolve();
          return;
        }

        const sessionId = resolveSessionIdFromSelection(trimmed, sessions);

        if (!sessionId) {
          console.log(chalk.red(`\nInvalid selection: ${trimmed}\n`));
          resolve();
          return;
        }

        try {
          console.log(chalk.green(`\n✓ Resuming session: ${sessionId}\n`));
          await onSessionSelected(sessionId);
        } finally {
          resolve();
        }
      }
    );
  });
}
