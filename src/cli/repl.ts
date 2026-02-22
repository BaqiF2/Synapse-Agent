/**
 * REPL 交互模式实现
 *
 * 功能：提供命令行交互式对话界面的主循环入口。
 *       命令处理位于 commands/ 子目录，显示函数位于 renderer/repl-display.ts，
 *       初始化逻辑位于 repl-init.ts。
 *
 * 核心导出：
 * - startRepl(): 启动 REPL 循环
 */

import * as readline from 'node:readline';
import chalk from 'chalk';

import { Session } from '../core/session/session.ts';
import { FixedBottomRenderer } from './fixed-bottom-renderer.ts';
import { extractHookOutput } from './hook-output.ts';
import { todoStore } from '../tools/commands/todo-handler.ts';
import {
  executeShellCommand,
  handleSpecialCommand,
  handleSigint,
  formatStreamText,
  type ReplState,
  type SigintHandlerOptions,
  type SpecialCommandOptions,
} from './commands/index.ts';
import { initializeAgent, initializeMcp, initializeSkills, showWelcomeBanner } from './repl-init.ts';
import { createLogger } from '../shared/file-logger.ts';

// re-export 供外部使用（测试等）
export { executeShellCommand, handleSpecialCommand, handleSigint, formatStreamText };
export type { ReplState, SigintHandlerOptions };

const cliLogger = createLogger('cli');

// ===== 内部工具函数 =====

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function clearPromptLine(rl: readline.Interface): void {
  const output = (rl as { output?: NodeJS.WriteStream }).output;
  if (!output || !output.isTTY) return;
  readline.clearLine(output, 0);
  readline.cursorTo(output, 0);
}

// ===== REPL 主循环 =====

interface ActiveTurnController {
  abortController: AbortController;
  interrupted: boolean;
}

/**
 * Start the REPL (Read-Eval-Print-Loop) interactive mode
 */
export async function startRepl(): Promise<void> {
  // 创建会话
  let session = await Session.create();

  // 初始化工具
  await initializeMcp();
  await initializeSkills();

  // 初始化固定底部渲染器（Todo 列表）
  const fixedBottomRenderer = new FixedBottomRenderer();
  fixedBottomRenderer.attachTodoStore(todoStore);

  // State
  const state: ReplState = { isProcessing: false };
  let activeTurn: ActiveTurnController | null = null;
  const shouldRenderTurn = () => Boolean(activeTurn && !activeTurn.interrupted);

  // 初始化 agent
  let agentRunner = initializeAgent(session, { shouldRenderTurn });

  // Welcome banner
  showWelcomeBanner(session.id);

  // Setup readline
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '',
  });

  const promptUser = () => {
    clearPromptLine(rl);
    rl.setPrompt(chalk.green('You> '));
    rl.prompt(true);
  };

  const clearCurrentInput = () => {
    const rlState = rl as unknown as {
      line?: string;
      cursor?: number;
    };
    rlState.line = '';
    rlState.cursor = 0;
  };

  const runAgentTurn = async (trimmedInput: string, signal?: AbortSignal) => {
    if (!agentRunner) {
      // Echo mode when agent is not available
      console.log(chalk.gray(`(echo) ${trimmedInput}`));
      return;
    }

    const response = await agentRunner.run(trimmedInput, { signal });
    const hookOutput = extractHookOutput(response);
    if (hookOutput && shouldRenderTurn()) {
      process.stdout.write(chalk.cyan(`\n${hookOutput}`));
    }
  };

  const interruptCurrentTurn = () => {
    const currentTurn = activeTurn;
    if (!currentTurn) {
      return;
    }

    currentTurn.interrupted = true;
    currentTurn.abortController.abort();
    activeTurn = null;
  };

  // 处理 resume 的回调
  const handleResumeSession = async (sessionId: string) => {
    const resumedSession = await Session.find(sessionId);
    if (resumedSession) {
      session = resumedSession;
      agentRunner = initializeAgent(session, { shouldRenderTurn });
      const history = await session.loadHistory();
      console.log(chalk.green(`✓ Loaded ${history.length} messages from session\n`));
    }
  };

  const createSpecialCommandOptions = (): SpecialCommandOptions => ({
    onResumeSession: handleResumeSession,
    getCurrentSessionId: () => session.id,
  });

  // 主输入处理
  const handleLine = async (input: string) => {
    const trimmedInput = input.trim();

    // 执行中忽略后续输入
    if (state.isProcessing) {
      const isExitCommand = trimmedInput === '/exit' || trimmedInput === '/quit';
      if (isExitCommand) {
        interruptCurrentTurn();
        await handleSpecialCommand(trimmedInput, rl, agentRunner, createSpecialCommandOptions());
        return;
      }
      clearPromptLine(rl);
      return;
    }

    // 处理空输入
    if (!trimmedInput) {
      promptUser();
      return;
    }

    // Shell commands (! prefix)
    if (trimmedInput.startsWith('!')) {
      const shellCommand = trimmedInput.slice(1).trim();
      if (shellCommand) {
        console.log();
        await executeShellCommand(shellCommand);
        console.log();
      } else {
        console.log(chalk.red('\nUsage: !<command>\n'));
      }
      promptUser();
      return;
    }

    // Special commands (/ prefix)
    if (trimmedInput.startsWith('/')) {
      await handleSpecialCommand(trimmedInput, rl, agentRunner, createSpecialCommandOptions());
      promptUser();
      return;
    }

    // Agent conversation
    state.isProcessing = true;
    const turnController: ActiveTurnController = {
      abortController: new AbortController(),
      interrupted: false,
    };
    activeTurn = turnController;
    rl.setPrompt('');
    clearPromptLine(rl);
    console.log();
    process.stdout.write(chalk.magenta('Agent> '));

    try {
      await runAgentTurn(trimmedInput, turnController.abortController.signal);
      if (!turnController.interrupted) {
        process.stdout.write('\n');
      }
    } catch (error) {
      if (!turnController.interrupted) {
        const message = getErrorMessage(error);
        console.log(chalk.red(`\nError: ${message}\n`));
        cliLogger.error('Agent request failed', { error: message });
      }
    } finally {
      if (activeTurn === turnController) {
        activeTurn = null;
        state.isProcessing = false;
        promptUser();
      }
    }
  };

  // Event handlers
  rl.on('line', handleLine);

  rl.on('close', () => {
    fixedBottomRenderer.dispose();
    rl.off('SIGINT', onProcessSigint);
    process.exit(0);
  });

  const onProcessSigint = () => handleSigint({
    state,
    promptUser,
    interruptCurrentTurn,
    clearCurrentInput,
  });

  rl.on('SIGINT', onProcessSigint);

  // Start
  promptUser();
}
