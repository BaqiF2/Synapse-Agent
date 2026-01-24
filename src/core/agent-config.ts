/**
 * Agent configuration types and defaults.
 *
 * Defines configuration options for Agent behavior including
 * iteration limits, output verbosity, and timeout settings.
 *
 * Core exports:
 * - AgentConfig: Configuration interface for Agent behavior
 * - DEFAULT_AGENT_CONFIG: Default configuration values
 */

/**
 * Configuration for Agent behavior.
 *
 * All fields are snake_case to align with Python version.
 */
export interface AgentConfig {
  /** Maximum number of LLM call iterations */
  max_iterations: number;

  /** Maximum tokens per LLM response */
  max_tokens: number;

  /** Whether to print debug information */
  verbose: boolean;

  /** Timeout for bash commands in seconds */
  bash_timeout: number;
}

/**
 * Default agent configuration.
 *
 * Matches Python version defaults.
 */
export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  max_iterations: 10,
  max_tokens: 4096,
  verbose: false,
  bash_timeout: 30,
};
