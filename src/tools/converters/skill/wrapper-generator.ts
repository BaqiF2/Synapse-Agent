/**
 * 文件功能说明：
 * - 该文件位于 `src/tools/converters/skill/wrapper-generator.ts`，主要负责 封装、generator 相关实现。
 * - 模块归属 工具、转换器、技能 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `SkillWrapperGenerator`
 * - `GeneratedSkillWrapper`
 * - `SkillInstallResult`
 *
 * 作用说明：
 * - `SkillWrapperGenerator`：封装该领域的核心流程与状态管理。
 * - `GeneratedSkillWrapper`：定义模块交互的数据结构契约。
 * - `SkillInstallResult`：声明类型别名，约束输入输出类型。
 */

import * as os from 'node:os';
import type { ScriptMetadata, ScriptParam } from './skill-structure.js';
import { DocstringParser } from './docstring-parser.js';
import { SkillStructure } from './skill-structure.js';
import { BinInstaller, type InstallResult } from '../shared/bin-installer.ts';
import { generateBriefHelp, generateDetailedHelp, type HelpParam } from '../shared/help-generator.ts';
import { getInterpreter } from '../shared/interpreter.ts';

/** 安装结果（兼容旧接口名称） */
export type SkillInstallResult = InstallResult;

/** 生成的 wrapper 元数据 */
export interface GeneratedSkillWrapper {
  commandName: string;
  skillName: string;
  toolName: string;
  wrapperPath: string;
  scriptPath: string;
  content: string;
  description?: string;
}

/**
 * SkillWrapperGenerator — Skill 工具 wrapper 脚本生成器
 *
 * 为每个 Skill 脚本生成：
 * - CLI 参数解析
 * - -h / --help 帮助信息
 * - 使用合适解释器调用原始脚本
 */
export class SkillWrapperGenerator {
  private readonly bin: BinInstaller;
  private readonly parser: DocstringParser;
  private readonly structure: SkillStructure;

  /**
   * 方法说明：初始化 SkillWrapperGenerator 实例并设置初始状态。
   * @param homeDir 输入参数。
   */
  constructor(homeDir: string = os.homedir()) {
    this.bin = new BinInstaller(homeDir);
    this.parser = new DocstringParser();
    this.structure = new SkillStructure(homeDir);
  }

  /**
   * 方法说明：读取并返回 getBinDir 对应的数据。
   */
  public getBinDir(): string {
    return this.bin.getBinDir();
  }

  /**
   * 方法说明：执行 ensureBinDir 相关逻辑。
   */
  public ensureBinDir(): void {
    this.bin.ensureBinDir();
  }

  /** 为单个脚本生成 wrapper
   * @param skillName 输入参数。
   * @param scriptPath 目标路径或文件信息。
   */
  public generateWrapper(skillName: string, scriptPath: string): GeneratedSkillWrapper | null {
    const metadata = this.parser.parseFile(scriptPath);
    if (!metadata) return null;

    const commandName = `skill:${skillName}:${metadata.name}`;
    const content = this.generateScriptContent(skillName, metadata);
    const wrapperPath = this.bin.getFilePath(commandName);

    return { commandName, skillName, toolName: metadata.name, wrapperPath, scriptPath, content, description: metadata.description };
  }

  /** 为 Skill 中所有脚本生成 wrapper
   * @param skillName 输入参数。
   */
  public generateWrappersForSkill(skillName: string): GeneratedSkillWrapper[] {
    const scripts = this.structure.listScripts(skillName);
    const wrappers: GeneratedSkillWrapper[] = [];
    for (const scriptPath of scripts) {
      const wrapper = this.generateWrapper(skillName, scriptPath);
      if (wrapper) wrappers.push(wrapper);
    }
    return wrappers;
  }

  /** 为所有 Skill 生成 wrapper */
  public generateAllWrappers(): Map<string, GeneratedSkillWrapper[]> {
    const result = new Map<string, GeneratedSkillWrapper[]>();
    const skills = this.structure.listSkills();
    for (const skill of skills) {
      const wrappers = this.generateWrappersForSkill(skill.name);
      if (wrappers.length > 0) result.set(skill.name, wrappers);
    }
    return result;
  }

  /** 安装单个 wrapper
   * @param wrapper 输入参数。
   */
  public install(wrapper: GeneratedSkillWrapper): SkillInstallResult {
    return this.bin.install({
      commandName: wrapper.commandName,
      content: wrapper.content,
      targetPath: wrapper.wrapperPath,
    });
  }

  /** 批量安装 wrapper
   * @param wrappers 集合数据。
   */
  public installAll(wrappers: GeneratedSkillWrapper[]): SkillInstallResult[] {
    return wrappers.map((w) => this.install(w));
  }

  /** 移除指定命令名称的 wrapper
   * @param commandName 输入参数。
   */
  public remove(commandName: string): boolean {
    return this.bin.remove(commandName);
  }

  /** 移除某 Skill 的所有 wrapper
   * @param skillName 输入参数。
   */
  public removeBySkill(skillName: string): number {
    return this.bin.removeByPrefix(`skill:${skillName}:`);
  }

  // -- 私有方法 --

  /** 将 ScriptParam 转为 HelpParam
   * @param params 集合数据。
   */
  private toHelpParams(params: ScriptParam[]): HelpParam[] {
    return params.map((p) => ({
      name: p.name,
      type: p.type,
      description: p.description,
      required: p.required,
      defaultValue: p.default,
    }));
  }

  /** 生成 wrapper 脚本内容
   * @param skillName 输入参数。
   * @param metadata 输入参数。
   */
  private generateScriptContent(skillName: string, metadata: ScriptMetadata): string {
    const params = metadata.params || [];
    const helpParams = this.toHelpParams(params);
    const commandName = `skill:${skillName}:${metadata.name}`;

    const briefHelp = generateBriefHelp({ commandName, description: metadata.description, params: helpParams });
    const detailedHelp = generateDetailedHelp({
      commandName,
      description: metadata.description,
      params: helpParams,
      examples: metadata.examples || [],
    });
    const interpreter = getInterpreter(metadata.extension);

    return `#!/usr/bin/env bun
/**
 * Skill Tool Wrapper: ${commandName}
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
  }
}

export default SkillWrapperGenerator;
