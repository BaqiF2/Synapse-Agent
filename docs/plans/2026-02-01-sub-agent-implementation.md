# Sub Agent 实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 基于 Task 工具重构 Sub Agent 架构，支持 skill、explore、general 三种类型

**Architecture:** Task 命令作为 Agent Shell Command (Layer 2)，通过 BashRouter 路由到 TaskCommandHandler，由 SubAgentManager 管理 Sub Agent 生命周期，复用 AgentRunner 执行 agent loop

**Tech Stack:** TypeScript, Zod, AgentRunner, CallableToolset

---

## Task 1: 创建 Sub Agent 类型定义

**Files:**
- Create: `src/sub-agents/sub-agent-types.ts`

**Step 1: 创建类型定义文件**

```typescript
/**
 * Sub Agent 类型定义
 *
 * 功能：定义 Sub Agent 相关的类型和接口
 *
 * 核心导出：
 * - SubAgentType: Sub Agent 类型枚举
 * - SubAgentConfig: Sub Agent 配置接口
 * - TaskCommandParams: Task 命令参数接口
 * - ToolPermissions: 工具权限配置接口
 */

import { z } from 'zod';

/**
 * Sub Agent 类型
 */
export type SubAgentType = 'skill' | 'explore' | 'general';

/**
 * Sub Agent 类型常量
 */
export const SUB_AGENT_TYPES = ['skill', 'explore', 'general'] as const;

/**
 * 工具权限配置
 */
export interface ToolPermissions {
  /** 包含的命令（'all' 表示全部） */
  include: 'all' | string[];
  /** 排除的命令模式 */
  exclude: string[];
}

/**
 * Sub Agent 配置
 */
export interface SubAgentConfig {
  /** Sub Agent 类型 */
  type: SubAgentType;
  /** 工具权限 */
  permissions: ToolPermissions;
  /** 系统提示词 */
  systemPrompt: string;
  /** 最大迭代次数（可选） */
  maxIterations?: number;
}

/**
 * Task 命令参数 Schema
 */
export const TaskCommandParamsSchema = z.object({
  prompt: z.string().min(1, 'prompt is required'),
  description: z.string().min(1, 'description is required'),
  model: z.string().optional(),
  maxTurns: z.number().positive().optional(),
});

/**
 * Task 命令参数类型
 */
export type TaskCommandParams = z.infer<typeof TaskCommandParamsSchema>;

/**
 * 检查是否为有效的 Sub Agent 类型
 */
export function isSubAgentType(value: string): value is SubAgentType {
  return (SUB_AGENT_TYPES as readonly string[]).includes(value);
}
```

**Step 2: 运行类型检查**

Run: `cd /Users/wuwenjun/WebstormProjects/Synapse-Agent && bun run typecheck`
Expected: PASS

**Step 3: 提交**

```bash
git add src/sub-agents/sub-agent-types.ts
git commit -m "feat(sub-agents): add type definitions for sub agent system"
```

---

## Task 2: 创建 Sub Agent 配置

**Files:**
- Create: `src/sub-agents/configs/skill.ts`
- Create: `src/sub-agents/configs/explore.ts`
- Create: `src/sub-agents/configs/general.ts`
- Create: `src/sub-agents/configs/index.ts`

**Step 1: 创建 skill 配置**

```typescript
/**
 * Skill Sub Agent 配置
 *
 * 功能：定义 Skill 类型 Sub Agent 的配置
 *
 * 核心导出：
 * - skillConfig: Skill Sub Agent 配置对象
 */

import type { SubAgentConfig } from '../sub-agent-types.ts';

/**
 * Skill Sub Agent 配置
 *
 * 工具权限：主 Agent 全部命令，移除 task:skill:*
 */
export const skillConfig: SubAgentConfig = {
  type: 'skill',
  permissions: {
    include: 'all',
    exclude: ['task:skill:search', 'task:skill:enhance'],
  },
  systemPrompt: `You are a Skill Management Expert.

