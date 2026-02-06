/**
 * Skill Enhance 相关共享常量与工具函数
 */

export const SKILL_ENHANCE_PROGRESS_TEXT = 'Analyzing skill enhancement...';

const SKILL_ENHANCE_COMMAND_PATTERN = /^task:skill:enhance(?:\s|$)/i;

export function isSkillEnhanceCommand(command: string): boolean {
  return SKILL_ENHANCE_COMMAND_PATTERN.test(command.trim());
}
