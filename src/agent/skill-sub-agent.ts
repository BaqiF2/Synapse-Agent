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

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createLogger } from '../utils/logger.ts';
import { SkillMemoryStore } from './skill-memory-store.ts';
import { buildSkillSubAgentPrompt } from './skill-sub-agent-prompt.ts';
import { AgentRunner, type AgentRunnerLlmClient, type AgentRunnerToolExecutor, type ToolCallInfo } from './agent-runner.ts';
import { ContextManager } from './context-manager.ts';
import { BashToolSchema } from '../tools/bash-tool-schema.ts';
import { SkillDocParser } from '../skills/skill-schema.ts';
import { SkillSearchResultSchema } from './skill-sub-agent-types.ts';
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
 * Default max iterations for SkillSubAgent
 */
const DEFAULT_SKILL_SUB_AGENT_MAX_ITERATIONS = parseInt(
  process.env.SYNAPSE_MAX_TOOL_ITERATIONS || '50',
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
  private skillsDir: string;
  private memoryStore: SkillMemoryStore;
  private agentRunner: AgentRunner | null = null;
  private llmClient: AgentRunnerLlmClient | null = null;
  private contextManager: ContextManager;
  private docParser: SkillDocParser;
  private initialized: boolean = false;
  private running: boolean = false;

  /**
   * Creates a new SkillSubAgent
   *
   * @param options - Configuration options
   */
  constructor(options: SkillSubAgentOptions) {
    const skillsDir = options.skillsDir ?? DEFAULT_SKILLS_DIR;
    this.skillsDir = skillsDir;
    this.docParser = new SkillDocParser();

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
      const parsed = this.parseJsonResult<SkillSearchResult>(result, { matched_skills: [] });
      return this.normalizeSearchResult(parsed, result);
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
        const parsed = this.parseJsonResult<SkillSearchResult>(response.content, { matched_skills: [] });
        return this.normalizeSearchResult(parsed, response.content);
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
   When creating a new skill, prefer the skill tool wrapper:
   \`skill:skill-creator:init_skill <skill-name> --path ~/.synapse/skills\`

   If the wrapper isn't available, run the script by absolute path:
   \`~/.synapse/skills/skill-creator/scripts/init_skill.py <skill-name> --path ~/.synapse/skills\`

   Always use absolute paths and do not create skill folders in the current project directory.

   When enhancing an existing skill, the skill files are in: ~/.synapse/skills/<skill-name>/

## Output Format

After completing the task, respond with a single JSON object only (no markdown, no code fences, no extra text).
{
  "action": "created" | "enhanced" | "none",
  "skillName": "skill-name-if-applicable",
  "message": "Brief description of what was done"
}`;

    const result = await this.agentRunner.run(prompt);
    const defaultResult: SkillEnhanceResult = {
      action: 'none',
      message: 'Could not parse result',
    };
    const firstParse = this.parseJsonResultWithFlag<SkillEnhanceResult>(result, defaultResult);
    let parsed = firstParse.value;

    if (!firstParse.ok) {
      logger.warn('Enhance response not valid JSON, attempting repair');
      const trimmedResponse = result.length > 2000 ? `${result.slice(0, 2000)}…` : result;
      const repairPrompt = `Your previous response was not valid JSON.

Return only a single JSON object matching this schema and nothing else:
{
  "action": "created" | "enhanced" | "none",
  "skillName": "skill-name-if-applicable",
  "message": "Brief description of what was done"
}

Previous response:
${trimmedResponse}`;
      const repairResult = await this.agentRunner.run(repairPrompt);
      const repairParse = this.parseJsonResultWithFlag<SkillEnhanceResult>(repairResult, defaultResult);
      if (repairParse.ok) {
        parsed = repairParse.value;
      } else {
        logger.warn('Enhance repair failed to produce valid JSON');
      }
    }

    if (parsed.action === 'created' && parsed.skillName) {
      const movedTo = this.relocateSkillIfNeeded(parsed.skillName);
      if (movedTo) {
        parsed.message = parsed.message
          ? `${parsed.message} (moved to ${movedTo})`
          : `Moved skill to ${movedTo}`;
        this.reloadAll();
      }
    }
    return parsed;
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
   * Relocate a newly created skill into the user skills directory if needed.
   * Returns the destination path when a move occurs.
   */
  private relocateSkillIfNeeded(skillName: string): string | null {
    const targetPath = path.join(this.skillsDir, skillName);
    if (fs.existsSync(targetPath)) {
      return null;
    }

    const candidates = this.findSkillCandidatesInCwd(skillName);
    for (const candidate of candidates) {
      if (!fs.existsSync(candidate)) {
        continue;
      }

      if (fs.existsSync(targetPath)) {
        logger.warn('Target skill directory already exists; skipping move', {
          skillName,
          targetPath,
        });
        return null;
      }

      try {
        this.ensureDir(path.dirname(targetPath));
        this.moveDirectory(candidate, targetPath);
        logger.info('Relocated skill to user skills directory', {
          skillName,
          from: candidate,
          to: targetPath,
        });
        return targetPath;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('Failed to relocate skill directory', {
          skillName,
          from: candidate,
          to: targetPath,
          error: message,
        });
      }
    }

    return null;
  }

  private findSkillCandidatesInCwd(skillName: string): string[] {
    const cwd = process.cwd();
    if (!fs.existsSync(cwd)) {
      return [];
    }

    const entries = fs.readdirSync(cwd, { withFileTypes: true });
    const candidates: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const candidatePath = path.join(cwd, entry.name);
      const skillMdPath = path.join(candidatePath, 'SKILL.md');
      if (!fs.existsSync(skillMdPath)) {
        continue;
      }

      if (entry.name === skillName) {
        candidates.unshift(candidatePath);
        continue;
      }

      const parsed = this.docParser.parse(skillMdPath, entry.name);
      if (parsed?.name === skillName) {
        candidates.push(candidatePath);
      }
    }

    return candidates;
  }

  private ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  private moveDirectory(source: string, target: string): void {
    try {
      fs.renameSync(source, target);
      return;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'EXDEV') {
        throw error;
      }
    }

    fs.cpSync(source, target, { recursive: true });
    fs.rmSync(source, { recursive: true, force: true });
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
    return this.parseJsonResultWithFlag(response, defaultValue).value;
  }

  private parseJsonResultWithFlag<T>(
    response: string,
    defaultValue: T
  ): { value: T; ok: boolean } {
    const jsonString = this.extractFirstJsonObject(response);
    if (!jsonString) {
      logger.warn('No JSON found in response', { response: response.substring(0, 200) });
      return { value: defaultValue, ok: false };
    }

    try {
      return { value: JSON.parse(jsonString) as T, ok: true };
    } catch (error) {
      logger.warn('Failed to parse JSON', { error, jsonString: jsonString.substring(0, 200) });
      return { value: defaultValue, ok: false };
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
   * Normalize search result with schema validation
   */
  private normalizeSearchResult(
    parsed: SkillSearchResult,
    rawResponse: string
  ): SkillSearchResult {
    const validation = SkillSearchResultSchema.safeParse(parsed);
    if (validation.success) {
      return validation.data;
    }

    const issues = validation.error.issues.map(issue => issue.message).join('; ');
    logger.warn('Invalid skill search result from LLM', {
      issues: issues.substring(0, 200),
      response: rawResponse.substring(0, 200),
    });

    return { matched_skills: [] };
  }
}

export default SkillSubAgent;
