/**
 * SubAgent Core — 基于 Agent Core 接口的 SubAgent 创建与工具权限过滤。
 * 使用 AgentConfig + runAgentLoop + EventStream 创建独立的 SubAgent 实例。
 *
 * 核心导出:
 * - createSubAgent: 创建 SubAgent，返回 EventStream 和 AgentConfig
 * - SubAgentExecutor: ISubAgentExecutor 实现，封装 runAgentLoop + EventStream 消费
 * - filterToolsByPermissions: 根据 ToolPermissions 过滤 AgentTool 列表
 * - callableToolToAgentTool: CallableTool → AgentTool 适配器
 * - SubAgentOptions: SubAgent 创建选项
 * - TOOL_PERMISSION_MAP: 不同 SubAgent 类型的工具权限映射
 */

import { runAgentLoop } from '../agent/agent-loop.ts';
import type { EventStream } from '../event-stream.ts';
import type { AgentTool, LLMProviderLike } from '../types.ts';
import type { AgentLoopConfig } from '../agent/agent-loop-config.ts';
import { MAX_TOOL_ITERATIONS } from '../../shared/constants.ts';
import type {
  SubAgentType,
  TaskCommandParams,
  ToolPermissions,
  ISubAgentExecutor,
} from './sub-agent-types.ts';
import { getConfig } from './configs/index.ts';
import { createLogger } from '../../shared/file-logger.ts';
import { isAbortError } from '../../shared/abort.ts';

/**
 * CallableTool 最小抽象接口 — 用于 callableToolToAgentTool 适配。
 * 避免 core → tools 的静态依赖。
 */
interface ICallableTool {
  readonly toolDefinition: {
    readonly name: string;
    readonly description: string;
    readonly input_schema: Record<string, unknown>;
  };
  call(input: unknown): Promise<{ output: string; isError: boolean }>;
}

const logger = createLogger('sub-agent-executor');

/** 默认滑动窗口大小 */
const DEFAULT_FAILURE_WINDOW_SIZE = parseInt(
  process.env.SYNAPSE_FAILURE_WINDOW_SIZE ?? '10',
  10,
);

/** 默认失败阈值 */
const DEFAULT_FAILURE_THRESHOLD = parseInt(
  process.env.SYNAPSE_FAILURE_THRESHOLD ?? '3',
  10,
);

/**
 * 不同 SubAgent 类型的工具权限映射。
 * - explore: 只读工具（排除 write、edit、task）
 * - general: 全部工具（排除 task 防止递归）
 * - skill: 根据 action 动态配置（此处使用 enhance 默认）
 */
export const TOOL_PERMISSION_MAP: Record<SubAgentType, ToolPermissions> = {
  explore: {
    include: 'all',
    exclude: ['write', 'edit', 'task'],
  },
  general: {
    include: 'all',
    exclude: ['task'],
  },
  skill: {
    include: 'all',
    exclude: ['task'],
  },
};

/** SubAgent 创建选项 */
export interface SubAgentOptions {
  /** SubAgent 类型 */
  type: SubAgentType;
  /** LLM Provider（与父 Agent 共享） */
  provider: LLMProviderLike;
  /** 父 Agent 的工具集 */
  parentTools: AgentTool[];
  /** 系统提示词 */
  systemPrompt: string;
  /** 用户消息 */
  userMessage: string;
  /** 最大迭代次数（可选，默认使用全局常量） */
  maxIterations?: number;
  /** 中止信号（可选，用于超时控制） */
  abortSignal?: AbortSignal;
  /** 自定义工具权限（可选，默认根据 type 查找 TOOL_PERMISSION_MAP） */
  permissions?: ToolPermissions;
}

/** createSubAgent 的返回值 */
export interface SubAgentResult {
  /** 事件流（供父 Agent 迭代消费） */
  stream: EventStream;
  /** 使用的 AgentLoopConfig（可用于调试和断言） */
  config: AgentLoopConfig;
}

/**
 * 根据 ToolPermissions 过滤 AgentTool 列表。
 *
 * - include='all': 使用所有工具，然后应用 exclude 排除列表
 * - include=[]: 不允许任何工具
 * - include=['name1','name2']: 只包含指定工具
 *
 * exclude 使用前缀匹配（如 'task' 会排除 'task', 'task:explore' 等）
 */
