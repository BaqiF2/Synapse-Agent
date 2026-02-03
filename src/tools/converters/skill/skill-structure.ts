/**
 * Skill Structure Definition
 *
 * This module defines the structure and schema for Synapse skills.
 * Skills are organized in directories with a SKILL.md document and
 * executable scripts in a scripts/ subdirectory.
 *
 * @module skill-structure
 *
 * Core Exports:
 * - SkillMetadataSchema: Zod schema for skill metadata
 * - ScriptMetadataSchema: Zod schema for script metadata
 * - SkillStructure: Class for managing skill directory structure
 */

import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

/**
 * Default skills directory
 */
const DEFAULT_SKILLS_DIR = '.synapse/skills';

/**
 * Skill metadata file name
 */
const SKILL_MD_FILE = 'SKILL.md';

/**
 * Scripts subdirectory name
 */
const SCRIPTS_DIR = 'scripts';

/**
 * Supported script extensions
 */
export const SUPPORTED_EXTENSIONS = ['.py', '.sh', '.ts', '.js'] as const;
export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

/**
 * Schema for script parameter
 */
export const ScriptParamSchema = z.object({
  name: z.string().describe('Parameter name'),
  type: z.enum(['string', 'number', 'boolean', 'array', 'object']).default('string'),
  description: z.string().optional(),
  required: z.boolean().default(false),
  default: z.unknown().optional(),
});

export type ScriptParam = z.infer<typeof ScriptParamSchema>;

/**
 * Schema for script metadata extracted from docstring
 */
export const ScriptMetadataSchema = z.object({
  name: z.string().describe('Script name (without extension)'),
  description: z.string().optional(),
  params: z.array(ScriptParamSchema).default([]),
  returns: z.string().optional(),
  examples: z.array(z.string()).default([]),
  extension: z.enum(SUPPORTED_EXTENSIONS),
  path: z.string().describe('Full path to the script'),
});

export type ScriptMetadata = z.infer<typeof ScriptMetadataSchema>;

/**
 * Skill domain categories
 */
export const SKILL_DOMAINS = [
  'programming',
  'data',
  'devops',
  'finance',
  'general',
  'automation',
  'ai',
  'security',
  'other',
] as const;

export type SkillDomain = (typeof SKILL_DOMAINS)[number];

/**
 * Schema for skill metadata from SKILL.md
 */
export const SkillMetadataSchema = z.object({
  name: z.string().describe('Skill name (directory name)'),
  title: z.string().optional().describe('Human-readable title'),
  domain: z.enum(SKILL_DOMAINS).default('general'),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
  version: z.string().default('1.0.0'),
  author: z.string().optional(),
  dependencies: z.array(z.string()).default([]),
  scripts: z.array(ScriptMetadataSchema).default([]),
  path: z.string().describe('Full path to the skill directory'),
});

export type SkillMetadata = z.infer<typeof SkillMetadataSchema>;

/**
 * Skill directory entry
 */
export interface SkillEntry {
  name: string;
  path: string;
  hasSkillMd: boolean;
  hasScripts: boolean;
  scriptCount: number;
}

/**
 * SkillStructure
 *
 * Manages the skill directory structure and provides utilities for
 * discovering, validating, and creating skills.
 */
export class SkillStructure {
  private skillsDir: string;

  /**
   * Creates a new SkillStructure instance
   *
   * @param homeDir - User home directory (defaults to os.homedir())
   */
  constructor(homeDir: string = os.homedir()) {
    this.skillsDir = path.join(homeDir, DEFAULT_SKILLS_DIR);
  }

  /**
   * Gets the skills directory path
   */
  public getSkillsDir(): string {
    return this.skillsDir;
  }

  /**
   * Ensures the skills directory exists
   */
  public ensureSkillsDir(): void {
    if (!fs.existsSync(this.skillsDir)) {
      fs.mkdirSync(this.skillsDir, { recursive: true });
    }
  }

  /**
   * Gets the path for a specific skill
   */
  public getSkillPath(skillName: string): string {
    return path.join(this.skillsDir, skillName);
  }

  /**
   * Gets the SKILL.md path for a skill
   */
  public getSkillMdPath(skillName: string): string {
    return path.join(this.getSkillPath(skillName), SKILL_MD_FILE);
  }

