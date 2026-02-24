/**
 * Session 子模块 — 会话管理、持久化和历史操作。
 *
 * 核心导出：
 * - Session: 会话管理类
 * - AgentSessionManager: Agent 会话管理器
 * - SessionUsage / formatCostOutput: 用量统计与格式化
 * - sanitizeToolProtocolHistory: 历史消息消毒
 */

export { Session } from './session.ts';
export {
  TITLE_MAX_LENGTH, SessionInfoSchema, SessionsIndexSchema,
  type SessionInfo, type SessionsIndex, type SessionCreateOptions,
} from './session-schema.ts';
export { SessionPersistence, generateSessionId, toJsonl, parseJsonl } from './session-persistence.ts';
export { SessionContext } from './session-context.ts';
export {
  createEmptySessionUsage, accumulateUsage, resetSessionUsage, formatCostOutput,
  type SessionUsage,
} from './session-usage.ts';
export { AgentSessionManager, type AgentSessionManagerOptions } from './agent-session-manager.ts';
export { sanitizeToolProtocolHistory } from './history-sanitizer.ts';
