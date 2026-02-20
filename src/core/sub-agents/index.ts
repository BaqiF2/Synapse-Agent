/**
 * Sub Agents 模块
 *
 * 功能：导出 Sub Agent 相关的类型、配置和执行器
 *
 * 核心导出：
 * - SubAgentExecutor: 新版 SubAgent 执行器（基于 runAgentLoop + EventStream）
 * - SubAgentManager: Sub Agent 管理器（旧版，基于 AgentRunner，将废弃）
 * - createSubAgent / filterToolsByPermissions / callableToolToAgentTool: SubAgent 核心函数
 * - SubAgentType: Sub Agent 类型
 * - TaskCommandParams: Task 命令参数
 * - configs: Sub Agent 配置集合
 */

export * from './sub-agent-types.ts';
export * from './sub-agent-manager.ts';
export * from './sub-agent-core.ts';
export * from './configs/index.ts';
