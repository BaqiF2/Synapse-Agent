/**
 * Skill Command Handler
 *
 * 功能：处理 skill:load 命令，使用 SkillLoader 加载技能内容
 *
 * 核心导出：
 * - SkillCommandHandler: 技能加载命令处理器，内部使用 SkillLoader 实现带缓存的技能加载
 */

import * as os from 'node:os';
import type { CommandResult } from './base-bash-handler.ts';
import { createLogger } from '../../utils/logger.ts';
import { SkillLoader } from '../../skills/skill-loader.js';

const logger = createLogger('skill-command-handler');

/**
 * SkillCommandHandler 配置选项
 */
export interface SkillCommandHandlerOptions {
  /** 用户主目录，默认 os.homedir() */
  homeDir?: string;
}

/**
 * SkillCommandHandler - 处理 skill:load 命令
 */
export class SkillCommandHandler {
  private skillLoader: SkillLoader;

  constructor(options: SkillCommandHandlerOptions = {}) {
    const homeDir = options.homeDir ?? os.homedir();
    this.skillLoader = new SkillLoader(homeDir);
  }

  /**
   * 执行 skill 命令
   */
  async execute(command: string): Promise<CommandResult> {
    const trimmed = command.trim();

    // 解析命令
    if (trimmed.startsWith('skill:load')) {
      return this.handleLoad(trimmed);
    }

    // 未知命令
    return {
      stdout: '',
      stderr: `Unknown skill command: ${command}\nAvailable: skill:load <name>`,
      exitCode: 1,
    };
  }

  /**
   * 处理 skill:load 命令
   */
  private handleLoad(command: string): CommandResult {
    // 解析技能名称
    const parts = this.tokenize(command);
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

    // 使用 SkillLoader 加载技能
    const skill = this.skillLoader.loadLevel2(skillName);

    if (!skill) {
      logger.warn('Skill not found', { skillName });
      return {
        stdout: '',
        stderr: `Skill '${skillName}' not found`,
        exitCode: 1,
      };
    }

    // 检查是否有 SKILL.md 内容
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

  /**
   * 分词（支持引号）
   */
  private tokenize(command: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuote: string | null = null;

    for (let i = 0; i < command.length; i++) {
      const char = command[i];

      if (inQuote) {
        if (char === inQuote) {
          inQuote = null;
        } else {
          current += char;
        }
      } else if (char === '"' || char === "'") {
        inQuote = char;
      } else if (char === ' ' || char === '\t') {
        if (current) {
          tokens.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current) {
      tokens.push(current);
    }

    return tokens;
  }

  /**
   * 关闭处理器
   */
  shutdown(): void {
    // 无需清理
  }
}

export default SkillCommandHandler;
