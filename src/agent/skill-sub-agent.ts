/**
 * Skill Sub-Agent
 *
 * A sub-agent with full Agent Loop capability for skill management.
 * Uses meta skills (skill-creator, enhancing-skills, evaluating-skills).
 *
 * @module skill-sub-agent
 *
 * Core Exports:
 * - SkillSubAgent: The skill sub-agent class
 * - SkillSubAgentOptions: Configuration options
 */

import * as path from 'node:path';
import * as os from 'node:os';
import { createLogger } from '../utils/logger.ts';
import { SkillMemoryStore } from './skill-memory-store.ts';
import { buildSkillSubAgentPrompt } from './skill-sub-agent-prompt.ts';
import { AgentRunner, type AgentRunnerLlmClient, type AgentRunnerToolExecutor, type ToolCallInfo } from './agent-runner.ts';
import { ContextManager } from './context-manager.ts';
import { BashToolSchema } from '../tools/bash-tool-schema.ts';
import type {
  SkillSearchResult,
  SkillEnhanceResult,
  SkillEvaluateResult,
} from './skill-sub-agent-types.ts';

const logger = createLogger('skill-sub-agent');

/**
 * Default skills directory
 */
const DEFAULT_SKILLS_DIR = path.join(os.homedir(), '.synapse', 'skills');

/**
 * Default max iterations for SkillSubAgent (higher than main agent)
 */
const DEFAULT_SKILL_SUB_AGENT_MAX_ITERATIONS = parseInt(
  process.env.SKILL_SUB_AGENT_MAX_ITERATIONS || '50',
  10
);

/**
 * Agent tag for SkillSubAgent
 */
const SKILL_SUB_AGENT_TAG = 'skill-sub-agent';

/**
 * Options for SkillSubAgent
 */
export interface SkillSubAgentOptions {
  /** Skills directory path */
  skillsDir?: string;
  /** LLM client (optional - required for LLM-based operations) */
  llmClient?: AgentRunnerLlmClient;
  /** Tool executor (optional - required for LLM-based operations) */
  toolExecutor?: AgentRunnerToolExecutor;
  /** Maximum iterations for Agent Loop */
  maxIterations?: number;
  /** Callback for tool calls (with agent tag) */
  onToolCall?: (info: ToolCallInfo) => void;
}

/**
 * SkillSubAgent - Sub-agent with full Agent Loop for skill management
 *
 * Features:
 * - Full Agent Loop capability via AgentRunner
 * - Meta skills loaded into system prompt
 * - Persistent session (same lifecycle as main agent)
 * - Silent execution mode
 *
 * Usage:
 * ```typescript
 * const agent = new SkillSubAgent({
 *   llmClient,
 *   toolExecutor,
 * });
 * const result = await agent.enhance('/path/to/conversation.jsonl');
 * ```
 */
export class SkillSubAgent {
  private memoryStore: SkillMemoryStore;
  private agentRunner: AgentRunner | null = null;
  private llmClient: AgentRunnerLlmClient | null = null;
  private contextManager: ContextManager;
  private initialized: boolean = false;
  private running: boolean = false;

  /**
   * Creates a new SkillSubAgent
   *
   * @param options - Configuration options
   */
  constructor(options: SkillSubAgentOptions) {
    const skillsDir = options.skillsDir ?? DEFAULT_SKILLS_DIR;

    // Initialize memory store and load skills
    this.memoryStore = new SkillMemoryStore(skillsDir);
    this.memoryStore.loadAll();

    // Create persistent context manager
    this.contextManager = new ContextManager();

    // Save llmClient for direct use (semantic search)
    this.llmClient = options.llmClient ?? null;

    // Build system prompt with meta skills
    const systemPrompt = buildSkillSubAgentPrompt(
      this.memoryStore.getDescriptions(),
      this.memoryStore.getMetaSkillContents()
    );

    // Create AgentRunner in silent mode (only if llmClient and toolExecutor provided)
    if (options.llmClient && options.toolExecutor) {
      this.agentRunner = new AgentRunner({
        llmClient: options.llmClient,
        contextManager: this.contextManager,
        toolExecutor: options.toolExecutor,
        systemPrompt,
        tools: [BashToolSchema],
        outputMode: 'silent',
        maxIterations: options.maxIterations ?? DEFAULT_SKILL_SUB_AGENT_MAX_ITERATIONS,
        agentTag: SKILL_SUB_AGENT_TAG,
        onToolCall: options.onToolCall,
      });
    }

    this.initialized = true;
    this.running = true;

    logger.info('Skill Sub-Agent initialized', {
      skillCount: this.memoryStore.size(),
      metaSkillCount: this.memoryStore.getAll().filter(s => s.type === 'meta').length,
    });
  }

  /**
   * Check if sub-agent is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get number of loaded skills
   */
  getSkillCount(): number {
    if (!this.running) return 0;
    return this.memoryStore.size();
  }

