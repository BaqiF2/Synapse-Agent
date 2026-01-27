/**
 * Skill Sub-Agent Manager
 *
 * Singleton manager for SkillSubAgent lifecycle management.
 * Ensures a single SkillSubAgent instance is reused within a session.
 *
 * Core Exports:
 * - SkillSubAgentManager: Singleton manager for SkillSubAgent
 */

import { SkillSubAgent } from './skill-sub-agent.js';

/**
 * SkillSubAgentManager
 *
 * Manages the lifecycle of SkillSubAgent instances.
 * Implements singleton pattern to ensure session-level reuse.
 *
 * Usage:
 * ```typescript
 * const manager = SkillSubAgentManager.getInstance();
 * const agent = await manager.getAgent();
 * const result = await agent.search("analyze code quality");
 * ```
 */
export class SkillSubAgentManager {
  private static instance: SkillSubAgentManager | null = null;
  private skillSubAgent: SkillSubAgent | null = null;
  private isInitialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;

  /**
   * Private constructor for singleton pattern
   */
  private constructor() {}

  /**
   * Get the singleton instance
   */
  static getInstance(): SkillSubAgentManager {
    if (!SkillSubAgentManager.instance) {
      SkillSubAgentManager.instance = new SkillSubAgentManager();
    }
    return SkillSubAgentManager.instance;
  }

  /**
   * Get the SkillSubAgent instance
   * Creates and initializes on first call, reuses on subsequent calls
   */
  async getAgent(): Promise<SkillSubAgent> {
    // If already initialized, return existing agent
    if (this.isInitialized && this.skillSubAgent) {
      return this.skillSubAgent;
    }

    // If initialization in progress, wait for it
    if (this.initializationPromise) {
      await this.initializationPromise;
      return this.skillSubAgent!;
    }

    // Start initialization
    this.initializationPromise = this.initialize();
    await this.initializationPromise;
    this.initializationPromise = null;

    return this.skillSubAgent!;
  }

  /**
   * Initialize the SkillSubAgent
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    this.skillSubAgent = new SkillSubAgent();
    await this.skillSubAgent.initialize();
    this.isInitialized = true;
  }

  /**
   * Check if the agent is initialized
   */
  isAgentInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Refresh the agent (reload skills)
   */
  async refresh(): Promise<void> {
    if (this.skillSubAgent) {
      this.skillSubAgent.refresh();
      await this.skillSubAgent.initialize();
    }
  }

  /**
   * Destroy the agent instance
   * Call this when the session ends
   */
  destroy(): void {
    if (this.skillSubAgent) {
      this.skillSubAgent.clearHistory();
      this.skillSubAgent = null;
    }
    this.isInitialized = false;
    this.initializationPromise = null;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  static resetInstance(): void {
    if (SkillSubAgentManager.instance) {
      SkillSubAgentManager.instance.destroy();
      SkillSubAgentManager.instance = null;
    }
  }
}

// Default export
export default SkillSubAgentManager;
