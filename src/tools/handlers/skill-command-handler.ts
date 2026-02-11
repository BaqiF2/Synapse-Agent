/**
 * Skill Command Handler
 *
 * 功能：处理 skill:* 管理命令
 * - skill:load
 * - skill:list
 * - skill:info
 * - skill:import
 * - skill:rollback
 * - skill:delete
 */

import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fsp } from 'node:fs';
import type { CommandResult } from './native-command-handler.ts';
import { parseCommandArgs } from './agent-bash/command-utils.ts';
import { createLogger } from '../../utils/logger.ts';
import { SkillLoader } from '../../skills/skill-loader.js';
import { SkillIndexer } from '../../skills/indexer.js';
import { SkillMerger } from '../../skills/skill-merger.js';
import { SkillManager } from '../../skills/skill-manager.js';
import type { ImportOptions, MergeIntoOption, SkillMeta, VersionInfo } from '../../skills/types.js';
import { SubAgentManager } from '../../sub-agents/sub-agent-manager.ts';
import type { LLMClient } from '../../providers/llm-client.ts';
import type { BashTool } from '../bash-tool.ts';
import type { ToolResultEvent, SubAgentCompleteEvent, SubAgentToolCallEvent } from '../../cli/terminal-renderer-types.ts';
import type { OnUsage } from '../../providers/generate.ts';

const logger = createLogger('skill-command-handler');

/**
 * SkillCommandHandler 配置选项
 */
export interface SkillCommandHandlerOptions {
  /** 用户主目录，默认 os.homedir() */
  homeDir?: string;
  /** 用于 SkillMerger 的 SubAgent 依赖 */
  llmClient?: LLMClient;
  /** 用于 SkillMerger 的 SubAgent 依赖 */
  toolExecutor?: BashTool;
  /** SubAgent 回调 */
  onSubAgentToolStart?: (event: SubAgentToolCallEvent) => void;
  /** SubAgent 回调 */
  onSubAgentToolEnd?: (event: ToolResultEvent) => void;
  /** SubAgent 回调 */
  onSubAgentComplete?: (event: SubAgentCompleteEvent) => void;
  /** SubAgent usage 回调 */
  onSubAgentUsage?: OnUsage;

  /** 测试注入：SkillLoader */
  skillLoader?: SkillLoader;
  /** 测试注入：SkillManager */
  skillManager?: SkillManager;
  /** 测试注入：SkillMerger */
  skillMerger?: SkillMerger;
}

/**
 * SkillCommandHandler - 处理 skill:* 管理命令
 */
export class SkillCommandHandler {
  private skillLoader: SkillLoader;
  private skillManager: SkillManager;
  private skillMerger: SkillMerger;
  private subAgentManager: SubAgentManager | null = null;

  constructor(options: SkillCommandHandlerOptions = {}) {
    const homeDir = options.homeDir ?? os.homedir();
    this.skillLoader = options.skillLoader ?? new SkillLoader(homeDir);

    this.skillMerger = options.skillMerger ?? this.createMerger(options);

    if (options.skillManager) {
      this.skillManager = options.skillManager;
    } else {
      const skillsDir = path.join(homeDir, '.synapse', 'skills');
      const indexer = new SkillIndexer(homeDir);
      this.skillManager = new SkillManager(skillsDir, indexer, this.skillMerger);
    }
  }

  /**
   * 执行 skill 命令
   */
  async execute(command: string): Promise<CommandResult> {
    const trimmed = command.trim();

    if (trimmed.startsWith('skill:load')) {
      return this.handleLoad(trimmed);
    }
    if (trimmed.startsWith('skill:list')) {
      return this.handleList();
    }
    if (trimmed.startsWith('skill:info')) {
      return this.handleInfo(trimmed);
    }
    if (trimmed.startsWith('skill:import')) {
      return this.handleImport(trimmed);
    }
    if (trimmed.startsWith('skill:rollback')) {
      return this.handleRollback(trimmed);
    }
    if (trimmed.startsWith('skill:delete')) {
      return this.handleDelete(trimmed);
    }

    return this.unknownCommand(command);
  }

