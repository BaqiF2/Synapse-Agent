/**
 * Bash Command Router
 *
 * 功能：解析 Bash 命令并路由到三层处理器（Native Shell / Agent Shell / Extend Shell）。
 * 使用声明式路由表 + 注册表模式管理命令处理器。
 *
 * 核心导出：
 * - BashRouter: 命令路由器，识别命令类型并分发到对应 handler
 * - CommandType: 命令类型枚举
 * - BashRouterOptions: 路由器配置选项
 * - RouteDefinition: 声明式路由定义
 */

import * as path from 'node:path';
import * as os from 'node:os';
import type { BashSession } from './bash-session.ts';
import { NativeShellCommandHandler, type CommandResult } from './handlers/native-command-handler.ts';
import { ReadHandler, WriteHandler, EditHandler, BashWrapperHandler, TodoWriteHandler } from './handlers/agent-bash/index.ts';
import { CommandSearchHandler, McpCommandHandler, SkillToolHandler } from './handlers/extend-bash/index.ts';
import { SkillCommandHandler } from './handlers/skill-command-handler.ts';
import { TaskCommandHandler } from './handlers/task-command-handler.ts';
import type { LLMClient } from '../providers/llm-client.ts';
import type { OnUsage } from '../providers/generate.ts';
import { asCancelablePromise, type CancelablePromise } from './callable-tool.ts';
import type { ISubAgentExecutor } from '../sub-agents/sub-agent-types.ts';
import type { SandboxManager } from '../sandbox/sandbox-manager.ts';
import type { ExecuteResult } from '../sandbox/types.ts';
import type {
  ToolResultEvent,
  SubAgentCompleteEvent,
  SubAgentToolCallEvent,
} from '../cli/terminal-renderer-types.ts';

/** 三层 Bash 架构中的命令类型 */
export enum CommandType {
  NATIVE_SHELL_COMMAND = 'native_shell_command',
  AGENT_SHELL_COMMAND = 'agent_shell_command',
  EXTEND_SHELL_COMMAND = 'extend_shell_command',
}

const DEFAULT_SYNAPSE_DIR = path.join(os.homedir(), '.synapse');

/** BashRouter 配置选项 */
export interface BashRouterOptions {
  synapseDir?: string;
  llmClient?: LLMClient;
  /** BashTool 实例，类型为 unknown 以避免 bash-tool ↔ bash-router 循环依赖 */
  toolExecutor?: unknown;
  sandboxManager?: SandboxManager;
  getCwd?: () => string;
  getConversationPath?: () => string | null;
  onSubAgentToolStart?: (event: SubAgentToolCallEvent) => void;
  onSubAgentToolEnd?: (event: ToolResultEvent) => void;
  onSubAgentComplete?: (event: SubAgentCompleteEvent) => void;
  onSubAgentUsage?: OnUsage;
}

export type BashRouterCommandResult = CommandResult & Partial<Pick<ExecuteResult, 'blocked' | 'blockedReason' | 'blockedResource'>>;

/** 注册表中的命令处理器接口 */
interface CommandHandler {
  execute(command: string): Promise<BashRouterCommandResult> | CancelablePromise<BashRouterCommandResult>;
  shutdown?(): void;
}

/** 声明式路由定义：描述一条命令前缀到处理器的映射 */
export interface RouteDefinition {
  /** 命令前缀 */
  prefix: string;
  /** 命令类型层次 */
  type: CommandType;
  /** 前缀匹配模式 */
  matchMode: 'exact' | 'prefix';
  /** 立即创建的处理器实例（与 factory 二选一） */
  handler?: CommandHandler | null;
  /** 惰性初始化工厂（与 handler 二选一） */
  factory?: () => CommandHandler | null;
}

/** 注册表条目：命令类型 + 处理器（支持惰性初始化） */
interface HandlerEntry {
  type: CommandType;
  handler: CommandHandler | null;
  /** 惰性初始化工厂，首次调用时创建 handler */
  factory?: () => CommandHandler | null;
  /** 前缀匹配模式：'exact' 匹配 cmd 或 cmd+空格，'prefix' 匹配 startsWith */
  matchMode: 'exact' | 'prefix';
}

// 辅助函数
function matchesExact(trimmed: string, cmd: string): boolean {
  return trimmed === cmd || trimmed.startsWith(cmd + ' ');
}

function isSkillToolCommand(value: string): boolean {
  const commandToken = value.trim().split(/\s+/, 1)[0] ?? '';
  return commandToken.startsWith('skill:') && commandToken.split(':').length >= 3;
}

function normalizeSlashSkillCommand(command: string): string {
  const trimmedStart = command.trimStart();
  if (!trimmedStart.startsWith('/skill:')) {
    return command;
  }

  const leadingWhitespace = command.slice(0, command.length - trimmedStart.length);
  return `${leadingWhitespace}${trimmedStart.slice(1)}`;
}

function errorResult(message: string): CommandResult {
  return { stdout: '', stderr: message, exitCode: 1 };
}

