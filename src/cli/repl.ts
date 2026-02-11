import * as readline from 'node:readline';
import chalk from 'chalk';

import type { AgentRunner } from '../agent/agent-runner.ts';
import { Session } from '../agent/session.ts';
import { FixedBottomRenderer } from './fixed-bottom-renderer.ts';
import { extractHookOutput } from './hook-output.ts';
import { TerminalRenderer } from './terminal-renderer.ts';
import { todoStore } from '../tools/handlers/agent-bash/todo/todo-store.ts';
import {
  executeShellCommand,
  handleSpecialCommand,
  handleSigint,
  type ReplState,
  type SigintHandlerOptions,
  type SpecialCommandOptions,
} from './repl-commands.ts';
import { formatStreamText } from './repl-display.ts';
import { initializeAgent, initializeMcp, initializeSkills, showWelcomeBanner } from './repl-init.ts';
import { getErrorMessage } from '../utils/error.ts';
import { createLogger } from '../utils/logger.ts';

export { executeShellCommand, handleSpecialCommand, handleSigint, formatStreamText };
export type { ReplState, SigintHandlerOptions };

const cliLogger = createLogger('cli');

type ReplPhase = 'idle' | 'running' | 'shutting-down';

type ParsedInput =
  | { kind: 'empty' }
  | { kind: 'shell'; command: string }
  | { kind: 'command'; command: string }
  | { kind: 'chat'; text: string };

interface ReplRuntimeState {
  phase: ReplPhase;
  activeTurn: ActiveTurnController | null;
}

interface ReplOutput {
  promptUser: () => void;
  printBlankLine: () => void;
  printShellUsage: () => void;
  printAgentPrefix: () => void;
  printAgentError: (message: string) => void;
  printSessionLoaded: (messageCount: number) => void;
}

function clearPromptLine(rl: readline.Interface): void {
  const output = (rl as { output?: NodeJS.WriteStream }).output;
  if (!output || !output.isTTY) return;
  readline.clearLine(output, 0);
  readline.cursorTo(output, 0);
}

interface ActiveTurnController {
  abortController: AbortController;
  interrupted: boolean;
}

function createReplOutput(rl: readline.Interface): ReplOutput {
  return {
    promptUser: () => {
      clearPromptLine(rl);
      rl.setPrompt(chalk.green('You> '));
      rl.prompt(true);
    },
    printBlankLine: () => {
      console.log();
    },
    printShellUsage: () => {
      console.log(chalk.red('\nUsage: !<command>\n'));
    },
    printAgentPrefix: () => {
      console.log();
      process.stdout.write(chalk.magenta('Agent> '));
    },
    printAgentError: (message: string) => {
      console.log(chalk.red(`\nError: ${message}\n`));
    },
    printSessionLoaded: (messageCount: number) => {
      console.log(chalk.green(`✓ Loaded ${messageCount} messages from session\n`));
    },
  };
}

function parseInput(input: string): ParsedInput {
  const trimmed = input.trim();
  if (!trimmed) {
    return { kind: 'empty' };
  }
  if (trimmed.startsWith('!')) {
    return { kind: 'shell', command: trimmed.slice(1).trim() };
  }
  if (trimmed.startsWith('/')) {
    return { kind: 'command', command: trimmed };
  }
  return { kind: 'chat', text: trimmed };
}

function isExitCommand(command: string): boolean {
  const normalized = command.toLowerCase();
  return normalized === '/exit' || normalized === '/quit' || normalized === '/q';
}

function clearCurrentInput(rl: readline.Interface): void {
  try {
    rl.write('', { ctrl: true, name: 'u' });
    return;
  } catch {
    // Fallback for environments where readline key events are unavailable.
  }

  const rlState = rl as unknown as { line?: string; cursor?: number };
  rlState.line = '';
  rlState.cursor = 0;
}

function createSigintState(runtimeState: ReplRuntimeState): ReplState {
  const state = {} as ReplState;
  Object.defineProperty(state, 'isProcessing', {
    enumerable: true,
    configurable: false,
    get: () => runtimeState.phase === 'running',
    set: (isProcessing: boolean) => {
      runtimeState.phase = isProcessing ? 'running' : 'idle';
    },
  });
  return state;
}

async function runAgentConversation(options: {
  input: string;
  runtimeState: ReplRuntimeState;
  rl: readline.Interface;
  output: ReplOutput;
  agentRunner: AgentRunner;
  terminalRenderer: TerminalRenderer;
}): Promise<void> {
  const { input, runtimeState, rl, output, agentRunner, terminalRenderer } = options;

  runtimeState.phase = 'running';
  const turnController: ActiveTurnController = {
    abortController: new AbortController(),
    interrupted: false,
  };
  runtimeState.activeTurn = turnController;

  rl.setPrompt('');
  clearPromptLine(rl);
  output.printAgentPrefix();

  try {
    const response = await agentRunner.run(input, { signal: turnController.abortController.signal });
    const shouldRender = runtimeState.activeTurn === turnController && !turnController.interrupted;
    terminalRenderer.renderHookOutput(extractHookOutput(response), shouldRender);
    terminalRenderer.renderTurnEnd(shouldRender);
  } catch (error) {
    if (!turnController.interrupted) {
      const message = getErrorMessage(error);
      output.printAgentError(message);
      cliLogger.error('Agent request failed', { error: message });
    }
  } finally {
    if (runtimeState.activeTurn === turnController) {
      runtimeState.activeTurn = null;
      runtimeState.phase = 'idle';
      output.promptUser();
    }
  }
}

