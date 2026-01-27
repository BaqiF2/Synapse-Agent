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

import * as fs from 'node:fs';
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

    const prompt = `Search for skills matching: "${query}"\n\nRespond with JSON in the format: {"matched_skills": [{"name": "...", "description": "..."}]}`;
    const result = await this.callLlmAndParseJson<SkillSearchResult>(prompt);

    if (!result) {
      logger.warn('LLM response is not valid JSON');
      return { matched_skills: [] };
    }

    return result;
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

    // Read conversation file content
    let conversationContent: string;
    try {
      conversationContent = fs.readFileSync(conversationPath, 'utf-8');
    } catch (error) {
      logger.error('Failed to read conversation file', { path: conversationPath, error });
      return {
        action: 'none',
        message: `Failed to read conversation file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }

    // Truncate if too long (keep last 50KB to focus on recent context)
    const MAX_CONTENT_LENGTH = 50000;
    if (conversationContent.length > MAX_CONTENT_LENGTH) {
      conversationContent = '...(truncated)...\n' + conversationContent.slice(-MAX_CONTENT_LENGTH);
    }

    const prompt = `Analyze the following conversation and determine if a skill should be created or enhanced.

<conversation>
${conversationContent}
</conversation>

Based on the conversation above, determine:
1. Is there a repeatable pattern or workflow that would benefit from being captured as a skill?
2. Does an existing skill need to be enhanced with new capabilities?

Respond ONLY with a JSON object in this exact format (no other text):
{"action": "created"|"enhanced"|"none", "skillName": "skill-name-if-applicable", "message": "brief explanation"}`;

    try {
      const result = await this.callLlmAndParseJson<SkillEnhanceResult>(prompt);

      if (!result) {
        return {
          action: 'none',
          message: 'Could not parse enhancement result',
        };
      }

      return result;
    } catch (error) {
      logger.error('Enhancement failed', { error });
      return {
        action: 'none',
        message: `Enhancement failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Call LLM and parse JSON response
   *
   * @param userPrompt - User prompt to send
   * @returns Parsed JSON or null if parsing fails
   */
  private async callLlmAndParseJson<T>(userPrompt: string): Promise<T | null> {
    if (!this.llmClient) {
      throw new Error('LLM client is required');
    }

    const userMessage: Anthropic.MessageParam = {
      role: 'user',
      content: userPrompt,
    };
    this.conversationHistory.push(userMessage);

    const response = await this.llmClient.sendMessage(
      this.conversationHistory,
      this.systemPrompt
    );

    const assistantMessage: Anthropic.MessageParam = {
      role: 'assistant',
      content: response.content,
    };
    this.conversationHistory.push(assistantMessage);

    // Extract first complete JSON object by tracking brace pairs
    const jsonString = this.extractFirstJsonObject(response.content);
    if (!jsonString) {
      logger.warn('No JSON found in LLM response', { content: response.content.substring(0, 200) });
      return null;
    }

    try {
      return JSON.parse(jsonString) as T;
    } catch (error) {
      logger.warn('Failed to parse JSON from LLM response', {
        matched: jsonString.substring(0, 200),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Extract first complete JSON object from text by tracking brace pairs
   *
   * @param text - Text containing JSON
   * @returns First complete JSON object string or null
   */
  private extractFirstJsonObject(text: string): string | null {
    const startIndex = text.indexOf('{');
    if (startIndex === -1) {
      return null;
    }

    let depth = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = startIndex; i < text.length; i++) {
      const char = text[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\' && inString) {
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0) {
          return text.substring(startIndex, i + 1);
        }
      }
    }

    return null;
  }

  /**
   * Local keyword-based search (no LLM required)
   *
   * Performs simple keyword matching against skill names and descriptions.
   * Use this for `skill search` command when LLM is not available.
   *
   * @param query - Search query
   * @returns Array of matching skills
   */
  searchLocal(query: string): { name: string; description: string }[] {
    const results: { name: string; description: string }[] = [];
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter((t) => t.length > 0);

    for (const skill of this.memoryStore.getAll()) {
      const nameLower = skill.name.toLowerCase();
      const descLower = (skill.description || '').toLowerCase();

      // Check if any query term matches name or description
      const matches = queryTerms.some(
        (term) => nameLower.includes(term) || descLower.includes(term)
      );

      if (matches) {
        results.push({
          name: skill.name,
          description: skill.description || '',
        });
      }
    }

    return results;
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
