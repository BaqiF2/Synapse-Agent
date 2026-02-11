/**
 * 文件功能说明：
 * - 该文件位于 `src/tools/converters/skill/skill-initializer.ts`，主要负责 技能、初始化 相关实现。
 * - 模块归属 工具、转换器、技能 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `initializeSkillTools`
 * - `cleanupSkillTools`
 * - `refreshSkillTools`
 * - `SkillInitResult`
 * - `SkillsInitResult`
 * - `SkillInitOptions`
 *
 * 作用说明：
 * - `initializeSkillTools`：用于初始化运行环境或模块状态。
 * - `cleanupSkillTools`：用于清理资源并回收状态。
 * - `refreshSkillTools`：用于刷新状态并重新加载数据。
 * - `SkillInitResult`：定义模块交互的数据结构契约。
 * - `SkillsInitResult`：定义模块交互的数据结构契约。
 * - `SkillInitOptions`：定义模块交互的数据结构契约。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { SkillStructure, type SkillEntry } from './skill-structure.js';
import { SkillWrapperGenerator } from './wrapper-generator.js';
import { MetaSkillInstaller } from '../../../skills/meta-skill-installer.js';
import { createLogger } from '../../../utils/logger.js';

const logger = createLogger('skill-init');

/**
 * Extract error message from unknown error
 * @param error 错误对象。
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Clean up orphaned skill tools that no longer have corresponding skill directories
 * @param binDir 输入参数。
 * @param activeSkills 集合数据。
 */
function cleanupOrphanedTools(binDir: string, activeSkills: SkillEntry[]): void {
  if (!fs.existsSync(binDir)) {
    return;
  }

  const activeSkillNames = new Set(activeSkills.map((s) => s.name));
  const existingFiles = fs.readdirSync(binDir);
  let removedCount = 0;

  for (const file of existingFiles) {
    if (!file.startsWith('skill:')) {
      continue;
    }

    const skillName = file.split(':')[1];
    if (skillName && !activeSkillNames.has(skillName)) {
      try {
        fs.unlinkSync(path.join(binDir, file));
        removedCount++;
        logger.debug(`Removed orphaned skill tool: ${file}`);
      } catch (error) {
        logger.warn(`Failed to remove orphaned tool ${file}: ${error}`);
      }
    }
  }

  if (removedCount > 0) {
    logger.info(`Cleaned up ${removedCount} orphaned skill tool(s)`);
  }
}

/**
 * Result of Skill tool initialization for a single skill
 */
export interface SkillInitResult {
  skillName: string;
  toolCount: number;
  installedTools: string[];
  errors: string[];
}

/**
 * Overall result of Skill initialization
 */
export interface SkillsInitResult {
  success: boolean;
  totalSkills: number;
  totalToolsInstalled: number;
  skillResults: SkillInitResult[];
  errors: string[];
}

/**
 * Options for Skill initialization
 */
export interface SkillInitOptions {
  /** Force reinstall even if tools already exist */
  forceReinstall?: boolean;
}

/**
 * Initialize Skill tools from ~/.synapse/skills directory
 *
 * This function performs the following steps:
 * 1. Discover skills in ~/.synapse/skills
 * 2. Parse script docstrings to extract metadata
 * 3. Generate Bash wrapper scripts for each skill script
 * 4. Install wrapper scripts to ~/.synapse/bin/
 *
 * @param options - Initialization options
 * @returns Initialization result
 * @param _options 配置参数。
 */
