/**
 * Terminal Renderer
 *
 * Renders tool calls and SubAgent calls with tree structure.
 *
 * Core Exports:
 * - TerminalRenderer: Main renderer class
 */

import chalk from 'chalk';
import { TreeBuilder } from './tree-builder.ts';
import {
  type ToolCallEvent,
  type ToolResultEvent,
  type SubAgentEvent,
  STATUS_ICONS,
} from './terminal-renderer-types.ts';

/**
 * Track active tool calls for determining isLast
 */
interface ActiveCall {
  id: string;
  depth: number;
  parentId?: string;
  command?: string;
}

/**
 * TerminalRenderer - Renders tool calls with tree structure
 *
 * Usage:
 * ```typescript
 * const renderer = new TerminalRenderer();
 * renderer.renderToolStart({ id: '1', command: 'bun test', depth: 0 });
 * renderer.renderToolEnd({ id: '1', success: true, output: 'All passed' });
 * ```
 */
export class TerminalRenderer {
  private treeBuilder: TreeBuilder;
  private activeCalls: Map<string, ActiveCall>;
  private activeSubAgents: Map<string, SubAgentEvent>;

  constructor() {
    this.treeBuilder = new TreeBuilder();
    this.activeCalls = new Map();
    this.activeSubAgents = new Map();
  }

  /**
   * Render tool call start (pending state)
   */
  renderToolStart(event: ToolCallEvent): void {
    this.activeCalls.set(event.id, {
      id: event.id,
      depth: event.depth,
      parentId: event.parentId,
      command: event.command,
    });

    const prefix = this.treeBuilder.getPrefix(event.depth, false);
    const toolName = chalk.yellow(`Bash(${this.treeBuilder.truncate(event.command, 50)})`);
    const status = chalk.gray(STATUS_ICONS.PENDING);

    console.log(`${prefix}${toolName} ${status}`);
  }

  /**
   * Render tool call end (success/failure state)
   */
  renderToolEnd(event: ToolResultEvent): void {
    const call = this.activeCalls.get(event.id);
    if (!call) {
      return;
    }

    const depth = call.depth;
    const isLast = this.isLastCallAtDepth(event.id, depth);

    // Render completion line
    const prefix = this.treeBuilder.getPrefix(depth, isLast);
    const command = call.command || event.id;
    const toolName = chalk.yellow(`Bash(${this.treeBuilder.truncate(command, 50)})`);
    const status = event.success
      ? chalk.green(STATUS_ICONS.SUCCESS)
      : chalk.red(STATUS_ICONS.FAILURE);

    console.log(`${prefix}${toolName} ${status}`);

    // Render output line
    if (event.output) {
      const resultPrefix = this.treeBuilder.getResultPrefix(depth, isLast);
      const outputText = this.treeBuilder.truncate(event.output);
      const outputColor = event.success ? chalk.gray : chalk.red;

      console.log(`${resultPrefix}${outputColor(outputText)}`);
    }

    this.activeCalls.delete(event.id);
  }

  /**
   * Render SubAgent start
   */
  renderSubAgentStart(event: SubAgentEvent): void {
    this.activeSubAgents.set(event.id, event);

    const prefix = chalk.cyan('•') + ' ';
    const name = chalk.yellow(`Skill(${event.name})`);

    console.log(`${prefix}${name}`);
  }

  /**
   * Render SubAgent end
   */
  renderSubAgentEnd(id: string): void {
    const agent = this.activeSubAgents.get(id);
    if (!agent) {
      return;
    }

    const prefix = this.treeBuilder.getSubAgentEndPrefix();
    console.log(`${prefix}${chalk.gray('[completed]')}`);

    this.activeSubAgents.delete(id);
  }

  /**
   * Check if this is the last call at the given depth
   */
  private isLastCallAtDepth(excludeId: string, depth: number): boolean {
    for (const [id, call] of this.activeCalls) {
      if (id !== excludeId && call.depth === depth) {
        return false;
      }
    }
    return true;
  }

  /**
   * Store command with call for later retrieval
   */
  storeCommand(id: string, command: string): void {
    const call = this.activeCalls.get(id);
    if (call) {
      call.command = command;
    }
  }

  /**
   * Get stored command for a call
   */
  getStoredCommand(id: string): string | undefined {
    const call = this.activeCalls.get(id);
    return call?.command;
  }
}

export default TerminalRenderer;
