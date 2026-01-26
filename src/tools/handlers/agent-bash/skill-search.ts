/**
 * Skill Search 工具 - Agent Shell Command Layer 2
 *
 * 功能：在技能库中搜索匹配的技能，支持关键词、领域和标签过滤
 *
 * 核心导出：
 * - SkillSearchHandler: 技能搜索处理器类
 * - parseSkillSearchCommand: 解析 skill search 命令参数的函数
 */

import * as os from 'node:os';
import type { CommandResult } from '../base-bash-handler.ts';
import { SkillIndexer, type SkillIndexEntry, type SkillIndex } from '../../../skills/indexer.js';
import { SKILL_DOMAINS, type SkillDomain } from '../../../skills/skill-schema.js';

/**
 * Default maximum search results
 */
const DEFAULT_MAX_RESULTS = parseInt(process.env.SKILL_SEARCH_MAX_RESULTS || '20', 10);

/**
 * Parsed skill search command arguments
 */
interface SkillSearchArgs {
  query?: string;
  domain?: SkillDomain;
  tags?: string[];
  maxResults: number;
  showTools: boolean;
  rebuild: boolean;
}

/**
 * Search result with relevance score
 */
interface ScoredResult {
  entry: SkillIndexEntry;
  score: number;
  matches: string[];
}

/**
 * Parse the skill search command arguments
 * Syntax: skill search [query] [--domain <domain>] [--tag <tag>] [--max <n>] [--tools] [--rebuild]
 */
export function parseSkillSearchCommand(command: string): SkillSearchArgs {
  const parts = command.trim().split(/\s+/);

  // Remove 'skill' and 'search' prefix
  if (parts[0] === 'skill') {
    parts.shift();
  }
  if (parts[0] === 'search') {
    parts.shift();
  }

  let query: string | undefined;
  let domain: SkillDomain | undefined;
  const tags: string[] = [];
  let maxResults = DEFAULT_MAX_RESULTS;
  let showTools = false;
  let rebuild = false;

  let i = 0;
  while (i < parts.length) {
    const part = parts[i];

    if (part === '--domain') {
      i++;
      if (i >= parts.length) {
        throw new Error('--domain requires a domain argument');
      }
      const domainVal = parts[i] as SkillDomain;
      if (!SKILL_DOMAINS.includes(domainVal)) {
        throw new Error(`Invalid domain: ${domainVal}. Valid domains: ${SKILL_DOMAINS.join(', ')}`);
      }
      domain = domainVal;
    } else if (part === '--tag') {
      i++;
      if (i >= parts.length) {
        throw new Error('--tag requires a tag argument');
      }
      tags.push(parts[i] ?? '');
    } else if (part === '--max') {
      i++;
      if (i >= parts.length) {
        throw new Error('--max requires a number argument');
      }
      const val = parseInt(parts[i] ?? '', 10);
      if (isNaN(val) || val < 1) {
        throw new Error('--max must be a positive number');
      }
      maxResults = val;
    } else if (part === '--tools') {
      showTools = true;
    } else if (part === '--rebuild') {
      rebuild = true;
    } else if (part === '-h' || part === '--help') {
      // Help flag will be handled in execute()
    } else if (!part?.startsWith('--') && !query) {
      // First non-flag argument is the query
      let q = part ?? '';
      if ((q.startsWith('"') && q.endsWith('"')) ||
          (q.startsWith("'") && q.endsWith("'"))) {
        q = q.slice(1, -1);
      }
      query = q;
    } else if (!part?.startsWith('--')) {
      // Additional query terms
      if (query) {
        query += ' ' + part;
      } else {
        query = part;
      }
    }
    i++;
  }

  return { query, domain, tags, maxResults, showTools, rebuild };
}

/**
 * Handler for the skill search command
 */
export class SkillSearchHandler {
  private indexer: SkillIndexer;

  /**
   * Creates a new SkillSearchHandler
   *
   * @param homeDir - User home directory (defaults to os.homedir())
   */
  constructor(homeDir: string = os.homedir()) {
    this.indexer = new SkillIndexer(homeDir);
  }

  /**
   * Execute the skill search command
   */
  async execute(command: string): Promise<CommandResult> {
    try {
      // Check for help flags
      if (command.includes(' -h') || command.includes(' --help')) {
        return this.showHelp(command.includes('--help'));
      }

      const args = parseSkillSearchCommand(command);

      // Rebuild index if requested
      if (args.rebuild) {
        this.indexer.rebuild();
      }

      const result = await this.search(args);

      return {
        stdout: result,
        stderr: '',
        exitCode: 0,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        stdout: '',
        stderr: message,
        exitCode: 1,
      };
    }
  }

  /**
   * Search skills based on arguments
   */
  private async search(args: SkillSearchArgs): Promise<string> {
    // Get or rebuild index
    const index = this.indexer.getIndex();

    if (index.skills.length === 0) {
      return 'No skills found. Create skills in ~/.synapse/skills/';
    }

    // Filter and score results
    const results = this.filterAndScore(index, args);

    if (results.length === 0) {
      return this.formatNoResults(args);
    }

    // Limit results
    const limited = results.slice(0, args.maxResults);

    // Format output
    return this.formatResults(limited, results.length, args);
  }