export function filterToolsByPermissions(
  tools: AgentTool[],
  permissions: ToolPermissions,
): AgentTool[] {
  // include 为空数组时不允许任何工具
  if (Array.isArray(permissions.include) && permissions.include.length === 0) {
    return [];
  }

  let filtered: AgentTool[];

  if (permissions.include === 'all') {
    filtered = [...tools];
  } else {
    // 只包含指定名称的工具
    const includeSet = new Set(permissions.include);
    filtered = tools.filter((t) => includeSet.has(t.name));
  }

  // 应用 exclude 排除列表（前缀匹配）
  if (permissions.exclude.length > 0) {
    filtered = filtered.filter((tool) =>
      !permissions.exclude.some((pattern) => tool.name.startsWith(pattern)),
    );
  }

  return filtered;
}

/**
 * 创建 SubAgent 实例。
 *
 * 使用 AgentConfig + runAgentLoop 创建独立的 SubAgent：
 * - 共享父 Agent 的 LLMProvider
 * - 根据 SubAgent 类型过滤工具权限
 * - 产生独立的 EventStream
 * - 支持通过 AbortSignal 超时中止
 */
export function createSubAgent(options: SubAgentOptions): SubAgentResult {
  const {
    type,
    provider,
    parentTools,
    systemPrompt,
    userMessage,
    maxIterations = MAX_TOOL_ITERATIONS,
    abortSignal,
    permissions,
  } = options;

  // 根据类型获取工具权限，支持自定义覆盖
  const toolPermissions = permissions ?? TOOL_PERMISSION_MAP[type];

  // 过滤工具
  const filteredTools = filterToolsByPermissions(parentTools, toolPermissions);

  // 构建 AgentLoopConfig
  const config: AgentLoopConfig = {
    provider,
    tools: filteredTools,
    systemPrompt,
    maxIterations,
    failureDetection: {
      strategy: 'sliding-window',
      windowSize: DEFAULT_FAILURE_WINDOW_SIZE,
      failureThreshold: DEFAULT_FAILURE_THRESHOLD,
    },
    abortSignal,
  };

  // 启动 Agent Loop，返回独立的 EventStream
  const stream = runAgentLoop(config, [{ type: 'text', text: userMessage }]);

  return { stream, config };
}

// ========== CallableTool → AgentTool 适配器 ==========

/**
 * 将 CallableTool 适配为 AgentTool 接口。
 *
 * 桥接旧版工具系统（CallableTool/ToolReturnValue）和新版 Agent Core（AgentTool/AgentToolResult），
 * 使 BashTool 等 CallableTool 实例可直接传入 runAgentLoop()。
 */
export function callableToolToAgentTool(tool: ICallableTool): AgentTool {
  const toolDef = tool.toolDefinition;
  return {
    name: toolDef.name,
    description: toolDef.description,
    inputSchema: toolDef.input_schema as Record<string, unknown>,
    async execute(input: unknown) {
      const result = await tool.call(input);
      return {
        output: result.output,
        isError: result.isError,
      };
    },
  };
}

// ========== SubAgentExecutor — ISubAgentExecutor 实现 ==========

/**
 * SubAgentExecutor 配置选项。
 *
 * 接受 LLMProviderLike + AgentTool[]（新版工具列表），
 * 或 toolFactory 工厂函数用于创建隔离工具实例。
 */
export interface SubAgentExecutorOptions {
  /** LLM Provider（与父 Agent 共享） */
  provider: LLMProviderLike;
  /** 父 Agent 的工具集（AgentTool 列表） */
  parentTools?: AgentTool[];
  /**
   * 工具工厂函数 — 创建 SubAgent 专用的隔离工具。
   * 每次 execute() 调用时调用此工厂，获取独立的工具实例和清理函数。
   * 用于 BashTool.createIsolatedCopy() 场景，保证 SubAgent 会话隔离。
   */
  toolFactory?: () => { tools: AgentTool[]; cleanup: () => void };
}

