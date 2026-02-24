/**
 * Explore Sub Agent 配置
 *
 * 功能：定义 Explore 类型 Sub Agent 的配置
 * 系统提示词从 explore.md 文件加载。
 *
 * 核心导出：
 * - exploreConfig: Explore Sub Agent 配置对象
 */

import * as path from 'node:path';
import type { SubAgentConfig } from '../sub-agent-types.ts';
import { loadDesc } from '../../../shared/load-desc.js';

/**
 * Explore Sub Agent 配置
 *
 * 工具权限：除 task:*、edit、write 外全部
 */
export const exploreConfig: SubAgentConfig = {
  type: 'explore',
  permissions: {
    include: 'all',
    exclude: ['task:', 'edit', 'write'],
  },
  systemPrompt: loadDesc(path.join(import.meta.dirname, 'explore.md')),
};
