/**
 * Sub Agents 模块
 *
 * 功能：导出 Sub Agent 相关的类型、配置和管理器
 *
 * 核心导出：
 * - SubAgentManager: Sub Agent 管理器（旧版，基于 AgentRunner）
 * - createSubAgent / filterToolsByPermissions: 新版 SubAgent 核心（基于 AgentConfig + runAgentLoop）
 * - SubAgentType: Sub Agent 类型
 * - TaskCommandParams: Task 命令参数
 * - configs: Sub Agent 配置集合
 */

export * from './sub-agent-types.ts';
export * from './sub-agent-manager.ts';
export * from './sub-agent-core.ts';
export * from './configs/index.ts';
