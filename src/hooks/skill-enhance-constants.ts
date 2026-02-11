/**
 * 文件功能说明：
 * - 该文件位于 `src/hooks/skill-enhance-constants.ts`，主要负责 技能、增强、常量 相关实现。
 * - 模块归属 Hook 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `isSkillEnhanceCommand`
 * - `SKILL_ENHANCE_PROGRESS_TEXT`
 *
 * 作用说明：
 * - `isSkillEnhanceCommand`：用于条件判断并返回布尔结果。
 * - `SKILL_ENHANCE_PROGRESS_TEXT`：提供可复用的常量配置。
 */

export const SKILL_ENHANCE_PROGRESS_TEXT = 'Analyzing skill enhancement...';

const SKILL_ENHANCE_COMMAND_PATTERN = /^task:skill:enhance(?:\s|$)/i;

/**
 * 方法说明：判断 isSkillEnhanceCommand 对应条件是否成立。
 * @param command 输入参数。
 */
export function isSkillEnhanceCommand(command: string): boolean {
  return SKILL_ENHANCE_COMMAND_PATTERN.test(command.trim());
}
