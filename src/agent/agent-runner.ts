/**
 * Agent Runner
 *
 * 功能：Agent 主循环实现，驱动 LLM 生成与工具执行。
 * 会话管理委托给 AgentSessionManager，沙箱权限委托给 SandboxPermissionHandler。
 *
 * 核心导出：
 * - AgentRunner: Agent 循环实现类
 * - AgentRunnerOptions: 配置选项接口
 * - SandboxPermissionRequest / SandboxPermissionOption: 沙箱权限类型（re-export）
 */

import type { LLMClient } from '../providers/llm-client.ts';
import { type OnToolCall, type OnToolResult, step as runAgentStep } from './step.ts';
import type { OnMessagePart, OnUsage } from '../providers/generate.ts';
import {
  createTextMessage, extractText, type Message,
  type ToolResult as MessageToolResult, toolResultToMessage,
} from '../providers/message.ts';
import type { Toolset } from '../tools/toolset.ts';
import { EventEmitter } from 'node:events';
import { createLogger } from '../utils/logger.ts';
import { parseEnvInt, parseEnvPositiveInt } from '../utils/env.ts';
import type { Session } from './session.ts';
import type { SessionUsage } from './session-usage.ts';
import type { TokenUsage } from '../providers/anthropic/anthropic-types.ts';
import { todoStore } from '../tools/handlers/agent-bash/todo/todo-store.ts';
import { shouldCountToolFailure } from '../tools/tool-failure.ts';
import { throwIfAborted } from '../utils/abort.ts';
import { countMessageTokens } from '../utils/token-counter.ts';
import { prependSkillSearchInstruction } from './system-prompt.ts';
import { ContextOrchestrator, type AgentRunnerContextOptions, type ContextStats, type OffloadEventPayload, type CompactEventPayload } from './context-orchestrator.ts';
import type { CompactResult } from './context-compactor.ts';
import { StopHookExecutor } from './stop-hook-executor.ts';
import { SandboxPermissionHandler, type SandboxPermissionRequest, type SandboxPermissionOption } from './sandbox-permission-handler.ts';
import { AgentSessionManager } from './agent-session-manager.ts';

export type { AgentRunnerContextOptions, ContextStats, OffloadEventPayload, CompactEventPayload };
export type { SandboxPermissionRequest, SandboxPermissionOption };

const logger = createLogger('agent-runner');
const DEFAULT_MAX_ITERATIONS = parseEnvInt(process.env.SYNAPSE_MAX_TOOL_ITERATIONS, 50);
const DEFAULT_MAX_CONSECUTIVE_FAILURES = parseEnvPositiveInt(process.env.SYNAPSE_MAX_CONSECUTIVE_TOOL_FAILURES, 3);

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

export interface AgentRunOptions { signal?: AbortSignal; }

export type AgentRunnerStepResult =
  | { status: 'completed'; response: string }
  | { status: 'requires_permission'; permission: SandboxPermissionRequest };

/** 循环单步结果（内部使用） */
type LoopAction = 'continue' | 'completed' | 'permission' | 'failure_limit';

interface LoopResult {
  finalResponse: string;
  completedNormally: boolean;
  permissionRequest?: SandboxPermissionRequest;
}

/**
 * AgentRunner - Agent Loop implementation using step()
 */
export class AgentRunner extends EventEmitter {
  private client: LLMClient;
  private systemPrompt: string;
  private toolset: Toolset;
  private maxIterations: number;
  private maxConsecutiveFailures: number;
  private onMessagePart?: OnMessagePart;
  private onToolCall?: OnToolCall;
  private onToolResult?: OnToolResult;
  private enableSkillSearchInstruction: boolean;
  private sm: AgentSessionManager;
  private contextOrchestrator: ContextOrchestrator;
  private stopHookExecutor: StopHookExecutor;
  private sandboxHandler = new SandboxPermissionHandler();

