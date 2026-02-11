/**
 * 文件功能说明：
 * - 该文件位于 `src/agent/agent-runner.ts`，主要负责 Agent、运行 相关实现。
 * - 模块归属 Agent 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `AgentRunner`
 * - `AgentRunnerOptions`
 * - `AgentRunOptions`
 * - `SandboxPermissionRequest`
 * - `SandboxPermissionOption`
 * - `AgentRunnerStepResult`
 *
 * 作用说明：
 * - `AgentRunner`：封装该领域的核心流程与状态管理。
 * - `AgentRunnerOptions`：定义模块交互的数据结构契约。
 * - `AgentRunOptions`：定义模块交互的数据结构契约。
 * - `SandboxPermissionRequest`：定义模块交互的数据结构契约。
 * - `SandboxPermissionOption`：声明类型别名，约束输入输出类型。
 * - `AgentRunnerStepResult`：声明类型别名，约束输入输出类型。
 */

import type { LLMClient } from '../providers/llm-client.ts';
import { type OnToolCall, type OnToolResult, step as runAgentStep } from './step.ts';
import { type OnMessagePart, type OnUsage } from '../providers/generate.ts';
import {
  createTextMessage, extractText,
  type Message, type ToolCall, type ToolResult as MessageToolResult,
  toolResultToMessage,
} from '../providers/message.ts';
import type { Toolset } from '../tools/toolset.ts';
import { EventEmitter } from 'node:events';
import * as path from 'node:path';
import { createLogger } from '../utils/logger.ts';
import { parseEnvInt, parseEnvPositiveInt } from '../utils/env.ts';
import { Session } from './session.ts';
import type { SessionUsage } from './session-usage.ts';
import type { TokenUsage } from '../providers/anthropic/anthropic-types.ts';
import { shouldCountToolFailure } from '../tools/tool-failure.ts';
import { countMessageTokens } from '../utils/token-counter.ts';
import { sanitizeToolProtocolHistory } from './history-sanitizer.ts';

import {
  ContextOrchestrator,
  type AgentRunnerContextOptions, type ContextStats,
  type OffloadEventPayload, type CompactEventPayload,
} from './context-orchestrator.ts';
import type { CompactResult } from './context-compactor.ts';
import { StopHookExecutor } from './stop-hook-executor.ts';

// 重新导出上下文相关类型（保持外部 API 兼容）
export type { AgentRunnerContextOptions, ContextStats, OffloadEventPayload, CompactEventPayload };

const logger = createLogger('agent-runner');

const DEFAULT_MAX_ITERATIONS = parseEnvInt(process.env.SYNAPSE_MAX_TOOL_ITERATIONS, 50);
const DEFAULT_MAX_CONSECUTIVE_TOOL_FAILURES = parseEnvPositiveInt(
  process.env.SYNAPSE_MAX_CONSECUTIVE_TOOL_FAILURES, 3
);

/** AgentRunner 配置选项 */
interface AgentRunnerBaseOptions {
  client: LLMClient;
  systemPrompt: string;
  toolset: Toolset;
  maxIterations?: number;
  maxConsecutiveToolFailures?: number;
  onMessagePart?: OnMessagePart;
  onToolCall?: OnToolCall;
  onToolResult?: OnToolResult;
  onUsage?: OnUsage;
  enableStopHooks?: boolean;
  context?: AgentRunnerContextOptions;
}

export interface AgentRunnerSessionRef {
  sessionId?: string;
  sessionsDir?: string;
}

export type AgentRunnerSessionOptions =
  | {
    session: Session;
    sessionRef?: never;
  }
  | {
    session?: never;
    sessionRef?: AgentRunnerSessionRef;
  };

export type AgentRunnerOptions = AgentRunnerBaseOptions & AgentRunnerSessionOptions;

export interface AgentRunOptions {
  signal?: AbortSignal;
}

export type SandboxPermissionOption = 'allow_once' | 'allow_session' | 'allow_permanent' | 'deny';

export interface SandboxPermissionRequest {
  type: 'sandbox_access';
  resource: string;
  reason: string;
  command: string;
  options: SandboxPermissionOption[];
}

