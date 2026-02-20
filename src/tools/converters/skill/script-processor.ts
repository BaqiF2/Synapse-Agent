/**
 * 技能脚本处理器
 *
 * 负责处理单个脚本文件的 wrapper 生成、技能目录批量处理以及 wrapper 移除。
 * 从 watcher.ts 中提取，使文件监听与脚本处理职责分离。
 *
 * 核心导出:
 * - SkillScriptProcessor: 技能脚本的 wrapper 生成与管理
 * - ProcessResult: 脚本处理结果接口
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { SUPPORTED_EXTENSIONS } from './skill-structure.js';
import type { SupportedExtension } from './skill-structure.js';
import { SkillWrapperGenerator } from './wrapper-generator.js';
import { createLogger } from '../../../utils/logger.ts';

const logger = createLogger('skill-script-processor');

/**
 * Scripts 子目录名
 */
const SCRIPTS_DIR = 'scripts';

/**
 * 脚本处理结果
 */
export interface ProcessResult {
  success: boolean;
  skillName: string;
  toolName?: string;
  wrapperPath?: string;
  error?: string;
}

/**
 * SkillScriptProcessor
 *
 * 处理技能脚本文件：验证、生成 wrapper、安装 wrapper 以及批量处理。
 */
export class SkillScriptProcessor {
  private readonly skillsDir: string;
  private readonly generator: SkillWrapperGenerator;

  constructor(skillsDir: string, generator: SkillWrapperGenerator) {
    this.skillsDir = skillsDir;
    this.generator = generator;
  }

  /**
   * 处理单个脚本文件并生成 wrapper
   *
   * @param scriptPath - 脚本文件完整路径
   * @param skillName - 脚本所属技能名称
   * @returns 处理结果
   */
  public async processScript(scriptPath: string, skillName: string): Promise<ProcessResult> {
    try {
      if (!fs.existsSync(scriptPath)) {
        return {
          success: false,
          skillName,
          error: `Script file not found: ${scriptPath}`,
        };
      }

      const ext = path.extname(scriptPath) as SupportedExtension;
      if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        return {
          success: false,
          skillName,
          error: `Unsupported extension: ${ext}`,
        };
      }

      const wrapper = this.generator.generateWrapper(skillName, scriptPath);
      if (!wrapper) {
        // 脚本没有元数据时，创建基础 wrapper
        const scriptName = path.basename(scriptPath, ext);

        logger.debug('Script has no metadata, creating basic wrapper', {
          path: scriptPath,
          skill: skillName,
          tool: scriptName,
        });

        const commandName = `skill:${skillName}:${scriptName}`;
        return {
          success: true,
          skillName,
          toolName: scriptName,
          wrapperPath: path.join(this.generator.getBinDir(), commandName),
        };
      }

      const result = this.generator.install(wrapper);

      if (result.success) {
        logger.info('Wrapper installed', {
          skill: skillName,
          tool: wrapper.toolName,
          path: result.path,
        });
        return {
          success: true,
          skillName,
          toolName: wrapper.toolName,
          wrapperPath: result.path,
        };
      } else {
        return {
          success: false,
          skillName,
          toolName: wrapper.toolName,
          error: result.error,
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to process script', { path: scriptPath, error: message });
      return {
        success: false,
        skillName,
        error: message,
      };
    }
  }

  /**
   * 处理某个技能目录下的所有脚本
   *
   * @param skillName - 技能名称
   * @returns 处理结果数组
   */
  public async processNewSkill(skillName: string): Promise<ProcessResult[]> {
    const scriptsDir = path.join(this.skillsDir, skillName, SCRIPTS_DIR);
    const results: ProcessResult[] = [];

    if (!fs.existsSync(scriptsDir)) {
      logger.debug('No scripts directory for skill', { skill: skillName });
      return results;
    }

    try {
      const files = fs.readdirSync(scriptsDir);

      for (const file of files) {
        const ext = path.extname(file) as SupportedExtension;
        if (!SUPPORTED_EXTENSIONS.includes(ext)) {
          continue;
        }

        const scriptPath = path.join(scriptsDir, file);
        const stat = fs.statSync(scriptPath);

        if (stat.isFile()) {
          const result = await this.processScript(scriptPath, skillName);
          results.push(result);
        }
      }

      logger.info('Processed new skill', {
        skill: skillName,
        scripts: results.length,
        success: results.filter(r => r.success).length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to process skill', { skill: skillName, error: message });
    }

    return results;
  }

  /**
   * 移除某个技能的所有 wrapper
   *
   * @param skillName - 技能名称
   * @returns 移除的 wrapper 数量
   */
  public async removeSkillWrappers(skillName: string): Promise<number> {
    const removed = this.generator.removeBySkill(skillName);

    if (removed > 0) {
      logger.info('Removed skill wrappers', { skill: skillName, count: removed });
    }

    return removed;
  }
}
