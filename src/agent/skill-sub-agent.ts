/**
 * Skill Sub-Agent
 *
 * A persistent sub-agent with independent LLM session for skill management.
 * Handles skill search (semantic) and skill enhancement operations.
 *
 * @module skill-sub-agent
 *
 * Core Exports:
 * - SkillSubAgent: The skill sub-agent class
 * - SkillSubAgentOptions: Configuration options
 */

import * as path from 'node:path';
import * as os from 'node:os';
import type Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '../utils/logger.ts';
import { SkillMemoryStore } from './skill-memory-store.ts';
import { buildSkillSubAgentPrompt } from './skill-sub-agent-prompt.ts';
import type {
  SkillSearchResult,
  SkillEnhanceResult,
} from './skill-sub-agent-types.ts';

const logger = createLogger('skill-sub-agent');

/**
 * Default skills directory
 */
const DEFAULT_SKILLS_DIR = path.join(os.homedir(), '.synapse', 'skills');

/**
 * Options for SkillSubAgent
 */
export interface SkillSubAgentOptions {
  /** Skills directory path */
  skillsDir?: string;
  /** LLM client (optional, for testing) */
  llmClient?: {
    sendMessage: (
      messages: Anthropic.MessageParam[],
      systemPrompt: string,
      tools?: Anthropic.Tool[]
    ) => Promise<{ content: string; toolCalls: unknown[]; stopReason: string | null }>;
  };
}

/**
 * SkillSubAgent - Persistent sub-agent for skill management
 *
 * Features:
 * - Independent LLM session context
 * - Skill memory store integration
 * - LLM-based semantic search (no keyword fallback)
 * - Enhancement capability skeleton
 * - Lazy loading of skill content
 *
 * Usage:
 * ```typescript
 * const agent = new SkillSubAgent();
 * const results = await agent.search('code analysis');
 * const content = agent.getSkillContent('my-skill');
 * agent.shutdown();
 * ```
 */
export class SkillSubAgent {
  private memoryStore: SkillMemoryStore;
  private conversationHistory: Anthropic.MessageParam[] = [];
  private systemPrompt: string = '';
  private running: boolean = false;
  private initialized: boolean = false;
  private llmClient: SkillSubAgentOptions['llmClient'];

  /**
   * Creates a new SkillSubAgent
   *
   * @param options - Configuration options
   */
  constructor(options: SkillSubAgentOptions = {}) {
    const skillsDir = options.skillsDir ?? DEFAULT_SKILLS_DIR;
    this.llmClient = options.llmClient;

    this.memoryStore = new SkillMemoryStore(skillsDir);
    this.initialize();
  }

  /**
   * Initialize the sub-agent
   */
  private initialize(): void {
    try {
      // Load all skills into memory
      this.memoryStore.loadAll();

      // Build system prompt with skill descriptions
      this.systemPrompt = buildSkillSubAgentPrompt(
        this.memoryStore.getDescriptions()
      );

      this.running = true;
      this.initialized = true;

      logger.info('Skill Sub-Agent initialized', {
        skillCount: this.memoryStore.size(),
      });
    } catch (error) {
      logger.error('Failed to initialize Skill Sub-Agent', { error });
      this.initialized = false;
    }
  }

  /**
   * Check if sub-agent is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if sub-agent is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get number of loaded skills
   */
  getSkillCount(): number {
    return this.memoryStore.size();
  }

  /**
   * Get skill content by name (for skill load command)
   * This bypasses LLM and reads directly from memory
   *
   * @param name - Skill name
   * @returns Skill content or null if not found
   */
  getSkillContent(name: string): string | null {
    const body = this.memoryStore.getBody(name);
    if (!body) return null;

    return `# Skill: ${name}\n\n${body}`;
  }

  /**
   * Get formatted skill descriptions
   */
  getSkillDescriptions(): string {
    return this.memoryStore.getDescriptions();
  }

  /**
   * Semantic search using LLM
   *
   * IMPORTANT: This method requires an LLM client. All search is done
   * by LLM reasoning - there is no keyword fallback.
   *
   * @param query - Natural language query
   * @returns Search result with matched skills
   * @throws Error if LLM client is not available
   */
  async search(query: string): Promise<SkillSearchResult> {
    if (!this.llmClient) {
      throw new Error('LLM client is required for skill search. Skill search must use LLM reasoning, not keyword matching.');
    }

    try {
      // Add search request to conversation
      const userMessage: Anthropic.MessageParam = {
        role: 'user',
        content: `Search for skills matching: "${query}"\n\nRespond with JSON in the format: {"matched_skills": [{"name": "...", "description": "..."}]}`,
      };

      this.conversationHistory.push(userMessage);

      // Call LLM
      const response = await this.llmClient.sendMessage(
        this.conversationHistory,
        this.systemPrompt
      );

      // Add response to history
      const assistantMessage: Anthropic.MessageParam = {
        role: 'assistant',
        content: response.content,
      };
      this.conversationHistory.push(assistantMessage);

      // Parse JSON response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]) as SkillSearchResult;
        return result;
      }

      // If LLM response is not valid JSON, return empty result
      logger.warn('LLM response is not valid JSON', { content: response.content });
      return { matched_skills: [] };
    } catch (error) {
      logger.error('Semantic search failed', { error });
      throw error;
    }
  }

  /**
   * Enhance skills based on conversation history
   *
   * @param conversationPath - Path to conversation history file
   * @returns Enhancement result
   */
  async enhance(conversationPath: string): Promise<SkillEnhanceResult> {
    if (!this.llmClient) {
      return {
        action: 'none',
        message: 'LLM client not available for enhancement',
      };
    }

    try {
      // Add enhance request to conversation
      const userMessage: Anthropic.MessageParam = {
        role: 'user',
        content: `Analyze the conversation at "${conversationPath}" and determine if a skill should be created or enhanced.\n\nRespond with JSON in the format: {"action": "created"|"enhanced"|"none", "skillName": "...", "message": "..."}`,
      };

      this.conversationHistory.push(userMessage);

      // Call LLM
      const response = await this.llmClient.sendMessage(
        this.conversationHistory,
        this.systemPrompt
      );

      // Add response to history
      const assistantMessage: Anthropic.MessageParam = {
        role: 'assistant',
        content: response.content,
      };
      this.conversationHistory.push(assistantMessage);

      // Parse JSON response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as SkillEnhanceResult;
      }

      return {
        action: 'none',
        message: 'Could not parse enhancement result',
      };
    } catch (error) {
      logger.error('Enhancement failed', { error });
      return {
        action: 'none',
        message: `Enhancement failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Refresh skill metadata
   *
   * @param name - Skill name to refresh
   */
  refresh(name: string): void {
    this.memoryStore.refresh(name);
    this.systemPrompt = buildSkillSubAgentPrompt(
      this.memoryStore.getDescriptions()
    );
  }

  /**
   * Reload all skills
   */
  reloadAll(): void {
    this.memoryStore.loadAll();
    this.systemPrompt = buildSkillSubAgentPrompt(
      this.memoryStore.getDescriptions()
    );
    logger.info('Skills reloaded', { count: this.memoryStore.size() });
  }

  /**
   * Shutdown the sub-agent
   */
  shutdown(): void {
    this.running = false;
    this.conversationHistory = [];
    this.memoryStore.clear();
    logger.info('Skill Sub-Agent shutdown');
  }
}

// Default export
export default SkillSubAgent;
