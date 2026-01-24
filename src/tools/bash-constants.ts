/**
 * Constants and shared definitions for bash architecture.
 *
 * Defines the Agent Bash commands that are handled by internal tools
 * (as opposed to native bash commands or Field Bash commands).
 *
 * Core exports:
 * - AGENT_COMMANDS: Set of Agent Bash command names
 */

/**
 * Agent commands that are handled by internal tools.
 *
 * These commands form the "Agent Bash" layer of the three-layer architecture:
 * - Base Bash: Native Unix/Linux commands
 * - Agent Bash: These commands (read, write, edit, grep, glob, skill, field)
 * - Field Bash: Domain-specific tools converted from MCP/Function Calling
 */
export const AGENT_COMMANDS = new Set([
  'read',
  'write',
  'edit',
  'glob',
  'grep',
  'skill',
  'field',
]);
