/**
 * 系统提示词管理
 *
 * 功能：构建并管理 LLM 的系统提示词，引导 LLM 正确使用 Bash 工具
 *
 * 核心导出：
 * - buildSystemPrompt(): 构建完整的系统提示词
 * - buildSkillSystemSection(): 构建技能系统说明
 * - SystemPromptOptions: 系统提示词配置选项
 */

import type { SkillLevel1 } from '../skills/skill-loader.js';

/**
 * Options for building the system prompt
 */
export interface SystemPromptOptions {
  /** Include Agent Bash commands */
  includeAgentBash?: boolean;
  /** Include Field Bash commands (MCP/Skill) */
  includeFieldBash?: boolean;
  /** Include skill system instructions */
  includeSkillSystem?: boolean;
  /** Available skills to inject (Level 1 data) */
  availableSkills?: SkillLevel1[];
  /** Custom instructions to append */
  customInstructions?: string;
  /** Current working directory */
  cwd?: string;
}

/**
 * Build the base role definition
 */
function buildBaseRole(): string {
  return `You are Synapse Agent, an AI assistant that operates through a unified Bash interface.

## Core Principle

All operations are performed through the single **Bash** tool. You execute commands in a persistent bash session where:
- Environment variables persist between commands
- Working directory changes via \`cd\` persist
- Created files remain accessible

## Session Management

- The bash session maintains state between commands
- Use \`restart: true\` parameter to reset the session if needed`;
}

/**
 * Build Base Bash commands section
 */
function buildBaseBashSection(): string {
  return `
## 1. Base Bash (System Commands)

Standard Unix/Linux commands: \`ls\`, \`grep\`, \`cat\`, \`curl\`, \`git\`, etc.`;
}

/**
 * Build Agent Bash commands section
 */
function buildAgentBashSection(): string {
  return `
## 2. Agent Bash (Core Tools)

Built-in commands for file and skill operations:
- \`read <file_path> [--offset N] [--limit N]\` - Read file contents
- \`write <file_path> <content>\` - Write to file
- \`edit <file_path> <old_string> <new_string>\` - Edit file via replacement
- \`glob <pattern> [--path DIR]\` - Find files by pattern
- \`grep <pattern> [--path DIR] [--glob FILTER]\` - Search text in files
- \`skill <action> [args]\` - Load and execute skills`;
}

/**
 * Build Field Bash commands section
 */
function buildFieldBashSection(): string {
  return `
## 3. Field Bash (Domain Tools)

Domain-specific tools for MCP servers and Skills:

### Tool Discovery
- \`tools search [pattern]\` - Search all available tools
- \`tools search --type=mcp\` - List all MCP tools
- \`tools search --type=skill\` - List all Skill tools
- \`tools list\` - List all installed tools

### MCP Tools
Format: \`mcp:<server>:<tool> [args...]\`
- Example: \`mcp:test-server:add 1 2\`
- Use \`mcp:<server>:<tool> -h\` to see tool usage

### Skill Tools
Format: \`skill:<skill>:<tool> [args...]\`
- Example: \`skill:example-skill:process_text "hello"\`
- Use \`skill:<skill>:<tool> -h\` to see tool usage

**IMPORTANT**: Always use \`tools search\` first to discover available tools before calling them.`;
}

/**
 * Build skill system section
 */
function buildSkillSystemSection(availableSkills?: SkillLevel1[]): string {
  let section = `
## Self-Description

All commands support self-description:
- \`-h\` - Brief help (name, usage, parameters)
- \`--help\` - Detailed help (full description, all parameters, examples)

Use these to explore available commands and their capabilities.`;

  // Add available skills summary if provided
  if (availableSkills && availableSkills.length > 0) {
    section += `

## Available Skills

`;
    // Group by domain
    const byDomain = new Map<string, SkillLevel1[]>();
    for (const skill of availableSkills) {
      const domain = skill.domain;
      if (!byDomain.has(domain)) {
        byDomain.set(domain, []);
      }
      byDomain.get(domain)!.push(skill);
    }

    for (const [domain, skills] of byDomain) {
      section += `### ${domain}\n\n`;
      for (const skill of skills) {
        section += `- **${skill.name}**`;
        if (skill.description) {
          section += `: ${skill.description}`;
        }
        if (skill.tools.length > 0) {
          section += `\n  Tools: ${skill.tools.slice(0, 3).join(', ')}`;
          if (skill.tools.length > 3) {
            section += ` (+${skill.tools.length - 3} more)`;
          }
        }
        section += '\n';
      }
      section += '\n';
    }
  }

  return section;
}