export type AgentRunnerStepResult =
  | { status: 'completed'; response: string }
  | { status: 'requires_permission'; permission: SandboxPermissionRequest };

interface SandboxAwareBashTool {
  call(args: unknown): Promise<{ output: string; message: string; extras?: Record<string, unknown> }>;
  executeUnsandboxed(command: string, cwd?: string): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    blocked: boolean;
  }>;
  allowSession(resourcePath: string, cwd?: string): Promise<void>;
  allowPermanent(resourcePath: string, cwd?: string): Promise<void>;
}

/**
 * AgentRunner - Agent Loop implementation using step()
 */
export class AgentRunner extends EventEmitter {
  private client: LLMClient;
  private systemPrompt: string;
  private toolset: Toolset;
  private maxIterations: number;
  private maxConsecutiveToolFailures: number;
  private onMessagePart?: OnMessagePart;
  private onToolCall?: OnToolCall;
  private onToolResult?: OnToolResult;
  private onUsage?: OnUsage;
  private session: Session | null = null;
  private sessionId?: string;
  private sessionsDir?: string;
  private shouldPersistSession = false;
  private sessionInitialized = false;
  private history: Message[] = [];
  private contextOrchestrator: ContextOrchestrator;
  private stopHookExecutor: StopHookExecutor;
  private pendingSandboxPermission: SandboxPermissionRequest | null = null;

  /**
   * 方法说明：注入模型客户端、工具集、会话与上下文组件，并初始化运行状态。
   * @param options 配置参数。
   */
  constructor(options: AgentRunnerOptions) {
    super();
    if (options.session && options.sessionRef) {
      throw new Error('Cannot provide both session and sessionRef');
    }

    this.client = options.client;
    this.systemPrompt = options.systemPrompt;
    this.toolset = options.toolset;
    this.maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    this.maxConsecutiveToolFailures =
      options.maxConsecutiveToolFailures ?? DEFAULT_MAX_CONSECUTIVE_TOOL_FAILURES;
    this.onMessagePart = options.onMessagePart;
    this.onToolCall = options.onToolCall;
    this.onToolResult = options.onToolResult;
    this.onUsage = options.onUsage;
    this.session = options.session ?? null;
    this.sessionId = options.sessionRef?.sessionId ?? options.session?.id;
    this.sessionsDir = options.sessionRef?.sessionsDir;
    this.shouldPersistSession = Boolean(options.session || options.sessionRef?.sessionId || options.sessionRef?.sessionsDir);
    this.contextOrchestrator = new ContextOrchestrator({
      client: options.client,
      context: options.context,
    });
    this.stopHookExecutor = new StopHookExecutor({
      enabled: options.enableStopHooks ?? true,
      onMessagePart: options.onMessagePart,
    });
  }

  /**
   * 方法说明：返回当前会话 ID；未初始化会话时返回 null。
   */
  getSessionId(): string | null { return this.session?.id ?? null; }
  /**
   * 方法说明：返回当前内存中的消息历史（只读视图）。
   */
  getHistory(): readonly Message[] { return this.history; }
  /**
   * 方法说明：返回当前会话累计用量；未启用会话持久化时返回 null。
   */
  getSessionUsage(): SessionUsage | null { return this.session?.getUsage() ?? null; }
  /**
   * 方法说明：返回当前 Agent 使用的模型名称。
   */
  getModelName(): string { return this.client.modelName; }
  /**
   * 方法说明：清空内存中的消息历史，不触发会话文件写入。
   */
  clearHistory(): void { this.history = []; }

  /**
   * 方法说明：调用 Bash 工具执行命令，清理自描述提示后拼接并返回可读输出。
   * @param command 要执行的 Bash 命令文本。
   * @param restart 是否在执行前重建 Bash 会话。
   */
  async executeBashCommand(command: string, restart: boolean = false): Promise<string> {
    const bashTool = this.toolset.getTool?.('Bash');
    if (!bashTool) {
      throw new Error('Bash tool is unavailable');
    }

    const result = await bashTool.call({ command, restart });
    const parts = [
      this.stripToolSelfDescriptionHint(result.output),
      this.stripToolSelfDescriptionHint(result.message),
    ].filter((value) => value.trim().length > 0);
    return parts.join('\n\n') || '(Command executed successfully with no output)';
  }