  /**
   * 仅用于测试或调试：获取 merger
   */
  getSkillMerger(): SkillMerger {
    return this.skillMerger;
  }

  /**
   * 仅用于测试或调试：获取 manager
   */
  getSkillManager(): SkillManager {
    return this.skillManager;
  }

  /**
   * 关闭处理器
   */
  shutdown(): void {
    this.subAgentManager?.shutdown();
  }

  private createMerger(options: SkillCommandHandlerOptions): SkillMerger {
    if (!options.llmClient || !options.toolExecutor) {
      this.subAgentManager = null;
      return new SkillMerger(null);
    }

    this.subAgentManager = new SubAgentManager({
      client: options.llmClient,
      bashTool: options.toolExecutor,
      onToolStart: options.onSubAgentToolStart,
      onToolEnd: options.onSubAgentToolEnd,
      onComplete: options.onSubAgentComplete,
      onUsage: options.onSubAgentUsage,
    });
    return new SkillMerger(this.subAgentManager);
  }

  /**
   * 处理 skill:load 命令
   */
  private handleLoad(command: string): CommandResult {
    const parts = parseCommandArgs(command);
    const skillName = parts[1]; // skill:load <name>

    if (!skillName || skillName === '-h' || skillName === '--help') {
      return {
        stdout: `skill:load - Load a skill's content

USAGE:
    skill:load <skill-name>

ARGUMENTS:
    <skill-name>  Name of the skill to load

EXAMPLES:
    skill:load code-analyzer
    skill:load my-custom-skill`,
        stderr: '',
        exitCode: skillName ? 0 : 1,
      };
    }

    const skill = this.skillLoader.loadLevel2(skillName);
    if (!skill) {
      logger.warn('Skill not found', { skillName });
      return {
        stdout: '',
        stderr: `Skill '${skillName}' not found`,
        exitCode: 1,
      };
    }

    if (!skill.rawContent) {
      logger.warn('Skill SKILL.md not found', { skillName });
      return {
        stdout: '',
        stderr: `Skill '${skillName}' not found (missing SKILL.md)`,
        exitCode: 1,
      };
    }

    return {
      stdout: `# Skill: ${skillName}\n\n${skill.rawContent}`,
      stderr: '',
      exitCode: 0,
    };
  }

  private async handleList(): Promise<CommandResult> {
    try {
      const skills = await this.skillManager.list();
      if (skills.length === 0) {
        return {
          stdout: 'No skills installed.',
          stderr: '',
          exitCode: 0,
        };
      }

      const lines = skills.map((skill) => {
        const description = skill.description?.trim() || 'No description';
        return `${skill.name.padEnd(20)} - ${description} (${skill.versions.length} versions)`;
      });

      return {
        stdout: lines.join('\n'),
        stderr: '',
        exitCode: 0,
      };
    } catch (error) {
      return this.errorResult(error, 'Failed to list skills');
    }
  }

  private async handleInfo(command: string): Promise<CommandResult> {
    const parts = parseCommandArgs(command);
    const skillName = parts[1];

    if (!skillName || skillName === '-h' || skillName === '--help') {
      return {
        stdout: `skill:info - Show detailed skill information

USAGE:
    skill:info <skill-name>

ARGUMENTS:
    <skill-name>  Name of the skill`,
        stderr: '',
        exitCode: skillName ? 0 : 1,
      };
    }

    try {
      const skill = await this.skillManager.info(skillName);
      if (!skill) {
        return {
          stdout: '',
          stderr: `Skill '${skillName}' not found`,
          exitCode: 1,
        };
      }

      const created = await this.getCreatedLabel(skill);
      const updated = skill.lastModified ? formatDateLabel(skill.lastModified) : this.getUpdatedLabel(skill.versions);
      const tools = skill.tools.length > 0 ? skill.tools.join(', ') : '(none)';
      const lines: string[] = [
        `Skill: ${skill.name}`,
        `Description: ${skill.description || 'No description'}`,
        `Version: ${skill.version}`,
        `Created: ${created}`,
        `Updated: ${updated}`,
        `Tools: ${tools}`,
        '',
        `Version History (${skill.versions.length}):`,
      ];

      if (skill.versions.length === 0) {
        lines.push('  (none)');
      } else {
        for (let i = 0; i < skill.versions.length; i++) {
          const version = skill.versions[i]!;
          lines.push(`  ${i + 1}. ${version.version} (${formatDateLabel(version.createdAt)})`);
        }
      }

      return {
        stdout: lines.join('\n'),
        stderr: '',
        exitCode: 0,
      };
    } catch (error) {
      return this.errorResult(error, 'Failed to get skill info');
    }
  }