export async function initializeSkillTools(_options: SkillInitOptions = {}): Promise<SkillsInitResult> {
  const result: SkillsInitResult = {
    success: true,
    totalSkills: 0,
    totalToolsInstalled: 0,
    skillResults: [],
    errors: [],
  };

  // Install meta skills if missing
  try {
    const metaInstaller = new MetaSkillInstaller();
    const metaResult = metaInstaller.installIfMissing();
    if (metaResult.installed.length > 0) {
      logger.info(`Installed ${metaResult.installed.length} meta skill(s)`, {
        skills: metaResult.installed,
      });
    }
  } catch (error) {
    const msg = getErrorMessage(error);
    logger.warn('Failed to install meta skills', { error: msg });
    // Don't fail initialization if meta skills can't be installed
  }

  const structure = new SkillStructure();
  const generator = new SkillWrapperGenerator();

  // Ensure bin directory exists
  generator.ensureBinDir();

  // Step 1: Discover skills
  let skills: SkillEntry[];
  try {
    skills = structure.listSkills();
  } catch (error) {
    const msg = getErrorMessage(error);
    result.errors.push(`Failed to list skills: ${msg}`);
    result.success = false;
    logger.error(`Failed to list skills: ${msg}`);
    return result;
  }

  result.totalSkills = skills.length;

  if (skills.length === 0) {
    logger.info('No skills found in skills directory');
    return result;
  }

  logger.info(`Found ${skills.length} skill(s) in skills directory`);

  // Step 2: Clean up orphaned skill tools
  cleanupOrphanedTools(generator.getBinDir(), skills);

  // Step 3: Process each skill
  for (const skill of skills) {
    const skillResult = processSkill(skill, generator);
    result.skillResults.push(skillResult);
    result.totalToolsInstalled += skillResult.installedTools.length;

    if (skillResult.errors.length > 0) {
      result.errors.push(...skillResult.errors.map((e) => `${skill.name}: ${e}`));
    }
  }

  // Log summary
  logger.info(
    `Skill initialization complete: ${result.totalSkills} skill(s), ` +
      `${result.totalToolsInstalled} tool(s) installed`
  );

  return result;
}

/**
 * Process a single skill: discover scripts, generate and install wrappers
 * @param skill 输入参数。
 * @param generator 输入参数。
 */
function processSkill(skill: SkillEntry, generator: SkillWrapperGenerator): SkillInitResult {
  const result: SkillInitResult = {
    skillName: skill.name,
    toolCount: 0,
    installedTools: [],
    errors: [],
  };

  logger.debug(`Processing skill: ${skill.name}`);

  try {
    // Generate wrappers for all scripts in the skill
    const wrappers = generator.generateWrappersForSkill(skill.name);
    result.toolCount = wrappers.length;

    if (wrappers.length === 0) {
      logger.debug(`No valid scripts found in skill: ${skill.name}`);
      return result;
    }

    // Install each wrapper
    for (const wrapper of wrappers) {
      const installResult = generator.install(wrapper);

      if (installResult.success) {
        result.installedTools.push(wrapper.commandName);
        logger.debug(`Installed: ${wrapper.commandName}`);
      } else {
        const errorMsg = `Failed to install ${wrapper.commandName}: ${installResult.error}`;
        result.errors.push(errorMsg);
        logger.warn(errorMsg);
      }
    }
  } catch (error) {
    const msg = getErrorMessage(error);
    result.errors.push(`Error processing skill: ${msg}`);
    logger.error(`Error processing skill ${skill.name}: ${msg}`);
  }

  return result;
}

/**
 * Remove all installed Skill tools
 *
 * @returns Number of tools removed
 */
export function cleanupSkillTools(): number {
  const generator = new SkillWrapperGenerator();
  const binDir = generator.getBinDir();

  if (!fs.existsSync(binDir)) {
    return 0;
  }

  const files = fs.readdirSync(binDir);
  let removed = 0;

  for (const file of files) {
    if (file.startsWith('skill:')) {
      const filePath = path.join(binDir, file);
      try {
        fs.unlinkSync(filePath);
        removed++;
      } catch {
        // Ignore removal errors
      }
    }
  }

  logger.info(`Cleaned up ${removed} skill tool(s)`);
  return removed;
}

/**
 * Refresh Skill tools by cleaning up and reinitializing
 *
 * @param options - Initialization options
 * @returns Initialization result
 */
export async function refreshSkillTools(options: SkillInitOptions = {}): Promise<SkillsInitResult> {
  cleanupSkillTools();
  return initializeSkillTools({ ...options, forceReinstall: true });
}

// Default export
export default initializeSkillTools;
