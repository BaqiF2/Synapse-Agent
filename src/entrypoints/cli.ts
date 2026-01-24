#!/usr/bin/env bun
/**
 * CLI entry point for Synapse Agent.
 *
 * This file defines the command-line interface using Commander.js.
 *
 * Core commands:
 * - synapse <query> - Run a single query
 * - synapse chat - Start interactive REPL
 * - synapse config - Show configuration
 * - synapse tools - List available tools
 * - synapse skills - Manage skills
 */

import { Command } from 'commander';
import { runCommand } from '../cli/commands/run.js';
import { chatCommand } from '../cli/commands/chat.js';
import { configCommand } from '../cli/commands/config.js';
import { toolsCommand } from '../cli/commands/tools.js';
import { skillsCommand } from '../cli/commands/skills.js';
import { handleError } from '../cli/formatters/output.js';

// Read version from package.json
const version = '1.0.0';

const program = new Command();

program
  .name('synapse')
  .description('Synapse Agent - Self-growing AI agent with unified Bash interface')
  .version(version);

// Main command: synapse <query>
program
  .argument('[query...]', 'Query to send to the agent')
  .option('-v, --verbose', 'Enable verbose output')
  .option('--max-iterations <n>', 'Maximum iterations', '10')
  .action(async (query, options) => {
    if (query.length === 0) {
      program.help();
      return;
    }
    await runCommand(query.join(' '), options);
  });

// Subcommand: chat
program
  .command('chat')
  .description('Start interactive REPL session')
  .option('-v, --verbose', 'Enable verbose output')
  .action(chatCommand);

// Subcommand: config
program
  .command('config')
  .description('Show configuration')
  .action(configCommand);

// Subcommand: tools
program
  .command('tools')
  .description('List available tools')
  .option('-v, --verbose', 'Show detailed information')
  .option('--info <tool-name>', 'Show detailed info for specific tool')
  .action(toolsCommand);

// Subcommand: skills
program
  .command('skills')
  .description('Manage skills')
  .option('-l, --list', 'List all skills (default)')
  .option('-s, --search <query>', 'Search skills')
  .option('-d, --domain <domain>', 'Filter by domain')
  .option('--info <skill-name>', 'Show detailed info for specific skill')
  .action(skillsCommand);

// Global error handlers
process.on('uncaughtException', (error) => {
  handleError(error);
});

process.on('unhandledRejection', (reason) => {
  handleError(reason as Error);
});

// Parse arguments
program.parse();
