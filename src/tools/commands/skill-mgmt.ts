/**
 * Skill Management Command Handler
 *
 * 技能管理命令的统一入口，合并了 skill-command-handler、
 * skill-command-read-handlers 和 skill-command-write-handlers。
 * 将各 skill:* 命令路由到对应的子处理逻辑。
 *
 * 通过接口抽象消除 tools→skills 跨层依赖：
 * 所有技能服务通过 ISkillLoader / ISkillManager / ISkillMetadataService 接口访问，
 * 具体实现由调用方（cli 层）通过依赖注入提供。
 *
 * 核心导出：
 * - SkillCommandHandler: 技能命令分发器
 * - SkillCommandHandlerOptions: 配置选项
 * - handleLoad / handleList / handleInfo: 只读操作处理函数
 * - handleImport / handleRollback / handleDelete: 写入操作处理函数
 * - parseImportOptions: 导入选项解析函数
 * - formatDateLabel: 日期格式化工具函数
 */

import * as os from 'node:os';
import { promises as fsp } from 'node:fs';
import type { CommandResult } from '../../types/tool.ts';
import { parseCommandArgs } from './command-utils.ts';
import { createLogger } from '../../shared/file-logger.ts';
import type { ISubAgentExecutor } from '../../types/sub-agent.ts';
import type {
  ISkillLoader,
  ISkillManager,
  ISkillMetadataService,
  ISkillMerger,
  SkillMeta,
  VersionInfo,
  ImportOptions,
  MergeIntoOption,
} from '../../types/skill.ts';

const logger = createLogger('skill-mgmt');

// ==================== 只读操作处理函数 ====================

/** 处理 skill:load 命令 */
export function handleLoad(command: string, skillLoader: ISkillLoader): CommandResult {
  const parts = parseCommandArgs(command);
  const skillName = parts[1];

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

  const skill = skillLoader.loadLevel2(skillName);
  if (!skill) {
    logger.warn('Skill not found', { skillName });
    return { stdout: '', stderr: `Skill '${skillName}' not found`, exitCode: 1 };
  }

  if (!skill.rawContent) {
    logger.warn('Skill SKILL.md not found', { skillName });
    return { stdout: '', stderr: `Skill '${skillName}' not found (missing SKILL.md)`, exitCode: 1 };
  }

  return { stdout: `# Skill: ${skillName}\n\n${skill.rawContent}`, stderr: '', exitCode: 0 };
}

/** 处理 skill:list 命令 */
export async function handleList(metadataService: ISkillMetadataService): Promise<CommandResult> {
  try {
    const skills = await metadataService.list();
    if (skills.length === 0) {
      return { stdout: 'No skills installed.', stderr: '', exitCode: 0 };
    }

    const lines = skills.map((skill: SkillMeta) => {
      const description = skill.description?.trim() || 'No description';
      return `${skill.name.padEnd(20)} - ${description} (${skill.versions.length} versions)`;
    });

    return { stdout: lines.join('\n'), stderr: '', exitCode: 0 };
  } catch (error) {
    return readErrorResult(error, 'Failed to list skills');
  }
}

/** 处理 skill:info 命令 */
export async function handleInfo(command: string, metadataService: ISkillMetadataService): Promise<CommandResult> {
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
    const skill = await metadataService.info(skillName);
    if (!skill) {
      return { stdout: '', stderr: `Skill '${skillName}' not found`, exitCode: 1 };
    }

    const created = await getCreatedLabel(skill);
    const updated = skill.lastModified ? formatDateLabel(skill.lastModified) : getUpdatedLabel(skill.versions);
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

    return { stdout: lines.join('\n'), stderr: '', exitCode: 0 };
  } catch (error) {
    return readErrorResult(error, 'Failed to get skill info');
  }
}

// ==================== 写入操作处理函数 ====================

/** 处理 skill:import 命令 */
export async function handleImport(
  command: string,
  getManager: () => ISkillManager,
): Promise<CommandResult> {
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
    const options = parseImportOptions(parts.slice(2));
    const manager = getManager();
    const result = await manager.import(source, options);
    const lines: string[] = [];

    if (result.imported.length > 0) lines.push(`Imported: ${result.imported.join(', ')}`);
    if (result.skipped.length > 0) lines.push(`Skipped: ${result.skipped.join(', ')}`);
    if (result.conflicts.length > 0) {
      lines.push('Conflicts:');
      for (const conflict of result.conflicts) lines.push(`  - ${conflict.name}`);
      lines.push('Please rename the conflicting skills in the source directory and re-import.');
    }
    if (result.similar.length > 0) {
      lines.push('Similar Skills:');
      for (const similar of result.similar) {
        lines.push(`  - ${similar.name} ~ ${similar.similarTo}: ${similar.reason}`);
        lines.push(`    --continue=${similar.name}`);
        lines.push(`    --merge=${similar.name}:${similar.similarTo}`);
      }
    }
    if (lines.length === 0) lines.push('Import completed. No skills found.');

    return { stdout: lines.join('\n'), stderr: '', exitCode: 0 };
  } catch (error) {
    return writeErrorResult(error, 'Failed to import skills');
  }
}

