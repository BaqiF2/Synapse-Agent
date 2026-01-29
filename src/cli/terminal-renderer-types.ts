/**
 * Terminal Renderer Types
 *
 * Type definitions for terminal rendering system.
 *
 * Core Exports:
 * - ToolCallEvent: Event when tool starts
 * - ToolResultEvent: Event when tool completes
 * - SubAgentEvent: Event for SubAgent lifecycle
 * - TreeSymbols: Unicode tree symbols
 * - StatusIcons: Status indicator icons
 */

/**
 * Event emitted when a tool call starts
 */
export interface ToolCallEvent {
  /** Unique identifier for tracking */
  id: string;
  /** Command being executed */
  command: string;
  /** Parent SubAgent ID (for nested calls) */
  parentId?: string;
  /** Nesting depth (0 = top-level, 1 = inside SubAgent) */
  depth: number;
}

/**
 * Event emitted when a tool call completes
 */
export interface ToolResultEvent {
  /** Matches ToolCallEvent.id */
  id: string;
  /** Whether execution succeeded */
  success: boolean;
  /** Output content (will be truncated) */
  output: string;
}

/**
 * Event for SubAgent lifecycle
 */
export interface SubAgentEvent {
  /** Unique identifier */
  id: string;
  /** SubAgent name/description */
  name: string;
}

/**
 * Unicode tree symbols for rendering
 */
export const TREE_SYMBOLS = {
  /** Middle branch: ├─ */
  BRANCH: '├─',
  /** Last branch: └─ */
  LAST: '└─',
  /** Vertical line: │ */
  VERTICAL: '│',
  /** Indent spacing */
  SPACE: '  ',
} as const;

/**
 * Status indicator icons
 */
export const STATUS_ICONS = {
  /** Pending/executing */
  PENDING: '⏳',
  /** Success */
  SUCCESS: '✓',
  /** Failure */
  FAILURE: '✗',
} as const;

/**
 * Maximum output length before truncation
 */
export const MAX_OUTPUT_LENGTH = parseInt(process.env.SYNAPSE_MAX_OUTPUT_LENGTH || '100', 10);
