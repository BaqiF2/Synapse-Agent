/**
 * REPL 初始化函数
 *
 * 功能：初始化 Agent、MCP 工具、Skill 工具和欢迎界面。
 *
 * 核心导出：
 * - initializeAgent: 创建并配置 AgentRunner 实例
 * - initializeMcp: 初始化 MCP 工具
 * - initializeSkills: 初始化 Skill 工具
 * - showWelcomeBanner: 显示欢迎横幅
 */

import chalk from 'chalk';

import { AnthropicClient } from '../providers/anthropic/anthropic-client.ts';
import { buildSystemPrompt } from '../core/system-prompt.ts';
import type { Session } from '../core/session.ts';
import { AgentRunner } from '../core/agent-runner.ts';
import { CallableToolset } from '../tools/toolset.ts';
import { BashTool } from '../tools/bash-tool.ts';
import { initializeMcpTools } from '../tools/converters/mcp/index.ts';
import { initializeSkillTools } from '../tools/converters/skill/index.ts';
import { createLogger } from '../shared/file-logger.ts';
import { parseEnvInt } from '../shared/env.ts';
import { SettingsManager } from '../shared/config/settings-manager.ts';
import { TerminalRenderer } from './terminal-renderer.ts';
import { formatStreamText } from './commands/index.ts';

const cliLogger = createLogger('cli');
const MAX_TOOL_ITERATIONS = parseEnvInt(process.env.SYNAPSE_MAX_TOOL_ITERATIONS, 50);

// ===== 内部工具函数 =====

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

// ===== 导出函数 =====

/**
 * Initialize the AgentRunner with LLM client and tools
 */
export function initializeAgent(
  session: Session,
  options: { shouldRenderTurn: () => boolean }
): AgentRunner | null {
  try {
    const llmClient = new AnthropicClient({ settings: SettingsManager.getInstance().getLlmConfig() });
    let runnerRef: AgentRunner | null = null;

    // 先创建 TerminalRenderer，以便传递回调给 BashTool
    const terminalRenderer = new TerminalRenderer();

    const bashTool = new BashTool({
      getConversationPath: () => session?.historyPath ?? null,
    });

    const toolset = new CallableToolset([bashTool]);
    const systemPrompt = buildSystemPrompt({ cwd: process.cwd() });

    const runner = new AgentRunner({
      client: llmClient,
      systemPrompt,
      toolset,
      maxIterations: MAX_TOOL_ITERATIONS,
      session,
      onMessagePart: (part) => {
        if (!options.shouldRenderTurn()) return;
        if (part.type === 'text' && part.text.trim()) {
          process.stdout.write(formatStreamText(part.text));
        }
      },
      onToolCall: (toolCall) => {
        if (!options.shouldRenderTurn()) return;
        let command = toolCall.name;
        if (toolCall.name === 'Bash') {
          try {
            const parsed = JSON.parse(toolCall.arguments) as { command?: unknown };
            if (typeof parsed.command === 'string') {
              command = parsed.command;
            }
          } catch {
            command = 'Bash';
          }
        }

        // 跳过 task:* 命令的主层级渲染，由 SubAgent 渲染接管
        if (command.startsWith('task:')) {
          return;
        }

        const shouldRender = !(toolCall.name === 'Bash' && command.trimStart().startsWith('TodoWrite'));

        terminalRenderer.renderToolStart({
          id: toolCall.id,
          command,
          depth: 0,
          shouldRender,
        });
      },
      onToolResult: (result) => {
        if (!options.shouldRenderTurn()) return;
        terminalRenderer.renderToolEnd({
          id: result.toolCallId,
          success: !result.returnValue.isError,
          output: result.returnValue.output,
        });
      },
    });
    runnerRef = runner;
    return runner;
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
export async function initializeMcp(): Promise<void> {
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
export async function initializeSkills(): Promise<void> {
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
export function showWelcomeBanner(sessionId: string): void {
  console.log(chalk.blue.bold('╭──────────────────────────────────────────╮'));
  console.log(chalk.blue.bold('│     Synapse Agent - Interactive Mode     │'));
  console.log(chalk.blue.bold('╰──────────────────────────────────────────╯'));
  console.log();
  console.log(chalk.gray('Type /help for commands, /exit to quit'));
  console.log(chalk.gray('Use !<command> to execute shell commands directly'));
  console.log(chalk.gray(`Session: ${sessionId}`));
  console.log();
}
