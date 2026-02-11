/**
 * 文件功能说明：
 * - 该文件位于 `src/tools/bash-tool.ts`，主要负责 Bash、工具 相关实现。
 * - 模块归属 工具 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `BashTool`
 * - `BashToolOptions`
 *
 * 作用说明：
 * - `BashTool`：封装该领域的核心流程与状态管理。
 * - `BashToolOptions`：定义模块交互的数据结构契约。
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
import { loadDesc } from '../utils/load-desc.js';
import type { LLMClient } from '../providers/llm-client.ts';
import { extractBaseCommand } from './constants.ts';
import {
  classifyToolFailure,
  shouldAttachToolSelfDescription,
  TOOL_FAILURE_CATEGORIES,
} from './tool-failure.ts';
import type { OnUsage } from '../providers/generate.ts';
import type {
  ToolResultEvent,
  SubAgentCompleteEvent,
  SubAgentToolCallEvent,
} from '../cli/terminal-renderer-types.ts';
import { addPermanentWhitelist, loadSandboxConfig } from '../sandbox/sandbox-config.ts';
import { SandboxManager } from '../sandbox/sandbox-manager.ts';
import type { ExecuteResult, SandboxConfig } from '../sandbox/types.ts';

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

/**
 * 方法说明：执行 appendSelfDescription 相关逻辑。
 * @param output 输入参数。
 * @param helpHint 输入参数。
 */
function appendSelfDescription(output: string, helpHint: string): string {
  return `${output}\n\n${helpHint.trim()}`;
}

/**
 * 方法说明：判断 isBashToolMisuse 对应条件是否成立。
 * @param command 输入参数。
 */
function isBashToolMisuse(command: string): boolean {
  return BASH_TOOL_MISUSE_REGEX.test(command.trim());
}

/**
 * Options for constructing BashTool
 */
export interface BashToolOptions {
  /** LLM client for semantic skill search */
  llmClient?: LLMClient;
  /** Callback to get current conversation path */
  getConversationPath?: () => string | null;
  /** SubAgent 工具调用开始回调 */
  onSubAgentToolStart?: (event: SubAgentToolCallEvent) => void;
  /** SubAgent 工具调用结束回调 */
  onSubAgentToolEnd?: (event: ToolResultEvent) => void;
  /** SubAgent 完成回调 */
  onSubAgentComplete?: (event: SubAgentCompleteEvent) => void;
  /** SubAgent usage 回调 */
  onSubAgentUsage?: OnUsage;
  /** 测试或外部注入的 SandboxManager */
  sandboxManager?: SandboxManager;
  /** 沙箱配置（createIsolatedCopy 时继承，优先于 loadSandboxConfig()） */
  sandboxConfig?: SandboxConfig;
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

  /**
   * 方法说明：初始化 BashTool 实例并设置初始状态。
   * @param options 配置参数。
   */
  constructor(options: BashToolOptions = {}) {
    super();
    this.optionsSnapshot = { ...options };
    this.description = loadDesc(path.join(import.meta.dirname, 'bash-tool.md'));

    this.session = new BashSession();
    this.sandboxManager = options.sandboxManager
      ?? new SandboxManager(options.sandboxConfig ?? loadSandboxConfig());
    this.router = new BashRouter(this.session, {
      llmClient: options.llmClient,
      sandboxManager: this.sandboxManager,
      getConversationPath: options.getConversationPath,
      onSubAgentToolStart: options.onSubAgentToolStart,
      onSubAgentToolEnd: options.onSubAgentToolEnd,
      onSubAgentComplete: options.onSubAgentComplete,
      onSubAgentUsage: options.onSubAgentUsage,
    });
    this.router.setToolExecutor(this);
  }

  /**
   * 方法说明：执行 execute 相关主流程。
   * @param params 集合数据。
   */
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
        return ToolError({
          message: `Command execution failed: ${message}`,
          brief: 'Command execution failed',
        });
      }), () => routePromise.cancel?.());

    return resultPromise;
  }

  /**
   * 方法说明：执行 restartSessionSafely 相关逻辑。
   */
  private async restartSessionSafely(): Promise<void> {
    try {
      await this.session.restart();
    } catch {
      // Best-effort restart; ignore errors to avoid masking the original failure.
    }
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

  /**
   * 方法说明：读取并返回 getSandboxManager 对应的数据。
   */
  getSandboxManager(): SandboxManager {
    return this.sandboxManager;
  }

  /**
   * Restart the Bash session
   */
  async restartSession(): Promise<void> {
    await this.session.restart();
  }

  /**
   * 方法说明：执行 executeUnsandboxed 相关主流程。
   * @param command 输入参数。
   * @param cwd 输入参数。
   */
  async executeUnsandboxed(command: string, cwd: string = process.cwd()): Promise<ExecuteResult> {
    return this.sandboxManager.executeUnsandboxed(command, cwd);
  }

  /**
   * 方法说明：执行 allowSession 相关逻辑。
   * @param resourcePath 目标路径或文件信息。
   * @param cwd 输入参数。
   */
  async allowSession(resourcePath: string, cwd: string = process.cwd()): Promise<void> {
    await this.sandboxManager.addRuntimeWhitelist(resourcePath, cwd);
  }

  /**
   * 方法说明：执行 allowPermanent 相关逻辑。
   * @param resourcePath 目标路径或文件信息。
   * @param cwd 输入参数。
   */
  async allowPermanent(resourcePath: string, cwd: string = process.cwd()): Promise<void> {
    addPermanentWhitelist(resourcePath);
    await this.allowSession(resourcePath, cwd);
  }

  /**
   * 方法说明：执行 dispose 相关逻辑。
   */
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
   * @param overrides 集合数据。
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
