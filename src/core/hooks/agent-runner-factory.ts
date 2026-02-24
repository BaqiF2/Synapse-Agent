/**
 * Agent Runner Factory — 延迟创建 AgentRunner 实例的工厂
 *
 * 独立于 agent-runner.ts 模块，通过动态 import 延迟加载 AgentRunner 类。
 * 用于 skill-enhance-hook 等需要创建 AgentRunner 但不能静态依赖的场景。
 *
 * 核心导出:
 * - createPreloadedAgentRunnerFactory: 异步创建可同步使用的 AgentRunnerFactory
 */

import type { AgentRunnerFactory } from '../sub-agents/sub-agent-types.ts';
import type { LLMClient } from '../../types/llm-client.ts';
import type { GenerateFunction, OnUsage } from '../../types/generate.ts';
import type { Toolset } from '../../types/toolset.ts';

interface FactoryDeps {
  client: LLMClient;
  generateFn: GenerateFunction;
  onUsage?: OnUsage;
}

/**
 * 异步创建 AgentRunnerFactory
 *
 * 内部动态 import AgentRunner 类，返回同步可调用的工厂函数。
 */
export async function createPreloadedAgentRunnerFactory(
  deps: FactoryDeps,
): Promise<AgentRunnerFactory> {
  const { AgentRunner } = await import('../agent/agent-runner.ts');

  return (params) =>
    new AgentRunner({
      client: deps.client,
      systemPrompt: params.systemPrompt,
      toolset: params.toolset as Toolset,
      generateFn: deps.generateFn,
      maxIterations: params.maxIterations,
      enableStopHooks: params.enableStopHooks,
      onToolCall: params.onToolCall,
      onToolResult: params.onToolResult,
      onUsage: deps.onUsage,
    });
}
