/**
 * Bash Tool Implementation
 *
 * CallableTool subclass for the unified Bash tool. Routes commands through
 * BashRouter (three-layer architecture) and returns structured ToolReturnValue.
 * 通过 subAgentExecutorFactory 注入 SubAgent 能力，消除与 BashRouter 的循环依赖。
 *
 * Core Exports:
 * - BashTool: The Bash tool implementation
 * - BashToolParams: Zod-validated parameter type
 * - BashToolOptions: Construction options
 */

import path from 'node:path';
import {
  CallableTool,
  ToolOk,
  ToolError,
  asCancelablePromise,
  type ToolReturnValue,
  type CancelablePromise,
} from './callable-tool.ts';
import { BashToolParamsSchema, type BashToolParams } from './schemas.ts';
export type { BashToolParams } from './schemas.ts';
import { BashRouter } from './bash-router.ts';
import { BashSession } from './bash-session.ts';
import type { SkillCommandHandlerOptions } from './commands/skill-mgmt.ts';
import { loadDesc } from '../shared/load-desc.js';
import type { LLMProviderLike } from '../types/provider.ts';
import { extractBaseCommand } from './constants.ts';
import {
  classifyToolFailure,
  shouldAttachToolSelfDescription,
  TOOL_FAILURE_CATEGORIES,
} from './tool-failure.ts';
import { isSynapseError } from '../shared/errors.ts';
import { addPermanentWhitelist, loadSandboxConfig } from '../shared/sandbox/sandbox-config.ts';
import { SandboxManager } from '../shared/sandbox/sandbox-manager.ts';
import type { ExecuteResult, SandboxConfig } from '../shared/sandbox/types.ts';
import {
  SubAgentExecutor,
  callableToolToAgentTool,
} from '../core/sub-agents/sub-agent-core.ts';
import type { ISubAgentExecutor } from '../types/sub-agent.ts';

