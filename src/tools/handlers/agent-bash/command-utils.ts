/**
 * Command Utilities - Agent Shell Command Layer 2
 *
 * Shared utilities for parsing command arguments.
 *
 * Core Exports:
 * - parseCommandArgs: Parse command arguments with proper quote handling
 */

import type { CommandResult } from '../base-bash-handler.ts';

/**
 * Parse command arguments with proper quote handling
 * Supports both single and double quotes
 *
 * @param command - The command string to parse
 * @returns Array of parsed arguments
 */
export function parseCommandArgs(command: string): string[] {
  const args: string[] = [];
  let current = '';
  let inQuote: string | null = null;

  for (let i = 0; i < command.length; i++) {
    const char = command[i];

    if (inQuote) {
      if (char === inQuote) {
        inQuote = null;
      } else {
        current += char;
      }
    } else if (char === '"' || char === "'") {
      inQuote = char;
    } else if (char === ' ' || char === '\t') {
      if (current) {
        args.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current) {
    args.push(current);
  }

  return args;
}

/**
 * Normalize unknown errors to a CommandResult
 */
export function toCommandErrorResult(error: unknown): CommandResult {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return {
    stdout: '',
    stderr: message,
    exitCode: 1,
  };
}
