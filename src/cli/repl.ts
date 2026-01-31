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
import { ContextPersistence } from '../agent/context-persistence.ts';
import { AgentRunner } from '../agent/agent-runner.ts';
import { CallableToolset } from '../agent/toolset.ts';
import { BashTool } from '../tools/bash-tool.ts';
import { McpInstaller, initializeMcpTools } from '../tools/converters/mcp/index.ts';
import { initializeSkillTools } from '../tools/converters/skill/index.ts';
import { createLogger } from '../utils/logger.ts';
import { SettingsManager } from '../config/settings-manager.ts';
import { TerminalRenderer } from './terminal-renderer.ts';

const cliLogger = createLogger('cli');

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

/**
 * Print a section header with consistent formatting
 */
function printSectionHeader(title: string): void {
  console.log();
  console.log(chalk.cyan.bold(title));
  console.log(chalk.cyan('═'.repeat(50)));
}

/**
 * Environment variable configuration
 */
const MAX_TOOL_ITERATIONS = parseInt(process.env.SYNAPSE_MAX_TOOL_ITERATIONS || '50', 10);
const PERSISTENCE_ENABLED = true;

/**
 * REPL State
 */
export interface ReplState {
  turnNumber: number;
  isProcessing: boolean;
}

/**
 * Execute a shell command directly (for ! prefix)
 * Streams output to the terminal in real-time
 *
 * @param command - The shell command to execute (without the ! prefix)
 * @returns Promise that resolves when the command completes
 */
export async function executeShellCommand(command: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      shell: true,
      stdio: ['inherit', 'inherit', 'inherit'],
    });

    child.on('error', (error) => {
      console.error(chalk.red(`Shell command error: ${error.message}`));
      resolve(1);
    });

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
 * @param state - Current REPL state
 * @param rl - Readline interface
 * @param agentRunner - Optional agent runner for context access
 * @param options - Optional settings for testing
 * @returns true if command was handled, false otherwise
 */