Your role is to help manage, search, create, and enhance skills for the Synapse Agent system.

## Capabilities
- Search for skills matching user queries
- Analyze conversation patterns to identify reusable skills
- Create new skills following the skill-creator meta skill
- Enhance existing skills following the enhancing-skills meta skill

## Guidelines
1. When searching, consider semantic similarity, not just keywords
2. When creating skills, always use the ~/.synapse/skills/ directory
3. Follow the meta skill guidelines strictly
4. Return structured JSON results when appropriate

## Output Format
For search operations, return JSON:
{"matched_skills": [{"name": "skill-name", "description": "description"}]}

For enhance operations, return JSON:
{"action": "created" | "enhanced" | "none", "skillName": "name", "message": "details"}`,
};
```

**Step 2: 创建 explore 配置**

```typescript
/**
 * Explore Sub Agent 配置
 *
 * 功能：定义 Explore 类型 Sub Agent 的配置
 *
 * 核心导出：
 * - exploreConfig: Explore Sub Agent 配置对象
 */

import type { SubAgentConfig } from '../sub-agent-types.ts';

/**
 * Explore Sub Agent 配置
 *
 * 工具权限：除 task:*、edit、write 外全部
 */
export const exploreConfig: SubAgentConfig = {
  type: 'explore',
  permissions: {
    include: 'all',
    exclude: ['task:', 'edit', 'write'],
  },
  systemPrompt: `You are a Codebase Exploration Expert.

Your role is to quickly search files, understand code structure, and answer questions about the codebase.

## Capabilities
- Fast file pattern matching with glob
- Code content search with grep/search
- Read and analyze source files
- Understand project architecture

## Guidelines
1. Start with broad searches, then narrow down
2. Use glob for file patterns, search for content
3. Read key files to understand structure
4. Provide concise, actionable summaries

## Depth Levels
- quick: Basic file search, single-pass
- medium: Multiple search passes, read key files
- very thorough: Comprehensive analysis across all locations

## Output Format
Provide clear, structured summaries of findings.
Include file paths and relevant code snippets when helpful.`,
};
```

**Step 3: 创建 general 配置**

```typescript
/**
 * General Sub Agent 配置
 *
 * 功能：定义 General 类型 Sub Agent 的配置
 *
 * 核心导出：
 * - generalConfig: General Sub Agent 配置对象
 */

import type { SubAgentConfig } from '../sub-agent-types.ts';

/**
 * General Sub Agent 配置
 *
 * 工具权限：全部命令可用
 */
export const generalConfig: SubAgentConfig = {
  type: 'general',
  permissions: {
    include: 'all',
    exclude: [],
  },
  systemPrompt: `You are a General-Purpose Research Agent.

Your role is to handle complex research tasks, multi-step operations, and comprehensive analysis.

## Capabilities
- Full access to all tools and commands
- Complex problem research
- Multi-step task execution
- Code reading, writing, and modification

## Guidelines
1. Break down complex tasks into manageable steps
2. Use appropriate tools for each subtask
3. Verify results before proceeding
4. Provide clear progress updates

## Output Format
Provide comprehensive results with:
- Summary of findings
- Detailed analysis when appropriate
- Recommendations or next steps`,
};
```

**Step 4: 创建配置索引**

```typescript
/**
 * Sub Agent 配置索引
 *
 * 功能：导出所有 Sub Agent 配置
 *
 * 核心导出：
 * - configs: 类型到配置的映射
 * - getConfig: 获取指定类型的配置
 */

import type { SubAgentConfig, SubAgentType } from '../sub-agent-types.ts';
import { skillConfig } from './skill.ts';
import { exploreConfig } from './explore.ts';
import { generalConfig } from './general.ts';

/**
 * 所有 Sub Agent 配置
 */
export const configs: Record<SubAgentType, SubAgentConfig> = {
  skill: skillConfig,
  explore: exploreConfig,
  general: generalConfig,
};

/**
 * 获取指定类型的 Sub Agent 配置
 */
export function getConfig(type: SubAgentType): SubAgentConfig {
  return configs[type];
}

export { skillConfig, exploreConfig, generalConfig };
```

