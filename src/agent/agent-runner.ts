/**
 * Agent Runner
 *
 * 功能：Agent 主循环实现，维护对话历史并驱动 LLM 生成与工具执行。
 *
 * 核心导出：
 * - AgentRunner: Agent 循环实现类
 * - AgentRunnerOptions: 配置选项接口
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
import { todoStore } from '../tools/handlers/agent-bash/todo/todo-store.ts';
import { shouldCountToolFailure } from '../tools/tool-failure.ts';
import { throwIfAborted } from '../utils/abort.ts';
import { countMessageTokens } from '../utils/token-counter.ts';
import { sanitizeToolProtocolHistory } from './history-sanitizer.ts';
import { prependSkillSearchInstruction } from './system-prompt.ts';
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
export interface AgentRunnerOptions {
  client: LLMClient;
  systemPrompt: string;
  toolset: Toolset;
  maxIterations?: number;
  maxConsecutiveToolFailures?: number;
  onMessagePart?: OnMessagePart;
  onToolCall?: OnToolCall;
  onToolResult?: OnToolResult;
  onUsage?: OnUsage;
  sessionId?: string;
  session?: Session;
  sessionsDir?: string;
  enableStopHooks?: boolean;
  context?: AgentRunnerContextOptions;
  /** 主 Agent 启用技能搜索指令；子 Agent 应禁用 */
  enableSkillSearchInstruction?: boolean;
}

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
  private enableSkillSearchInstruction: boolean;

  private session: Session | null = null;
  private sessionId?: string;
  private sessionsDir?: string;
  private shouldPersistSession = false;
  private sessionInitialized = false;
  private history: Message[] = [];
  private contextOrchestrator: ContextOrchestrator;
  private stopHookExecutor: StopHookExecutor;
  private pendingSandboxPermission: SandboxPermissionRequest | null = null;

  constructor(options: AgentRunnerOptions) {
    super();
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
    this.sessionId = options.sessionId ?? options.session?.id;
    this.sessionsDir = options.sessionsDir;
    this.shouldPersistSession = Boolean(options.session || options.sessionId || options.sessionsDir);
    this.enableSkillSearchInstruction = options.enableSkillSearchInstruction ?? true;
    this.contextOrchestrator = new ContextOrchestrator({
      client: options.client,
      context: options.context,
    });
    this.stopHookExecutor = new StopHookExecutor({
      enabled: options.enableStopHooks ?? true,
      onMessagePart: options.onMessagePart,
    });
  }

  getSessionId(): string | null { return this.session?.id ?? null; }
  getHistory(): readonly Message[] { return this.history; }
  getSessionUsage(): SessionUsage | null { return this.session?.getUsage() ?? null; }
  getModelName(): string { return this.client.modelName; }
  clearHistory(): void { this.history = []; }

  async recordUsage(usage: TokenUsage, model: string): Promise<void> {
    await this.handleUsage(usage, model);
  }

  getContextStats(): ContextStats | null {
    if (!this.session) return null;
    if (this.history.length === 0 && this.session.messageCount > 0) {
      this.history = this.session.loadHistorySync();
    }
    return this.contextOrchestrator.getContextStats(
      this.history, this.session.countOffloadedFiles()
    );
  }

  async clearSession(): Promise<void> {
    this.history = [];
    if (this.session) {
      await this.session.clear();
      logger.info(`Cleared session history: ${this.session.id}`);
    }
  }

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

  /** Run the Agent Loop for a user message */
  async run(userMessage: string, options?: AgentRunOptions): Promise<string> {
    const runResult = await this.runWithPotentialPermission(userMessage, options);
    if (runResult.permissionRequest) {
      return runResult.finalResponse;
    }

    if (runResult.completedNormally && this.stopHookExecutor.shouldExecute()) {
      return this.stopHookExecutor.executeAndAppend(runResult.finalResponse, {
        sessionId: this.getSessionId(), history: this.history,
      });
    }
    return runResult.finalResponse;
  }

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

  getPendingSandboxPermission(): SandboxPermissionRequest | null {
    return this.pendingSandboxPermission;
  }

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

  private async runWithPotentialPermission(
    userMessage: string,
    options?: AgentRunOptions
  ): Promise<{ finalResponse: string; completedNormally: boolean; permissionRequest?: SandboxPermissionRequest }> {
    const signal = options?.signal;
    throwIfAborted(signal);

    await this.initSession();
    await this.stopHookExecutor.init();
    throwIfAborted(signal);

    await this.sanitizeHistoryForToolProtocol('before run');
    throwIfAborted(signal);

    // 添加用户消息（可选追加技能搜索指令）
    const enhanced = this.enableSkillSearchInstruction
      ? prependSkillSearchInstruction(userMessage) : userMessage;
    await this.appendToHistory(createTextMessage('user', enhanced));

    return this.executeLoop(signal);
  }

  // --- Private: Agent loop ---

  private async executeLoop(signal?: AbortSignal): Promise<{
    finalResponse: string; completedNormally: boolean; permissionRequest?: SandboxPermissionRequest;
  }> {
    let iteration = 0;
    let consecutiveFailures = 0;

    while (iteration < this.maxIterations) {
      await this.sanitizeHistoryForToolProtocol('before step');
      throwIfAborted(signal);
      await this.offloadHistoryIfNeeded();
      throwIfAborted(signal);

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
        if (this.hasIncompleteTodos()) continue;
        const finalResponse = extractText(result.message);
        logger.info(`Agent loop completed, no tool calls，messages : ${finalResponse}`);
        return { finalResponse, completedNormally: true };
      }

      // 等待并记录工具执行结果
      throwIfAborted(signal);
      const toolResults = await result.toolResults();
      throwIfAborted(signal);
      await this.appendToHistory(result.message);
      for (const tr of toolResults) {
        await this.appendToHistory(toolResultToMessage(tr));
      }

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

    const stopMessage = `Reached tool iteration limit (${this.maxIterations}); stopping.\nUse --help to see command usage.`;
    logger.error(stopMessage);
    await this.appendToHistory(createTextMessage('assistant', stopMessage));
    return { finalResponse: stopMessage, completedNormally: false };
  }

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
      const reason = typeof tr.returnValue.message === 'string' && tr.returnValue.message.length > 0
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

  private toWhitelistPath(resource: string): string {
    if (!resource || resource === '/' || resource.endsWith('/')) {
      return resource;
    }
    return path.dirname(resource);
  }

  private async retryBlockedCommand(
    bashTool: SandboxAwareBashTool,
    command: string
  ): Promise<string> {
    const result = await bashTool.call({ command });
    const output = [result.output, result.message].filter((item) => item && item.length > 0).join('\n\n');
    return output || '(Command executed successfully with no output)';
  }

  private formatExecuteResult(stdout: string, stderr: string, exitCode: number): string {
    let output = '';
    if (stdout) {
      output += stdout;
    }
    if (stderr) {
      if (output) {
        output += '\n\n';
      }
      output += `[stderr]\n${stderr}`;
    }
    if (!output) {
      output = `(Command exited with code ${exitCode})`;
    }
    return output;
  }

  /** 检查是否有未完成的 todo 任务，如果有则追加提醒消息 */
  private hasIncompleteTodos(): boolean {
    const incompleteTodos = todoStore.get().items.filter((i) => i.status !== 'completed');
    if (incompleteTodos.length === 0) return false;

    const pendingTasks = incompleteTodos.map((i) => `- ${i.content} (${i.status})`).join('\n');
    const reminderMsg = createTextMessage(
      'user',
      `[System Reminder] You have incomplete tasks in your todo list. You MUST continue working on them before stopping:\n${pendingTasks}\n\nPlease continue with the next task.`
    );
    this.history.push(reminderMsg);
    if (this.session) this.session.appendMessage(reminderMsg);
    logger.info('Agent attempted to stop with incomplete todos, continuing...', {
      incompleteTodosCount: incompleteTodos.length,
    });
    return true;
  }

  /** 更新连续失败计数并记录日志 */
  private updateConsecutiveFailures(
    toolResults: MessageToolResult[], previousFailures: number
  ): number {
    const failedResults = toolResults.filter((r) => r.returnValue.isError);
    if (failedResults.length === 0) return 0;

    const countable = failedResults.filter((r) => this.shouldCountFailure(r));
    const next = countable.length > 0 ? previousFailures + 1 : 0;
    logger.warn(
      `Tool execution failed (counted: ${countable.length}/${failedResults.length}, consecutive: ${next}/${this.maxConsecutiveToolFailures})`,
      {
        errors: failedResults.map((r) => ({
          toolCallId: r.toolCallId, message: r.returnValue.message,
          brief: r.returnValue.brief, output: r.returnValue.output,
          extras: r.returnValue.extras,
        })),
        countableFailureIds: countable.map((r) => r.toolCallId),
      }
    );
    return next;
  }

  // --- Private: 历史管理 ---

  private async appendToHistory(message: Message): Promise<void> {
    this.history.push(message);
    if (this.session) await this.session.appendMessage(message);
  }

  private async sanitizeHistoryForToolProtocol(stage: 'before run' | 'before step'): Promise<void> {
    const { sanitized, changed } = sanitizeToolProtocolHistory(this.history);
    if (!changed) return;

    const beforeCount = this.history.length;
    this.history = sanitized;
    if (this.session) {
      await this.session.clear({ resetUsage: false });
      if (this.history.length > 0) await this.session.appendMessage(this.history);
    }
    logger.warn('Sanitized dangling or malformed tool-call history', {
      stage, beforeCount, afterCount: this.history.length,
    });
  }

  // --- Private: Session 管理 ---

  private async initSession(): Promise<void> {
    if (this.sessionInitialized) return;
    if (!this.shouldPersistSession) { this.sessionInitialized = true; return; }
    if (this.session) {
      this.history = await this.session.loadHistory();
      this.sessionInitialized = true;
      return;
    }

    const opts = this.sessionsDir ? { sessionsDir: this.sessionsDir } : {};
    const model = this.client.modelName;
    if (this.sessionId) {
      this.session = await Session.find(this.sessionId, { ...opts, model });
      if (this.session) {
        this.history = await this.session.loadHistory();
        logger.info(`Resumed session: ${this.sessionId} (${this.history.length} messages)`);
      } else {
        logger.warn(`Session not found: ${this.sessionId}, creating new one`);
        this.session = await Session.create({ ...opts, model });
      }
    } else {
      this.session = await Session.create({ ...opts, model });
    }
    this.sessionInitialized = true;
  }

  // --- Private: 工具失败与使用量 ---

  private shouldCountFailure(result: MessageToolResult): boolean {
    const category = result.returnValue.extras?.failureCategory;
    return shouldCountToolFailure(category, `${result.returnValue.brief}\n${result.returnValue.output}`);
  }

  private async handleUsage(usage: TokenUsage, model: string): Promise<void> {
    if (this.session) await this.session.updateUsage(usage, model);
    if (this.onUsage) {
      try { await this.onUsage(usage, model); }
      catch (error) { logger.warn('onUsage callback failed', { error }); }
    }
  }

  // --- Private: Context offload ---

  private async offloadHistoryIfNeeded(): Promise<void> {
    if (!this.session) return;
    const { messages, offloadResult, compactResult } =
      await this.contextOrchestrator.offloadIfNeeded(this.history, this.session.offloadSessionDir);

    if (offloadResult) {
      this.history = messages;
      await this.session.rewriteHistory(this.history);
      this.emit('offload', this.contextOrchestrator.buildOffloadPayload(offloadResult));
    }
    if (compactResult) {
      this.history = messages;
      await this.session.rewriteHistory(this.history);
      this.emit('compact', this.contextOrchestrator.buildCompactPayload(compactResult));
    }
  }
}