/** 处理 skill:rollback 命令 */
export async function handleRollback(
  command: string,
  getManager: () => ISkillManager,
  metadataService: ISkillMetadataService,
): Promise<CommandResult> {
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
    const manager = getManager();
    if (!version) {
      const versions = await metadataService.getVersions(skillName);
      if (versions.length === 0) {
        return { stdout: '', stderr: `No versions available for skill '${skillName}'`, exitCode: 1 };
      }

      const lines = [`Available versions for ${skillName}:`];
      for (let i = 0; i < versions.length; i++) {
        const item = versions[i]!;
        lines.push(`  ${i + 1}. ${item.version} (${formatDateLabel(item.createdAt)})`);
      }
      lines.push(`Select a version and re-run: skill:rollback ${skillName} <version>`);

      return { stdout: lines.join('\n'), stderr: '', exitCode: 0 };
    }

    await manager.rollback(skillName, version);
    return { stdout: `Rollback completed: ${skillName} -> ${version}`, stderr: '', exitCode: 0 };
  } catch (error) {
    return writeErrorResult(error, 'Rollback failed');
  }
}

/** 处理 skill:delete 命令 */
export async function handleDelete(
  command: string,
  getManager: () => ISkillManager,
): Promise<CommandResult> {
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
    const manager = getManager();
    await manager.delete(skillName);
    return { stdout: `Skill '${skillName}' deleted.`, stderr: '', exitCode: 0 };
  } catch (error) {
    return writeErrorResult(error, 'Delete failed');
  }
}

/** 解析 import 命令的选项参数 */
export function parseImportOptions(args: string[]): ImportOptions {
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
      if (nextValue) { continueSkills.push(...splitCommaValues(nextValue)); i++; }
      continue;
    }
    if (token.startsWith('--merge=')) {
      mergeInto.push(...parseMergeItems(token.slice('--merge='.length)));
      continue;
    }
    if (token === '--merge') {
      const nextValue = args[i + 1];
      if (nextValue) { mergeInto.push(...parseMergeItems(nextValue)); i++; }
    }
  }

  return { continueSkills, mergeInto };
}

// ==================== 辅助函数 ====================

export function formatDateLabel(date: Date | string): string {
  const rawDate = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(rawDate.getTime())) return 'N/A';
  return rawDate.toISOString().replace('T', ' ').replace('Z', ' UTC');
}

async function getCreatedLabel(skill: SkillMeta): Promise<string> {
  if (skill.versions.length > 0) {
    return formatDateLabel(skill.versions[skill.versions.length - 1]!.createdAt);
  }

  const filesystemCreatedAt = await getFilesystemCreatedAt(skill.path);
  if (filesystemCreatedAt) return formatDateLabel(filesystemCreatedAt);
  if (skill.lastModified) return formatDateLabel(skill.lastModified);
  return 'N/A';
}

function getUpdatedLabel(versions: VersionInfo[]): string {
  if (versions.length === 0) return 'N/A';
  return formatDateLabel(versions[0]!.createdAt);
}

async function getFilesystemCreatedAt(skillPath: string): Promise<Date | null> {
  try {
    const stat = await fsp.stat(skillPath);
    if (Number.isFinite(stat.birthtime.getTime())) return stat.birthtime;
    if (Number.isFinite(stat.ctime.getTime())) return stat.ctime;
  } catch {
    return null;
  }
  return null;
}