  /**
   * Get skill content by name
   *
   * @param name - Skill name
   * @returns Skill content or null if not found or shutdown
   */
  getSkillContent(name: string): string | null {
    if (!this.running) return null;
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
   * Search for skills matching a query
   *
   * @param query - Natural language query
   * @returns Search result with matched skills
   */
  async search(query: string): Promise<SkillSearchResult> {
    // Use AgentRunner if available (full Agent Loop)
    if (this.agentRunner) {
      const prompt = `Search for skills matching: "${query}"

Analyze the available skills and return those that best match the query.
Respond with JSON only.`;

      const result = await this.agentRunner.run(prompt);
      return this.parseJsonResult<SkillSearchResult>(result, { matched_skills: [] });
    }

    // Fallback to direct LLM call for semantic search (no tools needed)
    if (this.llmClient) {
      const systemPrompt = `You are a skill search assistant. Find skills that match the user's query.
Available skills:
${this.memoryStore.getDescriptions()}

Respond with JSON only in this format:
{"matched_skills": [{"name": "skill-name", "description": "description"}]}`;

      const messages = [{ role: 'user' as const, content: `Search for skills matching: "${query}"` }];

      try {
        const response = await this.llmClient.sendMessage(messages, systemPrompt);
        return this.parseJsonResult<SkillSearchResult>(response.content, { matched_skills: [] });
      } catch (error) {
        logger.warn('Semantic search failed', { error });
        return { matched_skills: [] };
      }
    }

    logger.warn('No LLM client available for search');
    return { matched_skills: [] };
  }

  /**
   * Enhance skills based on conversation history
   *
   * @param conversationPath - Path to conversation history file
   * @returns Enhancement result
   */
  async enhance(conversationPath: string): Promise<SkillEnhanceResult> {
    if (!this.agentRunner) {
      logger.warn('AgentRunner not available for enhance');
      return { action: 'none', message: 'AgentRunner not available' };
    }

    const prompt = `Analyze the conversation at "${conversationPath}" and determine if a skill should be created or enhanced.

## Instructions

1. **Read and analyze** the conversation file to identify reusable patterns or workflows

2. **Search for similar skills** by checking the Available Skills (Metadata) section in your system prompt:
   - Look for skills that cover similar functionality
   - Consider semantic similarity, not just keyword matching

3. **Decide action based on search results**:
   - **If a similar skill exists**: Follow the enhancing-skills meta skill to enhance it
   - **If no similar skill exists**: Follow the skill-creator meta skill to create a new one
   - **If no actionable pattern found**: Return action "none"

4. **Important - Output Directory**:
   When creating a new skill, use this command:
   \`scripts/init_skill.py <skill-name> --path ~/.synapse/skills\`

   When enhancing an existing skill, the skill files are in: ~/.synapse/skills/<skill-name>/

## Output Format

After completing the task, respond with JSON only:
\`\`\`json
{
  "action": "created" | "enhanced" | "none",
  "skillName": "skill-name-if-applicable",
  "message": "Brief description of what was done"
}
\`\`\``;

    const result = await this.agentRunner.run(prompt);
    return this.parseJsonResult<SkillEnhanceResult>(result, {
      action: 'none',
      message: 'Could not parse result',
    });
  }

  /**
   * Evaluate a skill's quality
   *
   * @param skillName - Name of the skill to evaluate
   * @returns Evaluation result
   */
  async evaluate(skillName: string): Promise<SkillEvaluateResult> {
    if (!this.agentRunner) {
      logger.warn('AgentRunner not available for evaluate');
      return { action: 'none', message: 'AgentRunner not available' };
    }

    const prompt = `Evaluate the skill "${skillName}" following the evaluating-skills meta skill.

1. Read the skill's SKILL.md file
2. Score each criterion (clarity, completeness, usability, accuracy, efficiency)
3. Provide recommendations for improvement

After completing the evaluation, respond with JSON only.`;

    const result = await this.agentRunner.run(prompt);
    return this.parseJsonResult<SkillEvaluateResult>(result, {
      action: 'none',
      message: 'Could not parse result',
    });
  }

  /**
   * Reload all skills
   */
  reloadAll(): void {
    if (!this.running) return;
    this.memoryStore.loadAll();
    logger.info('Skills reloaded', { count: this.memoryStore.size() });
  }

  /**
   * Refresh a specific skill
   *
   * @param skillName - Name of the skill to refresh
   */
  refresh(skillName: string): void {
    if (!this.running) return;
    // Reload all skills (simple implementation)
    this.memoryStore.loadAll();
    logger.info('Skill refreshed', { skillName });
  }

  /**
   * Check if the sub-agent is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Search for skills locally (synchronous, keyword-based)
   *
   * @param query - Search query
   * @returns Array of matched skills with name and description
   */
  searchLocal(query: string): { name: string; description: string }[] {
    const queryTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 0);

    return this.memoryStore.getAll()
      .filter((skill) => {
        const searchText = `${skill.name} ${skill.description || ''}`.toLowerCase();
        return queryTerms.some((term) => searchText.includes(term));
      })
      .map((skill) => ({
        name: skill.name,
        description: skill.description || '',
      }));
  }

  /**
   * Shutdown the sub-agent
   */
  shutdown(): void {
    this.running = false;
    this.agentRunner = null;
    this.llmClient = null;
    logger.info('Skill Sub-Agent shutdown');
  }

  /**
   * Parse JSON result from LLM response
   */
  private parseJsonResult<T>(response: string, defaultValue: T): T {
    const jsonString = this.extractFirstJsonObject(response);
    if (!jsonString) {
      logger.warn('No JSON found in response', { response: response.substring(0, 200) });
      return defaultValue;
    }

    try {
      return JSON.parse(jsonString) as T;
    } catch (error) {
      logger.warn('Failed to parse JSON', { error, jsonString: jsonString.substring(0, 200) });
      return defaultValue;
    }
  }

  /**
   * Extract first complete JSON object from text
   */
  private extractFirstJsonObject(text: string): string | null {
    const startIndex = text.indexOf('{');
    if (startIndex === -1) return null;

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

      if (inString) continue;

      if (char === '{') depth++;
      else if (char === '}') {
        depth--;
        if (depth === 0) {
          return text.substring(startIndex, i + 1);
        }
      }
    }

    return null;
  }
}

export default SkillSubAgent;
