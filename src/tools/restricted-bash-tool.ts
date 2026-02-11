/**
 * 文件功能说明：
 * - 该文件位于 `src/tools/restricted-bash-tool.ts`，主要负责 受限、Bash、工具 相关实现。
 * - 模块归属 工具 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `isCommandBlocked`
 * - `RestrictedBashTool`
 *
 * 作用说明：
 * - `isCommandBlocked`：用于条件判断并返回布尔结果。
 * - `RestrictedBashTool`：封装该领域的核心流程与状态管理。
 */

import {
  CallableTool,
  ToolError,
  asCancelablePromise,
  type ToolReturnValue,
  type CancelablePromise,
} from './callable-tool.ts';
import { BashToolParamsSchema, type BashToolParams } from './schemas.ts';
import type { BashTool } from './bash-tool.ts';
import type { ToolPermissions } from '../sub-agents/sub-agent-types.ts';
import { extractBaseCommand } from './constants.ts';

/**
 * 检查命令是否被权限配置阻止
 *
 * 支持两种匹配模式：
 * - 前缀匹配：以 ':' 结尾的模式（如 'task:'）匹配所有以该前缀开头的命令
 * - 精确匹配：不以 ':' 结尾的模式（如 'edit'）只匹配完全相同的命令
 *
 * @param command - 完整命令字符串
 * @param excludePatterns - 排除的命令模式列表
 * @returns 如果命令被阻止返回 true
 *
 * @example
 * isCommandBlocked('task:skill:search query', ['task:']) // => true (前缀匹配)
 * isCommandBlocked('edit ./file.txt', ['edit']) // => true (精确匹配)
 * isCommandBlocked('read ./file.txt', ['edit']) // => false
 */
export function isCommandBlocked(command: string, excludePatterns: string[]): boolean {
  const baseCommand = extractBaseCommand(command);

  for (const pattern of excludePatterns) {
    // 前缀匹配：'task:' 匹配 'task:skill:search'
    if (pattern.endsWith(':')) {
      if (baseCommand.startsWith(pattern)) {
        return true;
      }
    } else {
      // 精确匹配：'edit' 匹配 'edit'
      if (baseCommand === pattern) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 获取被阻止命令的友好错误信息
 * @param command 输入参数。
 * @param agentType 输入参数。
 */
function getBlockedCommandMessage(command: string, agentType?: string): string {
  const baseCommand = extractBaseCommand(command);
  const typeHint = agentType ? ` The ${agentType} agent` : ' This agent';
  return `Command '${baseCommand}' is not permitted.${typeHint} has restricted access to this command for security or recursion prevention.`;
}

/**
 * RestrictedBashTool - 受限的 Bash 工具
 *
 * 使用装饰器模式包装原 BashTool，在执行命令前根据 ToolPermissions 进行权限检查。
 * 被排除的命令将返回错误而不执行。
 *
 * @example
 * const restricted = new RestrictedBashTool(bashTool, {
 *   include: 'all',
 *   exclude: ['task:', 'edit', 'write']
 * }, 'explore');
 *
 * // 'edit' 命令将被阻止
 * await restricted.call({ command: 'edit ./file.txt' }); // => ToolError
 *
 * // 'read' 命令正常执行
 * await restricted.call({ command: 'read ./file.txt' }); // => 委托给原 BashTool
 */
export class RestrictedBashTool extends CallableTool<BashToolParams> {
  readonly name = 'Bash';
  readonly description: string;
  readonly paramsSchema = BashToolParamsSchema;

  private delegate: BashTool;
  private permissions: ToolPermissions;
  private agentType?: string;

  /**
   * 创建受限 Bash 工具实例
   *
   * @param delegate - 被包装的原始 BashTool 实例
   * @param permissions - 权限配置
   * @param agentType - 可选的 Agent 类型名称（用于错误信息）
   */
  constructor(delegate: BashTool, permissions: ToolPermissions, agentType?: string) {
    super();
    this.delegate = delegate;
    this.permissions = permissions;
    this.agentType = agentType;

    // 复用原 BashTool 的 description
    this.description = delegate.description;
  }

  /**
   * 方法说明：执行 execute 相关主流程。
   * @param params 集合数据。
   */
  protected execute(params: BashToolParams): CancelablePromise<ToolReturnValue> {
    const { command } = params;

    // 检查命令是否被阻止
    if (isCommandBlocked(command, this.permissions.exclude)) {
      return asCancelablePromise(Promise.resolve(ToolError({
        message: getBlockedCommandMessage(command, this.agentType),
        brief: 'Command blocked',
      })));
    }

    // 委托给原 BashTool 执行
    return this.delegate.call(params);
  }

  /**
   * 获取被委托的原始 BashTool
   */
  getDelegate(): BashTool {
    return this.delegate;
  }

  /**
   * 获取权限配置
   */
  getPermissions(): ToolPermissions {
    return this.permissions;
  }
}