  /**
   * Filter skills and calculate relevance scores
   */
  private filterAndScore(index: SkillIndex, args: SkillSearchArgs): ScoredResult[] {
    const { query, domain, tags } = args;
    const results: ScoredResult[] = [];

    for (const entry of index.skills) {
      let score = 0;
      const matches: string[] = [];

      // Domain filter (required if specified)
      if (domain && entry.domain !== domain) {
        continue;
      }

      // Tags filter (all specified tags must match)
      if (tags.length > 0) {
        const entryTags = entry.tags.map((t) => t.toLowerCase());
        const allTagsMatch = tags.every((t) => entryTags.includes(t.toLowerCase()));
        if (!allTagsMatch) {
          continue;
        }
        score += tags.length * 2;
        matches.push(`tags: ${tags.join(', ')}`);
      }

      // Query matching
      if (query) {
        const queryLower = query.toLowerCase();
        const queryTerms = queryLower.split(/\s+/);

        // Name match (highest priority)
        if (entry.name.toLowerCase().includes(queryLower)) {
          score += 10;
          matches.push('name');
        }

        // Title match
        if (entry.title?.toLowerCase().includes(queryLower)) {
          score += 8;
          matches.push('title');
        }

        // Description match
        if (entry.description?.toLowerCase().includes(queryLower)) {
          score += 5;
          matches.push('description');
        }

        // Tag match
        for (const tag of entry.tags) {
          if (tag.toLowerCase().includes(queryLower)) {
            score += 3;
            matches.push(`tag:${tag}`);
          }
        }

        // Tool match
        for (const tool of entry.tools) {
          if (tool.toLowerCase().includes(queryLower)) {
            score += 2;
            matches.push(`tool:${tool}`);
          }
        }

        // Multi-term matching
        for (const term of queryTerms) {
          if (term.length < 2) continue;

          const allText = [
            entry.name,
            entry.title || '',
            entry.description || '',
            ...entry.tags,
            ...entry.tools,
          ].join(' ').toLowerCase();

          if (allText.includes(term)) {
            score += 1;
          }
        }

        // If query specified but no matches, skip this result
        if (score === 0) {
          continue;
        }
      } else {
        // No query, include all (after domain/tag filters)
        score = 1;
      }

      results.push({ entry, score, matches });
    }

    // Sort by score (descending), then by name
    results.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.entry.name.localeCompare(b.entry.name);
    });

    return results;
  }

  /**
   * Format search results for display
   */
  private formatResults(results: ScoredResult[], totalMatches: number, args: SkillSearchArgs): string {
    const lines: string[] = [];

    lines.push(`Found ${totalMatches} matching skill${totalMatches > 1 ? 's' : ''}:\n`);

    for (let i = 0; i < results.length; i++) {
      const { entry } = results[i];
      const num = i + 1;

      // Skill name and domain
      lines.push(`${num}. ${entry.name} (${entry.domain})`);

      // Description
      if (entry.description) {
        lines.push(`   ${entry.description}`);
      }

      // Tags
      if (entry.tags.length > 0) {
        lines.push(`   Tags: ${entry.tags.join(', ')}`);
      }

      // Tools (if requested)
      if (args.showTools && entry.tools.length > 0) {
        lines.push(`   Tools: ${entry.tools.join(', ')}`);
      }

      // Script count
      lines.push(`   Scripts: ${entry.scriptCount}`);

      lines.push('');
    }

    if (totalMatches > results.length) {
      lines.push(`(Showing ${results.length} of ${totalMatches} results. Use --max to see more)`);
    }

    return lines.join('\n').trim();
  }

  /**
   * Format no results message
   */
  private formatNoResults(args: SkillSearchArgs): string {
    const filters: string[] = [];

    if (args.query) {
      filters.push(`query "${args.query}"`);
    }
    if (args.domain) {
      filters.push(`domain "${args.domain}"`);
    }
    if (args.tags.length > 0) {
      filters.push(`tags "${args.tags.join(', ')}"`);
    }

    if (filters.length > 0) {
      return `No skills found matching: ${filters.join(', ')}`;
    }

    return 'No skills found.';
  }

  /**
   * Show help message
   */
  private showHelp(verbose: boolean): CommandResult {
    if (verbose) {
      const domains = SKILL_DOMAINS.join(', ');
      const help = `skill search - Search for skills in the skill library

USAGE:
    skill search [query] [OPTIONS]

ARGUMENTS:
    [query]        Search query (matches name, description, tags, tools)

OPTIONS:
    --domain <d>   Filter by domain (${domains})
    --tag <tag>    Filter by tag (can be used multiple times)
    --max <n>      Maximum number of results (default: ${DEFAULT_MAX_RESULTS})
    --tools        Show tool commands in output
    --rebuild      Rebuild the skill index before searching
    -h             Show brief help
    --help         Show detailed help

SEARCH BEHAVIOR:
    - Query matches skill name, title, description, tags, and tools
    - Results are ranked by relevance score
    - Domain and tag filters are applied before query matching

OUTPUT FORMAT:
    1. skill-name (domain)
       Description text
       Tags: tag1, tag2
       Scripts: N

EXAMPLES:
    skill search pdf              Search for skills related to PDF
    skill search --domain data    List all data-related skills
    skill search --tag automation Find skills tagged with "automation"
    skill search git --tools      Search for git skills, show tool commands
    skill search --rebuild        Rebuild index and list all skills

SKILL LOCATIONS:
    Skills directory: ~/.synapse/skills/
    Index file: ~/.synapse/skills/index.json`;

      return { stdout: help, stderr: '', exitCode: 0 };
    }

    const brief = 'Usage: skill search [query] [--domain <d>] [--tag <tag>] [--max <n>] [--tools]';
    return { stdout: brief, stderr: '', exitCode: 0 };
  }
}

// Default export
export default SkillSearchHandler;
