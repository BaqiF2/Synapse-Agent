# SkillSubAgent 重构设计方案

## 概述

重构 `SkillSubAgent`，使其成为一个具备完整 Agent Loop 能力的子代理，能够通过三个元技能（skill-creator、enhancing-skills、evaluating-skills）来完成技能的创建、增强和评估。

## 设计决策

| 决策点 | 选择 | 说明 |
|--------|------|------|
| AgentRunner 复用 | 抽象为通用基类 | DRY，工具执行逻辑统一 |
| 元技能识别 | Frontmatter `type: meta` | 灵活，通过元数据识别 |
| 会话生命周期 | 与主 Agent 一致 | 持久会话，可积累上下文 |
| 执行输出 | 静默模式 | 只返回最终结果 |
| 工具范围 | 与主 Agent 相同 (Bash) | 通过提示词引导使用工具 |

## 架构设计

### 整体架构

```
当前架构:
┌─────────────────┐     ┌─────────────────┐
│   AgentRunner   │     │  SkillSubAgent  │
│  (Agent Loop)   │     │  (单次 LLM 调用) │
└─────────────────┘     └─────────────────┘
        ↓                       ↓
   完整工具执行              只返回 JSON 建议

目标架构:
┌─────────────────────────────────────────┐
│            AgentRunner (通用)            │
│  - llmClient, contextManager, tools     │
│  - run() Agent Loop                     │
└─────────────────────────────────────────┘
        ↑                       ↑
┌───────┴───────┐       ┌───────┴───────┐
│  主 Agent     │       │ SkillSubAgent │
│  (用户交互)    │       │  (静默执行)    │
│  输出          │       │  返回结果      │
└───────────────┘       └───────────────┘
```

### 依赖关系

```
agent-runner.ts (新)
       ↑
   ┌───┴───┐
   │       │
repl.ts  skill-sub-agent.ts
              ↑
    skill-memory-store.ts
    skill-sub-agent-prompt.ts
```

## AgentRunner 重构

### 接口设计

```typescript
// src/agent/agent-runner.ts (新文件，从 repl.ts 提取)

interface AgentRunnerOptions {
  llmClient: LlmClient;
  contextManager: ContextManager;
  toolExecutor: ToolExecutor;
  systemPrompt: string;
  maxIterations?: number;
}

class AgentRunner {
  // ... 现有字段 ...

  async run(userMessage: string): Promise<string> {
    // Agent Loop 核心逻辑不变
  }
}
```

## SkillSubAgent 系统提示词

### 提示词结构

```
┌────────────────────────────────────────────┐
│  1. 角色定义与职责说明                        │
├────────────────────────────────────────────┤
│  2. 工具使用引导（与主 Agent 一致）            │
├────────────────────────────────────────────┤
│  3. 三个元技能的完整 SKILL.md 内容            │
│     - skill-creator (type: meta)           │
│     - enhancing-skills (type: meta)        │
│     - evaluating-skills (type: meta)       │
├────────────────────────────────────────────┤
│  4. 所有技能的元数据（name + description）    │
│     - 用于语义搜索匹配                        │
└────────────────────────────────────────────┘
```

### 提示词模板

```typescript
// src/agent/skill-sub-agent-prompt.ts

export function buildSkillSubAgentPrompt(
  skillMetadata: string,      // 所有技能的 name + description
  metaSkillContents: string   // 三个元技能的完整 SKILL.md
): string {
  return `You are the Skill Sub-Agent for Synapse Agent.

## 1. Your Role
Manage the skill library: search skills, create new skills, enhance existing skills, and evaluate skill quality.

## 2. Tools
You have access to bash tool for file operations (read, write, edit, etc.)

## 3. Meta Skills (Full Content)
Use these skills to perform your tasks:
- To CREATE a new skill: Follow the skill-creator skill
- To ENHANCE an existing skill: Follow the enhancing-skills skill
- To EVALUATE a skill: Follow the evaluating-skills skill

${metaSkillContents}

## 4. Available Skills (Metadata)
For skill search, match query against these skills semantically:
${skillMetadata}
`;
}
```

## SkillSubAgent 实现

### 类结构

