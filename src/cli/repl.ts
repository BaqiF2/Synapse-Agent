/**
 * REPL 交互模式实现
 *
 * 功能：提供命令行交互式对话界面，支持用户输入和响应输出
 *       支持 Shell 命令直接执行（! 前缀）和特殊命令（/ 前缀）
 *       集成 LLM 客户端实现完整的 Agent Loop
 *
 * 核心导出：
 * - startRepl(): 启动 REPL 循环
 * - executeShellCommand(): 执行 Shell 命令
 * - handleSpecialCommand(): 处理特殊命令
 */

import * as readline from 'node:readline';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import chalk from 'chalk';

// Agent imports
import { AnthropicClient } from '../providers/anthropic/anthropic-client.ts';
import { buildSystemPrompt } from '../agent/system-prompt.ts';
import { Session } from '../agent/session.ts';
import { AgentRunner } from '../agent/agent-runner.ts';
import { CallableToolset } from '../tools/toolset.ts';
import { BashTool } from '../tools/bash-tool.ts';
import { McpInstaller, initializeMcpTools } from '../tools/converters/mcp/index.ts';
import { initializeSkillTools } from '../tools/converters/skill/index.ts';
import { createLogger } from '../utils/logger.ts';
import { SettingsManager } from '../config/settings-manager.ts';
import { TerminalRenderer } from './terminal-renderer.ts';
import { FixedBottomRenderer } from './fixed-bottom-renderer.ts';
import { extractHookOutput } from './hook-output.ts';
import { todoStore } from '../tools/handlers/agent-bash/todo/todo-store.ts';
import { SKILL_ENHANCE_PROGRESS_TEXT } from '../hooks/skill-enhance-constants.ts';
// ════════════════════════════════════════════════════════════════════
//  Constants & Configuration
// ════════════════════════════════════════════════════════════════════

const cliLogger = createLogger('cli');
const MAX_TOOL_ITERATIONS = parseInt(process.env.SYNAPSE_MAX_TOOL_ITERATIONS || '50', 10);
const BRIGHT_PROGRESS_START = '\x1b[1;93m';
const BRIGHT_PROGRESS_END = '\x1b[0m';

// ════════════════════════════════════════════════════════════════════
//  Types
// ════════════════════════════════════════════════════════════════════

export interface ReplState {
  isProcessing: boolean;
}

interface ActiveTurnController {
  abortController: AbortController;
  interrupted: boolean;
}

export interface SigintHandlerOptions {
  state: ReplState;
  promptUser: () => void;
  interruptCurrentTurn: () => void;
  clearCurrentInput?: () => void;
}

// ════════════════════════════════════════════════════════════════════
//  Utility Helpers
// ════════════════════════════════════════════════════════════════════

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function printSectionHeader(title: string): void {
  console.log();
  console.log(chalk.cyan.bold(title));
  console.log(chalk.cyan('═'.repeat(50)));
}

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function clearPromptLine(rl: readline.Interface): void {
  const output = (rl as { output?: NodeJS.WriteStream }).output;
  if (!output || !output.isTTY) return;
  readline.clearLine(output, 0);
  readline.cursorTo(output, 0);
}

export function formatStreamText(text: string): string {
  if (
    text.includes(SKILL_ENHANCE_PROGRESS_TEXT) &&
    (process.stdout as { isTTY?: boolean }).isTTY
  ) {
    return `${BRIGHT_PROGRESS_START}${text}${BRIGHT_PROGRESS_END}`;
  }
  return text;
}

