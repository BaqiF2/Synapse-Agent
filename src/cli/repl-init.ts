import chalk from 'chalk';

import { buildSystemPrompt } from '../agent/system-prompt.ts';
import { AgentRunner, type AgentRunnerOptions } from '../agent/agent-runner.ts';
import type { Session } from '../agent/session.ts';
import { SettingsManager } from '../config/settings-manager.ts';
import { AnthropicClient } from '../providers/anthropic/anthropic-client.ts';
import type { TokenUsage } from '../providers/anthropic/anthropic-types.ts';
import type { LLMClient } from '../providers/llm-client.ts';
import { BashTool, type BashToolOptions } from '../tools/bash-tool.ts';
import { initializeMcpTools } from '../tools/converters/mcp/index.ts';
import { initializeSkillTools } from '../tools/converters/skill/index.ts';
import { CallableToolset } from '../tools/toolset.ts';
import { getValueType } from '../utils/common-util.ts';
import { parseEnvInt } from '../utils/env.ts';
import { getErrorMessage } from '../utils/error.ts';
import { createLogger } from '../utils/logger.ts';
import { TerminalRenderer } from './terminal-renderer.ts';

const cliLogger = createLogger('cli');
const MAX_TOOL_ITERATIONS = parseEnvInt(process.env.SYNAPSE_MAX_TOOL_ITERATIONS, 50);
const MAX_ERROR_SUMMARY = 3;
const BASH_TOOL_FALLBACK = 'Bash';

type ToolCallLike = { id: string; name: string; arguments: string };
type RenderGuard = () => boolean;

interface AgentRenderer {
  renderMessagePart: TerminalRenderer['renderMessagePart'];
  renderToolStart: TerminalRenderer['renderToolStart'];
  renderToolEnd: TerminalRenderer['renderToolEnd'];
  renderSubAgentToolStart: TerminalRenderer['renderSubAgentToolStart'];
  renderSubAgentToolEnd: TerminalRenderer['renderSubAgentToolEnd'];
  renderSubAgentComplete: TerminalRenderer['renderSubAgentComplete'];
}

export interface InitializeAgentDependencies {
  createClient: () => LLMClient;
  createRenderer: () => AgentRenderer;
  createBashTool: (options: BashToolOptions) => BashTool;
  createAgentRunner: (options: AgentRunnerOptions) => AgentRunner;
  buildSystemPrompt: (cwd: string) => string;
  getCwd: () => string;
  maxToolIterations: number;
}

export interface InitializeAgentOptions {
  shouldRenderTurn: RenderGuard;
  dependencies?: Partial<InitializeAgentDependencies>;
}

interface CallbackContext {
  shouldRenderTurn: RenderGuard;
  renderer: AgentRenderer;
}

interface AgentUsageBridge {
  getRunner: () => AgentRunner | null;
}

interface InitSummary {
  success: boolean;
  totalSources: number;
  totalToolsInstalled: number;
  errors: string[];
}

export interface McpInitializationSummary extends InitSummary {
  kind: 'mcp';
  connectedSources: number;
}

export interface SkillInitializationSummary extends InitSummary {
  kind: 'skill';
}

export interface InitializeMcpDependencies {
  initializeMcpTools: typeof initializeMcpTools;
}

export interface InitializeSkillDependencies {
  initializeSkillTools: typeof initializeSkillTools;
}

function withRenderGuard<T extends unknown[]>(
  shouldRenderTurn: RenderGuard,
  render: (...args: T) => void
): (...args: T) => void {
  return (...args: T) => {
    if (!shouldRenderTurn()) {
      return;
    }
    render(...args);
  };
}

function sanitizeCommandForDisplay(command: string): string | null {
  let cleaned = '';
  for (const char of command) {
    const code = char.charCodeAt(0);
    cleaned += code < 0x20 || code === 0x7f ? ' ' : char;
  }
  const normalized = cleaned.replace(/\s+/g, ' ').trim();
  return normalized || null;
}