**Step 5: 运行类型检查**

Run: `cd /Users/wuwenjun/WebstormProjects/Synapse-Agent && bun run typecheck`
Expected: PASS

**Step 6: 提交**

```bash
git add src/sub-agents/configs/
git commit -m "feat(sub-agents): add configuration files for skill, explore, general agents"
```

---

## Task 3: 创建 SubAgentManager

**Files:**
- Create: `src/sub-agents/sub-agent-manager.ts`

**Step 1: 创建 SubAgentManager**

```typescript
/**
 * Sub Agent Manager
 *
 * 功能：管理 Sub Agent 的生命周期（创建、复用、销毁）
 *
 * 核心导出：
 * - SubAgentManager: Sub Agent 管理器类
 * - SubAgentManagerOptions: 管理器配置选项
 */

import { createLogger } from '../utils/logger.ts';
import { AgentRunner } from '../agent/agent-runner.ts';
import { CallableToolset } from '../tools/toolset.ts';
import type { AnthropicClient } from '../providers/anthropic/anthropic-client.ts';
import type { BashTool } from '../tools/bash-tool.ts';
import type { SubAgentType, TaskCommandParams, ToolPermissions } from './sub-agent-types.ts';
import { getConfig } from './configs/index.ts';

const logger = createLogger('sub-agent-manager');

/**
 * SubAgentManager 配置选项
 */
export interface SubAgentManagerOptions {
  /** Anthropic 客户端 */
  client: AnthropicClient;
  /** Bash 工具（用于创建受限 Toolset） */
  bashTool: BashTool;
  /** 最大迭代次数（默认继承主 Agent） */
  maxIterations?: number;
}

/**
 * Sub Agent 实例信息
 */
interface SubAgentInstance {
  runner: AgentRunner;
  type: SubAgentType;
  createdAt: Date;
}

/**
 * SubAgentManager - 管理 Sub Agent 生命周期
 *
 * 特性：
 * - 同一 session 中复用 Sub Agent 实例
 * - 根据类型配置工具权限
 * - 运行时 resume（内存中）
 */
export class SubAgentManager {
  private client: AnthropicClient;
  private bashTool: BashTool;
  private maxIterations: number;
  private agents: Map<SubAgentType, SubAgentInstance> = new Map();

  constructor(options: SubAgentManagerOptions) {
    this.client = options.client;
    this.bashTool = options.bashTool;
    this.maxIterations = options.maxIterations ?? parseInt(
      process.env.SYNAPSE_MAX_TOOL_ITERATIONS || '50',
      10
    );
  }

  /**
   * 执行 Sub Agent 任务
   *
   * @param type - Sub Agent 类型
   * @param params - 任务参数
   * @returns 执行结果
   */
  async execute(type: SubAgentType, params: TaskCommandParams): Promise<string> {
    const agent = this.getOrCreate(type);

    logger.info('Executing sub agent task', {
      type,
      description: params.description,
    });

    const result = await agent.runner.run(params.prompt);

    logger.info('Sub agent task completed', {
      type,
      resultLength: result.length,
    });

    return result;
  }

  /**
   * 获取或创建 Sub Agent 实例
   */
  private getOrCreate(type: SubAgentType): SubAgentInstance {
    const existing = this.agents.get(type);
    if (existing) {
      logger.debug('Reusing existing sub agent', { type });
      return existing;
    }

    logger.info('Creating new sub agent', { type });

    const config = getConfig(type);
    const toolset = this.createToolset(config.permissions);

    const runner = new AgentRunner({
      client: this.client,
      systemPrompt: config.systemPrompt,
      toolset,
      maxIterations: config.maxIterations ?? this.maxIterations,
    });

    const instance: SubAgentInstance = {
      runner,
      type,
      createdAt: new Date(),
    };

    this.agents.set(type, instance);
    return instance;
  }

  /**
   * 根据权限配置创建 Toolset
   *
   * 注意：当前实现简化为直接使用 BashTool
   * 后续可扩展为根据 permissions 过滤命令
   */
  private createToolset(permissions: ToolPermissions): CallableToolset {
    // TODO: 根据 permissions.exclude 创建受限的 BashTool
    // 当前简化实现：直接使用原始 BashTool
    return new CallableToolset([this.bashTool]);
  }

  /**
   * 获取指定类型的 Sub Agent 实例（如果存在）
   */
  get(type: SubAgentType): SubAgentInstance | undefined {
    return this.agents.get(type);
  }

  /**
   * 检查指定类型的 Sub Agent 是否存在
   */
  has(type: SubAgentType): boolean {
    return this.agents.has(type);
  }

  /**
   * 销毁指定类型的 Sub Agent
   */
  destroy(type: SubAgentType): boolean {
    const instance = this.agents.get(type);
    if (instance) {
      this.agents.delete(type);
      logger.info('Sub agent destroyed', { type });
      return true;
    }
    return false;
  }

  /**
   * 销毁所有 Sub Agent
   */
  destroyAll(): void {
    const count = this.agents.size;
    this.agents.clear();
    logger.info('All sub agents destroyed', { count });
  }

  /**
   * 获取当前活跃的 Sub Agent 数量
   */
  get size(): number {
    return this.agents.size;
  }

  /**
   * 关闭管理器
   */
  shutdown(): void {
    this.destroyAll();
  }
}
```