  /**
   * 方法说明：对外暴露的用量记录入口，内部委托给统一的用量处理流程。
   * @param usage 本次模型调用产生的 token 用量。
   * @param model 本次调用对应的模型名称。
   */
  async recordUsage(usage: TokenUsage, model: string): Promise<void> {
    await this.handleUsage(usage, model);
  }

  /**
   * 方法说明：返回上下文统计；当内存历史为空但会话存在时会先懒加载历史。
   */
  getContextStats(): ContextStats | null {
    if (!this.session) return null;
    if (this.history.length === 0 && this.session.messageCount > 0) {
      this.history = this.session.loadHistorySync();
    }
    return this.contextOrchestrator.getContextStats(
      this.history, this.session.countOffloadedFiles()
    );
  }

  /**
   * 方法说明：清空内存历史并删除当前会话持久化内容。
   */
  async clearSession(): Promise<void> {
    this.history = [];
    if (this.session) {
      await this.session.clear();
      logger.info(`Cleared session history: ${this.session.id}`);
    }
  }

  /**
   * 方法说明：强制执行上下文压缩；压缩成功后回写会话历史并发送 compact 事件。
   */
  async forceCompact(): Promise<CompactResult> {
    await this.initSession();
    if (!this.session) {
      const previousTokens = countMessageTokens(this.history);
      return {
        messages: [...this.history], previousTokens, currentTokens: previousTokens,
        freedTokens: 0, deletedFiles: [], success: true,
        preservedCount: Math.min(this.history.length, this.contextOrchestrator.compactPreserveCount),
      };
    }
    const result = await this.contextOrchestrator.forceCompact(
      this.history, this.session.offloadSessionDir
    );
    if (result.success) {
      this.history = result.messages;
      await this.session.rewriteHistory(this.history);
      this.emit('compact', this.contextOrchestrator.buildCompactPayload(result));
    }
    return result;
  }

  /** Run the Agent Loop for a user message
   * @param userMessage 消息内容。
   * @param options 配置参数。
   */
  async run(userMessage: string, options?: AgentRunOptions): Promise<string> {
    // 执行 Agent 循环
    const runResult = await this.runWithPotentialPermission(userMessage, options);
    // 如果循环因沙箱拦截而提前退出，直接返回拦截原因文本，跳过 stop hooks。
    if (runResult.permissionRequest) {
      return runResult.finalResponse;
    }

    // 仅当循环正常完成（completedNormally === true，即 LLM 自行停止无工具调用）且 stop hooks 已启用时，将 hook 的输出追加到最终响应后返回
    if (runResult.completedNormally && this.stopHookExecutor.shouldExecute()) {
      return this.stopHookExecutor.executeAndAppend(runResult.finalResponse, {
        sessionId: this.getSessionId(), history: this.history,
      });
    }
    return runResult.finalResponse;
  }

  /**
   * 方法说明：执行一次运行并返回结构化状态；若命中沙箱拦截则返回权限请求。
   * @param userMessage 消息内容。
   * @param options 配置参数。
   */
  async step(userMessage: string, options?: AgentRunOptions): Promise<AgentRunnerStepResult> {
    const runResult = await this.runWithPotentialPermission(userMessage, options);
    if (runResult.permissionRequest) {
      return {
        status: 'requires_permission',
        permission: runResult.permissionRequest,
      };
    }

    return {
      status: 'completed',
      response: runResult.finalResponse,
    };
  }

  /**
   * 方法说明：返回当前待处理的沙箱权限请求。
   */
  getPendingSandboxPermission(): SandboxPermissionRequest | null {
    return this.pendingSandboxPermission;
  }

