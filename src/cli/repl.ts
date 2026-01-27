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
import { LlmClient } from '../agent/llm-client.ts';
import { ContextManager } from '../agent/context-manager.ts';
import { ToolExecutor } from '../agent/tool-executor.ts';
import { buildSystemPrompt } from '../agent/system-prompt.ts';
import { ContextPersistence } from '../agent/context-persistence.ts';
import { AgentRunner } from '../agent/agent-runner.ts';
import { BashToolSchema } from '../tools/bash-tool-schema.ts';
import { initializeMcpTools } from '../tools/converters/mcp/index.ts';
import { initializeSkillTools } from '../tools/converters/skill/index.ts';
import { createLogger } from '../utils/logger.ts';
import { SettingsManager } from '../config/settings-manager.ts';
import { SkillSubAgent } from '../agent/skill-sub-agent.ts';

const cliLogger = createLogger('cli');

/**
 * Truncate text to specified length with ellipsis
 */
function truncateText(text: string, maxLength: number): string {
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}
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
const HISTORY_FILE =
  process.env.SYNAPSE_HISTORY_FILE || path.join(os.homedir(), '.synapse', '.repl_history');
const MAX_HISTORY_SIZE = parseInt(process.env.SYNAPSE_MAX_HISTORY || '1000', 10);
const MAX_TOOL_ITERATIONS = parseInt(process.env.SYNAPSE_MAX_TOOL_ITERATIONS || '10', 10);
const PERSISTENCE_ENABLED = process.env.SYNAPSE_PERSISTENCE_ENABLED !== 'false';

/**
 * Conversation message for history display
 */
interface ConversationEntry {
  turn: number;
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
}

/**
 * REPL State
 */
export interface ReplState {
  turnNumber: number;
  conversationHistory: ConversationEntry[];
  commandHistory: string[];
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
      env: process.env,
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
      state.conversationHistory = [];
      state.turnNumber = 1;
      // Also clear context manager if available
      if (agentRunner) {
        agentRunner.getContextManager().clear();
      }
      console.log(chalk.green('\nConversation history cleared.\n'));
      return true;

    case '/history':
      showConversationHistory(state.conversationHistory);
      return true;

    case '/tools':
      showToolsList();
      return true;

    case '/skills':
      showSkillsList();
      return true;

    case '/sessions':
      showSessionsList();
      return true;

    default:
      // Handle /resume <session-id>
      if (parts[0]?.toLowerCase() === '/resume') {
        const sessionId = parts[1];
        if (sessionId) {
          resumeSession(sessionId, state, agentRunner);
        } else {
          console.log(chalk.yellow('\nUsage: /resume <session-id>\n'));
          console.log(chalk.gray('Use /sessions to see available sessions.\n'));
        }
        return true;
      }

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
    const conversationPath = enhanceArgs[convIndex + 1];
    if (!conversationPath) {
      console.log(chalk.red('\nError: --conversation requires a path argument.'));
      console.log(chalk.gray('Usage: /skill enhance --conversation <path>\n'));
      return;
    }

    // Expand ~ to home directory
    const expandedPath = conversationPath.startsWith('~')
      ? path.join(os.homedir(), conversationPath.slice(1))
      : conversationPath;

    if (!fs.existsSync(expandedPath)) {
      console.log(chalk.red(`\nError: Conversation file not found: ${expandedPath}\n`));
      return;
    }

    // Manual enhance requires LLM client from agentRunner
    if (!agentRunner) {
      console.log(chalk.yellow('\nAgent not available. Cannot perform manual enhance.\n'));
      return;
    }

    console.log(chalk.gray(`\nTriggering manual enhance from: ${expandedPath}`));
    console.log(chalk.gray('This feature requires LLM processing...\n'));

