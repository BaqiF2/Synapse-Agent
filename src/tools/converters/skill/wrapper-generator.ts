/**
 * Skill Wrapper Generator
 *
 * This module generates executable Bash wrapper scripts for Skill tools.
 * Each wrapper script provides a CLI interface to invoke the corresponding
 * script with proper argument handling and help support.
 *
 * @module wrapper-generator
 *
 * Core Exports:
 * - SkillWrapperGenerator: Generates wrapper scripts for Skill tools
 * - GeneratedSkillWrapper: Metadata about a generated wrapper
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { ScriptMetadata, ScriptParam } from './skill-structure.js';
import { DocstringParser } from './docstring-parser.js';
import { SkillStructure } from './skill-structure.js';

/**
 * Default bin directory for installed tools
 */
const DEFAULT_BIN_DIR = '.synapse/bin';

/**
 * File mode for executable scripts (755)
 */
const EXECUTABLE_MODE = 0o755;

/**
 * Generated wrapper metadata
 */
export interface GeneratedSkillWrapper {
  /** Command name (e.g., skill:my-skill:my_tool) */
  commandName: string;
  /** Skill name */
  skillName: string;
  /** Script/tool name */
  toolName: string;
  /** Full path to the generated wrapper */
  wrapperPath: string;
  /** Full path to the original script */
  scriptPath: string;
  /** Script content */
  content: string;
  /** Tool description */
  description?: string;
}

/**
 * Installation result
 */
export interface SkillInstallResult {
  success: boolean;
  commandName: string;
  path: string;
  error?: string;
}

/**
 * SkillWrapperGenerator
 *
 * Generates executable wrapper scripts for Skill tools. Each wrapper:
 * - Parses command-line arguments based on script metadata
 * - Provides -h flag for brief help
 * - Provides --help flag for detailed documentation
 * - Invokes the original script with proper arguments
 */
export class SkillWrapperGenerator {
  private binDir: string;
  private parser: DocstringParser;
  private structure: SkillStructure;

  /**
   * Creates a new SkillWrapperGenerator
   *
   * @param homeDir - User home directory (defaults to os.homedir())
   */
  constructor(homeDir: string = os.homedir()) {
    this.binDir = path.join(homeDir, DEFAULT_BIN_DIR);
    this.parser = new DocstringParser();
    this.structure = new SkillStructure(homeDir);
  }

  /**
   * Gets the bin directory path
   */
  public getBinDir(): string {
    return this.binDir;
  }

  /**
   * Ensures the bin directory exists
   */
  public ensureBinDir(): void {
    if (!fs.existsSync(this.binDir)) {
      fs.mkdirSync(this.binDir, { recursive: true });
    }
  }

  /**
   * Generates brief help text (-h)
   */
  private generateBriefHelp(
    skillName: string,
    toolName: string,
    description: string | undefined,
    params: ScriptParam[]
  ): string {
    const commandName = `skill:${skillName}:${toolName}`;
    const requiredParams = params.filter((p) => p.required);
    const optionalParams = params.filter((p) => !p.required);

    let usage = commandName;
    for (const p of requiredParams) {
      usage += ` <${p.name}>`;
    }
    if (optionalParams.length > 0) {
      usage += ' [options]';
    }

    let help = `Usage: ${usage}\n`;
    if (description) {
      help += `${description}\n`;
    }
    help += `Use --help for detailed information.`;

    return help;
  }

  /**
   * Generates detailed help text (--help)
   */
  private generateDetailedHelp(
    skillName: string,
    toolName: string,
    description: string | undefined,
    params: ScriptParam[],
    examples: string[]
  ): string {
    const commandName = `skill:${skillName}:${toolName}`;
    const requiredParams = params.filter((p) => p.required);
    const optionalParams = params.filter((p) => !p.required);

    let help = `${commandName}\n`;
    help += '='.repeat(commandName.length) + '\n\n';

    if (description) {
      help += `DESCRIPTION\n  ${description}\n\n`;
    }

    // Usage
    let usage = commandName;
    for (const p of requiredParams) {
      usage += ` <${p.name}>`;
    }
    if (optionalParams.length > 0) {
      usage += ' [options]';
    }
    help += `USAGE\n  ${usage}\n\n`;

    // Arguments
    if (requiredParams.length > 0) {
      help += 'ARGUMENTS\n';
      for (const p of requiredParams) {
        help += `  <${p.name}>  (${p.type}) ${p.description || ''}\n`;
      }
      help += '\n';
    }

    // Options
    if (optionalParams.length > 0) {
      help += 'OPTIONS\n';
      for (const p of optionalParams) {
        const defaultStr = p.default !== undefined ? ` (default: ${JSON.stringify(p.default)})` : '';
        help += `  --${p.name}=<value>  (${p.type}) ${p.description || ''}${defaultStr}\n`;
      }
      help += '\n';
    }

    // Examples
    if (examples.length > 0) {
      help += 'EXAMPLES\n';
      for (const ex of examples) {
        help += `  ${ex}\n`;
      }
      help += '\n';
    }

    help += 'SPECIAL OPTIONS\n';
    help += '  -h         Show brief help\n';
    help += '  --help     Show this detailed help\n';

    return help;
  }

  /**
   * Gets the interpreter command for a script extension
   */
  private getInterpreter(extension: string): string {
    switch (extension) {
      case '.py':
        return 'python3';
      case '.sh':
        return 'bash';
      case '.ts':
        return 'bun';
      case '.js':
        return 'node';
      default:
        return 'bash';
    }
  }