/**
 * 格式化相对时间
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function extractSkillDescription(content: string): string | null {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatterMatch?.[1]) {
    const lines = frontmatterMatch[1].split('\n');
    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex <= 0) continue;
      const key = line.slice(0, colonIndex).trim();
      if (key !== 'description') continue;
      const rawValue = line.slice(colonIndex + 1).trim();
      if (!rawValue) return null;
      return stripWrappingQuotes(rawValue);
    }
  }

  const markdownDesc =
    content.match(/\*\*描述\*\*:\s*(.+)/)?.[1] ??
    content.match(/\*\*Description\*\*:\s*(.+)/i)?.[1];
  return markdownDesc ? markdownDesc.trim() : null;
}

// ════════════════════════════════════════════════════════════════════
//  Display Functions
// ════════════════════════════════════════════════════════════════════

function showHelp(): void {
  printSectionHeader('Synapse Agent - Help');
  console.log();
  console.log(chalk.white.bold('Common:'));
  console.log(chalk.gray('  /help, /h, /?    ') + chalk.white('Show this help message'));
  console.log(chalk.gray('  /exit, /quit, /q ') + chalk.white('Exit the REPL'));
  console.log(chalk.gray('  /clear           ') + chalk.white('Clear conversation history'));
  console.log(chalk.gray('  /tools           ') + chalk.white('List available tools'));
  console.log(chalk.gray('  /skills          ') + chalk.white('List all available skills'));
  console.log();
  console.log(chalk.white.bold('Session:'));
  console.log(chalk.gray('  /resume          ') + chalk.white('List and resume a previous session'));
  console.log(chalk.gray('  /resume --last   ') + chalk.white('Resume the most recent session'));
  console.log();
  console.log(chalk.white.bold('Skill:'));
  console.log(chalk.gray('  /skill enhance       ') + chalk.white('Show auto-enhance status'));
  console.log(chalk.gray('  /skill enhance --on  ') + chalk.white('Enable auto skill enhance'));
  console.log(chalk.gray('  /skill enhance --off ') + chalk.white('Disable auto skill enhance'));
  console.log(chalk.gray('  /skill enhance -h    ') + chalk.white('Show skill enhance help'));
  console.log();
  console.log(chalk.white.bold('Execute:'));
  console.log(chalk.gray('  !<command>       ') + chalk.white('Execute a shell command directly'));
  console.log(chalk.gray('                   ') + chalk.white('Example: !ls -la, !git status'));
  console.log();
  console.log(chalk.white.bold('Keyboard Shortcuts:'));
  console.log(chalk.gray('  Ctrl+C           ') + chalk.white('Interrupt current turn immediately'));
  console.log(chalk.gray('  Ctrl+D           ') + chalk.white('Exit immediately'));
  console.log();
}

export function handleSigint(options: SigintHandlerOptions): void {
  const { state, promptUser, interruptCurrentTurn, clearCurrentInput } = options;

  if (state.isProcessing) {
    interruptCurrentTurn();
    state.isProcessing = false;
  } else {
    // 空闲时 Ctrl+C 仅清空当前输入并回到提示符，不触发退出确认。
    clearCurrentInput?.();
  }

  promptUser();
}

function showToolsList(): void {
  printSectionHeader('Available Tools');
  console.log();
  const installer = new McpInstaller();
  const result = installer.search({ pattern: '*', type: 'all' });
  const output = installer.formatSearchResult(result);
  const lines = output.split('\n');
  if (lines[0]?.startsWith('Found ')) {
    lines.shift();
    if (lines[0] === '') {
      lines.shift();
    }
  }
  console.log(lines.join('\n'));
  console.log();
}

function showSkillsList(): void {
  printSectionHeader('Available Skills');

  const skillsDir = path.join(os.homedir(), '.synapse', 'skills');

  if (!fs.existsSync(skillsDir)) {
    console.log(chalk.gray('  No skills directory found.'));
    console.log(chalk.gray(`  Create skills in: ${skillsDir}`));
    console.log();
    return;
  }

  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    const skills = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.'));

    if (skills.length === 0) {
      console.log(chalk.gray('  No skills installed.'));
      console.log(chalk.gray(`  Create skills in: ${skillsDir}`));
      console.log();
      return;
    }

    for (const skill of skills) {
      const skillMdPath = path.join(skillsDir, skill.name, 'SKILL.md');
      let description = chalk.gray('(No description)');

      if (fs.existsSync(skillMdPath)) {
        try {
          const content = fs.readFileSync(skillMdPath, 'utf-8');
          const parsedDescription = extractSkillDescription(content);
          if (parsedDescription) {
            description = chalk.white(parsedDescription);
          }
        } catch {
          // Ignore read errors
        }
      }

      console.log(chalk.green(`  ${skill.name}`));
      console.log(`    ${description}`);
    }

    console.log();
  } catch (error) {
    const message = getErrorMessage(error);
    console.log(chalk.red(`  Error reading skills: ${message}`));
    console.log();
  }
}

function showSkillEnhanceHelp(): void {
  printSectionHeader('Skill Enhance - Help');
  console.log();
  console.log(chalk.white.bold('Description:'));
  console.log(chalk.white('  Manage automatic skill enhancement based on conversation history.'));
  console.log(chalk.white('  When enabled, the system analyzes completed tasks and may'));
  console.log(chalk.white('  create or enhance skills to improve future performance.'));
  console.log();
  console.log(chalk.white.bold('Usage:'));
  console.log(chalk.gray('  /skill enhance                   ') + chalk.white('Show current status'));
  console.log(chalk.gray('  /skill enhance --on              ') + chalk.white('Enable auto-enhance'));
  console.log(chalk.gray('  /skill enhance --off             ') + chalk.white('Disable auto-enhance'));
  console.log(
    chalk.gray('  /skill enhance --conversation <path>  ') + chalk.white('Manual enhance from file')
  );
  console.log(chalk.gray('  /skill enhance -h, --help        ') + chalk.white('Show this help'));
  console.log();
  console.log(chalk.white.bold('Examples:'));
  console.log(chalk.gray('  /skill enhance --on'));
  console.log(chalk.gray('  /skill enhance --conversation ~/.synapse/conversations/session.jsonl'));
  console.log();
  console.log(chalk.white.bold('Note:'));
  console.log(chalk.yellow('  Auto-enhance consumes additional tokens for LLM analysis.'));
  console.log();
}

// ════════════════════════════════════════════════════════════════════
//  Command Handlers
// ════════════════════════════════════════════════════════════════════

/**
 * Execute a shell command directly (for ! prefix)
 * Streams output to the terminal in real-time
 *
 * @param command - The shell command to execute (without the ! prefix)
 * @returns Promise that resolves when the command completes
 */
