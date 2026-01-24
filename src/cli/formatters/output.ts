/**
 * Output formatters - Format output for CLI display.
 *
 * This file provides utilities for formatting CLI output including
 * error messages and structured data.
 *
 * Core exports:
 * - formatError: Format error messages with stack traces
 * - CLIError: Custom error class for CLI errors
 */

import chalk from 'chalk';

/**
 * Custom CLI error with exit code.
 */
export class CLIError extends Error {
  constructor(
    message: string,
    public exitCode: number = 1
  ) {
    super(message);
    this.name = 'CLIError';
  }
}

/**
 * Format an error for CLI output.
 *
 * @param error - Error object or string
 * @returns Formatted error string
 */
export function formatError(error: Error | string): string {
  if (typeof error === 'string') {
    return chalk.red('Error: ') + error;
  }

  const lines = [
    chalk.red.bold('Error:'),
    chalk.red(`  ${error.message}`),
  ];

  if (error.stack) {
    lines.push('');
    lines.push(chalk.gray('Stack trace:'));
    error.stack.split('\n').slice(1).forEach(line => {
      lines.push(chalk.gray(`  ${line.trim()}`));
    });
  }

  return lines.join('\n');
}

/**
 * Handle error and exit process.
 *
 * @param error - Error to handle
 */
export function handleError(error: unknown): never {
  if (error instanceof CLIError) {
    console.error(formatError(error.message));
    process.exit(error.exitCode);
  }

  if (error instanceof Error) {
    console.error(formatError(error));
    process.exit(1);
  }

  console.error(chalk.red('Unknown error:'), error);
  process.exit(1);
}