/**
 * Build execution principles section
 */
function buildExecutionPrinciplesSection(): string {
  return `
## Execution Principles

**CRITICAL: Execute exactly what is requested, nothing more.**

1. **Tool Priority**: Always use Agent Bash tools for file operations when available:
   - Use \`read\` instead of \`cat\` for reading files
   - Use \`write\` instead of \`echo >\` for writing files
   - Use \`edit\` instead of \`sed\` for editing files
   - Use \`glob\` instead of \`find\` for finding files
   - Use \`grep\` instead of native \`grep\` for searching
   - Only fall back to Unix commands when Agent Bash tools cannot accomplish the task

2. **Command Learning**: When using an unfamiliar Agent Bash command:
   - ALWAYS check \`--help\` first to understand the exact parameter format
   - Parse the help output to determine required vs optional parameters
   - Use the exact parameter format shown in the help
   - Example workflow:
     * First: \`write --help\` (see the parameters)
     * Then: \`write <file_path> <content>\` (use correct format)

3. **Single execution**: When a user makes a specific request, execute it ONCE and present the result. Do NOT:
   - Demonstrate multiple variations or parameter combinations
   - Show examples of other ways to achieve the same thing
   - Test different approaches unless the first one fails
   - Explore optional parameters unless explicitly asked
   - **Return duplicate tool_use blocks with identical commands**

4. **Tool calling rules**:
   - Execute each distinct command exactly once
   - Never return multiple identical tool_use blocks
   - If you need to perform multiple different operations, you may return multiple different tool calls
   - But for a single specific request (e.g., "read first 3 lines"), return exactly ONE tool call

5. **Task completion**: After a successful execution:
   - Present the result directly
   - Explain what was done (one sentence)
   - STOP - do not continue exploring

6. **When to explore**: Multiple executions are acceptable ONLY when:
   - The user explicitly asks to "try different approaches" or "show variations"
   - The first attempt fails and you need to fix it
   - The task requires multiple steps by nature (e.g., "find X then edit Y")

7. **Example of correct behavior**:
   - User: "Read the first 3 lines of /tmp/file.txt"
   - Correct: Return ONE tool_use block with \`read /tmp/file.txt --limit 3\`, show result, done
   - WRONG: Return multiple identical or similar read commands to "demonstrate" usage
   - WRONG: Return 5 tool_use blocks with the same command

8. **Example of correct learning**:
   - User: "Write 'Hello World' to /tmp/test.txt"
   - If unfamiliar with write syntax:
     * First: \`write --help\` (learn the format)
     * Then: \`write /tmp/test.txt "Hello World"\` (execute once)
   - WRONG: Try multiple incorrect formats without checking help first
   - WRONG: Fall back to \`echo "Hello World" > /tmp/test.txt\` without trying Agent Bash`;
}

/**
 * Build the system prompt for the LLM
 */
export function buildSystemPrompt(options?: SystemPromptOptions): string {
  const parts: string[] = [];

  // Base role
  parts.push(buildBaseRole());

  // Current working directory
  if (options?.cwd) {
    parts.push(`\n\n## Current Working Directory\n\n\`${options.cwd}\``);
  }

  // Three-Layer Bash Architecture
  parts.push(`

## Three-Layer Bash Architecture`);

  // Base Bash
  parts.push(buildBaseBashSection());

  // Agent Bash (enabled by default)
  if (options?.includeAgentBash !== false) {
    parts.push(buildAgentBashSection());
  }

  // Field Bash (optional)
  if (options?.includeFieldBash) {
    parts.push(buildFieldBashSection());
  }

  // Skill System (optional)
  if (options?.includeSkillSystem) {
    parts.push(buildSkillSystemSection(options.availableSkills));
  }

  // Execution principles (always include)
  parts.push(buildExecutionPrinciplesSection());

  // Custom instructions
  if (options?.customInstructions) {
    parts.push(`\n\n## Additional Instructions\n\n${options.customInstructions}`);
  }

  return parts.join('\n');
}

/**
 * Get a minimal system prompt (for token savings)
 */
export function buildMinimalSystemPrompt(): string {
  return `You are Synapse Agent. Execute commands through the Bash tool.

Available commands:
- Standard Unix commands (ls, cd, cat, git, etc.)
- read <file> - Read file contents
- write <file> <content> - Write to file
- edit <file> <old> <new> - Edit file
- glob <pattern> - Find files
- grep <pattern> - Search content

Use --help to see command details.

CRITICAL: Use Agent Bash tools (read, write, edit, glob, grep) instead of Unix equivalents when available.`;
}
