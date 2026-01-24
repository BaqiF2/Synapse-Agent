/**
 * Tools command - List and inspect available tools.
 *
 * This file implements the tools command for displaying tool information.
 *
 * Core exports:
 * - ToolsOptions: Options interface for tools command
 * - toolsCommand: Main function to list/inspect tools
 */

import { Agent } from '../../core/agent.js';
import { createLLMClient } from '../../core/llm.js';
import type { AgentConfig } from '../../core/agent-config.js';
import { getConfig } from '../../core/config.js';
import { ToolRegistry } from '../../tools/registry.js';
import chalk from 'chalk';

export interface ToolsOptions {
  verbose?: boolean;
  info?: string; // Tool name to show info for
}

export async function toolsCommand(options: ToolsOptions): Promise<void> {
  const config = getConfig();
  const llm = createLLMClient(config);

  const agentConfig: Partial<AgentConfig> = {
    max_iterations: 1,
    verbose: false,
  };

  const agent = new Agent(llm, agentConfig);
  const toolNames = agent.listTools();
  const registry = new ToolRegistry();

  // Show detailed info for specific tool
  if (options.info) {
    const tool = registry.get(options.info);
    if (!tool) {
      console.error(chalk.red(`Tool not found: ${options.info}`));
      console.log(chalk.gray('Available tools:'), toolNames.join(', '));
      return;
    }

    console.log(chalk.green.bold(tool.name));
    console.log(chalk.gray(tool.description));
    console.log('');

    const schema = tool.getSchema();
    const props = schema.input_schema.properties || {};
    const required = schema.input_schema.required || [];

    if (Object.keys(props).length > 0) {
      console.log(chalk.blue('Parameters:'));
      for (const [paramName, paramDef] of Object.entries(props)) {
        const isRequired = required.includes(paramName);
        const requiredMark = isRequired ? chalk.red('*') : ' ';
        const typeDef = (paramDef as any).type || 'any';
        const desc = (paramDef as any).description || '';

        console.log(`  ${requiredMark} ${chalk.yellow(paramName)} (${typeDef})`);
        if (desc) {
          console.log(`    ${chalk.gray(desc)}`);
        }
      }
    }
    return;
  }

  // Verbose mode: show all tools with parameters
  if (options.verbose) {
    console.log(chalk.blue.bold('Available Tools'));
    console.log('');

    for (const name of toolNames) {
      const tool = registry.get(name);
      if (!tool) continue;

      console.log(chalk.green.bold(name));
      console.log(chalk.gray(`  ${tool.description}`));
      console.log('');

      const schema = tool.getSchema();
      const props = schema.input_schema.properties || {};
      const required = schema.input_schema.required || [];

      if (Object.keys(props).length > 0) {
        console.log(chalk.blue('  Parameters:'));
        for (const [paramName, paramDef] of Object.entries(props)) {
          const isRequired = required.includes(paramName);
          const requiredMark = isRequired ? chalk.red('*') : ' ';
          const typeDef = (paramDef as any).type || 'any';
          const desc = (paramDef as any).description || '';

          console.log(`    ${requiredMark} ${chalk.yellow(paramName)} (${typeDef})`);
          if (desc) {
            console.log(`      ${chalk.gray(desc)}`);
          }
        }
      }
      console.log('');
    }
  } else {
    // Simple mode: list tool names with descriptions
    console.log(chalk.blue.bold('Available Tools'));
    console.log('');

    toolNames.forEach((name, i) => {
      const tool = registry.get(name);
      const desc = tool ? tool.description : 'No description';
      const shortDesc = desc.length > 60 ? desc.slice(0, 57) + '...' : desc;
      console.log(`${chalk.cyan((i + 1).toString().padStart(2))}. ${chalk.yellow(name.padEnd(15))} ${chalk.gray(shortDesc)}`);
    });

    console.log('');
    console.log(chalk.gray(`Total: ${toolNames.length} tools`));
    console.log(chalk.gray('Use --verbose for detailed information'));
    console.log(chalk.gray('Use --info <tool-name> for specific tool details'));
  }
}
