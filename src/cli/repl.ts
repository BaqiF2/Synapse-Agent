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
 * - AgentRunner: Agent Loop 执行器
 */

import * as readline from 'node:readline';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import chalk from 'chalk';

// Agent imports
import { LlmClient, type LlmToolCall } from '../agent/llm-client.ts';
import { ContextManager } from '../agent/context-manager.ts';
import { ToolExecutor, type ToolCallInput } from '../agent/tool-executor.ts';
import { buildSystemPrompt } from '../agent/system-prompt.ts';
import { ContextPersistence } from '../agent/context-persistence.ts';
import { BashToolSchema } from '../tools/bash-tool-schema.ts';
import { initializeMcpTools } from '../tools/converters/mcp/index.ts';
import { initializeSkillTools } from '../tools/converters/skill/index.ts';
import { createLogger } from '../utils/logger.ts';

const cliLogger = createLogger('cli');

/**
 * Extract error message from unknown error
 */
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
 * Agent Runner for handling LLM interaction loop
 */
export class AgentRunner {
  private llmClient: LlmClient;
  private contextManager: ContextManager;
  private toolExecutor: ToolExecutor;
  private systemPrompt: string;
  private maxIterations: number;

  constructor(options: {
    llmClient: LlmClient;
    contextManager: ContextManager;
    toolExecutor: ToolExecutor;
    systemPrompt: string;
    maxIterations?: number;
  }) {
    this.llmClient = options.llmClient;
    this.contextManager = options.contextManager;
    this.toolExecutor = options.toolExecutor;
    this.systemPrompt = options.systemPrompt;
    this.maxIterations = options.maxIterations ?? MAX_TOOL_ITERATIONS;
  }

  /**
   * Run the agent loop for a user message
   * Returns the final text response
   */
  async run(userMessage: string): Promise<string> {
    // Add user message to context
    this.contextManager.addUserMessage(userMessage);

    let iteration = 0;
    let finalResponse = '';

    while (iteration < this.maxIterations) {
      iteration++;
      cliLogger.debug(`Agent loop iteration ${iteration}`);

      const messages = this.contextManager.getMessages();
      cliLogger.debug(`Sending ${messages.length} message(s) to LLM`);

      // Call LLM
      const response = await this.llmClient.sendMessage(messages, this.systemPrompt, [
        BashToolSchema,
      ]);

      // Collect text content
      if (response.content) {
        finalResponse = response.content;
        // Output text immediately
        if (response.content.trim()) {
          process.stdout.write(response.content);
        }
      }

      // Check for tool calls
      if (response.toolCalls.length === 0) {
        // No tool calls, add assistant response and finish
        this.contextManager.addAssistantMessage(response.content);
        break;
      }

      // Add assistant response with tool calls
      this.contextManager.addAssistantToolCall(response.content, response.toolCalls);

      // Execute tools
      console.log(); // Newline before tool execution
      const toolInputs: ToolCallInput[] = response.toolCalls.map((call: LlmToolCall) => ({
        id: call.id,
        name: call.name,
        input: call.input,
      }));

      const results = await this.toolExecutor.executeTools(toolInputs);
      const toolResults = this.toolExecutor.formatResultsForLlm(results);

      // Add tool results to context
      this.contextManager.addToolResults(toolResults);

      // Display tool execution info
      for (const result of results) {
        const status = result.success ? chalk.green('✓') : chalk.red('✗');
        const cmd =
          toolInputs.find((t) => t.id === result.toolUseId)?.input?.command?.toString() || '';
        const shortCmd = cmd.length > 50 ? cmd.substring(0, 50) + '...' : cmd;
        console.log(chalk.gray(`  ${status} ${shortCmd}`));

        // Show error output for failed commands
        if (!result.success && result.output) {
          const errorPreview =
            result.output.length > 200 ? result.output.substring(0, 200) + '...' : result.output;
          console.log(chalk.red(`    ${errorPreview.split('\n')[0]}`));
        }
      }
      console.log();

      // Check if stop reason is end_turn
      if (response.stopReason === 'end_turn') {
        break;
      }
    }

    if (iteration >= this.maxIterations) {
      cliLogger.warn(`Agent loop reached maximum iterations: ${this.maxIterations}`);
      console.log(chalk.yellow(`\n[Reached maximum tool iterations: ${this.maxIterations}]`));
    }

    return finalResponse;
  }

  /**
   * Get the context manager (for external access)
   */
  getContextManager(): ContextManager {
    return this.contextManager;
  }

  /**
   * Get the tool executor (for cleanup)
   */
  getToolExecutor(): ToolExecutor {
    return this.toolExecutor;
  }
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

    // Truncate long messages
    const maxLen = 200;
    const displayContent =
      entry.content.length > maxLen ? entry.content.substring(0, maxLen) + '...' : entry.content;
    console.log(chalk.white(`  ${displayContent}`));
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
    const toolExecutor = new ToolExecutor();

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