export async function executeShellCommand(command: string): Promise<number> {
  return new Promise((resolve) => {
    // 使用 spawn 创建子进程来执行传入的命令
    const child = spawn(command, {
      shell: true,
      stdio: ['inherit', 'inherit', 'inherit'],
    });
    // 监听子进程的错误事件，如果出现错误则打印红色错误信息并返回退出码 1
    child.on('error', (error) => {
      console.error(chalk.red(`Shell command error: ${error.message}`));
      resolve(1);
    });
    // 监听子进程的退出事件，获取实际的退出码（如果为 null 则默认为 0）
    child.on('exit', (code) => {
      const exitCode = code ?? 0;
      if (exitCode !== 0) {
        console.log(chalk.gray(`Exit code: ${exitCode}`));
      }
      resolve(exitCode);
    });
  });
}

/**
 * Handle special REPL commands (/ prefix)
 *
 * @param command - The command (with / prefix)
 * @param rl - Readline interface
 * @param agentRunner - Optional agent runner for context access
 * @param options - Optional settings for testing
 * @returns true if command was handled, false otherwise
 */
export function handleSpecialCommand(
  command: string,
  rl: readline.Interface,
  agentRunner?: AgentRunner | null,
  options?: { skipExit?: boolean; onResumeSession?: (sessionId: string) => void }
): boolean {
  const cmd = command.toLowerCase().trim();
  const parts = command.trim().split(/\s+/);

  switch (cmd) {
    case '/exit':
    case '/quit':
    case '/q':
      console.log(chalk.yellow('\nGoodbye!\n'));
      rl.close();
      if (!options?.skipExit) {
        process.exit(0);
      }
      return true;

    case '/help':
    case '/h':
    case '/?':
      showHelp();
      return true;

    case '/clear':
      if (agentRunner) {
        agentRunner.clearSession().catch((err) => {
          console.error(chalk.red(`Failed to clear session: ${err.message}`));
        });
      }
      console.log(chalk.green('\nConversation history cleared.\n'));
      return true;

    case '/tools':
      showToolsList();
      return true;

    case '/skills':
      showSkillsList();
      return true;

    default:
      // /resume 命令
      if (cmd === '/resume' || cmd.startsWith('/resume ')) {
        const args = parts.slice(1);
        if (options?.onResumeSession) {
          handleResumeCommand(args, rl, options.onResumeSession);
        } else {
          console.log(chalk.yellow('\nResume not available in this context.\n'));
        }
        return true;
      }

      if (parts[0]?.toLowerCase() === '/skill') {
        handleSkillEnhanceCommand(parts.slice(1), agentRunner);
        return true;
      }

      if (cmd.startsWith('/')) {
        console.log(chalk.red(`\nUnknown command: ${cmd}`));
        console.log(chalk.gray('Type /help for available commands.\n'));
        return true;
      }
      return false;
  }
}