  /**
   * Gets the scripts directory path for a skill
   */
  public getScriptsDir(skillName: string): string {
    return path.join(this.getSkillPath(skillName), SCRIPTS_DIR);
  }

  /**
   * Checks if a skill exists
   */
  public skillExists(skillName: string): boolean {
    const skillPath = this.getSkillPath(skillName);
    return fs.existsSync(skillPath) && fs.statSync(skillPath).isDirectory();
  }

  /**
   * Lists all skill directories
   */
  public listSkills(): SkillEntry[] {
    if (!fs.existsSync(this.skillsDir)) {
      return [];
    }

    const entries: SkillEntry[] = [];
    const items = fs.readdirSync(this.skillsDir);

    for (const item of items) {
      const itemPath = path.join(this.skillsDir, item);
      const stat = fs.statSync(itemPath);

      if (!stat.isDirectory()) continue;

      const skillMdPath = path.join(itemPath, SKILL_MD_FILE);
      const scriptsPath = path.join(itemPath, SCRIPTS_DIR);

      const hasSkillMd = fs.existsSync(skillMdPath);
      const hasScripts = fs.existsSync(scriptsPath) && fs.statSync(scriptsPath).isDirectory();

      let scriptCount = 0;
      if (hasScripts) {
        const scripts = fs.readdirSync(scriptsPath);
        scriptCount = scripts.filter((s) =>
          SUPPORTED_EXTENSIONS.some((ext) => s.endsWith(ext))
        ).length;
      }

      entries.push({
        name: item,
        path: itemPath,
        hasSkillMd,
        hasScripts,
        scriptCount,
      });
    }

    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Lists all scripts in a skill
   */
  public listScripts(skillName: string): string[] {
    const scriptsDir = this.getScriptsDir(skillName);

    if (!fs.existsSync(scriptsDir)) {
      return [];
    }

    const files = fs.readdirSync(scriptsDir);
    return files
      .filter((f) => SUPPORTED_EXTENSIONS.some((ext) => f.endsWith(ext)))
      .map((f) => path.join(scriptsDir, f));
  }

  /**
   * Creates a new skill directory structure
   *
   * @param skillName - Name of the skill to create
   * @param metadata - Optional initial metadata
   * @returns Path to the created skill
   */
  public createSkill(skillName: string, metadata?: Partial<SkillMetadata>): string {
    const skillPath = this.getSkillPath(skillName);

    if (fs.existsSync(skillPath)) {
      throw new Error(`Skill '${skillName}' already exists`);
    }

    // Create directories
    fs.mkdirSync(skillPath, { recursive: true });
    fs.mkdirSync(path.join(skillPath, SCRIPTS_DIR));

    // Create SKILL.md
    const skillMdContent = this.generateSkillMd(skillName, metadata);
    fs.writeFileSync(path.join(skillPath, SKILL_MD_FILE), skillMdContent, 'utf-8');

    return skillPath;
  }

  /**
   * Generates SKILL.md content
   */
  private generateSkillMd(skillName: string, metadata?: Partial<SkillMetadata>): string {
    const title = metadata?.title || skillName;
    const domain = metadata?.domain || 'general';
    const description = metadata?.description || 'A Synapse skill';
    const tags = metadata?.tags || [];
    const version = metadata?.version || '1.0.0';

    return `# ${title}

**Domain**: ${domain}
**Version**: ${version}
**Description**: ${description}
**Tags**: ${tags.join(', ') || 'none'}

## Usage

Describe how to use this skill...

## Tools

This skill provides the following tools:

- \`skill:${skillName}:<tool_name>\` - Tool description

## Examples

\`\`\`bash
# Example usage
skill:${skillName}:example_tool arg1 arg2
\`\`\`

## Dependencies

List any external dependencies here.
`;
  }

  /**
   * Creates an example script in a skill
   */
  public createExampleScript(
    skillName: string,
    scriptName: string,
    extension: SupportedExtension = '.py'
  ): string {
    const scriptsDir = this.getScriptsDir(skillName);

    if (!fs.existsSync(scriptsDir)) {
      fs.mkdirSync(scriptsDir, { recursive: true });
    }

    const scriptPath = path.join(scriptsDir, `${scriptName}${extension}`);
    let content: string;

    switch (extension) {
      case '.py':
        content = this.generatePythonScript(scriptName);
        break;
      case '.sh':
        content = this.generateShellScript(scriptName);
        break;
      case '.ts':
        content = this.generateTypeScriptScript(scriptName);
        break;
      case '.js':
        content = this.generateJavaScriptScript(scriptName);
        break;
      default:
        throw new Error(`Unsupported extension: ${extension}`);
    }

    fs.writeFileSync(scriptPath, content, 'utf-8');
    fs.chmodSync(scriptPath, 0o755);

    return scriptPath;
  }

  private generatePythonScript(name: string): string {
    return `#!/usr/bin/env python3
"""
${name} - A Synapse skill script

Description:
    Brief description of what this script does.

Parameters:
    input (str): The input parameter
    --option (str): An optional parameter (default: "default")

Returns:
    str: Description of the return value

Examples:
    skill:example:${name} "hello"
    skill:example:${name} "hello" --option="custom"
"""

import argparse
import sys


def main():
    parser = argparse.ArgumentParser(description="${name}")
    parser.add_argument("input", help="The input parameter")
    parser.add_argument("--option", default="default", help="An optional parameter")

    args = parser.parse_args()

    # Your logic here
    result = f"Processed: {args.input} with option: {args.option}"
    print(result)


if __name__ == "__main__":
    main()
`;
  }

  private generateShellScript(name: string): string {
    return `#!/bin/bash
# ${name} - A Synapse skill script
#
# Description:
#     Brief description of what this script does.
#
# Parameters:
#     $1 (string): The input parameter
#     --option=value (string): An optional parameter (default: "default")
#
# Returns:
#     string: Description of the return value
#
# Examples:
#     skill:example:${name} "hello"
#     skill:example:${name} "hello" --option="custom"

set -e

# Parse arguments
INPUT="$1"
OPTION="default"

shift || true
while [[ $# -gt 0 ]]; do
    case $1 in
        --option=*)
            OPTION="\${1#*=}"
            shift
            ;;
        -h|--help)
            grep '^#' "$0" | sed 's/^# //' | sed 's/^#//'
            exit 0
            ;;
        *)
            shift
            ;;
    esac
done

# Your logic here
echo "Processed: $INPUT with option: $OPTION"
`;
  }

  private generateTypeScriptScript(name: string): string {
    return `#!/usr/bin/env bun
/**
 * ${name} - A Synapse skill script
 *
 * Description:
 *     Brief description of what this script does.
 *
 * Parameters:
 *     input (string): The input parameter
 *     --option (string): An optional parameter (default: "default")
 *
 * Returns:
 *     string: Description of the return value
 *
 * Examples:
 *     skill:example:${name} "hello"
 *     skill:example:${name} "hello" --option="custom"
 */

const args = process.argv.slice(2);

// Parse arguments
let input = '';
let option = 'default';

for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--option=')) {
    option = args[i].slice(9);
  } else if (args[i] === '-h' || args[i] === '--help') {
    console.log('Usage: ${name} <input> [--option=value]');
    process.exit(0);
  } else if (!input) {
    input = args[i];
  }
}

// Your logic here
console.log(\`Processed: \${input} with option: \${option}\`);
`;
  }

  private generateJavaScriptScript(name: string): string {
    return `#!/usr/bin/env node
/**
 * ${name} - A Synapse skill script
 *
 * Description:
 *     Brief description of what this script does.
 *
 * Parameters:
 *     input (string): The input parameter
 *     --option (string): An optional parameter (default: "default")
 *
 * Returns:
 *     string: Description of the return value
 *
 * Examples:
 *     skill:example:${name} "hello"
 *     skill:example:${name} "hello" --option="custom"
 */

const args = process.argv.slice(2);

// Parse arguments
let input = '';
let option = 'default';

for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--option=')) {
    option = args[i].slice(9);
  } else if (args[i] === '-h' || args[i] === '--help') {
    console.log('Usage: ${name} <input> [--option=value]');
    process.exit(0);
  } else if (!input) {
    input = args[i];
  }
}

// Your logic here
console.log(\`Processed: \${input} with option: \${option}\`);
`;
  }
}

// Default export
export default SkillStructure;
