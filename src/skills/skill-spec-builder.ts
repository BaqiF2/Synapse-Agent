/**
 * Skill Spec Builder - 从对话分析构建技能规格
 *
 * 负责从 ConversationAnalysis 生成 SkillSpec，包括快速开始、执行步骤、最佳实践等。
 * 同时包含 LLM 增强解析逻辑。
 *
 * @module skill-spec-builder
 *
 * Core Exports:
 * - buildSkillSpec: 从分析结果构建完整技能规格
 * - generateQuickStart: 生成快速开始文档
 * - generateExecutionSteps: 从对话轮次生成执行步骤
 * - generateBestPractices: 生成最佳实践建议
 * - generateUpdates: 生成现有技能的更新内容
 * - parseEnhancementsFromLLM: 从 LLM 响应解析增强字段
 */

import type { ConversationAnalysis } from './skill-enhancer.ts';
import type { ConversationTurn } from './conversation-reader.ts';
import type { SkillSpec } from './skill-generator.ts';

/** 快速开始中展示的最大工具数 */
const MAX_QUICKSTART_TOOLS = 5;
/** 执行步骤的最大数量 */
const MAX_EXECUTION_STEPS = 10;
/** 触发"拆分为小步骤"建议的工具调用阈值 */
const COMPLEX_TASK_TOOL_THRESHOLD = 5;
/** 触发"验证中间结果"建议的工具种类阈值 */
const DIVERSE_TOOLS_THRESHOLD = 3;

/**
 * 从对话分析构建完整技能规格
 *
 * @param analysis - 对话分析结果
 * @param name - 技能名称
 * @returns 完整的技能规格
 */
export function buildSkillSpec(analysis: ConversationAnalysis, name: string): SkillSpec {
  const { summary, toolSequence, turns } = analysis;

  // 从第一个用户消息提取意图
  const firstUserTurn = turns.find(t => t.role === 'user');
  const intent = firstUserTurn?.content || 'Complete the task';

  // 生成描述
  const description = `${intent}. Uses ${summary.uniqueTools.join(', ')} tools.`;

  return {
    name,
    description,
    quickStart: generateQuickStart(toolSequence),
    executionSteps: generateExecutionSteps(turns),
    bestPractices: generateBestPractices(analysis),
    examples: [],
    domain: 'general',
    version: '1.0.0',
  };
}

/**
 * 从工具序列生成快速开始文档
 *
 * @param toolSequence - 工具调用名称序列
 * @returns Markdown 格式的快速开始代码块
 */
export function generateQuickStart(toolSequence: string[]): string {
  const uniqueTools = [...new Set(toolSequence)];
  const lines = ['```bash'];

  for (const tool of uniqueTools.slice(0, MAX_QUICKSTART_TOOLS)) {
    lines.push(`${tool} <args>`);
  }

  lines.push('```');
  return lines.join('\n');
}

/**
 * 从对话轮次生成执行步骤
 *
 * @param turns - 对话轮次列表
 * @returns 去重后的执行步骤数组
 */
export function generateExecutionSteps(turns: ConversationTurn[]): string[] {
  const steps: string[] = [];

  for (const turn of turns) {
    if (turn.role === 'assistant' && turn.toolCalls) {
      for (const call of turn.toolCalls) {
        steps.push(`Use ${call.name} to process data`);
      }
    }
  }

  return [...new Set(steps)].slice(0, MAX_EXECUTION_STEPS);
}

/**
 * 根据对话分析生成最佳实践建议
 *
 * @param analysis - 对话分析结果
 * @returns 最佳实践建议数组
 */
export function generateBestPractices(analysis: ConversationAnalysis): string[] {
  const practices: string[] = [];

  if (analysis.summary.toolCalls > COMPLEX_TASK_TOOL_THRESHOLD) {
    practices.push('Break complex tasks into smaller steps');
  }

  if (analysis.summary.uniqueTools.length > DIVERSE_TOOLS_THRESHOLD) {
    practices.push('Verify intermediate results before proceeding');
  }

  return practices;
}

/**
 * 生成现有技能的更新内容
 *
 * @param analysis - 对话分析结果
 * @returns 技能规格的部分更新
 */
export function generateUpdates(analysis: ConversationAnalysis): Partial<SkillSpec> {
  return {
    executionSteps: generateExecutionSteps(analysis.turns),
    bestPractices: generateBestPractices(analysis),
  };
}

/**
 * 从 LLM 响应文本中解析增强字段
 *
 * 支持带有 markdown code fence 的 JSON 格式
 *
 * @param text - LLM 响应文本
 * @returns 解析出的技能规格部分字段
 */
export function parseEnhancementsFromLLM(text: string): Partial<SkillSpec> {
  // 尝试提取 JSON（处理可能的 markdown code fences）
  let jsonStr = text.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch && fenceMatch[1]) {
    jsonStr = fenceMatch[1].trim();
  }

  const parsed = JSON.parse(jsonStr);

  return {
    description: typeof parsed.description === 'string' ? parsed.description : undefined,
    executionSteps: Array.isArray(parsed.executionSteps) ? parsed.executionSteps : undefined,
    bestPractices: Array.isArray(parsed.bestPractices) ? parsed.bestPractices : undefined,
  };
}
