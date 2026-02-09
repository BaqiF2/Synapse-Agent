/**
 * Skill Enhance 相关共享常量与工具函数
 *
 * 核心导出：
 * - SKILL_ENHANCE_PROGRESS_TEXT: 技能增强进度提示文本
 * - isSkillEnhanceCommand: 判断命令是否为 skill enhance 命令
 */

export const SKILL_ENHANCE_PROGRESS_TEXT = 'Analyzing skill enhancement...';

const SKILL_ENHANCE_COMMAND_PATTERN = /^task:skill:enhance(?:\s|$)/i;

export function isSkillEnhanceCommand(command: string): boolean {
  return SKILL_ENHANCE_COMMAND_PATTERN.test(command.trim());
}
