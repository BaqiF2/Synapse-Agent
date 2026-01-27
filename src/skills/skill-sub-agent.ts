/**
 * Skill Sub-Agent
 *
 * A specialized sub-agent for semantic skill searching using LLM.
 * Maintains conversation context within a session for improved search accuracy.
 *
 * Core Exports:
 * - SkillSubAgent: LLM-based skill search agent
 * - SkillSearchResult: Search result interface
 */

import { LlmClient, type LlmMessage } from '../agent/llm-client.js';
import { SkillLoader, type SkillLevel1 } from './index.js';

/**
 * Search result item
 */
export interface SkillMatch {
  name: string;
  description: string;
}

/**
 * Skill search result
 */
export interface SkillSearchResult {
  matched_skills: SkillMatch[];
}

/**
 * Default system prompt for skill search
 */
const SKILL_SUB_AGENT_SYSTEM_PROMPT = `You are a skill search assistant responsible for matching skills based on user task descriptions.

## Available Skills

{SKILL_DESCRIPTIONS}

## Search Rules

1. Carefully analyze the user's task description
2. Select the semantically most relevant skills from available skills
3. Only return truly relevant skills, do not force matches
4. If no matching skills, return an empty array

## Return Format

You must return the following JSON format:
\`\`\`json
{
  "matched_skills": [
    {"name": "skill-name", "description": "skill description"}
  ]
}
\`\`\`

Only output the JSON, no other text.`;

/**
 * SkillSubAgent
 *
 * A specialized agent for semantic skill searching.
 * Uses LLM to understand task descriptions and match relevant skills.
 */
export class SkillSubAgent {
  private llmClient: LlmClient;
  private skillLoader: SkillLoader;
  private conversationHistory: LlmMessage[];
  private systemPrompt: string;
  private initialized: boolean;

  /**
   * Creates a new SkillSubAgent
   */
  constructor() {
    this.llmClient = new LlmClient();
    this.skillLoader = new SkillLoader();
    this.conversationHistory = [];
    this.systemPrompt = '';
    this.initialized = false;
  }

  /**
   * Initialize the agent with skill descriptions
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Load all skills at Level 1
    const skills = this.skillLoader.loadAllLevel1();

    // Build skill descriptions
    const skillDescriptions = this.buildSkillDescriptions(skills);

    // Build system prompt
    this.systemPrompt = SKILL_SUB_AGENT_SYSTEM_PROMPT.replace(
      '{SKILL_DESCRIPTIONS}',
      skillDescriptions
    );

    this.initialized = true;
  }

  /**
   * Build skill descriptions string for system prompt
   */
  private buildSkillDescriptions(skills: SkillLevel1[]): string {
    if (skills.length === 0) {
      return '(No skills available)';
    }

    const lines: string[] = [];

    for (const skill of skills) {
      const description = skill.description || 'No description';
      const tags = skill.tags.length > 0 ? ` [${skill.tags.join(', ')}]` : '';
      lines.push(`- **${skill.name}**: ${description}${tags}`);
    }

    return lines.join('\n');
  }

  /**
   * Search for skills matching the given description
   */
  async search(query: string): Promise<SkillSearchResult> {
    await this.initialize();

    // Add user message
    this.conversationHistory.push({
      role: 'user',
      content: query,
    });

    try {
      // Call LLM
      const response = await this.llmClient.sendMessage(
        this.conversationHistory,
        this.systemPrompt
      );

      // Add assistant response to history
      this.conversationHistory.push({
        role: 'assistant',
        content: response.content,
      });

      // Parse JSON response
      const result = this.parseSearchResult(response.content);

      return result;
    } catch (error) {
      // Remove failed message from history
      this.conversationHistory.pop();

      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Skill search failed: ${message}`);
    }
  }

  /**
   * Parse LLM response to extract search results
   */
  private parseSearchResult(content: string): SkillSearchResult {
    // Try to extract JSON from response
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch?.[1] ?? content;

    try {
      const parsed = JSON.parse(jsonStr.trim());

      // Validate structure
      if (!parsed.matched_skills || !Array.isArray(parsed.matched_skills)) {
        return { matched_skills: [] };
      }

      // Validate each skill entry
      const validSkills: SkillMatch[] = [];
      for (const skill of parsed.matched_skills) {
        if (typeof skill.name === 'string' && typeof skill.description === 'string') {
          validSkills.push({
            name: skill.name,
            description: skill.description,
          });
        }
      }

      return { matched_skills: validSkills };
    } catch {
      // Failed to parse, return empty result
      return { matched_skills: [] };
    }
  }

  /**
   * Format search result as JSON string
   */
  formatSearchResultAsJson(result: SkillSearchResult): string {
    return JSON.stringify(result, null, 2);
  }

  /**
   * Format search result as XML for context injection
   */
  formatSearchResultAsXml(result: SkillSearchResult): string {
    if (result.matched_skills.length === 0) {
      return '<available-skills>\n  (No matching skills found)\n</available-skills>';
    }

    const skillLines = result.matched_skills.map(
      (skill) => `  <skill name="${skill.name}">\n    ${skill.description}\n  </skill>`
    );

    return `<available-skills>\n${skillLines.join('\n')}\n</available-skills>`;
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.conversationHistory = [];
  }

  /**
   * Refresh skill list
   */
  refresh(): void {
    this.initialized = false;
    this.clearHistory();
    this.skillLoader.rebuildIndex();
  }

  /**
   * Get current skill count
   */
  getSkillCount(): number {
    const skills = this.skillLoader.loadAllLevel1();
    return skills.length;
  }
}

// Default export
export default SkillSubAgent;
