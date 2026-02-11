/**
 * 文件功能说明：
 * - 该文件位于 `src/tools/bash-router.ts`，主要负责 Bash、路由 相关实现。
 * - 模块归属 工具 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `BashRouter`
 * - `BashRouterOptions`
 * - `BashRouterCommandResult`
 * - `CommandType`
 *
 * 作用说明：
 * - `BashRouter`：封装该领域的核心流程与状态管理。
 * - `BashRouterOptions`：定义模块交互的数据结构契约。
 * - `BashRouterCommandResult`：声明类型别名，约束输入输出类型。
 * - `CommandType`：定义可枚举选项，统一分支语义。
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
import type { BashTool } from './bash-tool.ts';
import { asCancelablePromise, type CancelablePromise } from './callable-tool.ts';
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
  toolExecutor?: BashTool;
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
/**
 * 方法说明：执行 matchesExact 相关逻辑。
 * @param trimmed 输入参数。
 * @param cmd 输入参数。
 */
function matchesExact(trimmed: string, cmd: string): boolean {
  return trimmed === cmd || trimmed.startsWith(cmd + ' ');
}

/**
 * 方法说明：判断 isSkillToolCommand 对应条件是否成立。
 * @param value 输入参数。
 */
function isSkillToolCommand(value: string): boolean {
  const commandToken = value.trim().split(/\s+/, 1)[0] ?? '';
  return commandToken.startsWith('skill:') && commandToken.split(':').length >= 3;
}

/**
 * 方法说明：标准化 normalizeSlashSkillCommand 相关数据。
 * @param command 输入参数。
 */
function normalizeSlashSkillCommand(command: string): string {
  const trimmedStart = command.trimStart();
  if (!trimmedStart.startsWith('/skill:')) {
    return command;
  }

  const leadingWhitespace = command.slice(0, command.length - trimmedStart.length);
  return `${leadingWhitespace}${trimmedStart.slice(1)}`;
}

/**
 * 方法说明：执行 errorResult 相关逻辑。
 * @param message 消息内容。
 */
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

  /**
   * 方法说明：初始化 BashRouter 实例并设置初始状态。
   * @param session 输入参数。
   * @param options 配置参数。
   */
  constructor(private session: BashSession, options: BashRouterOptions = {}) {
    this.options = { synapseDir: DEFAULT_SYNAPSE_DIR, ...options };
    this.nativeHandler = new NativeShellCommandHandler(session);

    this.registerBuiltinHandlers();
  }

  /** 路由并执行命令
   * @param command 输入参数。
   * @param restart 输入参数。
   */
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

  /** 识别命令类型（public，供测试使用）
   * @param command 输入参数。
   */
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

  /** 注册命令处理器
   * @param prefix 输入参数。
   * @param type 输入参数。
   * @param handler 回调处理函数。
   * @param matchMode 输入参数。
   * @param factory 输入参数。
   */
  registerHandler(
    prefix: string,
    type: CommandType,
    handler: CommandHandler | null,
    matchMode: 'exact' | 'prefix' = 'exact',
    factory?: () => CommandHandler | null,
  ): void {
    this.handlerRegistry.set(prefix, { type, handler, factory, matchMode });
  }

  /** 设置 BashTool 实例（延迟绑定，避免循环依赖）
   * @param executor 输入参数。
   */
  setToolExecutor(executor: BashTool): void {
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

  /**
   * 方法说明：读取并返回 getSandboxManager 对应的数据。
   */
  getSandboxManager(): SandboxManager | undefined {
    return this.options.sandboxManager;
  }

  /** 注册所有内置命令处理器 */
  private registerBuiltinHandlers(): void {
    // Agent Shell — 文件操作命令（exact 匹配）
    this.registerHandler('read', CommandType.AGENT_SHELL_COMMAND, new ReadHandler());
    this.registerHandler('write', CommandType.AGENT_SHELL_COMMAND, new WriteHandler());
    this.registerHandler('edit', CommandType.AGENT_SHELL_COMMAND, new EditHandler());
    this.registerHandler('bash', CommandType.AGENT_SHELL_COMMAND, new BashWrapperHandler(this.session));
    this.registerHandler('TodoWrite', CommandType.AGENT_SHELL_COMMAND, new TodoWriteHandler());

    // Agent Shell — 搜索命令（prefix 匹配）
    this.registerHandler('command:search', CommandType.AGENT_SHELL_COMMAND, new CommandSearchHandler(), 'prefix');

    // Agent Shell — task 命令（prefix 匹配，惰性初始化）
    this.registerHandler('task:', CommandType.AGENT_SHELL_COMMAND, null, 'prefix', () => this.createTaskHandler());

    // Agent Shell — skill 管理命令（prefix 匹配，惰性初始化）
    this.registerHandler('skill:', CommandType.AGENT_SHELL_COMMAND, null, 'prefix', () => this.createSkillHandler());

    // Extend Shell — mcp 和 skill tool（prefix 匹配）
    this.registerHandler('mcp:', CommandType.EXTEND_SHELL_COMMAND, new McpCommandHandler(), 'prefix');
    // 注意：使用内部前缀 skill-tool: 作为注册表 key，实际匹配在 findHandler() 中特殊处理
    this.registerHandler('skill-tool:', CommandType.EXTEND_SHELL_COMMAND, new SkillToolHandler(), 'prefix');
  }

  /** 在注册表中查找匹配的处理器条目
   * @param trimmed 输入参数。
   */
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

  /** 解析处理器：直接返回或通过工厂惰性创建
   * @param entry 输入参数。
   */
  private resolveHandler(entry: HandlerEntry): CommandHandler | null {
    if (entry.handler) return entry.handler;

    if (entry.factory) {
      entry.handler = entry.factory();
      return entry.handler;
    }

    return null;
  }

  /** 带 session 重启的路由
   * @param command 输入参数。
   */
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

  /**
   * 方法说明：执行 executeNativeCommand 相关主流程。
   * @param command 输入参数。
   */
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

    return new TaskCommandHandler({
      client: llmClient,
      bashTool: toolExecutor,
      onToolStart: onSubAgentToolStart,
      onToolEnd: onSubAgentToolEnd,
      onComplete: onSubAgentComplete,
      onUsage: onSubAgentUsage,
    });
  }

  /** 创建 SkillCommandHandler（惰性） */
  private createSkillHandler(): SkillCommandHandler {
    const { llmClient, toolExecutor, onSubAgentToolStart, onSubAgentToolEnd, onSubAgentComplete, onSubAgentUsage } =
      this.options;

    return new SkillCommandHandler({
      homeDir: path.dirname(this.options.synapseDir ?? DEFAULT_SYNAPSE_DIR),
      llmClient,
      toolExecutor,
      onSubAgentToolStart,
      onSubAgentToolEnd,
      onSubAgentComplete,
      onSubAgentUsage,
    });
  }
}
