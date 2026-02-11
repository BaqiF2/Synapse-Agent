/**
 * 文件功能说明：
 * - 该文件位于 `src/tools/handlers/extend-bash/index.ts`，主要负责 索引 相关实现。
 * - 模块归属 工具、处理器、extend、Bash 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `CommandSearchHandler`
 * - `parseCommandSearchCommand`
 * - `ParsedCommandSearchCommand`
 * - `McpCommandHandler`
 * - `SkillToolHandler`
 *
 * 作用说明：
 * - `CommandSearchHandler`：聚合并对外暴露其它模块的能力。
 * - `parseCommandSearchCommand`：聚合并对外暴露其它模块的能力。
 * - `ParsedCommandSearchCommand`：聚合并对外暴露其它模块的能力。
 * - `McpCommandHandler`：聚合并对外暴露其它模块的能力。
 * - `SkillToolHandler`：聚合并对外暴露其它模块的能力。
 */

export { CommandSearchHandler, parseCommandSearchCommand, type ParsedCommandSearchCommand } from './command-search.ts';
export { McpCommandHandler } from './mcp-command-handler.ts';
export { SkillToolHandler } from './skill-tool-handler.ts';
