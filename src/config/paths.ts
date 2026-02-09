/**
 * Synapse 路径常量
 *
 * 功能：集中定义 ~/.synapse/ 下的目录路径常量，
 *       消除各模块中重复的路径构造逻辑。所有路径均支持环境变量覆盖。
 *
 * 核心导出：
 * - SYNAPSE_HOME: Synapse 主目录（~/.synapse）
 * - SYNAPSE_SKILLS_DIR: 技能目录（~/.synapse/skills）
 * - SYNAPSE_SESSIONS_DIR: 会话目录（~/.synapse/sessions）
 * - SYNAPSE_BIN_DIR: 可执行脚本目录（~/.synapse/bin）
 * - SYNAPSE_LOG_DIR: 日志目录（~/.synapse/logs）
 * - getSynapseHome: 动态获取 SYNAPSE_HOME（支持运行时 homedir 变更）
 * - getSynapseSkillsDir: 动态获取技能目录
 * - getSynapseSessionsDir: 动态获取会话目录
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