    // Create SkillSubAgent with LLM client and tool executor
    const llmClient = agentRunner.getLlmClient();
    const toolExecutor = agentRunner.getToolExecutor();
    const subAgent = new SkillSubAgent({
      llmClient,
      toolExecutor,
      onToolCall: (info) => {
        const tag = chalk.cyan(`[${info.agentTag}]`);
        const status = info.success ? chalk.green('✓') : chalk.red('✗');
        const toolName = chalk.yellow(info.name);
        const command = info.input?.command
          ? chalk.gray(` $ ${truncateText(String(info.input.command), 80)}`)
          : '';
        console.log(`${tag} ${status} ${toolName}${command}`);
      },
    });
    subAgent
      .enhance(expandedPath)
      .then((result) => {
        if (result.action === 'none') {
          console.log(chalk.gray('No enhancement needed.'));
        } else if (result.action === 'created') {
          console.log(chalk.green(`Created new skill: ${result.skillName}`));
        } else if (result.action === 'enhanced') {
          console.log(chalk.green(`Enhanced skill: ${result.skillName}`));
        }
        console.log(chalk.gray(`Message: ${result.message}\n`));
      })
      .catch((error: Error) => {
        console.log(chalk.red(`\nEnhance failed: ${error.message}\n`));
      });
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
  console.log(chalk.white.bold('Special Commands:'));
  console.log(chalk.gray('  /help, /h, /?    ') + chalk.white('Show this help message'));
  console.log(chalk.gray('  /exit, /quit, /q ') + chalk.white('Exit the REPL'));
  console.log(chalk.gray('  /clear           ') + chalk.white('Clear conversation history'));
  console.log(chalk.gray('  /history         ') + chalk.white('Show conversation history'));
  console.log(chalk.gray('  /tools           ') + chalk.white('List all available tools'));
  console.log(chalk.gray('  /skills          ') + chalk.white('List all available skills'));
  console.log(chalk.gray('  /sessions        ') + chalk.white('List saved sessions'));
  console.log(chalk.gray('  /resume <id>     ') + chalk.white('Resume a saved session'));
  console.log();
  console.log(chalk.white.bold('Skill Commands:'));
  console.log(chalk.gray('  /skill enhance       ') + chalk.white('Show auto-enhance status'));
  console.log(chalk.gray('  /skill enhance --on  ') + chalk.white('Enable auto skill enhance'));
  console.log(chalk.gray('  /skill enhance --off ') + chalk.white('Disable auto skill enhance'));
  console.log(chalk.gray('  /skill enhance -h    ') + chalk.white('Show skill enhance help'));
  console.log();
  console.log(chalk.white.bold('Shell Commands:'));
  console.log(chalk.gray('  !<command>       ') + chalk.white('Execute a shell command directly'));
  console.log(chalk.gray('                   ') + chalk.white('Example: !ls -la, !git status'));
  console.log();
  console.log(chalk.white.bold('Regular Input:'));
  console.log(chalk.gray('  <any text>       ') + chalk.white('Send message to the Agent'));
  console.log();
  console.log(chalk.white.bold('Keyboard Shortcuts:'));
  console.log(chalk.gray('  Ctrl+C           ') + chalk.white('Prompt for exit confirmation'));
  console.log(chalk.gray('  Ctrl+D           ') + chalk.white('Exit immediately'));
  console.log();
}

/**
 * Show conversation history
 */
function showConversationHistory(history: ConversationEntry[]): void {
  printSectionHeader('Conversation History');

  if (history.length === 0) {
    console.log(chalk.gray('\n  No conversation history.\n'));
    return;
  }

  console.log();
  for (const entry of history) {
    const time = entry.timestamp.toLocaleTimeString();
    const roleColor = entry.role === 'user' ? chalk.green : chalk.magenta;
    const roleLabel = entry.role === 'user' ? 'You' : 'Agent';

    console.log(chalk.gray(`[${time}] `) + roleColor(`${roleLabel} (${entry.turn}):`));
    console.log(chalk.white(`  ${truncateText(entry.content, 200)}`));
    console.log();
  }
}

/**
 * Show available tools list
 */
