/**
 * Run command - Execute a single query through the agent.
 *
 * This file implements the run command for executing one-off queries.
 *
 * Core exports:
 * - RunOptions: Options interface for run command
 * - runCommand: Main function to execute a single agent query
 */

import { Agent } from '../../core/agent.js';
import { createLLMClient } from '../../core/llm.js';
import type { AgentConfig } from '../../core/agent-config.js';
import { getConfig } from '../../core/config.js';
import chalk from 'chalk';

export interface RunOptions {
  verbose?: boolean;
  maxIterations?: string;
}

export async function runCommand(
  query: string,
  options: RunOptions
): Promise<void> {
  try {
    // Load and validate configuration
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

    // Create Agent with configuration
    const agentConfig: Partial<AgentConfig> = {
      max_iterations: parseInt(options.maxIterations || '10', 10),
      verbose: options.verbose || false,
    };

    const agent = new Agent(llm, agentConfig);

    // Execute query
    if (options.verbose) {
      console.log(chalk.blue('Query:'), query);
      console.log(chalk.blue('Max iterations:'), agentConfig.max_iterations || 10);
      console.log('');
    }

    const result = await agent.run(query);

    // Output result
    if (result.error) {
      console.error(chalk.red('Error:'), result.error);
      process.exit(1);
    }

    console.log(result.content);

    // Verbose mode: output tool call steps
    if (options.verbose && result.steps.length > 0) {
      console.log('');
      console.log(chalk.blue('Tool calls:'));
      result.steps.forEach((step, i) => {
        console.log(chalk.gray(`[${i + 1}] ${step.tool_name}`));
        console.log(chalk.gray(`    Input: ${JSON.stringify(step.tool_input)}`));
        console.log(chalk.gray(`    Success: ${step.success}`));
      });
    }
  } catch (error) {
    console.error(chalk.red('Unexpected error:'), error);
    process.exit(1);
  }
}
