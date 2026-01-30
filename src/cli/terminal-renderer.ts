/**
 * Terminal Renderer
 *
 * Renders tool calls and SubAgent calls with tree structure.
 *
 * Core Exports:
 * - TerminalRenderer: Main renderer class
 */

import chalk from 'chalk';
import readline from 'readline';
import { TreeBuilder } from './tree-builder.ts';
import {
  type ToolCallEvent,
  type ToolResultEvent,
  type SubAgentEvent,
} from './terminal-renderer-types.ts';

const MAX_OUTPUT_LINES = parseInt(process.env.SYNAPSE_MAX_OUTPUT_LINES || '5', 10);

/**
 * Track active tool calls for determining isLast
 */
interface ActiveCall {
  id: string;
  depth: number;
  parentId?: string;
  command?: string;
  lineOpen?: boolean;
  lineRows?: number;
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
  private activeAnimations: Map<string, ReturnType<typeof setInterval>>;

  constructor() {
    this.treeBuilder = new TreeBuilder();
    this.activeCalls = new Map();
    this.activeSubAgents = new Map();
    this.activeAnimations = new Map();
  }

  /**
   * Render tool call start (pending state)
   */
  renderToolStart(event: ToolCallEvent): void {
    this.finalizeOpenLines(event.id);

    const call: ActiveCall = {
      id: event.id,
      depth: event.depth,
      parentId: event.parentId,
      command: event.command,
      lineOpen: true,
    };
    this.activeCalls.set(event.id, call);

    const line = this.buildToolLine({
      depth: event.depth,
      isLast: false,
      dotColor: chalk.gray,
      command: event.command,
    });

    if (!process.stdout.isTTY) {
      call.lineOpen = false;
      return;
    }

    call.lineRows = this.getLineRows(line);
    process.stdout.write(line);
    this.startProgressAnimation(event.id);
  }

  /**
   * Render tool call end (success/failure state)
   */
  renderToolEnd(event: ToolResultEvent): void {
    const call = this.activeCalls.get(event.id);
    if (!call) {
      return;
    }

    this.stopProgressAnimation(event.id);

    const depth = call.depth;
    const isLast = this.isLastCallAtDepth(event.id, depth);

    // Render completion line
    const command = call.command || event.id;
    const line = this.buildToolLine({
      depth,
      isLast,
      dotColor: event.success ? chalk.green : chalk.red,
      command,
    });

    if (call.lineOpen) {
      this.renderLineInPlace(line, call.lineRows ?? this.getLineRows(line));
      process.stdout.write('\n');
      call.lineOpen = false;
    } else {
      console.log(line);
    }

    // Render output line
    if (event.output) {
      const resultPrefix = this.treeBuilder.getResultPrefix(depth, isLast);
      const outputColor = event.success ? chalk.gray : chalk.red;
      const lines = event.output.split('\n');
      const displayLines = lines.slice(0, MAX_OUTPUT_LINES);
      for (const lineText of displayLines) {
        console.log(`${resultPrefix}${outputColor(lineText)}`);
      }
      const omitted = lines.length - displayLines.length;
      if (omitted > 0) {
        console.log(`${resultPrefix}${outputColor(`...[omit ${omitted} lines]`)}`);
      }
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

  private buildToolLine(options: {
    depth: number;
    isLast: boolean;
    dotColor: (text: string) => string;
    command: string;
  }): string {
    const prefix = this.getToolPrefix(options.depth, options.isLast, options.dotColor);
    const toolName = chalk.yellow(`Bash(${options.command})`);
    return `${prefix}${toolName}`;
  }

  private getToolPrefix(
    depth: number,
    isLast: boolean,
    dotColor: (text: string) => string
  ): string {
    if (depth === 0) {
      return dotColor('•') + ' ';
    }
    return this.treeBuilder.getPrefix(depth, isLast);
  }

  private startProgressAnimation(id: string): void {
    const call = this.activeCalls.get(id);
    if (!call) {
      return;
    }

    if (call.depth !== 0) {
      return;
    }

    if (this.activeAnimations.has(id)) {
      return;
    }

    let tick = false;
    const interval = setInterval(() => {
      const activeCall = this.activeCalls.get(id);
      if (!activeCall) {
        this.stopProgressAnimation(id);
        return;
      }

      tick = !tick;
      const dotColor = tick ? chalk.cyan : chalk.gray;
      const command = activeCall.command || id;
      const line = this.buildToolLine({
        depth: activeCall.depth,
        isLast: false,
        dotColor,
        command,
      });
      const rows = activeCall.lineRows ?? this.getLineRows(line);
      activeCall.lineRows = rows;
      this.renderLineInPlace(line, rows);
    }, 350);

    this.activeAnimations.set(id, interval);
  }

  private stopProgressAnimation(id: string): void {
    const interval = this.activeAnimations.get(id);
    if (!interval) {
      return;
    }

    clearInterval(interval);
    this.activeAnimations.delete(id);
  }

  private finalizeOpenLines(excludeId?: string): void {
    for (const [id, call] of this.activeCalls) {
      if (excludeId && id === excludeId) {
        continue;
      }
      if (call.lineOpen) {
        this.stopProgressAnimation(id);
        process.stdout.write('\n');
        call.lineOpen = false;
      }
    }
  }

  private renderLineInPlace(line: string, rows: number): void {
    if (rows <= 1) {
      process.stdout.write(`\r${line}`);
      return;
    }

    readline.moveCursor(process.stdout, 0, -(rows - 1));
    readline.cursorTo(process.stdout, 0);

    for (let i = 0; i < rows; i += 1) {
      readline.clearLine(process.stdout, 0);
      if (i < rows - 1) {
        readline.moveCursor(process.stdout, 0, 1);
      }
    }

    readline.moveCursor(process.stdout, 0, -(rows - 1));
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(line);
  }

  private getLineRows(line: string): number {
    const columns = process.stdout.columns;
    if (!columns || columns <= 0) {
      return 1;
    }
    const visibleLength = this.stripAnsi(line).length;
    return Math.max(1, Math.ceil(visibleLength / columns));
  }

  private stripAnsi(text: string): string {
    return text.replace(/\x1b\[[0-9;]*m/g, '');
  }
}

export default TerminalRenderer;