/**
 * BashRouter — 命令路由器
 *
 * 使用注册表模式：通过 handlerRegistry 统一管理所有命令前缀与处理器的映射。
 */
export class BashRouter {
  private readonly options: BashRouterOptions;
  private readonly nativeHandler: NativeShellCommandHandler;
  /** 命令前缀 → 处理器注册表 */
  private readonly handlerRegistry = new Map<string, HandlerEntry>();

  constructor(private session: BashSession, options: BashRouterOptions = {}) {
    this.options = { synapseDir: DEFAULT_SYNAPSE_DIR, ...options };
    this.nativeHandler = new NativeShellCommandHandler(session);

    this.registerBuiltinHandlers();
  }

  /** 路由并执行命令 */
  route(command: string, restart: boolean = false): CancelablePromise<BashRouterCommandResult> {
    if (restart) {
      return this.routeWithRestart(command);
    }

    const normalizedCommand = normalizeSlashSkillCommand(command);
    const trimmed = normalizedCommand.trim();
    const entry = this.findHandler(trimmed);

    if (!entry) {
      // 默认 Native Shell（可选走 SandboxManager）
      return asCancelablePromise(this.executeNativeCommand(normalizedCommand));
    }

    const handler = this.resolveHandler(entry);
    if (!handler) {
      return asCancelablePromise(Promise.resolve(errorResult(`Handler initialization failed for: ${normalizedCommand}`)));
    }

    const result = handler.execute(normalizedCommand);
    return 'cancel' in result ? result as CancelablePromise<CommandResult> : asCancelablePromise(result);
  }

  /** 识别命令类型（public，供测试使用） */
  identifyCommandType(command: string): CommandType {
    const trimmed = normalizeSlashSkillCommand(command).trim();

    // Extend Shell — mcp:* 和 skill:*:*（三段式）
    if (trimmed.startsWith('mcp:')) return CommandType.EXTEND_SHELL_COMMAND;
    if (isSkillToolCommand(trimmed)) return CommandType.EXTEND_SHELL_COMMAND;

    // 注册表查找
    const entry = this.findHandler(trimmed);
    if (entry) return entry.type;

    // 默认 Native Shell
    return CommandType.NATIVE_SHELL_COMMAND;
  }

  /** 注册命令处理器 */
  registerHandler(
    prefix: string,
    type: CommandType,
    handler: CommandHandler | null,
    matchMode: 'exact' | 'prefix' = 'exact',
    factory?: () => CommandHandler | null,
  ): void {
    this.handlerRegistry.set(prefix, { type, handler, factory, matchMode });
  }

  /** 设置 BashTool 实例（延迟绑定，避免循环依赖） */
  setToolExecutor(executor: unknown): void {
    this.options.toolExecutor = executor;

    // 重置 task handler 以使用新的 executor
    const taskEntry = this.handlerRegistry.get('task:');
    if (taskEntry?.handler) {
      (taskEntry.handler as TaskCommandHandler).shutdown();
      taskEntry.handler = null;
    }

    // 重置 skill command handler
    const skillEntry = this.handlerRegistry.get('skill:');
    if (skillEntry?.handler) {
      (skillEntry.handler as SkillCommandHandler).shutdown();
      skillEntry.handler = null;
    }
  }

  /** 关闭并清理资源 */
  shutdown(): void {
    for (const entry of this.handlerRegistry.values()) {
      if (entry.handler?.shutdown) {
        entry.handler.shutdown();
      }
      entry.handler = null;
    }
  }

  getSandboxManager(): SandboxManager | undefined {
    return this.options.sandboxManager;
  }

  /** 声明式路由表：定义所有内置命令的路由规则 */
  private getBuiltinRoutes(): RouteDefinition[] {
    return [
      // Agent Shell — 文件操作命令（exact 匹配）
      { prefix: 'read',      type: CommandType.AGENT_SHELL_COMMAND, matchMode: 'exact',  handler: new ReadHandler() },
      { prefix: 'write',     type: CommandType.AGENT_SHELL_COMMAND, matchMode: 'exact',  handler: new WriteHandler() },
      { prefix: 'edit',      type: CommandType.AGENT_SHELL_COMMAND, matchMode: 'exact',  handler: new EditHandler() },
      { prefix: 'bash',      type: CommandType.AGENT_SHELL_COMMAND, matchMode: 'exact',  handler: new BashWrapperHandler(this.session) },
      { prefix: 'TodoWrite', type: CommandType.AGENT_SHELL_COMMAND, matchMode: 'exact',  handler: new TodoWriteHandler() },
      // Agent Shell — 搜索命令
      { prefix: 'command:search', type: CommandType.AGENT_SHELL_COMMAND, matchMode: 'prefix', handler: new CommandSearchHandler() },
      // Agent Shell — task / skill 管理命令（惰性初始化）
      { prefix: 'task:',  type: CommandType.AGENT_SHELL_COMMAND,  matchMode: 'prefix', factory: () => this.createTaskHandler() },
      { prefix: 'skill:', type: CommandType.AGENT_SHELL_COMMAND,  matchMode: 'prefix', factory: () => this.createSkillHandler() },
      // Extend Shell — mcp 和 skill tool
      { prefix: 'mcp:',        type: CommandType.EXTEND_SHELL_COMMAND, matchMode: 'prefix', handler: new McpCommandHandler() },
      { prefix: 'skill-tool:', type: CommandType.EXTEND_SHELL_COMMAND, matchMode: 'prefix', handler: new SkillToolHandler() },
    ];
  }

