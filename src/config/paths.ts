/**
 * 文件功能说明：
 * - 该文件位于 `src/config/paths.ts`，主要负责 路径 相关实现。
 * - 模块归属 配置 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `getSynapseHome`
 * - `getSynapseSkillsDir`
 * - `getSynapseSessionsDir`
 * - `getSynapseBinDir`
 * - `getSynapseLogDir`
 *
 * 作用说明：
 * - `getSynapseHome`：用于读取并返回目标数据。
 * - `getSynapseSkillsDir`：用于读取并返回目标数据。
 * - `getSynapseSessionsDir`：用于读取并返回目标数据。
 * - `getSynapseBinDir`：用于读取并返回目标数据。
 * - `getSynapseLogDir`：用于读取并返回目标数据。
 */

import * as path from 'node:path';
import * as os from 'node:os';

/** Synapse 配置根目录名 */
const SYNAPSE_DIR_NAME = '.synapse';

/**
 * 获取 Synapse 主目录
 *
 * 支持通过 SYNAPSE_HOME 环境变量覆盖
 */
export function getSynapseHome(): string {
  return process.env.SYNAPSE_HOME || path.join(os.homedir(), SYNAPSE_DIR_NAME);
}

/**
 * 获取技能目录
 *
 * 支持通过 SYNAPSE_META_SKILLS_DIR 环境变量覆盖
 */
export function getSynapseSkillsDir(): string {
  return process.env.SYNAPSE_META_SKILLS_DIR || path.join(getSynapseHome(), 'skills');
}

/**
 * 获取会话目录
 *
 * 支持通过 SYNAPSE_SESSIONS_DIR 环境变量覆盖
 */
export function getSynapseSessionsDir(): string {
  return process.env.SYNAPSE_SESSIONS_DIR || path.join(getSynapseHome(), 'sessions');
}

/**
 * 获取可执行脚本目录
 */
export function getSynapseBinDir(): string {
  return path.join(getSynapseHome(), 'bin');
}

/**
 * 获取日志目录
 *
 * 支持通过 SYNAPSE_LOG_DIR 环境变量覆盖
 */
export function getSynapseLogDir(): string {
  return process.env.SYNAPSE_LOG_DIR || path.join(getSynapseHome(), 'logs');
}
