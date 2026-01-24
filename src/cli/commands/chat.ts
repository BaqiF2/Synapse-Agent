/**
 * Chat command - Interactive REPL for conversational AI interaction.
 *
 * This file implements the chat command for starting an interactive session.
 *
 * Core exports:
 * - ChatOptions: Options interface for chat command
 * - chatCommand: Main function to start REPL session
 */

import { Agent } from '../../core/agent.js';
import { createLLMClient } from '../../core/llm.js';
import type { AgentConfig } from '../../core/agent-config.js';
import { getConfig } from '../../core/config.js';
import { BashRouter } from '../../tools/bash-router.js';
import { ToolRegistry } from '../../tools/registry.js';
import { BashSession } from '../../tools/bash-session.js';
import chalk from 'chalk';
import * as readline from 'readline';

export interface ChatOptions {
  verbose?: boolean;
}

enum REPLCommand {
  EXIT,
  HELP,
  CLEAR,
  TOOLS,
  HISTORY,
}

function parseREPLCommand(input: string): REPLCommand | null {
  const inputLower = input.trim().toLowerCase();

  if (['/exit', '/quit', '/q'].includes(inputLower)) {
    return REPLCommand.EXIT;
  } else if (['/help', '/?'].includes(inputLower)) {
    return REPLCommand.HELP;
  } else if (inputLower === '/clear') {
    return REPLCommand.CLEAR;
  } else if (inputLower === '/tools') {
    return REPLCommand.TOOLS;
  } else if (inputLower === '/history') {
    return REPLCommand.HISTORY;
  }

  return null;
}

export async function chatCommand(options: ChatOptions): Promise<void> {
  // Load configuration
  const config = getConfig();
  await config.ensureDirs();

  const errors = config.validate();
  if (errors.length > 0) {
    console.error(chalk.red('Configuration errors:'));
    errors.forEach(err => console.error(chalk.red(`  - ${err}`)));
    process.exit(1);
  }

  // Create LLM client
  const llm = createLLMClient(config);

  // Create Agent
  const agentConfig: Partial<AgentConfig> = {
    max_iterations: 10,
    verbose: options.verbose || false,
  };

  const agent = new Agent(llm, agentConfig);

  // Create router for direct command execution
  const registry = new ToolRegistry();
  const session = new BashSession();
  const router = new BashRouter(registry, session);

  // Track conversation state
  let turnCount = 0;

  // Print welcome message
  console.log('');
  console.log(chalk.green.bold('Synapse Agent'));
  console.log(chalk.dim('Type /help for commands, /exit to quit'));
  console.log('');

  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan('synapse> '),
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    // Handle REPL commands
    const command = parseREPLCommand(input);
    if (command !== null) {
      await handleREPLCommand(command, agent, turnCount);

      if (command === REPLCommand.EXIT) {
        rl.close();
        return;
      }

      if (command === REPLCommand.CLEAR) {
        turnCount = 0;
      }

      rl.prompt();
      return;
    }

    // Handle shell commands (! prefix)
    if (input.startsWith('!')) {
      const shellCommand = input.slice(1).trim();
      try {
        const result = await router.execute(shellCommand);

        if (result.output) {
          const output = result.output.toString().trimEnd();
          if (output) {
            console.log(output);
          }
        }

        if (!result.success && result.error) {
          console.error(chalk.red(result.error));
        }
      } catch (error) {
        console.error(chalk.red('Error executing command:'), error);
      }

      rl.prompt();
      return;
    }

    // Process regular Agent query
    try {
      turnCount++;
      const result = await agent.run(input);

      console.log('');
      console.log(chalk.magenta.bold('Agent>'));

      if (result.error) {
        console.error(chalk.red('Error:'), result.error);
      } else {
        console.log(result.content);
      }

      // Show tool steps in verbose mode
      if (options.verbose && result.steps.length > 0) {
        console.log('');
        console.log(chalk.dim('--- Tool Calls ---'));
        result.steps.forEach((step, i) => {
          console.log(chalk.cyan(`${i + 1}. Calling:`), step.tool_name);

          if (step.tool_name === 'Bash' && step.tool_input.command) {
            console.log(chalk.dim('   Command:'), step.tool_input.command);
          }

          if (step.success) {
            const preview = step.tool_result.length > 200
              ? step.tool_result.slice(0, 200) + '...'
              : step.tool_result;
            console.log(chalk.green('   Result:'), preview);
          } else {
            console.log(chalk.red('   Error:'), step.tool_result);
          }
        });
        console.log(chalk.dim('--- End Tool Calls ---'));
      }

      console.log('');
    } catch (error) {
      console.error(chalk.red('Unexpected error:'), error);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log('');
    console.log(chalk.dim('Goodbye!'));
    process.exit(0);
  });

  // Handle Ctrl+C gracefully
  rl.on('SIGINT', () => {
    console.log('');
    console.log(chalk.dim('Use /exit to quit'));
    rl.prompt();
  });
}

async function handleREPLCommand(
  command: REPLCommand,
  agent: Agent,
  turnCount: number
): Promise<void> {
  switch (command) {
    case REPLCommand.EXIT:
      // Will be handled by caller
      break;

    case REPLCommand.HELP:
      printHelp();
      break;

    case REPLCommand.CLEAR:
      agent.clearHistory();
      console.log(chalk.blue('Conversation history cleared'));
      break;

    case REPLCommand.TOOLS:
      const tools = agent.listTools();
      console.log(chalk.blue('Available Tools:'));
      tools.forEach(tool => console.log(`  - ${tool}`));
      break;

    case REPLCommand.HISTORY:
      console.log(chalk.dim(`Conversation turns: ${turnCount}`));
      if (turnCount === 0) {
        console.log(chalk.dim('No conversation history yet.'));
      }
      break;
  }
}

function printHelp(): void {
  console.log('');
  console.log(chalk.blue.bold('Available Commands:'));
  console.log('');
  console.log('  /help     - Show this help message');
  console.log('  /exit     - Exit the REPL (also /quit, /q)');
  console.log('  /clear    - Clear conversation history');
  console.log('  /tools    - List available tools');
  console.log('  /history  - Show conversation history');
  console.log('');
  console.log(chalk.blue.bold('Shell Commands:'));
  console.log('');
  console.log('  !<command> - Execute command through unified Bash architecture');
  console.log('               • Agent commands (read, write, edit, glob, grep) use Agent tools');
  console.log('               • Other commands execute in persistent bash session');
  console.log('               Examples:');
  console.log('                 !read -h           # Show read tool help');
  console.log('                 !ls -la            # List files');
  console.log('                 !git status        # Run git command');
  console.log('                 !python script.py  # Run Python script');
  console.log('');
  console.log(chalk.blue.bold('Tips:'));
  console.log('  - Just type your message to chat with the agent');
  console.log('  - The agent can use tools to help accomplish tasks');
  console.log('  - Use ! prefix for direct command execution');
  console.log('  - Agent commands support -h (short) and --help (detailed) flags');
  console.log('  - Use Ctrl+C to cancel current input');
  console.log('');
}