function resolveInitializeAgentDependencies(
  overrides?: Partial<InitializeAgentDependencies>
): InitializeAgentDependencies {
  return {
    createClient: () => new AnthropicClient({ settings: SettingsManager.getInstance().getLlmConfig() }),
    createRenderer: () => new TerminalRenderer(),
    createBashTool: (options) => new BashTool(options),
    createAgentRunner: (options) => new AgentRunner(options),
    buildSystemPrompt: (cwd) => buildSystemPrompt({ cwd }),
    getCwd: () => process.cwd(),
    maxToolIterations: MAX_TOOL_ITERATIONS,
    ...overrides,
  };
}

function createSubAgentCallbacks(
  context: CallbackContext,
  usageBridge: AgentUsageBridge
): Pick<BashToolOptions, 'onSubAgentToolStart' | 'onSubAgentToolEnd' | 'onSubAgentComplete' | 'onSubAgentUsage'> {
  return {
    onSubAgentToolStart: withRenderGuard(context.shouldRenderTurn, (event) => {
      context.renderer.renderSubAgentToolStart(event);
    }),
    onSubAgentToolEnd: withRenderGuard(context.shouldRenderTurn, (event) => {
      context.renderer.renderSubAgentToolEnd(event);
    }),
    onSubAgentComplete: withRenderGuard(context.shouldRenderTurn, (event) => {
      context.renderer.renderSubAgentComplete(event);
    }),
    onSubAgentUsage: async (usage: TokenUsage, model: string) => {
      const runner = usageBridge.getRunner();
      if (!runner) {
        return;
      }
      try {
        await runner.recordUsage(usage, model);
      } catch (error) {
        cliLogger.warn('Failed to record sub-agent usage', { error: getErrorMessage(error) });
      }
    },
  };
}

function createMainAgentCallbacks(context: CallbackContext): Pick<
  AgentRunnerOptions,
  'onMessagePart' | 'onToolCall' | 'onToolResult'
> {
  return {
    onMessagePart: withRenderGuard(context.shouldRenderTurn, (part) => {
      context.renderer.renderMessagePart(part);
    }),
    onToolCall: withRenderGuard(context.shouldRenderTurn, (toolCall) => {
      const command = resolveToolCallCommand(toolCall);
      if (command.startsWith('task:')) {
        return;
      }
      context.renderer.renderToolStart({
        id: toolCall.id,
        command,
        depth: 0,
      });
    }),
    onToolResult: withRenderGuard(context.shouldRenderTurn, (result) => {
      context.renderer.renderToolEnd({
        id: result.toolCallId,
        success: !result.returnValue.isError,
        output: result.returnValue.output,
      });
    }),
  };
}

function printErrorSummary(errors: string[]): void {
  for (const error of errors.slice(0, MAX_ERROR_SUMMARY)) {
    console.log(chalk.gray(`  - ${error}`));
  }
}

export function resolveToolCallCommand(toolCall: ToolCallLike): string {
  if (toolCall.name !== BASH_TOOL_FALLBACK) {
    return toolCall.name;
  }

  try {
    const parsed = JSON.parse(toolCall.arguments) as unknown;
    const commandValue =
      parsed && typeof parsed === 'object' ? (parsed as { command?: unknown }).command : undefined;

    if (typeof commandValue !== 'string') {
      cliLogger.warn('Bash tool call command is not a string', {
        toolCallId: toolCall.id,
        commandType: getValueType(commandValue),
        argumentsPreview: toolCall.arguments.slice(0, 200),
      });
      return BASH_TOOL_FALLBACK;
    }

    const sanitizedCommand = sanitizeCommandForDisplay(commandValue);
    if (!sanitizedCommand) {
      cliLogger.warn('Bash tool call command is empty after sanitization', {
        toolCallId: toolCall.id,
        argumentsPreview: toolCall.arguments.slice(0, 200),
      });
      return BASH_TOOL_FALLBACK;
    }

    return sanitizedCommand;
  } catch (error) {
    cliLogger.warn('Failed to parse Bash tool call arguments', {
      toolCallId: toolCall.id,
      error: getErrorMessage(error),
      argumentsPreview: toolCall.arguments.slice(0, 200),
    });
    return BASH_TOOL_FALLBACK;
  }
}