  /** 从声明式路由表批量注册处理器 */
  private registerBuiltinHandlers(): void {
    for (const route of this.getBuiltinRoutes()) {
      this.registerHandler(route.prefix, route.type, route.handler ?? null, route.matchMode, route.factory);
    }
  }

  /** 在注册表中查找匹配的处理器条目 */
  private findHandler(trimmed: string): HandlerEntry | null {
    // skill: 命令需要特殊处理：
    // 1. skill:name:tool（三段式）-> Extend Shell SkillToolHandler
    // 2. 其他 skill:* -> Agent Shell SkillCommandHandler
    if (trimmed.startsWith('skill:')) {
      if (isSkillToolCommand(trimmed)) {
        return this.handlerRegistry.get('skill-tool:') ?? null;
      }
      return this.handlerRegistry.get('skill:') ?? null;
    }

    for (const [prefix, entry] of this.handlerRegistry) {
      if (entry.matchMode === 'exact') {
        if (matchesExact(trimmed, prefix)) return entry;
      } else {
        if (trimmed.startsWith(prefix)) return entry;
      }
    }

    return null;
  }

  /** 解析处理器：直接返回或通过工厂惰性创建 */
  private resolveHandler(entry: HandlerEntry): CommandHandler | null {
    if (entry.handler) return entry.handler;

    if (entry.factory) {
      entry.handler = entry.factory();
      return entry.handler;
    }

    return null;
  }

  /** 带 session 重启的路由 */
  private routeWithRestart(command: string): CancelablePromise<BashRouterCommandResult> {
    let cancelled = false;
    let routedPromise: CancelablePromise<BashRouterCommandResult> | null = null;

    return asCancelablePromise(
      this.session.restart().then(() => {
        if (cancelled) {
          return { stdout: '', stderr: 'Command execution interrupted.', exitCode: 130 };
        }
        routedPromise = this.route(command, false);
        if (cancelled) routedPromise.cancel?.();
        return routedPromise;
      }),
      () => {
        cancelled = true;
        routedPromise?.cancel?.();
      },
    );
  }

  private async executeNativeCommand(command: string): Promise<BashRouterCommandResult> {
    const sandboxManager = this.options.sandboxManager;
    if (!sandboxManager) {
      return this.nativeHandler.execute(command);
    }

    try {
      const cwd = this.options.getCwd ? this.options.getCwd() : process.cwd();
      return await sandboxManager.execute(command, cwd);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Command execution failed: ${message}`);
    }
  }

  /** 创建 TaskCommandHandler（惰性） */
  private createTaskHandler(): CommandHandler {
    const { llmClient, toolExecutor, onSubAgentToolStart, onSubAgentToolEnd, onSubAgentComplete, onSubAgentUsage } =
      this.options;
    if (!llmClient || !toolExecutor) {
      // 缺少依赖时返回一个固定错误的处理器
      return { execute: () => Promise.resolve(errorResult('Task commands require LLM client and tool executor')) };
    }

    // 延迟创建 SubAgentManager 并注入到 handler，打破循环依赖
    const manager = this.createSubAgentManager();
    return new TaskCommandHandler({ manager });
  }

  /** 创建 SkillCommandHandler（惰性） */
  private createSkillHandler(): SkillCommandHandler {
    // 构建 SubAgentManager 工厂函数，由 SkillCommandHandler 按需调用
    const createSubAgentManager = this.options.llmClient && this.options.toolExecutor
      ? () => this.createSubAgentManager()
      : undefined;

    return new SkillCommandHandler({
      homeDir: path.dirname(this.options.synapseDir ?? DEFAULT_SYNAPSE_DIR),
      createSubAgentManager,
    });
  }

  /**
   * 创建 SubAgentManager 实例
   *
   * 使用动态 require 延迟加载 sub-agent-manager 模块，
   * 打破 bash-router → handler → sub-agent-manager → bash-tool → bash-router 循环依赖。
   * 此方法仅在惰性工厂中调用（首次 task:/skill: 命令时），安全且高效。
   */
  private createSubAgentManager(): ISubAgentExecutor {
    const { llmClient, toolExecutor, onSubAgentToolStart, onSubAgentToolEnd, onSubAgentComplete, onSubAgentUsage } =
      this.options;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SubAgentManager } = require('../sub-agents/sub-agent-manager.ts');
    return new SubAgentManager({
      client: llmClient,
      bashTool: toolExecutor,
      onToolStart: onSubAgentToolStart,
      onToolEnd: onSubAgentToolEnd,
      onComplete: onSubAgentComplete,
      onUsage: onSubAgentUsage,
    });
  }
}
