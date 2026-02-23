/**
 * General Sub Agent 配置
 *
 * 功能：定义 General 类型 Sub Agent 的配置
 * 系统提示词从 general.md 文件加载。
 *
 * 核心导出：
 * - generalConfig: General Sub Agent 配置对象
 */

import * as path from 'node:path';
import type { SubAgentConfig } from '../sub-agent-types.ts';
import { loadDesc } from '../../../shared/load-desc.js';

/**
 * General Sub Agent 配置
 *
 * 工具权限：除 task:* 外全部命令可用（防止递归）
 */
export const generalConfig: SubAgentConfig = {
  type: 'general',
  permissions: {
    include: 'all',
    exclude: ['task:'],
  },
  systemPrompt: loadDesc(path.join(import.meta.dirname, 'general.md')),
};