**Step 2: 运行类型检查**

Run: `cd /Users/wuwenjun/WebstormProjects/Synapse-Agent && bun run typecheck`
Expected: PASS

**Step 3: 提交**

```bash
git add src/sub-agents/sub-agent-manager.ts
git commit -m "feat(sub-agents): add SubAgentManager for lifecycle management"
```

---

## Task 4: 创建 TaskCommandHandler

**Files:**
- Create: `src/tools/handlers/task-command-handler.ts`

**Step 1: 创建 TaskCommandHandler**

```typescript
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
  private showHelp(type: SubAgentType | null): CommandResult {
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
```

**Step 2: 运行类型检查**

Run: `cd /Users/wuwenjun/WebstormProjects/Synapse-Agent && bun run typecheck`
Expected: PASS

**Step 3: 提交**

```bash
git add src/tools/handlers/task-command-handler.ts
git commit -m "feat(sub-agents): add TaskCommandHandler for task:* commands"
```

---

## Task 5: 创建 Sub Agents 模块索引

**Files:**
- Create: `src/sub-agents/index.ts`

**Step 1: 创建索引文件**

```typescript
/**
 * Sub Agents 模块
 *
 * 功能：导出 Sub Agent 相关的类型、配置和管理器
 *
 * 核心导出：
 * - SubAgentManager: Sub Agent 管理器
 * - SubAgentType: Sub Agent 类型
 * - TaskCommandParams: Task 命令参数
 * - configs: Sub Agent 配置集合
 */

export * from './sub-agent-types.ts';
export * from './sub-agent-manager.ts';
export * from './configs/index.ts';
```

**Step 2: 提交**

```bash
git add src/sub-agents/index.ts
git commit -m "feat(sub-agents): add module index"
```

---

## Task 6: 修改 BashRouter 添加 task:* 路由

**Files:**
- Modify: `src/tools/bash-router.ts`

**Step 1: 添加导入**

在文件顶部添加导入：

```typescript
import { TaskCommandHandler } from './handlers/task-command-handler.ts';
```

**Step 2: 添加 TASK_COMMAND_PREFIX 常量**

