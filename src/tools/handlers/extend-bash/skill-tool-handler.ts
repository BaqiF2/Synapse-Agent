/**
 * Skill Tool Command Handler
 *
 * 处理 skill:<skill>:<tool> 格式的技能工具执行命令。
 * 负责技能脚本查找、解释器选择和脚本执行。
 *
 * 核心导出：
 * - SkillToolHandler: 技能工具命令处理器，实现 extend Shell command 的 Skill 路由
 */

import type { CommandResult } from '../native-command-handler.ts';
import { parseColonCommand } from '../agent-bash/command-utils.ts';
import { SkillStructure, DocstringParser } from '../../converters/skill/index.ts';
import { getInterpreterForPath } from '../../converters/shared/interpreter.ts';

const SKILL_FORMAT_ERROR = 'Invalid skill command format. Expected: skill:<skill>:<tool> [args...]';

/** 脚本执行缓冲区大小上限 (10MB) */
const SCRIPT_MAX_BUFFER = 10 * 1024 * 1024;

/**
 * 创建错误结果的辅助函数
 */
function errorResult(message: string): CommandResult {
  return { stdout: '', stderr: message, exitCode: 1 };
}

/**
 * 技能工具命令处理器
 *
 * 处理 skill:<skill>:<tool> [args...] 格式的命令，
 * 查找对应脚本并使用合适的解释器执行。
 */
export class SkillToolHandler {
  /**
   * 执行技能工具命令
   *
   * @param command - 完整命令字符串，如 skill:analyzer:run --input=file.txt
   */
  async execute(command: string): Promise<CommandResult> {
    const parsed = parseColonCommand(command);
    if (!parsed) {
      return errorResult(SKILL_FORMAT_ERROR);
    }

    const { name: skillName, toolName, args } = parsed;

    // 帮助信息处理
    if (args.includes('-h') || args.includes('--help')) {
      return this.handleHelp(skillName, toolName, args);
    }

    // 查找并执行脚本
    return this.findAndExecuteScript(skillName, toolName, args);
  }

  /**
   * 处理 -h / --help 请求
   */
  private async handleHelp(
    skillName: string,
    toolName: string,
    args: string[],
  ): Promise<CommandResult> {
    const helpFlag = args.includes('--help') ? '--help' : '-h';
    const wrapperPath = `${process.env.HOME}/.synapse/bin/skill:${skillName}:${toolName}`;
    const fs = await import('fs');

    if (fs.existsSync(wrapperPath)) {
      const { execSync } = await import('child_process');
      try {
        const output = execSync(`bun "${wrapperPath}" ${helpFlag}`, { encoding: 'utf-8' });
        return { stdout: output, stderr: '', exitCode: 0 };
      } catch {
        // 如果 wrapper 执行失败，继续使用通用帮助
      }
    }

    return {
      stdout: `Usage: skill:${skillName}:${toolName} [args...]\nUse command:search "skill:${skillName}:${toolName}" for more info.`,
      stderr: '',
      exitCode: 0,
    };
  }

  /**
   * 查找匹配的技能脚本并执行
   */
  private async findAndExecuteScript(
    skillName: string,
    toolName: string,
    args: string[],
  ): Promise<CommandResult> {
    const structure = new SkillStructure();
    const scripts = structure.listScripts(skillName);

    if (scripts.length === 0) {
      return errorResult(`Skill '${skillName}' not found or has no scripts`);
    }

    // 查找匹配的脚本
    const parser = new DocstringParser();
    let targetScript: string | null = null;

    for (const scriptPath of scripts) {
      const metadata = parser.parseFile(scriptPath);
      if (metadata && metadata.name === toolName) {
        targetScript = scriptPath;
        break;
      }
    }

    if (!targetScript) {
      return errorResult(`Tool '${toolName}' not found in skill '${skillName}'`);
    }

    return this.executeScript(targetScript, args);
  }

  /**
   * 使用合适的解释器执行脚本
   */
  private async executeScript(scriptPath: string, args: string[]): Promise<CommandResult> {
    const interpreter = getInterpreterForPath(scriptPath);

    try {
      const { execSync } = await import('child_process');
      const quotedArgs = args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(' ');
      const output = execSync(`${interpreter} "${scriptPath}" ${quotedArgs}`, {
        encoding: 'utf-8',
        env: process.env,
        maxBuffer: SCRIPT_MAX_BUFFER,
      });

      return {
        stdout: output,
        stderr: '',
        exitCode: 0,
      };
    } catch (error) {
      if (error && typeof error === 'object' && 'stdout' in error && 'stderr' in error) {
        const execError = error as { stdout: string; stderr: string; status: number };
        return {
          stdout: execError.stdout || '',
          stderr: execError.stderr || '',
          exitCode: execError.status || 1,
        };
      }
      return errorResult(`Skill command failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