const COMMAND_TIMEOUT_MARKER = 'Command execution timeout';
const BASH_TOOL_MISUSE_REGEX = /^Bash(?:\s|\(|$)/;
const HELP_HINT_TEMPLATE =
  '\n\nSelf-description: The command failed. Next step: run `Bash(command="{command} --help")` to learn usage, then retry with valid arguments.';
const BASH_TOOL_MISUSE_OUTPUT = [
  'Invalid command: `Bash` is a tool name, not a runnable shell command.',
  'Do not wrap with `Bash(...)` inside the command string.',
  'Use the inner command text only. Examples:',
  '- Bash(command="read ./README.md")',
  '- Bash(command="ls -la")',
].join('\n');
const BASH_TOOL_MISUSE_MESSAGE =
  'Tool misuse detected: you attempted to execute the Bash tool itself as a command. ' +
  'CORRECTION: pass only the actual command string in `command`, then retry. ' +
  'Examples: Bash(command="read ./README.md"), Bash(command="ls -la").';

function appendSelfDescription(output: string, helpHint: string): string {
  return `${output}\n\n${helpHint.trim()}`;
}

function isBashToolMisuse(command: string): boolean {
  return BASH_TOOL_MISUSE_REGEX.test(command.trim());
}

/**
 * Options for constructing BashTool
 */
export interface BashToolOptions {
  /** LLM Provider，用于创建 SubAgentExecutor */
  provider?: LLMProviderLike;
  /** Callback to get current conversation path */
  getConversationPath?: () => string | null;
  /** 测试或外部注入的 SandboxManager */
  sandboxManager?: SandboxManager;
  /** 沙箱配置（createIsolatedCopy 时继承，优先于 loadSandboxConfig()） */
  sandboxConfig?: SandboxConfig;
  /** 预创建的 SubAgent 执行器（测试注入，优先于 provider） */
  subAgentExecutor?: ISubAgentExecutor;
  /** SkillCommandHandler 配置工厂 — 由调用方注入技能服务依赖 */
  skillCommandHandlerFactory?: (homeDir: string, createSubAgentManager?: () => ISubAgentExecutor) => SkillCommandHandlerOptions;
}

/**
 * BashTool — the single tool exposed to the LLM.
 *
 * Wraps BashSession + BashRouter and returns structured ToolReturnValue.
 */
export class BashTool extends CallableTool<BashToolParams> {
  readonly name = 'Bash';
  readonly description: string;
  readonly paramsSchema = BashToolParamsSchema;

  private readonly optionsSnapshot: BashToolOptions;
  private session: BashSession;
  private router: BashRouter;
  private readonly sandboxManager: SandboxManager;

  constructor(options: BashToolOptions = {}) {
    super();
    this.optionsSnapshot = { ...options };
    this.description = loadDesc(path.join(import.meta.dirname, 'bash-tool.md'));

    this.session = new BashSession();
    this.sandboxManager = options.sandboxManager
      ?? new SandboxManager(options.sandboxConfig ?? loadSandboxConfig());

    // 构建 subAgentExecutorFactory：惰性创建 SubAgentExecutor
    const subAgentExecutorFactory = this.buildSubAgentExecutorFactory(options);

    this.router = new BashRouter(this.session, {
      subAgentExecutorFactory,
      sandboxManager: this.sandboxManager,
      getConversationPath: options.getConversationPath,
      skillCommandHandlerFactory: options.skillCommandHandlerFactory,
    });
  }

  protected execute(params: BashToolParams): CancelablePromise<ToolReturnValue> {
    const { command, restart } = params;

    // Validate command
    if (!command.trim()) {
      return asCancelablePromise(Promise.resolve(ToolError({
        message: 'Error: command parameter is required and must be a non-empty string',
        brief: 'Empty command',
      })));
    }

    if (isBashToolMisuse(command)) {
      return asCancelablePromise(Promise.resolve(ToolError({
        output: BASH_TOOL_MISUSE_OUTPUT,
        message: BASH_TOOL_MISUSE_MESSAGE,
        brief: 'Invalid Bash command',
        extras: {
          failureCategory: TOOL_FAILURE_CATEGORIES.invalidUsage,
          baseCommand: extractBaseCommand(command),
        },
      })));
    }

    const routePromise = this.router.route(command, restart);
    const resultPromise: CancelablePromise<ToolReturnValue> = asCancelablePromise(routePromise
      .then(async (result) => {
        if (result.blocked) {
          return ToolOk({
            output: '',
            message: result.blockedReason ?? 'Sandbox blocked command execution',
            brief: 'Sandbox blocked',
            extras: {
              type: 'sandbox_blocked',
              resource: result.blockedResource,
              blockedReason: result.blockedReason,
            },
          });
        }

        const timeoutDetected = result.stderr.includes(COMMAND_TIMEOUT_MARKER);

        if (timeoutDetected) {
          await this.restartSessionSafely();
        }

        // Format output
        let output = '';
        if (result.stdout) {
          output += result.stdout;
        }
        let stderr = result.stderr;
        if (timeoutDetected) {
          const restartNote = 'Bash session restarted after timeout.';
          stderr = stderr ? `${stderr}\n${restartNote}` : restartNote;
        }
        if (stderr) {
          if (output) output += '\n\n';
          output += `[stderr]\n${stderr}`;
        }

        // Empty output handling
        if (!output.trim()) {
          output = '(Command executed successfully with no output)';
        }

        if (result.exitCode === 0) {
          return ToolOk({ output });
        }

        const baseCommand = extractBaseCommand(command);
        const helpHint = HELP_HINT_TEMPLATE.replace('{command}', baseCommand);
        const failureCategory = classifyToolFailure(result.stderr);
        const outputWithCorrection = shouldAttachToolSelfDescription(failureCategory)
          ? appendSelfDescription(output, helpHint)
          : output;
        return ToolError({
          output: outputWithCorrection,
          message: `Command failed with exit code ${result.exitCode}${helpHint}`,
          brief: 'Bash command failed',
          extras: {
            failureCategory,
            baseCommand,
            exitCode: result.exitCode,
          },
        });
      })
      .catch(async (error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (message.includes(COMMAND_TIMEOUT_MARKER)) {
          await this.restartSessionSafely();
        }
        const extras: Record<string, unknown> = {};
        if (isSynapseError(error)) {
          extras.errorCode = error.code;
          extras.recoverable = error.recoverable;
        }
        return ToolError({
          message: `Command execution failed: ${message}`,
          brief: 'Command execution failed',
          extras,
        });
      }), () => routePromise.cancel?.());

    return resultPromise;
  }

  private async restartSessionSafely(): Promise<void> {
    try {
      await this.session.restart();
    } catch {
      // Best-effort restart; ignore errors to avoid masking the original failure.
    }
  }

  /**
   * 构建 SubAgent 执行器工厂。
   *
   * 返回一个惰性工厂函数：首次调用创建 SubAgentExecutor，后续调用复用同一实例。
   * 如果缺少 provider，则返回 undefined（task: 命令将报错提示缺少依赖）。
   */
  private buildSubAgentExecutorFactory(
    options: BashToolOptions,
  ): (() => ISubAgentExecutor) | undefined {
    // 预注入的 executor（测试场景）
    if (options.subAgentExecutor) {
      return () => options.subAgentExecutor!;
    }

    // 需要 provider 才能创建 SubAgentExecutor
    if (!options.provider) {
      return undefined;
    }

    const provider = options.provider;
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- 闭包捕获 BashTool 实例
    const bashTool = this;
    let cachedExecutor: SubAgentExecutor | null = null;

    return () => {
      if (cachedExecutor) return cachedExecutor;

      cachedExecutor = new SubAgentExecutor({
        provider,
        toolFactory: () => {
          // 为每个 SubAgent 创建隔离 BashTool 副本
          const isolatedBashTool = bashTool.createIsolatedCopy();
          const agentTool = callableToolToAgentTool(isolatedBashTool);
          return {
            tools: [agentTool],
            cleanup: () => isolatedBashTool.cleanup(),
          };
        },
      });

      return cachedExecutor;
    };
  }

  /**
   * Get the BashRouter (for advanced integrations/testing)
   */
  getRouter(): BashRouter {
    return this.router;
  }

  /**
   * Get the BashSession (for session management)
   */
  getSession(): BashSession {
    return this.session;
  }

  getSandboxManager(): SandboxManager {
    return this.sandboxManager;
  }

  /**
   * Restart the Bash session
   */
  async restartSession(): Promise<void> {
    await this.session.restart();
  }

  async executeUnsandboxed(command: string, cwd: string = process.cwd()): Promise<ExecuteResult> {
    return this.sandboxManager.executeUnsandboxed(command, cwd);
  }

  async allowSession(resourcePath: string, cwd: string = process.cwd()): Promise<void> {
    await this.sandboxManager.addRuntimeWhitelist(resourcePath, cwd);
  }

  async allowPermanent(resourcePath: string, cwd: string = process.cwd()): Promise<void> {
    addPermanentWhitelist(resourcePath);
    await this.allowSession(resourcePath, cwd);
  }

  async dispose(): Promise<void> {
    await this.sandboxManager.shutdown();
    this.router.shutdown();
    this.session.cleanup();
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    void this.dispose();
  }

  /**
   * Create a new BashTool instance with an isolated BashSession.
   */
  createIsolatedCopy(overrides: Partial<BashToolOptions> = {}): BashTool {
    const baseOptions: BashToolOptions = { ...this.optionsSnapshot };
    delete baseOptions.sandboxManager;

    return new BashTool({
      ...baseOptions,
      ...overrides,
    });
  }
}
