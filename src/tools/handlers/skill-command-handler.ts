/**
 * Skill Command Handler
 *
 * 功能：处理 skill:load 命令，加载技能内容
 *
 * 核心导出：
 * - SkillCommandHandler: 技能加载命令处理器
 */

import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import type { CommandResult } from './base-bash-handler.ts';
import { createLogger } from '../../utils/logger.ts';

const logger = createLogger('skill-command-handler');

/**
 * 默认 Synapse 目录
 */
const DEFAULT_SYNAPSE_DIR = path.join(os.homedir(), '.synapse');

/**
 * SkillCommandHandler 配置选项
 */
export interface SkillCommandHandlerOptions {
  skillsDir?: string;
  synapseDir?: string;
}

/**
 * SkillCommandHandler - 处理 skill:load 命令
 */
export class SkillCommandHandler {
  private skillsDir: string;

  constructor(options: SkillCommandHandlerOptions = {}) {
    const synapseDir = options.synapseDir ?? DEFAULT_SYNAPSE_DIR;
    this.skillsDir = options.skillsDir ?? path.join(synapseDir, 'skills');
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

    // 读取技能内容
    const skillPath = path.join(this.skillsDir, skillName, 'SKILL.md');

    if (!fs.existsSync(skillPath)) {
      return {
        stdout: '',
        stderr: `Skill '${skillName}' not found at ${skillPath}`,
        exitCode: 1,
      };
    }

    try {
      const content = fs.readFileSync(skillPath, 'utf-8');
      return {
        stdout: `# Skill: ${skillName}\n\n${content}`,
        stderr: '',
        exitCode: 0,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to read skill', { skillName, error: message });
      return {
        stdout: '',
        stderr: `Failed to load skill: ${message}`,
        exitCode: 1,
      };
    }
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
