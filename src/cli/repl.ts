/**
 * REPL 交互模式实现
 *
 * 功能：提供命令行交互式对话界面，支持用户输入和响应输出
 *       支持 Shell 命令直接执行（! 前缀）和特殊命令（/ 前缀）
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

/**
 * Environment variable configuration
 */
const HISTORY_FILE = process.env.SYNAPSE_HISTORY_FILE || path.join(os.homedir(), '.synapse', '.repl_history');
const MAX_HISTORY_SIZE = parseInt(process.env.SYNAPSE_MAX_HISTORY || '1000', 10);

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
 * @param options - Optional settings for testing
 * @returns true if command was handled, false otherwise
 */
export function handleSpecialCommand(
  command: string,
  state: ReplState,
  rl: readline.Interface,
  options?: { skipExit?: boolean }
): boolean {
  const cmd = command.toLowerCase().trim();

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

    default:
      if (cmd.startsWith('/')) {
        console.log(chalk.red(`\nUnknown command: ${cmd}`));
        console.log(chalk.gray('Type /help for available commands.\n'));
        return true;
      }
      return false;
  }
}

/**
 * Show help information
 */
function showHelp(): void {
  console.log();
  console.log(chalk.cyan.bold('Synapse Agent - Help'));
  console.log(chalk.cyan('═'.repeat(50)));
  console.log();
  console.log(chalk.white.bold('Special Commands:'));
  console.log(chalk.gray('  /help, /h, /?    ') + chalk.white('Show this help message'));
  console.log(chalk.gray('  /exit, /quit, /q ') + chalk.white('Exit the REPL'));
  console.log(chalk.gray('  /clear           ') + chalk.white('Clear conversation history'));
  console.log(chalk.gray('  /history         ') + chalk.white('Show conversation history'));
  console.log(chalk.gray('  /tools           ') + chalk.white('List all available tools'));
  console.log(chalk.gray('  /skills          ') + chalk.white('List all available skills'));
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
  console.log();
  console.log(chalk.cyan.bold('Conversation History'));
  console.log(chalk.cyan('═'.repeat(50)));

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

    // Truncate long messages
    const maxLen = 200;
    const displayContent = entry.content.length > maxLen
      ? entry.content.substring(0, maxLen) + '...'
      : entry.content;
    console.log(chalk.white(`  ${displayContent}`));
    console.log();
  }
}

/**
 * Show available tools list
 */
function showToolsList(): void {
  console.log();
  console.log(chalk.cyan.bold('Available Tools'));
  console.log(chalk.cyan('═'.repeat(50)));
  console.log();
  console.log(chalk.white.bold('Agent Bash Tools (Layer 2):'));
  console.log(chalk.gray('  read <file>      ') + chalk.white('Read file contents'));
  console.log(chalk.gray('  write <file>     ') + chalk.white('Write content to file'));
  console.log(chalk.gray('  edit <file>      ') + chalk.white('Edit file (string replacement)'));
  console.log(chalk.gray('  glob <pattern>   ') + chalk.white('Find files by pattern'));
  console.log(chalk.gray('  grep <pattern>   ') + chalk.white('Search file contents'));
  console.log(chalk.gray('  bash <cmd>       ') + chalk.white('Execute bash command'));
  console.log();
  console.log(chalk.white.bold('Field Bash Tools (Layer 3):'));
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
  console.log();
  console.log(chalk.cyan.bold('Available Skills'));
  console.log(chalk.cyan('═'.repeat(50)));
  console.log();

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
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.log(chalk.red(`  Error reading skills: ${message}`));
    console.log();
  }
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
  // Initialize state
  const state: ReplState = {
    turnNumber: 1,
    conversationHistory: [],
    commandHistory: loadCommandHistory(),
  };

  // Display welcome message
  console.log(chalk.blue.bold('╭──────────────────────────────────────────╮'));
  console.log(chalk.blue.bold('│     Synapse Agent - Interactive Mode     │'));
  console.log(chalk.blue.bold('╰──────────────────────────────────────────╯'));
  console.log();
  console.log(chalk.gray('Type /help for commands, /exit to quit'));
  console.log(chalk.gray('Use !<command> to execute shell commands directly'));
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
      handleSpecialCommand(trimmedInput, state, rl);
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

    // Echo user input (placeholder response)
    // TODO: Replace with actual Agent response in future batches
    console.log();
    console.log(chalk.magenta(`Agent (${state.turnNumber})> `) + chalk.white(`You said: ${trimmedInput}`));
    console.log();

    // Add agent response to history
    state.conversationHistory.push({
      turn: state.turnNumber,
      role: 'agent',
      content: `You said: ${trimmedInput}`,
      timestamp: new Date(),
    });

    state.turnNumber++;
    promptUser();
  });

  rl.on('close', () => {
    // Save history before exit
    saveCommandHistory(state.commandHistory);
    console.log(chalk.yellow('\nREPL session ended.\n'));
    process.exit(0);
  });

  // Handle Ctrl+C
  rl.on('SIGINT', () => {
    console.log();
    rl.question(chalk.yellow('Do you want to exit? (y/n) '), (answer) => {
      if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
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