  /**
   * Generates the wrapper script content
   */
  private generateScriptContent(skillName: string, metadata: ScriptMetadata): string {
    const params = metadata.params || [];
    const briefHelp = this.generateBriefHelp(skillName, metadata.name, metadata.description, params);
    const detailedHelp = this.generateDetailedHelp(
      skillName,
      metadata.name,
      metadata.description,
      params,
      metadata.examples || []
    );
    const interpreter = this.getInterpreter(metadata.extension);

    const script = `#!/usr/bin/env bun
/**
 * Skill Tool Wrapper: skill:${skillName}:${metadata.name}
 *
 * Auto-generated by Synapse Agent Skill Wrapper Generator
 * Skill: ${skillName}
 * Tool: ${metadata.name}
 * Script: ${metadata.path}
 * Description: ${metadata.description || 'No description'}
 */

const BRIEF_HELP = \`${briefHelp.replace(/`/g, '\\`')}\`;

const DETAILED_HELP = \`${detailedHelp.replace(/`/g, '\\`')}\`;

const SCRIPT_PATH = '${metadata.path}';
const INTERPRETER = '${interpreter}';

// Parse command line arguments
const args = process.argv.slice(2);

// Check for help flags
if (args.includes('-h')) {
  console.log(BRIEF_HELP);
  process.exit(0);
}

if (args.includes('--help')) {
  console.log(DETAILED_HELP);
  process.exit(0);
}

// Forward all arguments to the original script
const { spawn } = await import('child_process');

const child = spawn(INTERPRETER, [SCRIPT_PATH, ...args], {
  stdio: 'inherit',
  env: process.env,
});

child.on('close', (code) => {
  process.exit(code || 0);
});

child.on('error', (error) => {
  console.error('Failed to execute script:', error.message);
  process.exit(1);
});
`;

    return script;
  }

  /**
   * Generates a wrapper for a single script
   *
   * @param skillName - Name of the skill
   * @param scriptPath - Path to the script file
   * @returns Generated wrapper metadata or null if parsing fails
   */
  public generateWrapper(skillName: string, scriptPath: string): GeneratedSkillWrapper | null {
    const metadata = this.parser.parseFile(scriptPath);
    if (!metadata) {
      return null;
    }

    const commandName = `skill:${skillName}:${metadata.name}`;
    const scriptContent = this.generateScriptContent(skillName, metadata);
    const wrapperPath = path.join(this.binDir, commandName);

    return {
      commandName,
      skillName,
      toolName: metadata.name,
      wrapperPath,
      scriptPath,
      content: scriptContent,
      description: metadata.description,
    };
  }

  /**
   * Generates wrappers for all scripts in a skill
   *
   * @param skillName - Name of the skill
   * @returns Array of generated wrapper metadata
   */
  public generateWrappersForSkill(skillName: string): GeneratedSkillWrapper[] {
    const scripts = this.structure.listScripts(skillName);
    const wrappers: GeneratedSkillWrapper[] = [];

    for (const scriptPath of scripts) {
      const wrapper = this.generateWrapper(skillName, scriptPath);
      if (wrapper) {
        wrappers.push(wrapper);
      }
    }

    return wrappers;
  }

  /**
   * Generates wrappers for all skills
   *
   * @returns Map of skill name to generated wrappers
   */
  public generateAllWrappers(): Map<string, GeneratedSkillWrapper[]> {
    const result = new Map<string, GeneratedSkillWrapper[]>();
    const skills = this.structure.listSkills();

    for (const skill of skills) {
      const wrappers = this.generateWrappersForSkill(skill.name);
      if (wrappers.length > 0) {
        result.set(skill.name, wrappers);
      }
    }

    return result;
  }

  /**
   * Installs a single wrapper
   *
   * @param wrapper - Generated wrapper to install
   * @returns Installation result
   */
  public install(wrapper: GeneratedSkillWrapper): SkillInstallResult {
    try {
      this.ensureBinDir();

      // Write the wrapper script
      fs.writeFileSync(wrapper.wrapperPath, wrapper.content, { encoding: 'utf-8' });

      // Make it executable
      fs.chmodSync(wrapper.wrapperPath, EXECUTABLE_MODE);

      return {
        success: true,
        commandName: wrapper.commandName,
        path: wrapper.wrapperPath,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        commandName: wrapper.commandName,
        path: '',
        error: errorMessage,
      };
    }
  }

  /**
   * Installs multiple wrappers
   *
   * @param wrappers - Array of wrappers to install
   * @returns Array of installation results
   */
  public installAll(wrappers: GeneratedSkillWrapper[]): SkillInstallResult[] {
    return wrappers.map((wrapper) => this.install(wrapper));
  }

  /**
   * Removes a skill wrapper
   *
   * @param commandName - Name of the command to remove
   * @returns True if removed, false if not found
   */
  public remove(commandName: string): boolean {
    const wrapperPath = path.join(this.binDir, commandName);

    if (fs.existsSync(wrapperPath)) {
      fs.unlinkSync(wrapperPath);
      return true;
    }

    return false;
  }

  /**
   * Removes all wrappers for a skill
   *
   * @param skillName - Name of the skill
   * @returns Number of wrappers removed
   */
  public removeBySkill(skillName: string): number {
    const prefix = `skill:${skillName}:`;
    let removed = 0;

    if (!fs.existsSync(this.binDir)) {
      return 0;
    }

    const files = fs.readdirSync(this.binDir);
    for (const file of files) {
      if (file.startsWith(prefix)) {
        const filePath = path.join(this.binDir, file);
        fs.unlinkSync(filePath);
        removed++;
      }
    }

    return removed;
  }
}

// Default export
export default SkillWrapperGenerator;