  constructor(options: AgentRunnerOptions) {
    super();
    this.client = options.client;
    this.systemPrompt = options.systemPrompt;
    this.toolset = options.toolset;
    this.maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    this.maxConsecutiveFailures = options.maxConsecutiveToolFailures ?? DEFAULT_MAX_CONSECUTIVE_FAILURES;
    this.onMessagePart = options.onMessagePart;
    this.onToolCall = options.onToolCall;
    this.onToolResult = options.onToolResult;
    this.enableSkillSearchInstruction = options.enableSkillSearchInstruction ?? true;
    this.sm = new AgentSessionManager({
      client: options.client, session: options.session,
      sessionId: options.sessionId, sessionsDir: options.sessionsDir, onUsage: options.onUsage,
    });
    this.contextOrchestrator = new ContextOrchestrator({ client: options.client, context: options.context });
    this.stopHookExecutor = new StopHookExecutor({ enabled: options.enableStopHooks ?? true, onMessagePart: options.onMessagePart });
  }

  // --- 公共 API ---

  getSessionId(): string | null { return this.sm.getSessionId(); }
  getHistory(): readonly Message[] { return this.sm.history; }
  getSessionUsage(): SessionUsage | null { return this.sm.getSessionUsage(); }
  getModelName(): string { return this.client.modelName; }
  clearHistory(): void { this.sm.history = []; }
  async clearSession(): Promise<void> { await this.sm.clear(); }
  getPendingSandboxPermission(): SandboxPermissionRequest | null { return this.sandboxHandler.getPending(); }
  async resolveSandboxPermission(option: SandboxPermissionOption): Promise<string> { return this.sandboxHandler.resolve(option, this.toolset); }

  async executeBashCommand(command: string, restart: boolean = false): Promise<string> {
    const bashTool = this.toolset.getTool?.('Bash');
    if (!bashTool) throw new Error('Bash tool is unavailable');
    const result = await bashTool.call({ command, restart });
    const parts = [stripSelfDescription(result.output), stripSelfDescription(result.message)]
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
    return parts.join('\n\n') || '(Command executed successfully with no output)';
  }

  async recordUsage(usage: TokenUsage, model: string): Promise<void> { await this.sm.handleUsage(usage, model); }

  getContextStats(): ContextStats | null {
    if (!this.sm.getSession()) return null;
    this.sm.loadHistorySync();
    return this.contextOrchestrator.getContextStats(this.sm.history, this.sm.countOffloadedFiles());
  }

  async forceCompact(): Promise<CompactResult> {
    await this.sm.init();
    if (!this.sm.getSession()) {
      const previousTokens = countMessageTokens(this.sm.history);
      return {
        messages: [...this.sm.history], previousTokens, currentTokens: previousTokens,
        freedTokens: 0, deletedFiles: [], success: true,
        preservedCount: Math.min(this.sm.history.length, this.contextOrchestrator.compactPreserveCount),
      };
    }
    const result = await this.contextOrchestrator.forceCompact(this.sm.history, this.sm.offloadSessionDir!);
    if (result.success) {
      await this.sm.rewriteHistory(result.messages);
      this.emit('compact', this.contextOrchestrator.buildCompactPayload(result));
    }
    return result;
  }

  async run(userMessage: string, options?: AgentRunOptions): Promise<string> {
    const r = await this.runLoop(userMessage, options);
    if (r.permissionRequest) return r.finalResponse;
    if (r.completedNormally && this.stopHookExecutor.shouldExecute()) {
      return this.stopHookExecutor.executeAndAppend(r.finalResponse, {
        sessionId: this.getSessionId(), history: this.sm.history,
      });
    }
    return r.finalResponse;
  }

  async step(userMessage: string, options?: AgentRunOptions): Promise<AgentRunnerStepResult> {
    const r = await this.runLoop(userMessage, options);
    if (r.permissionRequest) return { status: 'requires_permission', permission: r.permissionRequest };
    return { status: 'completed', response: r.finalResponse };
  }

  // --- Private: 主循环 ---