在 `COMMAND_SEARCH_PREFIX` 后添加：

```typescript
const TASK_COMMAND_PREFIX = 'task:';
```

**Step 3: 添加 taskCommandHandler 属性**

在 `BashRouter` 类中添加：

```typescript
private taskCommandHandler: TaskCommandHandler | null = null;
```

**Step 4: 修改 identifyCommandType 方法**

在 `COMMAND_SEARCH_PREFIX` 检查后添加：

```typescript
// task:* → Agent Shell Command
if (trimmed.startsWith(TASK_COMMAND_PREFIX)) {
  return CommandType.AGENT_SHELL_COMMAND;
}
```

**Step 5: 修改 executeAgentShellCommand 方法**

在 `COMMAND_SEARCH_PREFIX` 处理后添加：

```typescript
// task:* commands
if (trimmed.startsWith(TASK_COMMAND_PREFIX)) {
  return this.executeTaskCommand(command);
}
```

**Step 6: 添加 executeTaskCommand 方法**

```typescript
/**
 * Execute task command
 */
private async executeTaskCommand(command: string): Promise<CommandResult> {
  // Lazy initialize task command handler
  if (!this.taskCommandHandler) {
    if (!this.llmClient || !this.toolExecutor) {
      return {
        stdout: '',
        stderr: 'Task commands require LLM client and tool executor',
        exitCode: 1,
      };
    }

    this.taskCommandHandler = new TaskCommandHandler({
      client: this.llmClient,
      bashTool: this.toolExecutor,
    });
  }

  return this.taskCommandHandler.execute(command);
}
```

**Step 7: 修改 shutdown 方法**

添加 taskCommandHandler 的清理：

```typescript
shutdown(): void {
  if (this.skillCommandHandler) {
    this.skillCommandHandler.shutdown();
    this.skillCommandHandler = null;
  }
  if (this.taskCommandHandler) {
    this.taskCommandHandler.shutdown();
    this.taskCommandHandler = null;
  }
}
```

**Step 8: 运行类型检查**

Run: `cd /Users/wuwenjun/WebstormProjects/Synapse-Agent && bun run typecheck`
Expected: PASS

**Step 9: 提交**

```bash
git add src/tools/bash-router.ts
git commit -m "feat(router): add task:* command routing to sub agents"
```

---

## Task 7: 重构 SkillCommandHandler（只保留 skill:load）

**Files:**
- Modify: `src/tools/handlers/skill-command-handler.ts`

**Step 1: 简化 SkillCommandHandler**

移除 search 和 enhance 相关代码，只保留 load 功能。

重写文件为：

```typescript
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
```

**Step 2: 运行类型检查**

Run: `cd /Users/wuwenjun/WebstormProjects/Synapse-Agent && bun run typecheck`
Expected: PASS

**Step 3: 提交**

```bash
git add src/tools/handlers/skill-command-handler.ts
git commit -m "refactor(skill): simplify SkillCommandHandler to only handle skill:load"
```

---

## Task 8: 修改 BashRouter 移除旧的 skill 命令

**Files:**
- Modify: `src/tools/bash-router.ts`

**Step 1: 修改 SKILL_MANAGEMENT_COMMAND_PREFIXES**

将：
```typescript
const SKILL_MANAGEMENT_COMMAND_PREFIXES = ['skill:search', 'skill:load', 'skill:enhance'] as const;
```

改为：
```typescript
const SKILL_MANAGEMENT_COMMAND_PREFIXES = ['skill:load'] as const;
```

**Step 2: 移除不需要的导入**

移除：
```typescript
import type { AnthropicClient } from '../providers/anthropic/anthropic-client.ts';
import type { BashTool } from './bash-tool.ts';
```

（如果这些只用于 SkillCommandHandler）

**Step 3: 简化 SkillCommandHandler 初始化**

修改 `executeSkillManagementCommand` 方法：