  private async handleImport(command: string): Promise<CommandResult> {
    const parts = parseCommandArgs(command);
    const source = parts[1];

    if (!source || source === '-h' || source === '--help') {
      return {
        stdout: `skill:import - Import skills from local directory or remote URL

USAGE:
    skill:import <source> [--continue=<names>] [--merge=<source:target>]

OPTIONS:
    --continue=<names>    Skip similarity check for comma-separated skill names
    --merge=<src:dst>     Merge source skill into target skill`,
        stderr: '',
        exitCode: source ? 0 : 1,
      };
    }

    try {
      const options = this.parseImportOptions(parts.slice(2));
      const result = await this.skillManager.import(source, options);
      const lines: string[] = [];

      if (result.imported.length > 0) {
        lines.push(`Imported: ${result.imported.join(', ')}`);
      }
      if (result.skipped.length > 0) {
        lines.push(`Skipped: ${result.skipped.join(', ')}`);
      }
      if (result.conflicts.length > 0) {
        lines.push('Conflicts:');
        for (const conflict of result.conflicts) {
          lines.push(`  - ${conflict.name}`);
        }
        lines.push('请修改源目录中的名称后重新导入。');
      }
      if (result.similar.length > 0) {
        lines.push('Similar Skills:');
        for (const similar of result.similar) {
          lines.push(`  - ${similar.name} ~ ${similar.similarTo}: ${similar.reason}`);
          lines.push(`    --continue=${similar.name}`);
          lines.push(`    --merge=${similar.name}:${similar.similarTo}`);
        }
      }
      if (lines.length === 0) {
        lines.push('Import completed. No skills found.');
      }

      return {
        stdout: lines.join('\n'),
        stderr: '',
        exitCode: 0,
      };
    } catch (error) {
      return this.errorResult(error, 'Failed to import skills');
    }
  }

  private async handleRollback(command: string): Promise<CommandResult> {
    const parts = parseCommandArgs(command);
    const skillName = parts[1];
    const version = parts[2];

    if (!skillName || skillName === '-h' || skillName === '--help') {
      return {
        stdout: `skill:rollback - Rollback skill to a historical version

USAGE:
    skill:rollback <skill-name> [version]

EXAMPLES:
    skill:rollback git-commit
    skill:rollback git-commit 2026-02-02-001`,
        stderr: '',
        exitCode: skillName ? 0 : 1,
      };
    }

    try {
      if (!version) {
        const versions = await this.skillManager.getVersions(skillName);
        if (versions.length === 0) {
          return {
            stdout: '',
            stderr: `No versions available for skill '${skillName}'`,
            exitCode: 1,
          };
        }

        const lines = [`Available versions for ${skillName}:`];
        for (let i = 0; i < versions.length; i++) {
          const item = versions[i]!;
          lines.push(`  ${i + 1}. ${item.version} (${formatDateLabel(item.createdAt)})`);
        }
        lines.push(`请选择版本号重新执行: skill:rollback ${skillName} <version>`);

        return {
          stdout: lines.join('\n'),
          stderr: '',
          exitCode: 0,
        };
      }

      await this.skillManager.rollback(skillName, version);
      return {
        stdout: `Rollback completed: ${skillName} -> ${version}`,
        stderr: '',
        exitCode: 0,
      };
    } catch (error) {
      return this.errorResult(error, 'Rollback failed');
    }
  }