  /**
   * 方法说明：处理用户的沙箱授权决策，并在允许时重试被拦截命令。
   * @param option 用户选择的授权策略（一次/会话/永久/拒绝）。
   */
  async resolveSandboxPermission(option: SandboxPermissionOption): Promise<string> {
    const pending = this.pendingSandboxPermission;
    if (!pending) {
      throw new Error('No pending sandbox permission request');
    }

    const bashTool = this.toolset.getTool?.('Bash') as unknown as SandboxAwareBashTool | undefined;
    if (!bashTool) {
      throw new Error('Bash tool is unavailable for sandbox permission handling');
    }

    const cwd = process.cwd();
    const resourceForWhitelist = this.toWhitelistPath(pending.resource);
    this.pendingSandboxPermission = null;

    if (option === 'deny') {
      return `User denied access to ${pending.resource}`;
    }

    if (option === 'allow_once') {
      const result = await bashTool.executeUnsandboxed(pending.command, cwd);
      return this.formatExecuteResult(result.stdout, result.stderr, result.exitCode);
    }

    if (option === 'allow_session') {
      await bashTool.allowSession(resourceForWhitelist, cwd);
      return this.retryBlockedCommand(bashTool, pending.command);
    }

    await bashTool.allowPermanent(resourceForWhitelist, cwd);
    return this.retryBlockedCommand(bashTool, pending.command);
  }

  /**
   * 方法说明：完成运行前准备（会话初始化、hook 初始化、历史修复）并进入主循环。
   * @param userMessage 消息内容。
   * @param options 配置参数。
   */
  private async runWithPotentialPermission(
    userMessage: string,
    options?: AgentRunOptions
  ): Promise<{ finalResponse: string; completedNormally: boolean; permissionRequest?: SandboxPermissionRequest }> {
    const signal = options?.signal;

    await this.initSession();
    await this.stopHookExecutor.init();

    await this.appendToHistory(createTextMessage('user', userMessage));

    return this.executeLoop(signal);
  }

  // --- Private: Agent loop ---

  /**
   * 方法说明：主循环执行 step 与工具调用，直到自然完成、触发权限拦截或达到停止条件。
   * @param signal 外部取消信号，用于中断当前运行。
   */
  private async executeLoop(signal?: AbortSignal): Promise<{
    finalResponse: string; completedNormally: boolean; permissionRequest?: SandboxPermissionRequest;
  }> {
    let iteration = 0;
    let consecutiveFailures = 0;

    while (iteration < this.maxIterations) {
      await this.sanitizeHistoryIfNeeded();
      await this.offloadHistoryIfNeeded();

      iteration++;
      logger.info('Agent loop iteration', { iteration });

      const result = await runAgentStep(this.client, this.systemPrompt, this.toolset, this.history, {
        onMessagePart: this.onMessagePart,
        onToolCall: this.onToolCall,
        onToolResult: this.onToolResult,
        onUsage: (usage, model) => this.handleUsage(usage, model),
        signal,
      });

      // 无工具调用 — 检查是否可以停止
      if (result.toolCalls.length === 0) {
        await this.appendToHistory(result.message);
        if ((result.message.toolCalls?.length ?? 0) > 0) {
          await this.sanitizeHistoryIfNeeded();
          continue;
        }
        const finalResponse = extractText(result.message);
        logger.info(`Agent loop completed, no tool calls，messages : ${finalResponse}`);
        return { finalResponse, completedNormally: true };
      }

      // 等待并记录工具执行结果
      const toolResults = await result.toolResults();
      await this.appendToHistory(result.message);
      for (const tr of toolResults) {
        await this.appendToHistory(toolResultToMessage(tr));
      }
      await this.sanitizeHistoryIfNeeded();

      // 构建沙盒访问请求
      const permissionRequest = this.buildSandboxPermissionRequest(result.toolCalls, toolResults);
      if (permissionRequest) {
        this.pendingSandboxPermission = permissionRequest;
        return {
          finalResponse: permissionRequest.reason,
          completedNormally: false,
          permissionRequest,
        };
      }

      consecutiveFailures = this.updateConsecutiveFailures(toolResults, consecutiveFailures);
      if (consecutiveFailures >= this.maxConsecutiveToolFailures) {
        return { finalResponse: 'Consecutive tool execution failures; stopping.', completedNormally: false };
      }
    }

    const stopMessage = `Reached tool iteration limit (${this.maxIterations}); stopping.`;
    await this.appendToHistory(createTextMessage('assistant', stopMessage));
    logger.warn(stopMessage);
    return { finalResponse: stopMessage, completedNormally: false };
  }