```typescript
// src/agent/skill-sub-agent.ts

export class SkillSubAgent {
  private memoryStore: SkillMemoryStore;
  private agentRunner: AgentRunner;
  private contextManager: ContextManager;  // 持久会话
  private initialized: boolean = false;

  constructor(options: SkillSubAgentOptions) {
    const skillsDir = options.skillsDir ?? DEFAULT_SKILLS_DIR;

    // 初始化 MemoryStore
    this.memoryStore = new SkillMemoryStore(skillsDir);
    this.memoryStore.loadAll();

    // 创建持久 ContextManager（生命周期与主 Agent 一致）
    this.contextManager = new ContextManager();

    // 构建系统提示词
    const systemPrompt = buildSkillSubAgentPrompt(
      this.memoryStore.getDescriptions(),      // 所有技能元数据
      this.memoryStore.getMetaSkillContents()  // 元技能完整内容
    );

    // 创建 AgentRunner（silent 模式）
    this.agentRunner = new AgentRunner({
      llmClient: options.llmClient,
      contextManager: this.contextManager,
      toolExecutor: options.toolExecutor,
      systemPrompt,
      outputMode: 'silent',
    });

    this.initialized = true;
  }

  // 增强技能
  async enhance(conversationPath: string): Promise<SkillEnhanceResult> {
    const prompt = `Analyze the conversation at "${conversationPath}" and determine if a skill should be created or enhanced. Follow the appropriate meta skill.`;

    const result = await this.agentRunner.run(prompt);
    return this.parseEnhanceResult(result);
  }

  // 搜索技能
  async search(query: string): Promise<SkillSearchResult> {
    const prompt = `Search for skills matching: "${query}"`;

    const result = await this.agentRunner.run(prompt);
    return this.parseSearchResult(result);
  }

  // 评估技能
  async evaluate(skillName: string): Promise<SkillEvaluateResult> {
    const prompt = `Evaluate the skill "${skillName}" following the evaluating-skills meta skill.`;

    const result = await this.agentRunner.run(prompt);
    return this.parseEvaluateResult(result);
  }
}
```

### 关键变化

| 方面 | 之前 | 之后 |
|------|------|------|
| LLM 调用 | 单次调用，返回 JSON | Agent Loop，可执行工具 |
| 技能创建 | 只返回建议 | 实际执行创建（通过元技能） |
| 会话管理 | 每次重置 | 持久会话 |
| 输出 | 无 | 静默，只返回结果 |

## SkillMemoryStore 扩展

### 新增功能

```typescript
// src/agent/skill-memory-store.ts

interface SkillMetadata {
  name: string;
  description: string;
  type?: string;        // 新增：'meta' | undefined
  // ... 其他字段
}

export class SkillMemoryStore {
  // ... 现有字段 ...

  /**
   * 获取所有元技能（type: meta）的完整 SKILL.md 内容
   */
  getMetaSkillContents(): string {
    const metaSkills = this.skills.filter(s => s.type === 'meta');

    return metaSkills
      .map(skill => {
        const body = this.getBody(skill.name);
        return `### ${skill.name}\n\n${body}`;
      })
      .join('\n\n---\n\n');
  }

  /**
   * 判断技能是否为元技能
   */
  isMetaSkill(name: string): boolean {
    const skill = this.skills.find(s => s.name === name);
    return skill?.type === 'meta';
  }
}
```

### Frontmatter 解析更新

```typescript
// 解析 SKILL.md frontmatter 时，提取 type 字段
private parseSkillMd(content: string): SkillMetadata {
  // 现有解析逻辑...

  // 新增：提取 type 字段
  const typeMatch = frontmatter.match(/^type:\s*(.+)$/m);
  if (typeMatch) {
    metadata.type = typeMatch[1].trim();
  }

  return metadata;
}
```

## 元技能 Frontmatter 修改

需要修改三个元技能的 SKILL.md，添加 `type: meta`：

```yaml
# ~/.synapse/skills/skill-creator/SKILL.md
---
name: skill-creator
description: Guide for creating effective skills...
type: meta
---

# ~/.synapse/skills/enhancing-skills/SKILL.md
---
name: enhancing-skills
description: Guide for enhancing and improving existing skills...
type: meta
---

# ~/.synapse/skills/evaluating-skills/SKILL.md
---
name: evaluating-skills
description: Guide for evaluating and quality assessment...
type: meta
---
```

## 实现计划

### 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/agent/agent-runner.ts` | **新建** | 从 repl.ts 提取通用 AgentRunner |
| `src/agent/index.ts` | 修改 | 导出 AgentRunner 相关类型 |
| `src/cli/repl.ts` | 修改 | 移除 AgentRunner 类，引用新模块 |
| `src/agent/skill-sub-agent.ts` | 修改 | 重构为使用 AgentRunner |
| `src/agent/skill-sub-agent-prompt.ts` | 修改 | 更新提示词构建逻辑 |
| `src/agent/skill-sub-agent-types.ts` | 修改 | 添加 SkillEvaluateResult 类型 |
| `src/agent/skill-memory-store.ts` | 修改 | 添加元技能识别和加载 |
| `~/.synapse/skills/skill-creator/SKILL.md` | 修改 | 添加 `type: meta` |
| `~/.synapse/skills/enhancing-skills/SKILL.md` | 修改 | 添加 `type: meta` |
| `~/.synapse/skills/evaluating-skills/SKILL.md` | 修改 | 添加 `type: meta` |

### 实现步骤

1. **提取 AgentRunner** - 从 repl.ts 提取到独立模块，添加 outputMode 支持
2. **更新 repl.ts** - 引用新的 AgentRunner，完成实例化配置
3. **扩展 SkillMemoryStore** - 添加 type 字段解析和 getMetaSkillContents 方法
4. **更新提示词** - 修改 buildSkillSubAgentPrompt 函数签名和内容
5. **重构 SkillSubAgent** - 使用 AgentRunner，实现 enhance/search/evaluate
6. **修改元技能** - 为三个元技能添加 `type: meta` 标记
7. **测试验证** - 手动测试 `/skill enhance --conversation` 命令