export function handleSpecialCommand(
  command: string,
  state: ReplState,
  rl: readline.Interface,
  agentRunner?: AgentRunner | null,
  options?: { skipExit?: boolean }
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
      state.turnNumber = 1;
      // Also clear agent history if available
      if (agentRunner) {
        agentRunner.clearHistory();
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
      // Handle /skill enhance commands
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
function handleSkillEnhanceCommand(args: string[], agentRunner?: AgentRunner | null): void {
  const subcommand = args[0]?.toLowerCase();

  // Only support 'enhance' subcommand for user slash commands
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

  // Check for help flag
  if (enhanceArgs.includes('-h') || enhanceArgs.includes('--help')) {
    showSkillEnhanceHelp();
    return;
  }

  // Check for --on flag
  if (enhanceArgs.includes('--on')) {
    settingsManager.setAutoEnhance(true);
    console.log(chalk.green('\nAuto skill enhance enabled.'));
    console.log(chalk.gray('Skills will be automatically enhanced after task completion.'));
    console.log(chalk.gray('Note: This will consume additional tokens.\n'));
    console.log(chalk.gray('Use /skill enhance --off to disable.\n'));
    return;
  }

  // Check for --off flag
  if (enhanceArgs.includes('--off')) {
    settingsManager.setAutoEnhance(false);
    console.log(chalk.yellow('\nAuto skill enhance disabled.\n'));
    return;
  }

  // Check for --conversation flag
  const convIndex = enhanceArgs.indexOf('--conversation');
  if (convIndex !== -1) {
    // Manual enhance is temporarily disabled during refactoring
    console.log(chalk.yellow('\nManual enhance is temporarily unavailable.\n'));
    console.log(chalk.gray('Use auto-enhance with --on flag instead.\n'));
    return;
  }

  // No flags - show current status
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
 * Show skill enhance help
 */
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

/**
 * Show help information
 */
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
  console.log(chalk.gray('  Ctrl+C           ') + chalk.white('Prompt for exit confirmation'));
  console.log(chalk.gray('  Ctrl+D           ') + chalk.white('Exit immediately'));
  console.log();
}

/**
 * Show available tools list
 */
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

/**
 * Show available skills list
 */
function showSkillsList(): void {
  printSectionHeader('Available Skills');

  // Check if skills directory exists
  const skillsDir = path.join(os.homedir(), '.synapse', 'skills');

  if (!fs.existsSync(skillsDir)) {
    console.log(chalk.gray('  No skills directory found.'));
    console.log(chalk.gray(`  Create skills in: ${skillsDir}`));
    console.log();
    return;
  }

  // Read skill directories
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
      const skillPath = path.join(skillsDir, skill.name);
      const skillMdPath = path.join(skillPath, 'SKILL.md');

      let description = chalk.gray('(No description)');

      // Try to read skill description from SKILL.md
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

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Start the REPL (Read-Eval-Print-Loop) interactive mode
 */
export async function startRepl(): Promise<void> {
  // Initialize Agent components
  let agentRunner: AgentRunner | null = null;
  let persistence: ContextPersistence | null = null;

  // Initialize terminal renderer for tool output
  const terminalRenderer = new TerminalRenderer();

  try {
    const llmClient = new AnthropicClient();

    // Initialize persistence if enabled
    if (PERSISTENCE_ENABLED) {
      persistence = new ContextPersistence();
    }

    // Create BashTool for tool handling
    const bashTool = new BashTool({
      llmClient,
      getConversationPath: () => persistence?.getSessionPath() ?? null,
    });

    // Delayed binding: pass BashTool to its own router for skill sub-agent
    bashTool.getRouter().setToolExecutor(bashTool);

    // Create toolset
    const toolset = new CallableToolset([bashTool]);

    // Build system prompt
    const systemPrompt = buildSystemPrompt({
      cwd: process.cwd(),
    });

    agentRunner = new AgentRunner({
      client: llmClient,
      systemPrompt,
      toolset,
      maxIterations: MAX_TOOL_ITERATIONS,
      onMessagePart: (part) => {
        if (part.type === 'text' && part.text.trim()) {
          process.stdout.write(part.text);
        }
      },
      onToolResult: (result) => {
        terminalRenderer.renderToolEnd({
          id: result.toolCallId,
          success: !result.returnValue.isError,
          output: result.returnValue.output,
        });
      },
    });

    cliLogger.info('Agent components initialized successfully');
  } catch (error) {
    const message = getErrorMessage(error);
    console.log(chalk.yellow(`\nAgent mode unavailable: ${message}`));
    console.log(chalk.yellow('Running in echo mode (responses will be echoed back).\n'));
    cliLogger.warn(`Agent initialization failed: ${message}`);
  }

  // Initialize MCP tools from configuration
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
      console.log(chalk.yellow(`⚠ No MCP tools loaded (${mcpResult.errors.length} errors)`));
      for (const err of mcpResult.errors.slice(0, 3)) {
        console.log(chalk.gray(`  - ${err}`));
      }
    }
  } catch (error) {
    const message = getErrorMessage(error);
    cliLogger.warn(`MCP initialization failed: ${message}`);
    console.log(chalk.yellow(`⚠ MCP tools unavailable: ${message}`));
  }

  // Initialize Skill tools from skills directory
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
    cliLogger.warn(`Skill initialization failed: ${message}`);
    console.log(chalk.yellow(`⚠ Skill tools unavailable: ${message}`));
  }

  // Initialize state
  const initialTurnNumber = agentRunner
    ? Math.floor(agentRunner.getHistory().length / 2) + 1
    : 1;

  const state: ReplState = {
    turnNumber: initialTurnNumber,
    isProcessing: false,
  };

  // Display welcome message
  console.log(chalk.blue.bold('╭──────────────────────────────────────────╮'));
  console.log(chalk.blue.bold('│     Synapse Agent - Interactive Mode     │'));
  console.log(chalk.blue.bold('╰──────────────────────────────────────────╯'));
  console.log();
  console.log(chalk.gray('Type /help for commands, /exit to quit'));
  console.log(chalk.gray('Use !<command> to execute shell commands directly'));
  if (persistence) {
    console.log(chalk.gray(`Session: ${persistence.getSessionId()}`));
    if (initialTurnNumber > 1) {
      console.log(chalk.green(`✓ Resumed with ${initialTurnNumber - 1} previous turn(s)`));
    }
  }
  console.log();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '',
  });

  const promptUser = () => {
    rl.setPrompt(chalk.green(`You (${state.turnNumber})> `));
    rl.prompt();
  };

  rl.on('line', async (input: string) => {
    const trimmedInput = input.trim();

    // Handle empty input
    if (!trimmedInput) {
      promptUser();
      return;
    }

    // Handle shell commands (! prefix)
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

    // Handle special commands (/ prefix)
    if (trimmedInput.startsWith('/')) {
      handleSpecialCommand(trimmedInput, state, rl, agentRunner);
      promptUser();
      return;
    }

    // Check if agent mode is available
    if (!agentRunner) {
      // Fallback: echo mode
      console.log();
      console.log(
        chalk.magenta(`Agent (${state.turnNumber})> `) + chalk.white(`You said: ${trimmedInput}`)
      );
      console.log();
      state.turnNumber++;
      promptUser();
      return;
    }

    // Prevent concurrent requests
    if (state.isProcessing) {
      console.log(chalk.yellow('\nPlease wait for the current request to complete.\n'));
      promptUser();
      return;
    }

    state.isProcessing = true;
    console.log();
    process.stdout.write(chalk.magenta(`Agent (${state.turnNumber})> `));

    try {
      const response = await agentRunner.run(trimmedInput);

      // Ensure newline after response
      console.log();
      console.log();

    } catch (error) {
      const message = getErrorMessage(error);
      console.log(chalk.red(`\nError: ${message}\n`));
      cliLogger.error('Agent request failed', { error: message });
    } finally {
      state.isProcessing = false;
      state.turnNumber++;
      promptUser();
    }
  });

  rl.on('close', () => {
    console.log(chalk.yellow('\nREPL session ended.\n'));
    process.exit(0);
  });

  // Handle Ctrl+C
  rl.on('SIGINT', () => {
    // If processing, show cancel message
    if (state.isProcessing) {
      console.log(chalk.yellow('\n\n[Request cancelled]\n'));
      state.isProcessing = false;
      promptUser();
      return;
    }

    console.log();
    rl.question(chalk.yellow('Do you want to exit? (y/n) '), (answer) => {
      if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
        console.log(chalk.yellow('\nGoodbye!\n'));
        rl.close();
      } else {
        console.log();
        promptUser();
      }
    });
  });

  // Start the REPL
  promptUser();
}
