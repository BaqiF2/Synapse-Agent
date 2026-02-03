/**
 * Bash Tool Implementation
 *
 * CallableTool subclass for the unified Bash tool. Routes commands through
 * BashRouter (three-layer architecture) and returns structured ToolReturnValue.
 *
 * Core Exports:
 * - BashTool: The Bash tool implementation
 * - BashToolParams: Zod-validated parameter type
 * - BashToolOptions: Construction options
 */

import path from 'node:path';
import { z } from 'zod';
import { CallableTool, ToolOk, ToolError, type ToolReturnValue } from './callable-tool.ts';
import { BashRouter } from './bash-router.ts';
import { BashSession } from './bash-session.ts';
import { loadDesc } from '../utils/load-desc.js';
import type { AnthropicClient } from '../providers/anthropic/anthropic-client.ts';
import { extractBaseCommand } from './constants.ts';

const COMMAND_TIMEOUT_MARKER = 'Command execution timeout';
const HELP_HINT_TEMPLATE = '\n\nHint: Run `{command} --help` to learn the correct usage before retrying.';

/**
 * Zod schema for Bash tool parameters
 */
const BashToolParamsSchema = z.object({
  command: z.string().describe(
    'The bash command to execute. Must be non-interactive. Chain commands with `&&` or `;` if needed.'
  ),
  restart: z.boolean().default(false).describe(
    'If true, kills the existing shell session and starts a fresh one (clears env vars and resets CWD). Use only when the environment is corrupted.'
  ),
});

export type BashToolParams = z.infer<typeof BashToolParamsSchema>;

/**
 * Options for constructing BashTool
 */
export interface BashToolOptions {
  /** LLM client for semantic skill search */
  llmClient?: AnthropicClient;
  /** Callback to get current conversation path */
  getConversationPath?: () => string | null;
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

  private session: BashSession;
  private router: BashRouter;

  constructor(options: BashToolOptions = {}) {
    super();
    this.description = loadDesc(path.join(import.meta.dirname, 'bash-tool.md'));

    this.session = new BashSession();
    this.router = new BashRouter(this.session, {
      llmClient: options.llmClient,
      getConversationPath: options.getConversationPath,
    });
  }

  protected async execute(params: BashToolParams): Promise<ToolReturnValue> {
    const { command, restart } = params;

    // Validate command
    if (!command.trim()) {
      return ToolError({
        message: 'Error: command parameter is required and must be a non-empty string',
        brief: 'Empty command',
      });
    }

    try {
      const result = await this.router.route(command, restart);
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
      } else {
        const baseCommand = extractBaseCommand(command);
        const helpHint = HELP_HINT_TEMPLATE.replace('{command}', baseCommand);
        return ToolError({
          output,
          message: `Command failed with exit code ${result.exitCode}${helpHint}`,
          brief: 'Bash command failed',
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes(COMMAND_TIMEOUT_MARKER)) {
        await this.restartSessionSafely();
      }
      return ToolError({
        message: `Command execution failed: ${message}`,
        brief: 'Command execution failed',
      });
    }
  }

  private async restartSessionSafely(): Promise<void> {
    try {
      await this.session.restart();
    } catch {
      // Best-effort restart; ignore errors to avoid masking the original failure.
    }
  }

  /**
   * Get the BashRouter (for delayed binding of toolExecutor)
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
   * Restart the Bash session
   */
  async restartSession(): Promise<void> {
    await this.session.restart();
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.session.cleanup();
  }
}