```typescript
private async executeSkillManagementCommand(command: string): Promise<CommandResult> {
  // Lazy initialize skill command handler
  if (!this.skillCommandHandler) {
    this.skillCommandHandler = new SkillCommandHandler({
      skillsDir: this.skillsDir,
      synapseDir: this.synapseDir,
    });
  }

  return this.skillCommandHandler.execute(command);
}
```

**Step 4: 更新 BashRouterOptions**

移除不再需要的选项（如果 skill:load 不需要 llmClient 等）。

**Step 5: 运行类型检查**

Run: `cd /Users/wuwenjun/WebstormProjects/Synapse-Agent && bun run typecheck`
Expected: PASS

**Step 6: 提交**

```bash
git add src/tools/bash-router.ts
git commit -m "refactor(router): remove skill:search and skill:enhance routing"
```

---

## Task 9: 删除旧的 skill-sub-agent 目录

**Files:**
- Delete: `src/skill-sub-agent/` (entire directory)

**Step 1: 确认无其他引用**

Run: `cd /Users/wuwenjun/WebstormProjects/Synapse-Agent && grep -r "skill-sub-agent" src/ --include="*.ts" | grep -v "skill-sub-agent/"`
Expected: 只有 SkillCommandHandler 的引用（已重构）

**Step 2: 删除目录**

```bash
rm -rf src/skill-sub-agent/
```

**Step 3: 运行类型检查**

Run: `cd /Users/wuwenjun/WebstormProjects/Synapse-Agent && bun run typecheck`
Expected: PASS

**Step 4: 提交**

```bash
git add -A
git commit -m "refactor: remove legacy skill-sub-agent directory"
```

---

## Task 10: 更新系统提示词

**Files:**
- Modify: `src/agent/system-prompt.ts`

**Step 1: 添加 Task 工具说明到系统提示词**

找到工具说明部分，添加：

```typescript
const TASK_TOOL_DESCRIPTION = `
## Task Commands

Launch specialized sub-agents for complex, multi-step tasks:

Available agent types:
- task:skill:search - Search for skills matching a query
- task:skill:enhance - Analyze conversation and create/enhance skills
- task:explore - Fast codebase exploration
- task:general - General-purpose research agent

Usage:
  task:<type>[:<action>] --prompt <prompt> --description <desc>

Examples:
  task:skill:search --prompt "code review" --description "Search skills"
  task:explore --prompt "Find auth code" --description "Explore auth"
`;
```

**Step 2: 运行类型检查**

Run: `cd /Users/wuwenjun/WebstormProjects/Synapse-Agent && bun run typecheck`
Expected: PASS

**Step 3: 提交**

```bash
git add src/agent/system-prompt.ts
git commit -m "docs(prompt): add task command documentation to system prompt"
```

---

## Task 11: 添加单元测试

**Files:**
- Create: `tests/sub-agents/sub-agent-types.test.ts`
- Create: `tests/sub-agents/sub-agent-manager.test.ts`
- Create: `tests/tools/handlers/task-command-handler.test.ts`

**Step 1: 创建类型测试**

```typescript
/**
 * Sub Agent Types 测试
 */

import { describe, it, expect } from 'vitest';
import {
  isSubAgentType,
  TaskCommandParamsSchema,
  SUB_AGENT_TYPES,
} from '../../src/sub-agents/sub-agent-types.ts';

describe('Sub Agent Types', () => {
  describe('isSubAgentType', () => {
    it('should return true for valid types', () => {
      expect(isSubAgentType('skill')).toBe(true);
      expect(isSubAgentType('explore')).toBe(true);
      expect(isSubAgentType('general')).toBe(true);
    });

    it('should return false for invalid types', () => {
      expect(isSubAgentType('invalid')).toBe(false);
      expect(isSubAgentType('')).toBe(false);
    });
  });

  describe('TaskCommandParamsSchema', () => {
    it('should validate valid params', () => {
      const result = TaskCommandParamsSchema.safeParse({
        prompt: 'test prompt',
        description: 'test desc',
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing prompt', () => {
      const result = TaskCommandParamsSchema.safeParse({
        description: 'test desc',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing description', () => {
      const result = TaskCommandParamsSchema.safeParse({
        prompt: 'test prompt',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('SUB_AGENT_TYPES', () => {
    it('should contain all expected types', () => {
      expect(SUB_AGENT_TYPES).toContain('skill');
      expect(SUB_AGENT_TYPES).toContain('explore');
      expect(SUB_AGENT_TYPES).toContain('general');
      expect(SUB_AGENT_TYPES.length).toBe(3);
    });
  });
});
```