  /**
   * 方法说明：从工具结果中识别首个 sandbox_blocked 事件，并组装为可交互的权限请求。
   * @param toolCalls 本轮模型发起的工具调用列表，用于反查被拦截命令。
   * @param toolResults 本轮工具执行结果列表，用于定位沙箱拦截信息。
   */
  private buildSandboxPermissionRequest(
    toolCalls: ToolCall[],
    toolResults: MessageToolResult[]
  ): SandboxPermissionRequest | null {
    for (const tr of toolResults) {
      const extras = tr.returnValue.extras as Record<string, unknown> | undefined;
      if (extras?.type !== 'sandbox_blocked') {
        continue;
      }

      const resource = typeof extras.resource === 'string' ? extras.resource : 'unknown-resource';
      const reason = tr.returnValue.message.length > 0
        ? tr.returnValue.message
        : 'Sandbox blocked command execution';
      const command = this.extractCommandFromToolCall(toolCalls, tr.toolCallId);

      return {
        type: 'sandbox_access',
        resource,
        reason,
        command,
        options: ['allow_once', 'allow_session', 'allow_permanent', 'deny'],
      };
    }

    return null;
  }

  /**
   * 方法说明：按 toolCallId 查找对应 Bash 调用并解析 command 字段；失败时返回空字符串。
   * @param toolCalls 本轮工具调用列表。
   * @param toolCallId 目标工具调用 ID。
   */
  private extractCommandFromToolCall(toolCalls: ToolCall[], toolCallId: string): string {
    const call = toolCalls.find((item) => item.id === toolCallId);
    if (!call || call.name !== 'Bash') {
      return '';
    }

    try {
      const parsed = JSON.parse(call.arguments) as { command?: unknown };
      return typeof parsed.command === 'string' ? parsed.command : '';
    } catch {
      return '';
    }
  }

  /**
   * 方法说明：将拦截资源收敛为可授权路径：文件映射到父目录，目录或根路径保持不变。
   * @param resource 沙箱拦截返回的资源路径。
   */
  private toWhitelistPath(resource: string): string {
    if (!resource || resource === '/' || resource.endsWith('/')) {
      return resource;
    }
    return path.dirname(resource);
  }

  /**
   * 方法说明：在授权完成后重试原命令，并将工具输出格式化为最终文本。
   * @param bashTool 支持沙箱授权能力的 Bash 工具实例。
   * @param command 需要重试的原始命令。
   */
  private async retryBlockedCommand(
    bashTool: SandboxAwareBashTool,
    command: string
  ): Promise<string> {
    const result = await bashTool.call({ command });
    const output = [result.output, result.message].filter((item) => item && item.length > 0).join('\n\n');
    return output || '(Command executed successfully with no output)';
  }

  /** 格式化命令执行结果 */
  private formatExecuteResult(stdout: string, stderr: string, exitCode: number): string {
    const parts = [
      stdout,
      stderr ? `[stderr]\n${stderr}` : '',
    ].filter(Boolean);
    return parts.join('\n\n') || `(Command exited with code ${exitCode})`;
  }

  /**
   * 方法说明：移除工具输出中的自描述提示段，避免把内部提示词回显给用户。
   * @param value 工具返回的原始文本。
   */
  private stripToolSelfDescriptionHint(value?: string): string {
    if (!value) return '';

    const marker = 'Self-description:';
    const markerIndex = value.indexOf(marker);
    if (markerIndex === -1) {
      return value;
    }

    return value.slice(0, markerIndex).trimEnd();
  }


  /** 更新连续失败计数：单次遍历分类失败结果，返回新的连续计数 */
  private updateConsecutiveFailures(
    toolResults: MessageToolResult[], previousFailures: number
  ): number {
    const failures: MessageToolResult[] = [];
    const countable: MessageToolResult[] = [];

    for (const r of toolResults) {
      if (!r.returnValue.isError) continue;
      failures.push(r);
      if (this.shouldCountFailure(r)) countable.push(r);
    }

    if (failures.length === 0) return 0;

    // 有可计数失败 → 递增；仅 execution_error → 重置（LLM 在正常尝试，非困惑循环）
    const next = countable.length > 0 ? previousFailures + 1 : 0;
    this.logToolFailures(failures, countable, next);
    return next;
  }