  private async handleDelete(command: string): Promise<CommandResult> {
    const parts = parseCommandArgs(command);
    const skillName = parts[1];

    if (!skillName || skillName === '-h' || skillName === '--help') {
      return {
        stdout: `skill:delete - Delete a skill and all version history

USAGE:
    skill:delete <skill-name>`,
        stderr: '',
        exitCode: skillName ? 0 : 1,
      };
    }

    try {
      await this.skillManager.delete(skillName);
      return {
        stdout: `Skill '${skillName}' deleted.`,
        stderr: '',
        exitCode: 0,
      };
    } catch (error) {
      return this.errorResult(error, 'Delete failed');
    }
  }

  private parseImportOptions(args: string[]): ImportOptions {
    const continueSkills: string[] = [];
    const mergeInto: MergeIntoOption[] = [];

    for (let i = 0; i < args.length; i++) {
      const token = args[i] ?? '';

      if (token.startsWith('--continue=')) {
        continueSkills.push(...splitCommaValues(token.slice('--continue='.length)));
        continue;
      }

      if (token === '--continue') {
        const nextValue = args[i + 1];
        if (nextValue) {
          continueSkills.push(...splitCommaValues(nextValue));
          i++;
        }
        continue;
      }

      if (token.startsWith('--merge=')) {
        mergeInto.push(...parseMergeItems(token.slice('--merge='.length)));
        continue;
      }

      if (token === '--merge') {
        const nextValue = args[i + 1];
        if (nextValue) {
          mergeInto.push(...parseMergeItems(nextValue));
          i++;
        }
      }
    }

    return {
      continueSkills,
      mergeInto,
    };
  }

  private async getCreatedLabel(skill: SkillMeta): Promise<string> {
    if (skill.versions.length > 0) {
      return formatDateLabel(skill.versions[skill.versions.length - 1]!.createdAt);
    }

    const filesystemCreatedAt = await this.getFilesystemCreatedAt(skill.path);
    if (filesystemCreatedAt) {
      return formatDateLabel(filesystemCreatedAt);
    }

    if (skill.lastModified) {
      return formatDateLabel(skill.lastModified);
    }

    return 'N/A';
  }

  private getUpdatedLabel(versions: VersionInfo[]): string {
    if (versions.length === 0) return 'N/A';
    return formatDateLabel(versions[0]!.createdAt);
  }

  private async getFilesystemCreatedAt(skillPath: string): Promise<Date | null> {
    try {
      const stat = await fsp.stat(skillPath);
      if (Number.isFinite(stat.birthtime.getTime())) {
        return stat.birthtime;
      }
      if (Number.isFinite(stat.ctime.getTime())) {
        return stat.ctime;
      }
    } catch {
      return null;
    }
    return null;
  }

  private unknownCommand(command: string): CommandResult {
    return {
      stdout: '',
      stderr: `Unknown skill command: ${command}\nAvailable: skill:load <name>, skill:list, skill:info <name>, skill:import <source>, skill:rollback <name> [version], skill:delete <name>`,
      exitCode: 1,
    };
  }

  private errorResult(error: unknown, fallbackPrefix: string): CommandResult {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(fallbackPrefix, { error: message });
    return {
      stdout: '',
      stderr: message,
      exitCode: 1,
    };
  }
}

function splitCommaValues(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseMergeItems(value: string): MergeIntoOption[] {
  const items = splitCommaValues(value);
  const merge: MergeIntoOption[] = [];

  for (const item of items) {
    const [source, target] = item.split(':');
    if (!source || !target) continue;
    merge.push({
      source: source.trim(),
      target: target.trim(),
    });
  }

  return merge;
}

function formatDateLabel(date: Date | string): string {
  const rawDate = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(rawDate.getTime())) {
    return 'N/A';
  }
  return rawDate.toISOString().replace('T', ' ').replace('Z', ' UTC');
}

export default SkillCommandHandler;