  private async runLoop(userMessage: string, options?: AgentRunOptions): Promise<LoopResult> {
    const signal = options?.signal;
    throwIfAborted(signal);
    await this.sm.init();
    await this.stopHookExecutor.init();
    throwIfAborted(signal);
    await this.sm.sanitize('before run');
    throwIfAborted(signal);

    const enhanced = this.enableSkillSearchInstruction ? prependSkillSearchInstruction(userMessage) : userMessage;
    await this.sm.append(createTextMessage('user', enhanced));

    let consecutiveFailures = 0;
    for (let i = 0; i < this.maxIterations; i++) {
      await this.sm.sanitize('before step');
      throwIfAborted(signal);
      await this.offloadIfNeeded();
      throwIfAborted(signal);

      logger.info('Agent loop iteration', { iteration: i + 1 });
      const result = await runAgentStep(this.client, this.systemPrompt, this.toolset, this.sm.history, {
        onMessagePart: this.onMessagePart, onToolCall: this.onToolCall,
        onToolResult: this.onToolResult, onUsage: (u, m) => this.sm.handleUsage(u, m), signal,
      });

      // 无工具调用 — 尝试停止
      if (result.toolCalls.length === 0) {
        await this.sm.append(result.message);
        if (this.hasIncompleteTodos()) continue;
        const finalResponse = extractText(result.message);
        logger.info(`Agent loop completed, no tool calls，messages : ${finalResponse}`);
        return { finalResponse, completedNormally: true };
      }

      // 处理工具结果
      throwIfAborted(signal);
      const toolResults = await result.toolResults();
      throwIfAborted(signal);
      await this.sm.append(result.message);
      for (const tr of toolResults) await this.sm.append(toolResultToMessage(tr));

      // 沙箱权限检测
      const perm = this.sandboxHandler.buildFromToolResults(result.toolCalls, toolResults);
      if (perm) {
        this.sandboxHandler.setPending(perm);
        return { finalResponse: perm.reason, completedNormally: false, permissionRequest: perm };
      }

      // 连续失败检测
      consecutiveFailures = countConsecutiveFailures(toolResults, consecutiveFailures, this.maxConsecutiveFailures);
      if (consecutiveFailures >= this.maxConsecutiveFailures) {
        return { finalResponse: 'Consecutive tool execution failures; stopping.', completedNormally: false };
      }
    }

    const msg = `Reached tool iteration limit (${this.maxIterations}); stopping.\nUse --help to see command usage.`;
    logger.error(msg);
    await this.sm.append(createTextMessage('assistant', msg));
    return { finalResponse: msg, completedNormally: false };
  }

  private async offloadIfNeeded(): Promise<void> {
    if (!this.sm.getSession()) return;
    const { messages, offloadResult, compactResult } =
      await this.contextOrchestrator.offloadIfNeeded(this.sm.history, this.sm.offloadSessionDir!);
    if (offloadResult) {
      await this.sm.rewriteHistory(messages);
      this.emit('offload', this.contextOrchestrator.buildOffloadPayload(offloadResult));
    }
    if (compactResult) {
      await this.sm.rewriteHistory(messages);
      this.emit('compact', this.contextOrchestrator.buildCompactPayload(compactResult));
    }
  }

  private hasIncompleteTodos(): boolean {
    const incomplete = todoStore.get().items.filter((i) => i.status !== 'completed');
    if (incomplete.length === 0) return false;
    const tasks = incomplete.map((i) => `- ${i.content} (${i.status})`).join('\n');
    this.sm.pushLocal(createTextMessage('user',
      `[System Reminder] You have incomplete tasks in your todo list. You MUST continue working on them before stopping:\n${tasks}\n\nPlease continue with the next task.`
    ));
    logger.info('Agent attempted to stop with incomplete todos, continuing...', { incompleteTodosCount: incomplete.length });
    return true;
  }
}

// --- 模块级辅助函数 ---

const SELF_DESCRIPTION_MARKER = 'Self-description:';

function stripSelfDescription(value?: string): string {
  if (!value) return '';
  const idx = value.indexOf(SELF_DESCRIPTION_MARKER);
  return idx === -1 ? value : value.slice(0, idx).trimEnd();
}

function countConsecutiveFailures(
  toolResults: MessageToolResult[], previous: number, maxFailures: number
): number {
  const failed = toolResults.filter((r) => r.returnValue.isError);
  if (failed.length === 0) return 0;
  const countable = failed.filter((r) => {
    const cat = r.returnValue.extras?.failureCategory;
    return shouldCountToolFailure(cat, `${r.returnValue.brief}\n${r.returnValue.output}`);
  });
  const next = countable.length > 0 ? previous + 1 : 0;
  logger.warn(`Tool execution failed (counted: ${countable.length}/${failed.length}, consecutive: ${next}/${maxFailures})`, {
    errors: failed.map((r) => ({ toolCallId: r.toolCallId, message: r.returnValue.message, brief: r.returnValue.brief, output: r.returnValue.output, extras: r.returnValue.extras })),
    countableFailureIds: countable.map((r) => r.toolCallId),
  });
  return next;
}