  /** 记录工具失败详情 */
  private logToolFailures(
    failures: MessageToolResult[], countable: MessageToolResult[], consecutiveCount: number
  ): void {
    logger.warn(
      `Tool execution failed (counted: ${countable.length}/${failures.length}, consecutive: ${consecutiveCount}/${this.maxConsecutiveToolFailures})`,
      {
        errors: failures.map((r) => ({
          toolCallId: r.toolCallId, message: r.returnValue.message,
          brief: r.returnValue.brief, output: r.returnValue.output,
          extras: r.returnValue.extras,
        })),
        countableFailureIds: countable.map((r) => r.toolCallId),
      }
    );
  }

  // --- Private: 历史管理 ---

  /**
   * 方法说明：将消息追加到内存历史，并在启用会话时同步写入持久化存储。
   * @param message 消息内容。
   */
  private async appendToHistory(message: Message): Promise<void> {
    this.history.push(message);
    if (this.session) await this.session.appendMessage(message);
  }


  // --- Private: Session 管理 ---

  /**
   * 初始化会话：通过 Session.resolve 执行 find-or-create，并加载历史消息。
   */
  private async initSession(): Promise<void> {
    if (this.sessionInitialized) return;
    if (!this.shouldPersistSession) { this.sessionInitialized = true; return; }
    if (this.session) {
      this.history = await this.session.loadHistory();
      await this.sanitizeHistoryIfNeeded();
      this.sessionInitialized = true;
      return;
    }

    this.session = await Session.resolve({
      sessionId: this.sessionId,
      sessionsDir: this.sessionsDir,
      model: this.client.modelName,
    });
    this.history = await this.session.loadHistory();
    await this.sanitizeHistoryIfNeeded();
    this.sessionInitialized = true;
  }

  private async sanitizeHistoryIfNeeded(): Promise<void> {
    const { sanitized, changed } = sanitizeToolProtocolHistory(this.history);
    if (!changed) {
      return;
    }

    this.history = sanitized;
    if (this.session) {
      await this.session.rewriteHistory(this.history);
    }
  }

  // --- Private: 工具失败与使用量 ---

  /**
   * 方法说明：根据失败分类与提示文本判断该工具失败是否计入连续失败阈值。
   * @param result 单条工具执行结果。
   */
  private shouldCountFailure(result: MessageToolResult): boolean {
    const category = result.returnValue.extras?.failureCategory;
    return shouldCountToolFailure(category, `${result.returnValue.brief}\n${result.returnValue.output}`);
  }

  /**
   * 方法说明：更新会话用量并触发 onUsage 回调；回调异常仅记录日志不打断主流程。
   * @param usage 本次调用的 token 用量。
   * @param model 本次调用对应模型名称。
   */
  private async handleUsage(usage: TokenUsage, model: string): Promise<void> {
    if (this.session) await this.session.updateUsage(usage, model);
    if (this.onUsage) {
      try { await this.onUsage(usage, model); }
      catch (error) { logger.warn('onUsage callback failed', { error }); }
    }
  }

  // --- Private: Context offload ---

  /**
   * 方法说明：按策略执行 offload/compact，并在发生变化时统一回写历史与发送事件。
   */
  private async offloadHistoryIfNeeded(): Promise<void> {
    if (!this.session) return;
    const { messages, offloadResult, compactResult } =
      await this.contextOrchestrator.offloadIfNeeded(this.history, this.session.offloadSessionDir);

    if (!offloadResult && !compactResult) return;

    // offload 和 compact 共享同一份 messages，只需写入一次
    this.history = messages;
    await this.session.rewriteHistory(this.history);
    if (offloadResult) this.emit('offload', this.contextOrchestrator.buildOffloadPayload(offloadResult));
    if (compactResult) this.emit('compact', this.contextOrchestrator.buildCompactPayload(compactResult));
  }
}
