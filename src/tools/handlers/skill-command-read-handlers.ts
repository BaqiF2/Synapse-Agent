/**
 * Skill Command Read Handlers
 *
 * 处理只读 skill 命令：skill:load, skill:list, skill:info。
 * 从 SkillCommandHandler 中提取，作为只读操作的专职子处理器。
 *
 * 核心导出：
 * - handleLoad: 加载技能内容
 * - handleList: 列出所有技能
 * - handleInfo: 查看技能详情
 */

import { promises as fsp } from 'node:fs';
import { parseCommandArgs } from './agent-bash/command-utils.ts';
import { createLogger } from '../../utils/logger.ts';
import type { SkillLoader } from '../../skills/skill-loader.js';
import type { ISkillMetadataService } from '../../skills/skill-metadata-service.js';
import type { SkillMeta, VersionInfo } from '../../skills/types.js';
import type { CommandResult } from './native-command-handler.ts';

const logger = createLogger('skill-read-handlers');

/** 处理 skill:load 命令 */
export function handleLoad(command: string, skillLoader: SkillLoader): CommandResult {
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
    return errorResult(error, 'Failed to list skills');
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
    return errorResult(error, 'Failed to get skill info');
  }
}

// --- 辅助函数 ---

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

export function formatDateLabel(date: Date | string): string {
  const rawDate = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(rawDate.getTime())) return 'N/A';
  return rawDate.toISOString().replace('T', ' ').replace('Z', ' UTC');
}

function errorResult(error: unknown, fallbackPrefix: string): CommandResult {
  const message = error instanceof Error ? error.message : String(error);
  logger.warn(fallbackPrefix, { error: message });
  return { stdout: '', stderr: message, exitCode: 1 };
}