function showToolsList(): void {
  printSectionHeader('Available Tools');
  console.log();
  console.log(chalk.white.bold('Agent Shell Command Tools (Layer 2):'));
  console.log(chalk.gray('  read <file>      ') + chalk.white('Read file contents'));
  console.log(chalk.gray('  write <file>     ') + chalk.white('Write content to file'));
  console.log(chalk.gray('  edit <file>      ') + chalk.white('Edit file (string replacement)'));
  console.log(chalk.gray('  glob <pattern>   ') + chalk.white('Find files by pattern'));
  console.log(chalk.gray('  grep <pattern>   ') + chalk.white('Search file contents'));
  console.log(chalk.gray('  bash <cmd>       ') + chalk.white('Execute bash command'));
  console.log();
  console.log(chalk.white.bold('extend Shell command Tools (Layer 3):'));
  console.log(chalk.gray('  tools search     ') + chalk.white('Search installed tools'));
  console.log(chalk.gray('  skill search     ') + chalk.white('Search available skills'));
  console.log(chalk.gray('  mcp:*            ') + chalk.white('MCP server tools'));
  console.log(chalk.gray('  skill:*          ') + chalk.white('Skill script tools'));
  console.log();
  console.log(chalk.gray('Use "tools search" or "skill search" for more details.'));
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
          // Look for description line
          const descMatch = content.match(/\*\*描述\*\*:\s*(.+)/);
          if (descMatch?.[1]) {
            description = chalk.white(descMatch[1].trim());
          }
        } catch {
          // Ignore read errors
        }
      }

      console.log(chalk.green(`  ${skill.name}`));
      console.log(`    ${description}`);
    }

    console.log();
    console.log(chalk.gray('Use "skill search <query>" for detailed information.'));
    console.log();
  } catch (error) {
    const message = getErrorMessage(error);
    console.log(chalk.red(`  Error reading skills: ${message}`));
    console.log();
  }
}

/**
 * Show saved sessions list
 */
function showSessionsList(): void {
  printSectionHeader('Saved Sessions');

  const sessions = ContextPersistence.listSessions();

  if (sessions.length === 0) {
    console.log(chalk.gray('\n  No saved sessions.\n'));
    return;
  }

  console.log();
  for (const session of sessions.slice(0, 10)) {
    const updatedDate = new Date(session.updatedAt).toLocaleString();
    const title = session.title || '(Untitled)';

    console.log(chalk.green(`  ${session.id}`));
    console.log(chalk.white(`    ${title}`));
    console.log(chalk.gray(`    ${session.messageCount} messages | ${updatedDate}`));
    if (session.cwd) {
      console.log(chalk.gray(`    ${session.cwd}`));
    }
    console.log();
  }

  if (sessions.length > 10) {
    console.log(chalk.gray(`  ... and ${sessions.length - 10} more sessions\n`));
  }

  console.log(chalk.gray('Use /resume <session-id> to resume a session.\n'));
}

/**
 * Resume a saved session
 */
function resumeSession(
  sessionId: string,
  state: ReplState,
  agentRunner?: AgentRunner | null
): void {
  const session = ContextPersistence.getSession(sessionId);

  if (!session) {
    console.log(chalk.red(`\nSession not found: ${sessionId}\n`));
    return;
  }

  if (!agentRunner) {
    console.log(chalk.yellow('\nAgent not available. Cannot resume session.\n'));
    return;
  }

  // Create new persistence with existing session ID
  const persistence = new ContextPersistence(sessionId);
  const messages = persistence.loadMessages();

  // Clear and reload context manager
  const contextManager = agentRunner.getContextManager();
  contextManager.clear();
  contextManager.enablePersistence(persistence);
  contextManager.loadFromPersistence();

  // Update state
  state.turnNumber = Math.floor(messages.length / 2) + 1;
  state.conversationHistory = [];

  console.log(chalk.green(`\nResumed session: ${sessionId}`));
  console.log(chalk.gray(`Loaded ${messages.length} messages\n`));
}

/**
 * Load command history from file
 */
function loadCommandHistory(): string[] {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const content = fs.readFileSync(HISTORY_FILE, 'utf-8');
      return content.split('\n').filter((line) => line.trim());
    }
  } catch {
    // Ignore errors, return empty history
  }
  return [];
}

/**
 * Save command history to file
 */
