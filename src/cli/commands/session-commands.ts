/**
 * 会话相关命令处理器
 *
 * 功能：处理 /resume、/clear 等会话管理命令。
 *
 * 核心导出：
 * - handleClearCommand: 处理 /clear 命令，清空会话历史
 * - handleResumeCommand: 处理 /resume 命令，恢复历史会话
 */

import type * as readline from 'node:readline';
import chalk from 'chalk';

import { Session, type SessionInfo } from '../../core/session.ts';
import { extractText } from '../../providers/message.ts';
import type { AgentRunner } from '../../core/agent-runner.ts';
import type { ResumeSessionHandler } from './types.ts';

// ===== 常量 =====

const ORIGINAL_USER_REQUEST_MARKER = 'Original user request:';
const SESSION_PREVIEW_MAX_LENGTH = 50;
const SESSION_DISPLAY_COUNT = 10;

// ===== 内部工具函数 =====

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

/**
 * 处理 /clear 命令
 */
export function handleClearCommand(agentRunner?: AgentRunner | null): void {
  if (agentRunner) {
    agentRunner.clearSession().catch((err) => {
      console.error(chalk.red(`Failed to clear session: ${err.message}`));
    });
  }
  console.log(chalk.green('\nConversation history cleared.\n'));
}

/**
 * 处理 /resume 命令，支持交互式列表、--latest、直接指定 session ID
 */
export async function handleResumeCommand(
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

  const displaySessions = sessions.slice(0, SESSION_DISPLAY_COUNT);
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
