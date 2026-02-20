/**
 * Skill Command Write Handlers
 *
 * 处理写入 skill 命令：skill:import, skill:rollback, skill:delete。
 * 从 SkillCommandHandler 中提取，作为写入操作的专职子处理器。
 *
 * 核心导出：
 * - handleImport: 导入技能
 * - handleRollback: 回滚版本
 * - handleDelete: 删除技能
 * - parseImportOptions: 解析导入选项
 */

import { parseCommandArgs } from './agent-bash/command-utils.ts';
import { createLogger } from '../../utils/logger.ts';
import type { SkillManager } from '../../skills/skill-manager.js';
import type { ISkillMetadataService } from '../../skills/skill-metadata-service.js';
import type { ImportOptions, MergeIntoOption } from '../../skills/types.js';
import type { CommandResult } from './native-command-handler.ts';
import { formatDateLabel } from './skill-command-read-handlers.ts';

const logger = createLogger('skill-write-handlers');

/** 处理 skill:import 命令 */
export async function handleImport(
  command: string,
  getManager: () => SkillManager,
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
    if (lines.length === 0) lines.push('Import completed. No skills found.');

    return { stdout: lines.join('\n'), stderr: '', exitCode: 0 };
  } catch (error) {
    return errorResult(error, 'Failed to import skills');
  }
}

/** 处理 skill:rollback 命令 */
export async function handleRollback(
  command: string,
  getManager: () => SkillManager,
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
      lines.push(`请选择版本号重新执行: skill:rollback ${skillName} <version>`);

      return { stdout: lines.join('\n'), stderr: '', exitCode: 0 };
    }

    await manager.rollback(skillName, version);
    return { stdout: `Rollback completed: ${skillName} -> ${version}`, stderr: '', exitCode: 0 };
  } catch (error) {
    return errorResult(error, 'Rollback failed');
  }
}

/** 处理 skill:delete 命令 */
export async function handleDelete(
  command: string,
  getManager: () => SkillManager,
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
    return errorResult(error, 'Delete failed');
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

// --- 辅助函数 ---

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

function errorResult(error: unknown, fallbackPrefix: string): CommandResult {
  const message = error instanceof Error ? error.message : String(error);
  logger.warn(fallbackPrefix, { error: message });
  return { stdout: '', stderr: message, exitCode: 1 };
}
