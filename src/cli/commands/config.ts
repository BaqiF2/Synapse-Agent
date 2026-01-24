/**
 * Config command - Display current configuration.
 *
 * This file implements the config command for showing system configuration.
 *
 * Core exports:
 * - configCommand: Main function to display configuration
 */

import { getConfig } from '../../core/config.js';
import chalk from 'chalk';

export async function configCommand(): Promise<void> {
  const config = getConfig();

  console.log(chalk.blue.bold('Synapse Agent Configuration'));
  console.log('');
  console.log(chalk.cyan('SYNAPSE_HOME:'), config.synapseHome);
  console.log(chalk.cyan('Tools directory:'), config.toolsDir);
  console.log(chalk.cyan('Skills directory:'), config.skillsDir);
  console.log(chalk.cyan('Model:'), config.model);

  // Check API key
  const apiKey = config.apiKey;
  if (apiKey && apiKey.length > 8) {
    const masked = apiKey.slice(0, 4) + '...' + apiKey.slice(-4);
    console.log(chalk.cyan('API Key:'), masked);
  } else if (apiKey) {
    console.log(chalk.cyan('API Key:'), '****');
  } else {
    console.log(chalk.yellow('API Key:'), 'Not set (set ANTHROPIC_API_KEY)');
  }

  // Show base URL if set
  if (config.baseURL) {
    console.log(chalk.cyan('API Base URL:'), config.baseURL);
  } else {
    console.log(chalk.cyan('API Base URL:'), '(default Anthropic API)');
  }

  console.log(chalk.cyan('Max Tokens:'), config.maxTokens.toString());
  console.log(chalk.cyan('Temperature:'), config.temperature.toString());
  console.log('');

  // Validate configuration
  const errors = config.validate();
  if (errors.length > 0) {
    console.log(chalk.red.bold('Configuration Errors:'));
    errors.forEach(err => console.log(chalk.red(`  - ${err}`)));
  } else {
    console.log(chalk.green('✓ Configuration is valid'));
  }
}