function saveCommandHistory(history: string[]): void {
  try {
    // Ensure directory exists
    const dir = path.dirname(HISTORY_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Limit history size
    const trimmedHistory = history.slice(-MAX_HISTORY_SIZE);
    fs.writeFileSync(HISTORY_FILE, trimmedHistory.join('\n'));
  } catch {
    // Ignore save errors
  }
}

/**
 * Add entry to command history
 */
function addToHistory(command: string, history: string[]): void {
  // Don't add empty commands or duplicates of the last command
  if (!command.trim() || history[history.length - 1] === command) {
    return;
  }
  history.push(command);
}

/**
 * Start the REPL (Read-Eval-Print-Loop) interactive mode
 */
export async function startRepl(): Promise<void> {
  // Initialize Agent components
  let agentRunner: AgentRunner | null = null;
  let persistence: ContextPersistence | null = null;

  try {
    const llmClient = new LlmClient();
    const toolExecutor = new ToolExecutor({ llmClient });

    // Initialize persistence if enabled
    if (PERSISTENCE_ENABLED) {
      persistence = new ContextPersistence();
    }

    const contextManager = new ContextManager({
      persistence: persistence ?? undefined,
    });

    // Load existing messages from persistence
    if (persistence) {
      contextManager.loadFromPersistence();
      const messageCount = contextManager.getMessageCount();
      if (messageCount > 0) {
        cliLogger.info(`Loaded ${messageCount} messages from session: ${persistence.getSessionId()}`);
      }
    }

    // Build system prompt
    const systemPrompt = buildSystemPrompt({
      includeAgentShellCommand: true,
      includeExtendShellCommand: true,
      includeSkillSystem: true,
      cwd: process.cwd(),
    });

    agentRunner = new AgentRunner({
      llmClient,
      contextManager,
      toolExecutor,
      systemPrompt,
      tools: [BashToolSchema],
      outputMode: 'streaming',
      maxIterations: MAX_TOOL_ITERATIONS,
      onText: (text) => {
        if (text.trim()) {
          process.stdout.write(text);
        }
      },
      onToolExecution: (toolName, success, output) => {
        const status = success ? chalk.green('✓') : chalk.red('✗');
        console.log(chalk.gray(`  ${status} ${truncateText(toolName, 50)}`));

        // Show error output for failed commands
        if (!success && output) {
          const errorPreview = truncateText(output, 200);
          console.log(chalk.red(`    ${errorPreview.split('\n')[0]}`));
        }
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
  // Calculate initial turn number based on loaded messages
  const initialTurnNumber = agentRunner
    ? Math.floor(agentRunner.getContextManager().getMessageCount() / 2) + 1
    : 1;

  const state: ReplState = {
    turnNumber: initialTurnNumber,
    conversationHistory: [],
    commandHistory: loadCommandHistory(),
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
    historySize: MAX_HISTORY_SIZE,
  });

  // Load history into readline
  for (const cmd of state.commandHistory) {
    (rl as unknown as { history: string[] }).history?.unshift(cmd);
  }

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

    // Add to history
    addToHistory(trimmedInput, state.commandHistory);

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

    // Regular input - add to conversation history and process
    state.conversationHistory.push({
      turn: state.turnNumber,
      role: 'user',
      content: trimmedInput,
      timestamp: new Date(),
    });

    // Check if agent mode is available
    if (!agentRunner) {
      // Fallback: echo mode
      console.log();
      console.log(
        chalk.magenta(`Agent (${state.turnNumber})> `) + chalk.white(`You said: ${trimmedInput}`)
      );
      console.log();

      state.conversationHistory.push({
        turn: state.turnNumber,
        role: 'agent',
        content: `You said: ${trimmedInput}`,
        timestamp: new Date(),
      });

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

      console.log(); // Ensure newline after response
      console.log();

      // Add agent response to conversation history
      state.conversationHistory.push({
        turn: state.turnNumber,
        role: 'agent',
        content: response,
        timestamp: new Date(),
      });
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
    // Cleanup Agent resources
    if (agentRunner) {
      agentRunner.getToolExecutor().cleanup();
    }
    // Save history before exit
    saveCommandHistory(state.commandHistory);
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
        // Cleanup
        if (agentRunner) {
          agentRunner.getToolExecutor().cleanup();
        }
        saveCommandHistory(state.commandHistory);
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