function createLineHandler(options: {
  runtimeState: ReplRuntimeState;
  rl: readline.Interface;
  output: ReplOutput;
  terminalRenderer: TerminalRenderer;
  getAgentRunner: () => AgentRunner;
  dispatchSpecialCommand: (command: string) => Promise<boolean>;
  interruptCurrentTurn: () => void;
}): (input: string) => Promise<void> {
  const {
    runtimeState,
    rl,
    output,
    terminalRenderer,
    getAgentRunner,
    dispatchSpecialCommand,
    interruptCurrentTurn,
  } = options;

  return async (input: string) => {
    const parsedInput = parseInput(input);
    const isRunning = runtimeState.phase === 'running';

    if (isRunning) {
      if (parsedInput.kind === 'command' && isExitCommand(parsedInput.command)) {
        interruptCurrentTurn();
        await dispatchSpecialCommand(parsedInput.command);
      } else {
        clearPromptLine(rl);
      }
      return;
    }

    switch (parsedInput.kind) {
      case 'empty':
        output.promptUser();
        return;
      case 'shell':
        if (!parsedInput.command) {
          output.printShellUsage();
          output.promptUser();
          return;
        }
        output.printBlankLine();
        await executeShellCommand(parsedInput.command);
        output.printBlankLine();
        output.promptUser();
        return;
      case 'command':
        await dispatchSpecialCommand(parsedInput.command);
        output.promptUser();
        return;
      case 'chat':
        await runAgentConversation({
          input: parsedInput.text,
          runtimeState,
          rl,
          output,
          agentRunner: getAgentRunner(),
          terminalRenderer,
        });
        return;
      default:
        return;
    }
  };
}

function createSpecialCommandOptions(options: {
  onResumeSession: (sessionId: string) => Promise<void>;
  getCurrentSessionId: () => string;
}): SpecialCommandOptions {
  return {
    onResumeSession: options.onResumeSession,
    getCurrentSessionId: options.getCurrentSessionId,
  };
}

function createShutdown(options: {
  runtimeState: ReplRuntimeState;
  rl: readline.Interface;
  fixedBottomRenderer: FixedBottomRenderer;
  interruptCurrentTurn: () => void;
  handleLine: (input: string) => Promise<void>;
  onProcessSigint: () => void;
}): () => void {
  const {
    runtimeState,
    rl,
    fixedBottomRenderer,
    interruptCurrentTurn,
    handleLine,
    onProcessSigint,
  } = options;

  let disposed = false;
  return () => {
    if (disposed) {
      return;
    }
    disposed = true;
    runtimeState.phase = 'shutting-down';
    interruptCurrentTurn();
    rl.off('line', handleLine);
    rl.off('SIGINT', onProcessSigint);
    fixedBottomRenderer.dispose();
  };
}

export async function startRepl(): Promise<void> {
  let session: Session;
  let rlForCleanup: readline.Interface | null = null;
  let fixedBottomRenderer: FixedBottomRenderer | null = null;

  try {
    session = await Session.create();
    await initializeMcp();
    await initializeSkills();

    fixedBottomRenderer = new FixedBottomRenderer();
    fixedBottomRenderer.attachTodoStore(todoStore);
    const terminalRenderer = new TerminalRenderer();

    const runtimeState: ReplRuntimeState = { phase: 'idle', activeTurn: null };
    const state = createSigintState(runtimeState);
    const shouldRenderTurn = () => Boolean(runtimeState.activeTurn && !runtimeState.activeTurn.interrupted);

    let agentRunner = initializeAgent(session, { shouldRenderTurn });
    showWelcomeBanner(session.id);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '',
    });
    rlForCleanup = rl;
    const output = createReplOutput(rl);

    const interruptCurrentTurn = () => {
      const currentTurn = runtimeState.activeTurn;
      if (!currentTurn) {
        return;
      }
      currentTurn.interrupted = true;
      currentTurn.abortController.abort();
      runtimeState.activeTurn = null;
      runtimeState.phase = 'idle';
    };

    const onResumeSession = async (sessionId: string) => {
      const resumedSession = await Session.find(sessionId);
      if (!resumedSession) {
        return;
      }
      session = resumedSession;
      agentRunner = initializeAgent(session, { shouldRenderTurn });
      const history = await session.loadHistory();
      output.printSessionLoaded(history.length);
    };

    const dispatchSpecialCommand = (command: string) =>
      handleSpecialCommand(
        command,
        rl,
        agentRunner,
        createSpecialCommandOptions({
          onResumeSession,
          getCurrentSessionId: () => session.id,
        })
      );

    const handleLine = createLineHandler({
      runtimeState,
      rl,
      output,
      terminalRenderer,
      getAgentRunner: () => agentRunner,
      dispatchSpecialCommand,
      interruptCurrentTurn,
    });

    const onProcessSigint = () => handleSigint({
      state,
      promptUser: output.promptUser,
      interruptCurrentTurn,
      clearCurrentInput: () => clearCurrentInput(rl),
    });

    const shutdown = createShutdown({
      runtimeState,
      rl,
      fixedBottomRenderer,
      interruptCurrentTurn,
      handleLine,
      onProcessSigint,
    });

    rl.on('line', handleLine);
    rl.on('SIGINT', onProcessSigint);
    rl.on('close', () => {
      shutdown();
      process.exit(0);
    });

    output.promptUser();
  } catch (error) {
    const message = getErrorMessage(error);
    fixedBottomRenderer?.dispose();
    rlForCleanup?.close();
    console.error(chalk.red(`Failed to start REPL: ${message}`));
    cliLogger.error('Failed to start REPL startup', { error: message });
    process.exit(1);
  }
}
