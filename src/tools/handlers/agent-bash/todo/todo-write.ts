/**
 * TodoWrite 工具 - Agent Shell Command Layer 2
 */

import * as path from 'node:path';
import type { CommandResult } from '../../base-bash-handler.ts';
import { toCommandErrorResult } from '../command-utils.ts';
import { loadDesc } from '../../../../utils/load-desc.js';
import { todoStore, type TodoItem } from './todo-store.ts';
import { buildTodoWriteSchema } from './todo-schema.ts';

const USAGE =
  'Usage: TodoWrite \'{"todos":[{"content":"...","activeForm":"...","status":"pending"}]}\'';

interface ParsedArgs {
  jsonText: string;
}

function extractJsonFromArgs(command: string): ParsedArgs | null {
  const trimmed = command.trim();
  if (!trimmed.startsWith('TodoWrite')) {
    return null;
  }

  const rest = trimmed.slice('TodoWrite'.length).trim();
  if (!rest) {
    return null;
  }

  let jsonText = rest;
  if (
    (jsonText.startsWith('"') && jsonText.endsWith('"')) ||
    (jsonText.startsWith("'") && jsonText.endsWith("'"))
  ) {
    jsonText = jsonText.slice(1, -1);
  }

  return { jsonText };
}

function formatZodError(error: unknown): string {
  if (!error || typeof error !== 'object' || !('issues' in error)) {
    return 'Validation failed';
  }

  const issues = (error as {
    issues: Array<{
      path: (string | number)[];
      message: string;
      code?: string;
      received?: unknown;
    }>;
  }).issues;

  const lines = issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'input';
    const message =
      (issue.code === 'invalid_type' && issue.received === 'undefined') ||
      issue.message.includes('received undefined')
        ? 'Required'
        : issue.message;
    return `- ${path}: ${message}`;
  });

  return ['Error: Validation failed', ...lines].join('\n');
}

function buildSummary(items: TodoItem[]): string {
  const counts = items.reduce(
    (acc, item) => {
      acc[item.status] += 1;
      return acc;
    },
    { pending: 0, in_progress: 0, completed: 0 }
  );

  return `Todo list updated: ${counts.completed} completed, ${counts.in_progress} in_progress, ${counts.pending} pending`;
}

export class TodoWriteHandler {
  async execute(command: string): Promise<CommandResult> {
    try {
      if (command.includes(' -h') || command.includes(' --help')) {
        return this.showHelp(command.includes('--help'));
      }

      const parsed = extractJsonFromArgs(command);
      if (!parsed) {
        return {
          stdout: '',
          stderr: `Error: Missing JSON parameter\n${USAGE}`,
          exitCode: 1,
        };
      }

      let data: unknown;
      try {
        data = JSON.parse(parsed.jsonText);
      } catch (error) {
        return {
          stdout: '',
          stderr: `Error: Invalid JSON format\n${USAGE}`,
          exitCode: 1,
        };
      }

      const { inputSchema } = buildTodoWriteSchema();
      const result = inputSchema.safeParse(data);
      if (!result.success) {
        return {
          stdout: '',
          stderr: formatZodError(result.error),
          exitCode: 1,
        };
      }

      const { todos } = result.data;
      todoStore.update(todos);

      return {
        stdout: buildSummary(todos),
        stderr: '',
        exitCode: 0,
      };
    } catch (error) {
      return toCommandErrorResult(error);
    }
  }

  private showHelp(verbose: boolean): CommandResult {
    if (verbose) {
      const help = loadDesc(path.join(import.meta.dirname, 'todo-write.md'));
      return { stdout: help, stderr: '', exitCode: 0 };
    }

    return { stdout: USAGE, stderr: '', exitCode: 0 };
  }
}