function splitCommaValues(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function parseMergeItems(value: string): MergeIntoOption[] {
  const items = splitCommaValues(value);
  const merge: MergeIntoOption[] = [];
  for (const item of items) {
    const [source, target] = item.split(':');
    if (!source || !target) continue;
    merge.push({ source: source.trim(), target: target.trim() });
  }
  return merge;
}

function readErrorResult(error: unknown, fallbackPrefix: string): CommandResult {
  const message = error instanceof Error ? error.message : String(error);
  logger.warn(fallbackPrefix, { error: message });
  return { stdout: '', stderr: message, exitCode: 1 };
}

function writeErrorResult(error: unknown, fallbackPrefix: string): CommandResult {
  const message = error instanceof Error ? error.message : String(error);
  logger.warn(fallbackPrefix, { error: message });
  return { stdout: '', stderr: message, exitCode: 1 };
}

// ==================== SkillCommandHandler ====================

/** SkillCommandHandler 配置选项 */
export interface SkillCommandHandlerOptions {
  homeDir?: string;
  /** SubAgentManager 工厂函数，解耦循环依赖 */
  createSubAgentManager?: () => ISubAgentExecutor;
  /** 技能加载器（由调用方注入，未注入时 skill:load 返回错误） */
  skillLoader?: ISkillLoader;
  /** 技能管理器（可选，惰性创建需提供 skillManagerFactory） */
  skillManager?: ISkillManager;
  /** 技能元数据服务（由调用方注入，未注入时 skill:list/info 返回空） */
  metadataService?: ISkillMetadataService;
  /** 技能合并器（直接注入） */
  skillMerger?: ISkillMerger;
  /** 技能合并器工厂（当提供 createSubAgentManager 时自动创建合并器） */
  skillMergerFactory?: (subAgentExecutor: ISubAgentExecutor | null) => ISkillMerger;
  /** 技能管理器工厂（惰性创建用） */
  skillManagerFactory?: () => ISkillManager;
}

/** 命令路由条目 */
interface SkillSubcommand {
  prefix: string;
  handle: (command: string) => CommandResult | Promise<CommandResult>;
}

/** 当未注入技能加载器时使用的空实现 */
const NOOP_SKILL_LOADER: ISkillLoader = {
  loadLevel2: () => null,
};

/** 当未注入元数据服务时使用的空实现 */
const NOOP_METADATA_SERVICE: ISkillMetadataService = {
  list: async () => [],
  info: async () => null,
  getVersions: async () => [],
};

/**
 * SkillCommandHandler - 技能命令分发器
 *
 * 只读操作通过 ISkillMetadataService 接口查询，
 * 写入操作通过 ISkillManager（惰性创建）执行。
 * 所有技能服务通过接口注入，不直接依赖 skills/ 模块。
 */
export class SkillCommandHandler {
  private skillLoader: ISkillLoader;
  private metadataService: ISkillMetadataService;
  private skillManager: ISkillManager | null;
  private skillMerger: ISkillMerger | null;
  private subAgentManager: ISubAgentExecutor | null = null;
  private readonly homeDir: string;
  private readonly skillManagerFactory?: () => ISkillManager;
  private readonly subcommands: SkillSubcommand[];

  constructor(options: SkillCommandHandlerOptions = {}) {
    this.homeDir = options.homeDir ?? os.homedir();
    this.skillLoader = options.skillLoader ?? NOOP_SKILL_LOADER;
    this.skillManager = options.skillManager ?? null;
    // ISkillManager 继承 ISkillMetadataService，优先使用显式注入的 metadataService，
    // 其次使用 skillManager（兼容旧调用方式），最后降级为 NOOP
    this.metadataService = options.metadataService ?? options.skillManager ?? NOOP_METADATA_SERVICE;
    this.skillManagerFactory = options.skillManagerFactory;

    // 构建 skillMerger：优先直接注入，其次通过工厂 + createSubAgentManager 创建
    if (options.skillMerger) {
      this.skillMerger = options.skillMerger;
    } else if (options.skillMergerFactory) {
      const subAgent = options.createSubAgentManager?.() ?? null;
      this.skillMerger = options.skillMergerFactory(subAgent);
    } else {
      this.skillMerger = null;
    }

    if (options.createSubAgentManager) {
      this.subAgentManager = options.createSubAgentManager();
    }

    // 声明式子命令路由表（按优先级顺序匹配）
    this.subcommands = [
      { prefix: 'skill:load', handle: (cmd) => handleLoad(cmd, this.skillLoader) },
      { prefix: 'skill:list', handle: () => handleList(this.metadataService) },
      { prefix: 'skill:info', handle: (cmd) => handleInfo(cmd, this.metadataService) },
      { prefix: 'skill:import', handle: (cmd) => handleImport(cmd, () => this.getOrCreateSkillManager()) },
      { prefix: 'skill:rollback', handle: (cmd) => handleRollback(cmd, () => this.getOrCreateSkillManager(), this.metadataService) },
      { prefix: 'skill:delete', handle: (cmd) => handleDelete(cmd, () => this.getOrCreateSkillManager()) },
    ];
  }

  /** 执行 skill 命令 */
  async execute(command: string): Promise<CommandResult> {
    const trimmed = command.trim();
    for (const sub of this.subcommands) {
      if (trimmed.startsWith(sub.prefix)) {
        return sub.handle(trimmed);
      }
    }
    return this.unknownCommand(command);
  }

  getSkillMerger(): ISkillMerger | null { return this.skillMerger; }
  getSkillManager(): ISkillManager { return this.getOrCreateSkillManager(); }

  shutdown(): void { this.subAgentManager?.shutdown(); }

  private getOrCreateSkillManager(): ISkillManager {
    if (!this.skillManager) {
      if (!this.skillManagerFactory) {
        throw new Error('SkillManager not provided and no factory available');
      }
      this.skillManager = this.skillManagerFactory();
    }
    return this.skillManager;
  }

  private unknownCommand(command: string): CommandResult {
    return {
      stdout: '',
      stderr: `Unknown skill command: ${command}\nAvailable: skill:load <name>, skill:list, skill:info <name>, skill:import <source>, skill:rollback <name> [version], skill:delete <name>`,
      exitCode: 1,
    };
  }
}