export function initializeAgent(session: Session, options: InitializeAgentOptions): AgentRunner {
  try {
    const dependencies = resolveInitializeAgentDependencies(options.dependencies);
    const client = dependencies.createClient();
    const renderer = dependencies.createRenderer();
    const callbackContext: CallbackContext = {
      shouldRenderTurn: options.shouldRenderTurn,
      renderer,
    };

    let runnerRef: AgentRunner | null = null;
    const subAgentCallbacks = createSubAgentCallbacks(callbackContext, {
      getRunner: () => runnerRef,
    });

    const bashTool = dependencies.createBashTool({
      llmClient: client,
      getConversationPath: () => session?.historyPath ?? null,
      ...subAgentCallbacks,
    });
    const toolset = new CallableToolset([bashTool]);

    const runner = dependencies.createAgentRunner({
      client,
      systemPrompt: dependencies.buildSystemPrompt(dependencies.getCwd()),
      toolset,
      maxIterations: dependencies.maxToolIterations,
      session,
      ...createMainAgentCallbacks(callbackContext),
    });

    runnerRef = runner;
    return runner;
  } catch (error) {
    const message = getErrorMessage(error);
    cliLogger.error('Agent initialization failed', { error: message });
    throw error instanceof Error ? error : new Error(message);
  }
}

export async function initializeMcp(
  dependencies?: Partial<InitializeMcpDependencies>
): Promise<McpInitializationSummary> {
  const mcpInitializer = dependencies?.initializeMcpTools ?? initializeMcpTools;
  console.log(chalk.gray('Initializing MCP tools...'));

  try {
    const result = await mcpInitializer({ skipFailedServers: true });
    if (result.totalServers === 0) {
      console.log(chalk.gray('  No MCP servers configured'));
    } else if (result.totalToolsInstalled > 0) {
      console.log(
        chalk.green(
          `✓ Loaded ${result.totalToolsInstalled} MCP tools from ${result.connectedServers} server(s)`
        )
      );
    } else {
      console.log(chalk.gray(`  Loaded 0 MCP tools from ${result.connectedServers} server(s)`));
    }

    if (result.errors.length > 0) {
      printErrorSummary(result.errors);
      cliLogger.warn('MCP initialization completed with errors', {
        errorCount: result.errors.length,
        connectedServers: result.connectedServers,
      });
    }

    return {
      kind: 'mcp',
      success: result.success && result.errors.length === 0,
      totalSources: result.totalServers,
      connectedSources: result.connectedServers,
      totalToolsInstalled: result.totalToolsInstalled,
      errors: [...result.errors],
    };
  } catch (error) {
    const message = getErrorMessage(error);
    console.log(chalk.yellow(`⚠ MCP tools unavailable: ${message}`));
    cliLogger.warn('MCP initialization failed', { error: message });
    return {
      kind: 'mcp',
      success: false,
      totalSources: 0,
      connectedSources: 0,
      totalToolsInstalled: 0,
      errors: [message],
    };
  }
}

export async function initializeSkills(
  dependencies?: Partial<InitializeSkillDependencies>
): Promise<SkillInitializationSummary> {
  const skillInitializer = dependencies?.initializeSkillTools ?? initializeSkillTools;

  try {
    const result = await skillInitializer();
    if (result.totalSkills === 0) {
      console.log(chalk.gray('  No skills found for tool initialization'));
    } else if (result.totalToolsInstalled > 0) {
      console.log(
        chalk.green(
          `✓ Loaded ${result.totalToolsInstalled} skill tool(s) from ${result.totalSkills} skill(s)`
        )
      );
    } else {
      console.log(chalk.gray(`  No skill tools to load (${result.totalSkills} skill(s) found)`));
    }

    if (result.errors.length > 0) {
      printErrorSummary(result.errors);
      cliLogger.warn('Skill initialization completed with errors', {
        errorCount: result.errors.length,
        totalSkills: result.totalSkills,
      });
    }

    return {
      kind: 'skill',
      success: result.success && result.errors.length === 0,
      totalSources: result.totalSkills,
      totalToolsInstalled: result.totalToolsInstalled,
      errors: [...result.errors],
    };
  } catch (error) {
    const message = getErrorMessage(error);
    console.log(chalk.yellow(`⚠ Skill tools unavailable: ${message}`));
    cliLogger.warn('Skill initialization failed', { error: message });
    return {
      kind: 'skill',
      success: false,
      totalSources: 0,
      totalToolsInstalled: 0,
      errors: [message],
    };
  }
}

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
