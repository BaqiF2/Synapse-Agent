/**
 * Task Command Handler
 *
 * 功能：解析和执行 task:* 命令，路由到对应的 Sub Agent
 *
 * 核心导出：
 * - TaskCommandHandler: Task 命令处理器类
 * - parseTaskCommand: 命令解析函数
 */

import type { CommandResult } from './base-bash-handler.ts';
import { SubAgentManager, type SubAgentManagerOptions } from '../../sub-agents/sub-agent-manager.ts';
import {
  type SubAgentType,
  type TaskCommandParams,
  TaskCommandParamsSchema,
  isSubAgentType,
} from '../../sub-agents/sub-agent-types.ts';
import { createLogger } from '../../utils/logger.ts';

const logger = createLogger('task-command-handler');

/**
 * Task 命令前缀
 */
const TASK_PREFIX = 'task:';

/**
 * 解析后的 Task 命令
 */
export interface ParsedTaskCommand {
  /** Sub Agent 类型 */
  type: SubAgentType | null;
  /** 子操作（如 skill 的 search/enhance） */
  action: string | null;
  /** 命令参数 */
  params: Partial<TaskCommandParams>;
  /** 是否请求帮助 */
  help: boolean;
}

/**
 * 解析 task:* 命令参数
 *
 * 支持格式：
 * - task:skill:search --prompt "..." --description "..."
 * - task:explore --prompt "..." --description "..."
 * - task:general --prompt "..." --description "..."
 */
export function parseTaskCommand(command: string): ParsedTaskCommand {
  const result: ParsedTaskCommand = {
    type: null,
    action: null,
    params: {},
    help: false,
  };

  // 分词（支持引号）
  const tokens = tokenize(command);
  if (tokens.length === 0) return result;

  // 解析命令前缀
  const firstToken = tokens[0];
  if (!firstToken?.startsWith(TASK_PREFIX)) return result;

  const commandPart = firstToken.slice(TASK_PREFIX.length);
  const parts = commandPart.split(':');

  // 解析类型和操作
  const typeStr = parts[0];
  if (typeStr && isSubAgentType(typeStr)) {
    result.type = typeStr;
    result.action = parts[1] ?? null;
  }

  // 解析参数
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];

    if (token === '-h' || token === '--help') {
      result.help = true;
    } else if (token === '--prompt' || token === '-p') {
      result.params.prompt = tokens[++i];
    } else if (token === '--description' || token === '-d') {
      result.params.description = tokens[++i];
    } else if (token === '--model') {
      result.params.model = tokens[++i];
    } else if (token === '--max-turns') {
      const value = tokens[++i];
      if (value) {
        result.params.maxTurns = parseInt(value, 10);
      }
    }
  }

  return result;
}

/**
 * 分词（支持引号）
 */
function tokenize(command: string): string[] {
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
 * TaskCommandHandler 配置选项
 */
export type TaskCommandHandlerOptions = SubAgentManagerOptions;

/**
 * TaskCommandHandler - Task 命令处理器
 *
 * 处理 task:* 命令，路由到对应的 Sub Agent
 */
export class TaskCommandHandler {
  private manager: SubAgentManager;

  constructor(options: TaskCommandHandlerOptions) {
    this.manager = new SubAgentManager(options);
  }

  /**
   * 执行 Task 命令
   */
  async execute(command: string): Promise<CommandResult> {
    try {
      const parsed = parseTaskCommand(command);

      // 帮助信息
      if (parsed.help) {
        return this.showHelp(parsed.type);
      }

      // 验证类型
      if (!parsed.type) {
        return {
          stdout: '',
          stderr: 'Invalid task command. Use task:<type> where type is: skill, explore, general',
          exitCode: 1,
        };
      }

      // 验证参数
      const validation = TaskCommandParamsSchema.safeParse(parsed.params);
      if (!validation.success) {
        const errors = validation.error.issues.map(i => i.message).join(', ');
        return {
          stdout: '',
          stderr: `Invalid parameters: ${errors}\nRequired: --prompt, --description`,
          exitCode: 1,
        };
      }

      // 执行 Sub Agent
      const result = await this.manager.execute(parsed.type, validation.data);

      return {
        stdout: result,
        stderr: '',
        exitCode: 0,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Task command failed', { error: message });
      return {
        stdout: '',
        stderr: `Task execution failed: ${message}`,
        exitCode: 1,
      };
    }
  }

  /**
   * 显示帮助信息
   */
  private showHelp(_type: SubAgentType | null): CommandResult {
    const generalHelp = `task - Launch specialized sub-agents for complex tasks

USAGE:
    task:<type>[:<action>] --prompt <prompt> --description <desc> [options]

TYPES:
    skill       Skill management agent
      Actions:  search, enhance
    explore     Codebase exploration agent
    general     General-purpose research agent

OPTIONS:
    --prompt, -p <text>       Task prompt (required)
    --description, -d <text>  Short description (required, 3-5 words)
    --model <model>           Model to use (optional, inherits from parent)
    --max-turns <n>           Maximum agent turns (optional)
    -h, --help                Show this help

EXAMPLES:
    task:skill:search --prompt "code review" --description "Search skills"
    task:skill:enhance --prompt "session-id" --description "Enhance skills"
    task:explore --prompt "Find auth code" --description "Explore auth"
    task:general --prompt "Analyze errors" --description "Research task"`;

    return {
      stdout: generalHelp,
      stderr: '',
      exitCode: 0,
    };
  }

  /**
   * 获取 SubAgentManager 实例（用于测试）
   */
  getManager(): SubAgentManager {
    return this.manager;
  }

  /**
   * 关闭处理器
   */
  shutdown(): void {
    this.manager.shutdown();
  }
}