/**
 * 从 EventStream 消费所有事件，提取最终文本响应。
 *
 * 迭代完所有事件后，通过 stream.result 获取 AgentResult。
 * 优先使用 AgentResult.response，如为空则回退到收集的 message_delta 文本。
 */
async function consumeEventStream(stream: EventStream): Promise<string> {
  const textParts: string[] = [];

  for await (const event of stream) {
    if (event.type === 'message_delta') {
      textParts.push((event as { contentDelta: string }).contentDelta);
    }
  }

  const result = await stream.result;

  // 优先使用 AgentResult.response（已包含完整文本）
  if (result.response) {
    return result.response;
  }

  return textParts.join('');
}

/**
 * SubAgentExecutor — 基于 runAgentLoop() + EventStream 的 ISubAgentExecutor 实现。
 *
 * 替代旧版 SubAgentManager（基于 AgentRunner），统一到 Agent Core 架构。
 * 支持两种工具提供方式：
 * - parentTools: 直接传入 AgentTool 列表，通过 filterToolsByPermissions 过滤
 * - toolFactory: 工厂函数创建隔离工具实例（用于 BashTool.createIsolatedCopy 场景）
 */
export class SubAgentExecutor implements ISubAgentExecutor {
  private provider: LLMProviderLike;
  private parentTools: AgentTool[];
  private toolFactory?: () => { tools: AgentTool[]; cleanup: () => void };
  /** 全局计数器，用于生成唯一的 SubAgent ID */
  private subAgentCounter = 0;

  constructor(options: SubAgentExecutorOptions) {
    this.provider = options.provider;
    this.parentTools = options.parentTools ?? [];
    this.toolFactory = options.toolFactory;
  }

  /**
   * 执行 SubAgent 任务。
   *
   * 根据类型获取配置，构建工具集，通过 createSubAgent() 启动 Agent Loop，
   * 消费 EventStream 提取文本结果。支持 AbortSignal 中止控制。
   */
  async execute(
    type: SubAgentType,
    params: TaskCommandParams,
    options?: { signal?: AbortSignal },
  ): Promise<string> {
    const subAgentId = this.generateSubAgentId();
    const startTime = Date.now();

    logger.info('Executing sub agent task', {
      type,
      action: params.action,
      subAgentId,
      description: params.description,
    });

    // 获取类型配置（包含 systemPrompt、permissions、maxIterations）
    const config = await getConfig(type, params.action ?? undefined);

    // 获取工具集：优先使用 toolFactory（支持隔离），否则使用 parentTools
    let tools: AgentTool[];
    let cleanup: (() => void) | null = null;

    if (this.toolFactory) {
      const factory = this.toolFactory();
      tools = factory.tools;
      cleanup = factory.cleanup;
    } else {
      tools = this.parentTools;
    }

    // 按权限过滤工具
    const filteredTools = filterToolsByPermissions(tools, config.permissions);

    // 创建 SubAgent
    const { stream } = createSubAgent({
      type,
      provider: this.provider,
      parentTools: filteredTools,
      systemPrompt: config.systemPrompt,
      userMessage: params.prompt,
      maxIterations: config.maxIterations,
      abortSignal: options?.signal,
      // 权限已在上面过滤，传入 'all' 避免 createSubAgent 内部二次过滤
      permissions: { include: 'all', exclude: [] },
    });

    let result: string;
    try {
      result = await consumeEventStream(stream);
    } catch (err) {
      if (options?.signal?.aborted || isAbortError(err)) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      logger.error('Sub agent execution failed', { subAgentId, error: message });
      result = message;
    } finally {
      cleanup?.();
    }

    const duration = Date.now() - startTime;
    logger.info('Sub agent task completed', {
      type,
      subAgentId,
      duration,
      resultLength: result.length,
    });

    return result;
  }

  /**
   * 关闭执行器（预留扩展点，当前无需清理）
   */
  shutdown(): void {
    // 每次 execute 结束时 EventStream 和工具已自动清理
  }

  private generateSubAgentId(): string {
    this.subAgentCounter++;
    return `subagent-${this.subAgentCounter}-${Date.now()}`;
  }
}