/**
 * Handle /skill enhance commands
 *
 * @param args - Command arguments (after '/skill')
 * @param agentRunner - Optional agent runner for enhance operations
 */
function handleSkillEnhanceCommand(args: string[], _agentRunner?: AgentRunner | null): void {
  const subcommand = args[0]?.toLowerCase();

  if (subcommand !== 'enhance') {
    console.log(chalk.red(`\nUnknown skill command: ${subcommand || '(none)'}`));
    console.log(chalk.gray('Available commands:'));
    console.log(chalk.gray('  /skill enhance         Show auto-enhance status'));
    console.log(chalk.gray('  /skill enhance --on    Enable auto-enhance'));
    console.log(chalk.gray('  /skill enhance --off   Disable auto-enhance'));
    console.log(chalk.gray('  /skill enhance -h      Show help\n'));
    return;
  }

  const enhanceArgs = args.slice(1);
  const settingsManager = new SettingsManager();

  if (enhanceArgs.includes('-h') || enhanceArgs.includes('--help')) {
    showSkillEnhanceHelp();
    return;
  }

  if (enhanceArgs.includes('--on')) {
    settingsManager.setAutoEnhance(true);
    console.log(chalk.green('\nAuto skill enhance enabled.'));
    console.log(chalk.gray('Skills will be automatically enhanced after task completion.'));
    console.log(chalk.gray('Note: This will consume additional tokens.\n'));
    console.log(chalk.gray('Use /skill enhance --off to disable.\n'));
    return;
  }

  if (enhanceArgs.includes('--off')) {
    settingsManager.setAutoEnhance(false);
    console.log(chalk.yellow('\nAuto skill enhance disabled.\n'));
    return;
  }

  if (enhanceArgs.indexOf('--conversation') !== -1) {
    console.log(chalk.yellow('\nManual enhance is temporarily unavailable.\n'));
    console.log(chalk.gray('Use auto-enhance with --on flag instead.\n'));
    return;
  }

  // No flags — show current status
  const isEnabled = settingsManager.isAutoEnhanceEnabled();
  printSectionHeader('Skill Auto-Enhance Status');
  console.log();
  console.log(
    chalk.white('  Status: ') +
      (isEnabled ? chalk.green('Enabled') : chalk.yellow('Disabled'))
  );
  console.log();
  console.log(chalk.gray('Commands:'));
  console.log(chalk.gray('  /skill enhance --on              Enable auto-enhance'));
  console.log(chalk.gray('  /skill enhance --off             Disable auto-enhance'));
  console.log(chalk.gray('  /skill enhance --conversation <path>  Manual enhance'));
  console.log(chalk.gray('  /skill enhance -h                Show help'));
  console.log();
}

/**
 * Handle /resume command
 */
