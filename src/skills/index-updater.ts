/**
 * 文件功能说明：
 * - 该文件位于 `src/skills/index-updater.ts`，主要负责 索引、updater 相关实现。
 * - 模块归属 skills 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `SkillIndexUpdater`
 *
 * 作用说明：
 * - `SkillIndexUpdater`：聚合并对外暴露其它模块的能力。
 */

export { SkillIndexer as SkillIndexUpdater } from './indexer.ts';
