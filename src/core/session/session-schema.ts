/**
 * Session Schema 定义
 *
 * 功能：定义会话相关的 Zod Schema、TypeScript 类型和标题提取工具函数。
 *       独立文件避免 session 模块间的循环依赖。
 *
 * 核心导出：
 * - SessionInfoSchema: 会话元信息 Schema
 * - SessionsIndexSchema: 会话索引 Schema
 * - SessionInfo: 会话元信息类型
 * - SessionsIndex: 会话索引类型
 * - SessionCreateOptions: 会话创建选项
 * - TITLE_MAX_LENGTH: 标题最大长度常量
 * - extractTitleFromMessage: 从消息中提取标题
 */

import { z } from 'zod';
import type { Message } from '../../types/message.ts';

export const TITLE_MAX_LENGTH = 50;

/**
 * Schema for session info
 */
export const SessionInfoSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  messageCount: z.number(),
  title: z.string().optional(),
  cwd: z.string().optional(),
  usage: z
    .object({
      totalInputOther: z.number(),
      totalOutput: z.number(),
      totalCacheRead: z.number(),
      totalCacheCreation: z.number(),
      model: z.string(),
      rounds: z.array(
        z.object({
          inputOther: z.number(),
          output: z.number(),
          inputCacheRead: z.number(),
          inputCacheCreation: z.number(),
        })
      ),
      totalCost: z.number().nullable(),
    })
    .optional(),
});

export type SessionInfo = z.infer<typeof SessionInfoSchema>;

/**
 * Schema for sessions index
 */
export const SessionsIndexSchema = z.object({
  version: z.string().default('1.0.0'),
  sessions: z.array(SessionInfoSchema),
  updatedAt: z.string(),
});

export type SessionsIndex = z.infer<typeof SessionsIndexSchema>;

/**
 * Session 创建选项
 */
export interface SessionCreateOptions {
  sessionId?: string;
  sessionsDir?: string;
  model?: string;
}

/**
 * 从消息中提取标题（截断到 TITLE_MAX_LENGTH）
 */
export function extractTitleFromMessage(message: Message): string {
  const text = message.content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join(' ');

  if (text.length <= TITLE_MAX_LENGTH) {
    return text;
  }

  return text.substring(0, TITLE_MAX_LENGTH - 3) + '...';
}