async function handleResumeCommand(
  args: string[],
  rl: readline.Interface,
  onSessionSelected: (sessionId: string) => void
): Promise<void> {
  // /resume --last
  if (args.includes('--last')) {
    const session = await Session.continue();
    if (!session) {
      console.log(chalk.yellow('\nNo previous sessions found.\n'));
      return;
    }
    console.log(chalk.green(`\n✓ Resuming session: ${session.id}\n`));
    onSessionSelected(session.id);
    return;
  }

  // /resume <session-id>
  const firstArg = args[0];
  if (args.length > 0 && firstArg && !firstArg.startsWith('-')) {
    const sessionId = firstArg;
    const session = await Session.find(sessionId);
    if (!session) {
      console.log(chalk.red(`\nSession not found: ${sessionId}\n`));
      return;
    }
    console.log(chalk.green(`\n✓ Resuming session: ${session.id}\n`));
    onSessionSelected(session.id);
    return;
  }

  // /resume (interactive list)
  const sessions = await Session.list();

  if (sessions.length === 0) {
    console.log(chalk.yellow('\nNo previous sessions found.\n'));
    return;
  }

  const displayCount = 10;
  console.log(chalk.cyan('\nRecent Sessions:'));
  sessions.slice(0, displayCount).forEach((s, i) => {
    const title = s.title || '(untitled)';
    const time = formatRelativeTime(s.updatedAt);
    const idShort = s.id.substring(0, 20);
    console.log(chalk.gray(`  ${i + 1}. `) + chalk.white(`[${idShort}] `) +
      chalk.white(title) + chalk.gray(` (${time})`));
  });
  console.log();

  rl.question(chalk.yellow('Enter number or session ID to resume (or press Enter to cancel): '),
    async (answer) => {
      const trimmed = answer.trim();
      if (!trimmed) {
        console.log(chalk.gray('Cancelled.\n'));
        return;
      }

      let sessionId: string | undefined;

      // 尝试解析为数字
      const num = parseInt(trimmed, 10);
      const sessionByIndex = sessions[num - 1];
      if (!isNaN(num) && num >= 1 && sessionByIndex) {
        sessionId = sessionByIndex.id;
      } else {
        // 尝试作为 session ID
        const found = sessions.find((s) => s.id === trimmed || s.id.startsWith(trimmed));
        sessionId = found?.id;
      }

      if (!sessionId) {
        console.log(chalk.red(`\nInvalid selection: ${trimmed}\n`));
        return;
      }

      console.log(chalk.green(`\n✓ Resuming session: ${sessionId}\n`));
      onSessionSelected(sessionId);
    }
  );
}

// ════════════════════════════════════════════════════════════════════
//  REPL Initialization Helpers
// ════════════════════════════════════════════════════════════════════

/**
 * Initialize the AgentRunner with LLM client and tools
 */
function initializeAgent(session: Session): AgentRunner | null {
  try {
    const llmClient = new AnthropicClient();

    // 先创建 TerminalRenderer，以便传递回调给 BashTool
    // 注意：不再调用 terminalRenderer.attachTodoStore()，因为 FixedBottomRenderer 已经负责 Todo 渲染
    const terminalRenderer = new TerminalRenderer();

    const bashTool = new BashTool({
      llmClient,
      getConversationPath: () => session?.historyPath ?? null,
      onSubAgentToolStart: (event) => terminalRenderer.renderSubAgentToolStart(event),
      onSubAgentToolEnd: (event) => terminalRenderer.renderSubAgentToolEnd(event),
      onSubAgentComplete: (event) => terminalRenderer.renderSubAgentComplete(event),
    });

    // Delayed binding: pass BashTool to its own router for skill sub-agent
    bashTool.getRouter().setToolExecutor(bashTool);

    const toolset = new CallableToolset([bashTool]);
    const systemPrompt = buildSystemPrompt({ cwd: process.cwd() });

    return new AgentRunner({
      client: llmClient,
      systemPrompt,
      toolset,
      maxIterations: MAX_TOOL_ITERATIONS,
      sessionId: session.id,
      onMessagePart: (part) => {
        if (part.type === 'text' && part.text.trim()) {
          process.stdout.write(formatStreamText(part.text));
        }
      },
      onToolCall: (toolCall) => {
        const command =
          toolCall.name === 'Bash'
            ? JSON.parse(toolCall.arguments).command
            : toolCall.name;

        // 跳过 task:* 命令的主层级渲染，由 SubAgent 渲染接管
        if (command.startsWith('task:')) {
          return;
        }

        terminalRenderer.renderToolStart({
          id: toolCall.id,
          command,
          depth: 0,
        });
      },
      onToolResult: (result) => {
        terminalRenderer.renderToolEnd({
          id: result.toolCallId,
          success: !result.returnValue.isError,
          output: result.returnValue.output,
        });
      },
    });
  } catch (error) {
    const message = getErrorMessage(error);
    console.log(chalk.yellow(`\nAgent mode unavailable: ${message}`));
    console.log(chalk.yellow('Running in echo mode (responses will be echoed back).\n'));
    cliLogger.warn(`Agent initialization failed: ${message}`);
    return null;
  }
}