**Step 2: 创建 TaskCommandHandler 测试**

```typescript
/**
 * Task Command Handler 测试
 */

import { describe, it, expect } from 'vitest';
import { parseTaskCommand } from '../../src/tools/handlers/task-command-handler.ts';

describe('parseTaskCommand', () => {
  it('should parse task:skill:search command', () => {
    const result = parseTaskCommand('task:skill:search --prompt "test" --description "desc"');
    expect(result.type).toBe('skill');
    expect(result.action).toBe('search');
    expect(result.params.prompt).toBe('test');
    expect(result.params.description).toBe('desc');
  });

  it('should parse task:explore command', () => {
    const result = parseTaskCommand('task:explore --prompt "find files" --description "explore"');
    expect(result.type).toBe('explore');
    expect(result.action).toBeNull();
    expect(result.params.prompt).toBe('find files');
  });

  it('should parse task:general command', () => {
    const result = parseTaskCommand('task:general -p "research" -d "general task"');
    expect(result.type).toBe('general');
    expect(result.params.prompt).toBe('research');
    expect(result.params.description).toBe('general task');
  });

  it('should handle help flag', () => {
    const result = parseTaskCommand('task:skill --help');
    expect(result.help).toBe(true);
  });

  it('should return null type for invalid command', () => {
    const result = parseTaskCommand('invalid command');
    expect(result.type).toBeNull();
  });
});
```

**Step 3: 运行测试**

Run: `cd /Users/wuwenjun/WebstormProjects/Synapse-Agent && bun test`
Expected: PASS

**Step 4: 提交**

```bash
git add tests/
git commit -m "test: add unit tests for sub agent system"
```

---

## Task 12: 集成测试和清理

**Step 1: 运行完整测试**

Run: `cd /Users/wuwenjun/WebstormProjects/Synapse-Agent && bun test`
Expected: All tests pass

**Step 2: 运行类型检查**

Run: `cd /Users/wuwenjun/WebstormProjects/Synapse-Agent && bun run typecheck`
Expected: PASS

**Step 3: 运行 lint**

Run: `cd /Users/wuwenjun/WebstormProjects/Synapse-Agent && bun run lint`
Expected: PASS (or fix any issues)

**Step 4: 最终提交**

```bash
git add -A
git commit -m "chore: final cleanup for sub agent refactoring"
```

---

## 总结

完成以上 12 个任务后，项目将具备：

1. **新的 Sub Agent 架构**
   - `task:skill:search` / `task:skill:enhance` 命令
   - `task:explore` 命令
   - `task:general` 命令

2. **保留的命令**
   - `skill:load` - 加载技能内容

3. **代码结构**
   ```
   src/sub-agents/
     ├── sub-agent-types.ts
     ├── sub-agent-manager.ts
     ├── index.ts
     └── configs/
         ├── skill.ts
         ├── explore.ts
         ├── general.ts
         └── index.ts
   src/tools/handlers/
     ├── task-command-handler.ts
     └── skill-command-handler.ts (simplified)
   ```

4. **特性**
   - 运行时 resume（内存中复用）
   - 配置驱动的工具权限
   - 复用 AgentRunner 执行 agent loop
