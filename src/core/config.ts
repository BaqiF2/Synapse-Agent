/**
 * Configuration management for Synapse Agent.
 *
 * Manages paths and settings for the agent's file system structure.
 * Implements singleton pattern with environment variable support.
 *
 * Core exports:
 * - SynapseConfig: Main configuration class with directory management
 * - getConfig(): Factory function to get the global configuration instance
 * - resetConfig(): Reset the global configuration (for testing only)
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Global configuration instance (singleton pattern).
 */
let _configInstance: SynapseConfig | null = null;

/**
 * Configuration for Synapse Agent.
 *
 * Manages paths and settings for the agent's file system structure.
 * Mirrors the Python version's dataclass implementation.
 */
export class SynapseConfig {
  /** Synapse home directory */
  public readonly synapseHome: string;

  /** Model name (e.g., MiniMax-M2) */
  public readonly model: string;

  /** API key for Anthropic/MiniMax */
  public readonly apiKey: string;

  /** API base URL */
  public readonly baseURL: string;

  /** Maximum tokens per LLM response */
  public readonly maxTokens: number;

  /** Temperature for LLM responses */
  public readonly temperature: number;

  // Directory structure constants (match Python version)
  private static readonly TOOLS_SUBDIR = 'tools';
  private static readonly SKILLS_SUBDIR = 'skills';
  private static readonly AGENT_TOOLS_SUBDIR = 'agent';
  private static readonly FIELD_TOOLS_SUBDIR = 'field';

  constructor(synapseHome?: string) {
    // Initialize synapse home directory
    this.synapseHome = synapseHome || path.join(os.homedir(), '.synapse');

    // Model configuration - read from environment variables
    // Defaults match Python version
    this.model = process.env.MODEL || 'MiniMax-M2';
    this.apiKey = process.env.ANTHROPIC_API_KEY || '';
    this.baseURL = process.env.ANTHROPIC_BASE_URL || 'https://api.minimaxi.com/anthropic';

    // LLM configuration
    const maxTokensEnv = process.env.MAX_TOKENS;
    this.maxTokens = maxTokensEnv ? parseInt(maxTokensEnv, 10) : 4096;

    const temperatureEnv = process.env.TEMPERATURE;
    this.temperature = temperatureEnv ? parseFloat(temperatureEnv) : 0.7;
  }

  /**
   * Get the tools directory path.
   */
  get toolsDir(): string {
    return path.join(this.synapseHome, SynapseConfig.TOOLS_SUBDIR);
  }

  /**
   * Get the skills directory path.
   */
  get skillsDir(): string {
    return path.join(this.synapseHome, SynapseConfig.SKILLS_SUBDIR);
  }

  /**
   * Get the agent tools directory path.
   */
  get agentToolsDir(): string {
    return path.join(this.toolsDir, SynapseConfig.AGENT_TOOLS_SUBDIR);
  }

  /**
   * Get the field tools directory path.
   */
  get fieldToolsDir(): string {
    return path.join(this.toolsDir, SynapseConfig.FIELD_TOOLS_SUBDIR);
  }

  /**
   * Create all required directories if they don't exist.
   *
   * Mirrors Python version's ensure_dirs() method.
   */
  async ensureDirs(): Promise<void> {
    const dirs = [this.synapseHome, this.agentToolsDir, this.fieldToolsDir, this.skillsDir];

    for (const dir of dirs) {
      await fs.promises.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Synchronous version of ensureDirs().
   *
   * Useful for initialization code.
   */
  ensureDirsSync(): void {
    const dirs = [this.synapseHome, this.agentToolsDir, this.fieldToolsDir, this.skillsDir];

    for (const dir of dirs) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Validate configuration and return error messages.
   *
   * @returns Array of validation error messages. Empty if valid.
   */
  validate(): string[] {
    const errors: string[] = [];

    if (!this.apiKey) {
      errors.push('ANTHROPIC_API_KEY is not set');
    }

    if (!this.model) {
      errors.push('MODEL is not set');
    }

    if (this.maxTokens <= 0) {
      errors.push('MAX_TOKENS must be positive');
    }

    if (this.temperature < 0 || this.temperature > 1) {
      errors.push('TEMPERATURE must be between 0 and 1');
    }

    return errors;
  }
}

/**
 * Get the global configuration instance.
 *
 * Returns a cached singleton instance. Reads SYNAPSE_HOME from
 * environment variable if set.
 *
 * Mirrors Python version's get_config() function.
 */
export function getConfig(): SynapseConfig {
  if (_configInstance === null) {
    const synapseHomeEnv = process.env.SYNAPSE_HOME;
    _configInstance = new SynapseConfig(synapseHomeEnv);
  }

  return _configInstance;
}

/**
 * Reset the global configuration instance.
 *
 * For testing only. Mirrors Python version's reset_config().
 */
export function resetConfig(): void {
  _configInstance = null;
}