/**
 * Initialize MCP tools from configuration
 */
async function initializeMcp(): Promise<void> {
  try {
    console.log(chalk.gray('Initializing MCP tools...'));
    const mcpResult = await initializeMcpTools({ skipFailedServers: true });
    if (mcpResult.totalToolsInstalled > 0) {
      console.log(
        chalk.green(
          `✓ Loaded ${mcpResult.totalToolsInstalled} MCP tools from ${mcpResult.connectedServers} server(s)`
        )
      );
    } else if (mcpResult.totalServers > 0) {
      for (const err of mcpResult.errors.slice(0, 3)) {
        console.log(chalk.gray(`  - ${err}`));
      }
    }
  } catch (error) {
    const message = getErrorMessage(error);
    console.log(chalk.yellow(`⚠ MCP tools unavailable: ${message}`));
  }
}

/**
 * Initialize Skill tools from skills directory
 */
async function initializeSkills(): Promise<void> {
  try {
    const skillResult = await initializeSkillTools();
    if (skillResult.totalToolsInstalled > 0) {
      console.log(
        chalk.green(
          `✓ Loaded ${skillResult.totalToolsInstalled} skill tool(s) from ${skillResult.totalSkills} skill(s)`
        )
      );
    } else if (skillResult.totalSkills > 0) {
      console.log(chalk.gray(`  No skill tools to load (${skillResult.totalSkills} skill(s) found)`));
    }
  } catch (error) {
    const message = getErrorMessage(error);
    console.log(chalk.yellow(`⚠ Skill tools unavailable: ${message}`));
  }
}

/**
 * Display the REPL welcome banner
 */
function showWelcomeBanner(sessionId: string): void {
  console.log(chalk.blue.bold('╭──────────────────────────────────────────╮'));
  console.log(chalk.blue.bold('│     Synapse Agent - Interactive Mode     │'));
  console.log(chalk.blue.bold('╰──────────────────────────────────────────╯'));
  console.log();
  console.log(chalk.gray('Type /help for commands, /exit to quit'));
  console.log(chalk.gray('Use !<command> to execute shell commands directly'));
  console.log(chalk.gray(`Session: ${sessionId}`));
  console.log();
}

// ════════════════════════════════════════════════════════════════════
//  REPL Entry Point
// ════════════════════════════════════════════════════════════════════

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

  // 初始化agent
  let agentRunner = initializeAgent(session);

  // State
  const state: ReplState = { isProcessing: false };
  let activeTurn: ActiveTurnController | null = null;

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
    if (hookOutput) {
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
    // 查找并恢复会话
    const resumedSession = await Session.find(sessionId);
    if (resumedSession) {
      session = resumedSession;
      // 重新初始化 agent 使用恢复的 session
      agentRunner = initializeAgent(session);
      const history = await session.loadHistory();
      console.log(chalk.green(`✓ Loaded ${history.length} messages from session\n`));
    }
    promptUser();
  };

  // 包装 handleLineInput 以传递 onResumeSession
  const handleLine = async (input: string) => {
    const trimmedInput = input.trim();

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
      handleSpecialCommand(trimmedInput, rl, agentRunner, { onResumeSession: handleResumeSession });
      promptUser();
      return;
    }

    // Prevent concurrent requests
    if (state.isProcessing) {
      console.log(chalk.yellow('\nPlease wait for the current request to complete.\n'));
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
