# Sub Agent 设计文档

## 概述

基于 Task 工具的方式创建 Sub Agent，对现有 Skill Sub Agent 进行重构。核心原则：
- Task 工具是业务层封装（类似 Read、Write），作为 Agent Shell Command
- 保持项目只有一个 Bash 工具的原则
- 遵循"一切工具都是 Shell Command"的核心理念

## 命令体系

### Sub Agent 命令

| 命令 | 类型 | 说明 |
|------|------|------|
| `task:skill:search --prompt "..."` | Sub Agent | 启动/复用 Skill Sub Agent 搜索技能 |
| `task:skill:enhance --prompt "..."` | Sub Agent | 启动/复用 Skill Sub Agent 增强技能 |
| `task:explore --prompt "..."` | Sub Agent | 代码探索代理 |
| `task:general --prompt "..."` | Sub Agent | 通用研究代理 |

### 保留的普通命令

| 命令 | 说明 |
|------|------|
| `skill:load <key>` | 加载 SKILL.md 完整内容（非 Sub Agent 操作） |

### 移除的命令

- `skill:search` - 替换为 `task:skill:search`
- `skill:enhance` - 替换为 `task:skill:enhance`

## 命令参数

```typescript
interface TaskCommandParams {
  // 必填参数
  prompt: string;        // 代理要执行的任务描述
  description: string;   // 任务的简短描述（3-5个词）

  // 由命令自动指定
  subagent_type: 'skill' | 'explore' | 'general';

  // 可选参数
  model?: string;        // 默认继承主 Agent
  max_turns?: number;    // 默认和主 Agent 一致
}
```

### 命令示例

```bash
# 技能搜索
task:skill:search --prompt "code review" --description "查询技能"

# 技能增强
task:skill:enhance --prompt "${session-id}" --description "增强技能"

# 代码探索
task:explore --prompt "搜索项目中所有处理用户认证的代码" --description "探索认证代码"

# 通用研究
task:general --prompt "分析项目的错误处理机制" --description "分析错误处理"
```

## Sub Agent 类型与工具权限

| 类型 | 工具权限 | 用途 |
|------|----------|------|
| skill | 主 Agent 全部命令，移除 `task:skill:*` | 技能搜索与增强 |
| explore | 除 `task:*`、`edit`、`write` 外全部 | 快速搜索文件、理解代码结构 |
| general | 全部命令可用 | 复杂问题研究、多步骤任务 |

## 生命周期管理

### 运行时 Resume

- 同一 session 中只存在一个 Skill Sub Agent 实例
- 同一进程运行期间，内存中的 Sub Agent 实例可复用
- 主进程退出后，Sub Agent 状态丢失
- 无需持久化/恢复逻辑

### Session 记录

- 主 Session 仅记录 `task:*` 调用的最终结果文本
- Sub Agent 对话历史不保存到 session 文件
- 日志记录 Sub Agent 执行过程供开发者分析

## 执行模型

### 执行流程

```
task:skill:search --prompt "code review"
        ↓
TaskCommandHandler.handle()
        ↓
SubAgentManager.getOrCreate("skill")
        ↓
创建/复用 AgentRunner（传入受限的 Toolset + 专用提示词）
        ↓
runner.run(prompt)
        ↓
返回最终结果文本
```

### 同步阻塞

- 主 Agent 调用 `task:*` 后等待 Sub Agent 完成
- 获取结果后继续执行

## 代码结构

```
src/
├── tools/
│   └── handlers/
│       └── task-command-handler.ts    # 解析 task:* 命令，提取参数
└── sub-agents/
    ├── sub-agent-manager.ts           # 内存实例管理（创建、复用、销毁）
    ├── sub-agent-context.ts           # 上下文类型定义
    └── configs/
        ├── skill.ts                   # Skill 类型配置（工具权限、提示词）
        ├── explore.ts                 # Explore 类型配置
        └── general.ts                 # General 类型配置
```

## 核心模块设计

### TaskCommandHandler

解析 `task:*` 命令，提取参数，路由到 SubAgentManager。

```typescript
class TaskCommandHandler implements CommandHandler {
  async handle(command: string, args: string[]): Promise<CommandResult> {
    const { type, action, params } = this.parseCommand(command, args);
    const result = await this.subAgentManager.execute(type, action, params);
    return { success: true, output: result };
  }
}
```

### SubAgentManager

管理 Sub Agent 生命周期，维护内存中的实例。

```typescript
class SubAgentManager {
  private agents: Map<string, AgentRunner> = new Map();

  async execute(type: SubAgentType, action: string, params: TaskParams): Promise<string> {
    const agent = this.getOrCreate(type);
    const result = await agent.run(params.prompt);
    return result;
  }

  private getOrCreate(type: SubAgentType): AgentRunner {
    if (!this.agents.has(type)) {
      const config = this.loadConfig(type);
      const toolset = this.createToolset(config.permissions);
      const agent = new AgentRunner({ toolset, systemPrompt: config.prompt });
      this.agents.set(type, agent);
    }
    return this.agents.get(type)!;
  }
}
```

### Sub Agent 配置

```typescript
// configs/skill.ts
export const skillConfig: SubAgentConfig = {
  type: 'skill',
  permissions: {
    include: 'all',
    exclude: ['task:skill:search', 'task:skill:enhance']
  },
  systemPrompt: `你是一个技能管理专家...`
};

// configs/explore.ts
export const exploreConfig: SubAgentConfig = {
  type: 'explore',
  permissions: {
    include: 'all',
    exclude: ['task:*', 'edit', 'write']
  },
  systemPrompt: `你是一个代码探索专家...`
};

// configs/general.ts
export const generalConfig: SubAgentConfig = {
  type: 'general',
  permissions: {
    include: 'all',
    exclude: []
  },
  systemPrompt: `你是一个通用研究代理...`
};
```

## 系统提示词

```markdown
Launch a new agent to handle complex, multi-step tasks autonomously.

The Task tool launches specialized agents (subprocesses) that autonomously
handle complex tasks. Each agent type has specific capabilities and tools
available to it.

Available agent types and the tools they have access to:
- skill: Expert in Agent Skills
- general: General-purpose agent for researching complex questions
- explore: Fast agent for exploring codebases (Tools: All except task:*, edit, write)

Usage notes:
- Always include a short description (3-5 words) summarizing what the agent will do
- Launch multiple agents concurrently whenever possible
- When the agent is done, it will return a single message back to you
- The result returned by the agent is not visible to the user
- Provide clear, detailed prompts so the agent can work autonomously
- The agent's outputs should generally be trusted
- Clearly tell the agent whether you expect it to write code or just do research
```

## 重构影响

### 需要删除的文件

- `src/skill-sub-agent/skill-sub-agent.ts`
- `src/skill-sub-agent/skill-memory-store.ts`
- `src/skill-sub-agent/skill-sub-agent-prompt.ts`
- `src/skill-sub-agent/skill-sub-agent-types.ts`
- `src/tools/handlers/skill-command-handler.ts`（部分重构）

### 需要修改的文件

- `src/tools/bash-router.ts` - 添加 `task:*` 路由
- `src/agent/system-prompt.ts` - 更新系统提示词

### 新增的文件

- `src/tools/handlers/task-command-handler.ts`
- `src/sub-agents/sub-agent-manager.ts`
- `src/sub-agents/sub-agent-context.ts`
- `src/sub-agents/configs/skill.ts`
- `src/sub-agents/configs/explore.ts`
- `src/sub-agents/configs/general.ts`
