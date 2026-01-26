# 技能强化系统实现计划

## 概述

基于 `02-architecture-and-features-part3.md` 文档中 4.5 节的设计，实现完整的技能强化功能。

**前置依赖**: 技能搜索系统已实现（参考 `skill-search-system-implementation.md`）

## 当前实现状态

### 已实现的组件

| 组件 | 文件 | 状态 | 说明 |
|------|------|------|------|
| SkillSubAgent | `src/skills/skill-sub-agent.ts` | ⚠️ 部分 | 有 enhance 方法的基础框架 |
| SkillMemoryMap | `src/skills/skill-memory-map.ts` | ✅ 完成 | 支持技能读写 |

### 需要实现的功能

1. **开关机制** - `skill enhance --on/--off` 和设置持久化
2. **会话历史存储** - 对话历史的 JSONL 存储
3. **自动触发机制** - 任务完成后的自动判断
4. **强化执行流程** - 完整的分析、决策、执行、反馈流程
5. **技能生成/更新** - 创建新技能或更新已有技能

## 实现任务列表

### 批次 1：设置与会话历史基础设施

#### Task 1.1: 创建 Settings 管理模块

**文件**: `src/config/settings.ts` (新建)

**功能**:
- 管理用户设置的读写
- 支持设置持久化到 `~/.synapse/settings.json`
- 提供类型安全的设置访问接口

**接口设计**:
```typescript
/**
 * 用户设置接口
 */
export interface SynapseSettings {
  /** 自动技能强化开关 */
  autoEnhance: boolean;
  /** 强化上下文最大 token 数 */
  maxEnhanceContextTokens: number;
  /** 其他设置... */
}

/**
 * 默认设置
 */
const DEFAULT_SETTINGS: SynapseSettings = {
  autoEnhance: false,
  maxEnhanceContextTokens: 8000,
};

/**
 * Settings 管理器
 */
export class SettingsManager {
  private settingsPath: string;
  private settings: SynapseSettings;

  constructor(homeDir?: string);

  /** 加载设置 */
  load(): SynapseSettings;

  /** 保存设置 */
  save(): void;

  /** 获取设置值 */
  get<K extends keyof SynapseSettings>(key: K): SynapseSettings[K];

  /** 设置值 */
  set<K extends keyof SynapseSettings>(key: K, value: SynapseSettings[K]): void;
}
```

**设置文件格式** (`~/.synapse/settings.json`):
```json
{
  "autoEnhance": false,
  "maxEnhanceContextTokens": 8000
}
```

**验证方式**:
- 单元测试：设置读写测试
- 单元测试：默认值测试

---

#### Task 1.2: 创建 ConversationPersistence 会话历史存储

**文件**: `src/agent/conversation-persistence.ts` (新建)

**功能**:
- 将对话历史存储为 JSONL 格式
- 支持按 session ID 管理会话文件
- 支持从末尾读取指定 token 数量的内容

**接口设计**:
```typescript
/**
 * 对话消息接口
 */
export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  toolCalls?: Array<{
    name: string;
    input: unknown;
    result: unknown;
  }>;
}

/**
 * 会话持久化管理器
 */
export class ConversationPersistence {
  private conversationsDir: string;
  private sessionId: string;
  private filePath: string;

  constructor(sessionId: string, homeDir?: string);

  /** 追加消息到会话历史 */
  append(message: ConversationMessage): void;

  /** 读取完整会话历史 */
  readAll(): ConversationMessage[];

  /** 从末尾读取指定 token 数量的内容（用于强化分析） */
  readTruncated(maxTokens: number): string;

  /** 获取会话文件路径 */
  getFilePath(): string;

  /** 清理会话历史 */
  clear(): void;
}
```

**存储路径**: `~/.synapse/conversations/<session-id>.jsonl`

**JSONL 格式示例**:
```jsonl
{"role":"user","content":"帮我分析 error.log","timestamp":"2025-01-26T10:00:00.000Z"}
{"role":"assistant","content":"...","timestamp":"2025-01-26T10:00:05.000Z","toolCalls":[...]}
```

**验证方式**:
- 单元测试：追加和读取测试
- 单元测试：截断读取测试

---

#### Task 1.3: 更新 SkillCommandHandler 支持 enhance 命令

**文件**: `src/tools/handlers/agent-bash/skill-command.ts`

**修改内容**:
1. 添加 `skill enhance [--on|--off]` 命令解析
2. 实现开关切换逻辑

**命令语法**:
```
skill enhance           # 手动触发强化
skill enhance --on      # 开启自动强化
skill enhance --off     # 关闭自动强化
```

**处理流程**:
```
skill enhance --on
    │
    ▼
SettingsManager.set('autoEnhance', true)
    │
    ▼
返回提示信息:
⚠️ 开启自动技能强化功能
   每轮任务结束后将自动分析是否需要强化技能
   这将产生额外的 token 消耗

   使用 `skill enhance --off` 可随时关闭

✓ 自动强化已开启
```

**验证方式**:
- 单元测试：开关切换测试
- 单元测试：设置持久化验证

---

### 批次 2：手动强化功能实现

#### Task 2.1: 完善 SkillSubAgent.enhance 方法

**文件**: `src/skills/skill-sub-agent.ts`

**当前状态**: 有基础框架，需要完善

**优化内容**:
1. 改进系统提示词，明确强化决策逻辑
2. 添加技能创建/更新工具调用支持
3. 完善返回结果格式

**系统提示词优化**:
```typescript
const SKILL_ENHANCE_PROMPT = `你是一个技能强化助手，负责分析会话历史并决定是否需要创建新技能或强化已有技能。

## 分析维度

1. **任务复杂度**
   - 执行步骤数量
   - 工具调用次数
   - 是否涉及多个文件或系统

2. **可复用性**
   - 是否发现可复用的工作流模式
   - 工具调用序列是否有明确的模式

3. **技能使用情况**
   - 本次任务是否使用了某个技能
   - 技能执行效果如何
   - 是否有改进空间

## 决策规则

| 情况 | 决策 |
|------|------|
| 任务使用了技能，执行效果良好 | 无需操作 |
| 任务使用了技能，但有改进空间 | 强化该技能 |
| 任务未使用技能，发现可复用模式 | 新增技能 |
| 任务简单，无复用价值 | 无需操作 |

## 返回格式

\`\`\`json
{
  "action": "create" | "update" | "none",
  "skillName": "可选，技能名称",
  "changes": ["变更列表"],
  "report": "人类可读的报告"
}
\`\`\`
`;
```

**验证方式**:
- 单元测试：提示词格式验证
- Mock 测试：决策逻辑测试

---

#### Task 2.2: 实现技能创建/更新执行逻辑

**文件**: `src/skills/skill-enhancer.ts` (新建)

**功能**:
- 根据 SkillSubAgent 的决策执行实际的技能操作
- 创建新技能目录和文件
- 更新已有技能文件
- 更新技能索引

**接口设计**:
```typescript
/**
 * 技能增强器
 */
export class SkillEnhancer {
  private skillsDir: string;
  private indexer: SkillIndexer;

  constructor(homeDir?: string);

  /**
   * 创建新技能
   */
  createSkill(skillName: string, content: string): CreateResult;

  /**
   * 更新已有技能
   */
  updateSkill(skillName: string, content: string): UpdateResult;

  /**
   * 执行强化决策
   */
  execute(decision: SkillEnhanceResult): ExecuteResult;
}
```

**创建技能的目录结构**:
```
~/.synapse/skills/<name>/
├── SKILL.md          # 主文档
├── references/       # 可选，详细参考资料
└── scripts/          # 可选，可执行脚本
```

**验证方式**:
- 单元测试：技能创建测试
- 单元测试：技能更新测试
- 集成测试：完整强化流程测试

---

#### Task 2.3: 实现手动 `skill enhance` 命令

**文件**: `src/tools/handlers/agent-bash/skill-command.ts`

**处理流程**:
```
skill enhance
    │
    ▼
获取当前 session 的会话历史路径
    │
    ▼
ConversationPersistence.readTruncated(maxTokens)
    │
    ▼
SkillSubAgent.enhance(conversationContent)
    │
    ▼
SkillEnhancer.execute(decision)
    │
    ▼
返回强化报告
```

**输出格式示例**:

新增技能时：
```
技能强化完成：
- 操作：新增技能
- 名称：analyzing-logs
- 包含工具：grep, read, glob
- 技能内容：
  - 分析日志文件
  - 寻找错误信息
```

强化已有技能时：
```
技能强化完成：
- 操作：强化技能
- 名称：code-review
- 强化内容：
  - 新增 Python 类型检查步骤
  - 补充错误处理最佳实践
```

无需操作时：
```
技能强化分析完成：
- 结论：无需强化
- 原因：本次任务已由现有技能完整覆盖，执行效果良好
```

**验证方式**:
- 集成测试：手动强化命令测试
- Mock 测试：不同决策结果的输出测试

---

#### Task 2.4: 配置 SkillSubAgent 的工具集

**文件**: `src/skills/skill-sub-agent.ts`

**功能**: 配置 SkillSubAgent 可用的工具列表

**PRD 要求** (4.5.4 节):

Skill 子 Agent 需要以下工具来执行强化操作：

| 工具 | 用途 |
|------|------|
| `read` | 读取会话历史、已有技能文件 |
| `write` | 创建新文件（SKILL.md、references、scripts） |
| `edit` | 编辑已有文件（强化技能时使用） |
| `glob` | 扫描技能目录 |
| `grep` | 搜索技能内容 |

**实现方式**:

```typescript
/**
 * SkillSubAgent 可用的工具定义
 */
const SKILL_SUB_AGENT_TOOLS = [
  'read',   // 读取文件
  'write',  // 写入文件
  'edit',   // 编辑文件
  'glob',   // 文件模式匹配
  'grep',   // 内容搜索
] as const;

/**
 * SkillSubAgent 的系统提示词中注入工具使用说明
 */
const SKILL_SUB_AGENT_TOOL_INSTRUCTIONS = `
## 可用工具

你可以使用以下工具完成技能管理操作：

### read - 读取文件
用法：read <file_path>
示例：read ~/.synapse/skills/code-review/SKILL.md

### write - 创建/覆盖文件
用法：write <file_path> <content>
示例：write ~/.synapse/skills/new-skill/SKILL.md "---\\nname: new-skill\\n..."

### edit - 编辑文件
用法：edit <file_path> <old_content> <new_content>
示例：edit ~/.synapse/skills/code-review/SKILL.md "旧内容" "新内容"

### glob - 文件模式匹配
用法：glob <pattern>
示例：glob "~/.synapse/skills/*/SKILL.md"

### grep - 搜索内容
用法：grep <pattern> <path>
示例：grep "analyzing" ~/.synapse/skills/
`;
```

**验证方式**:
- 单元测试：验证工具列表配置
- 集成测试：验证 SkillSubAgent 可以正确调用这些工具

---

### 批次 3：自动强化功能实现

#### Task 3.1: 创建 AutoEnhanceManager 自动强化管理器

**文件**: `src/skills/auto-enhance-manager.ts` (新建)

**功能**:
- 管理自动强化的触发逻辑
- 提供任务结束时的强化判断钩子
- 执行自动强化流程

**接口设计**:
```typescript
/**
 * 自动强化管理器
 */
export class AutoEnhanceManager {
  private settingsManager: SettingsManager;
  private skillSubAgentManager: SkillSubAgentManager;
  private skillEnhancer: SkillEnhancer;

  constructor();

  /**
   * 检查是否应该触发自动强化
   * 在主 Agent 任务完成后调用
   */
  async shouldEnhance(taskContext: TaskContext): Promise<boolean>;

  /**
   * 执行自动强化
   */
  async enhance(conversationPath: string): Promise<EnhanceReport>;

  /**
   * 任务完成钩子（供主 Agent 调用）
   */
  async onTaskComplete(taskContext: TaskContext): Promise<EnhanceReport | null>;
}

/**
 * 任务上下文（用于判断是否需要强化）
 */
interface TaskContext {
  /** 执行步骤数量 */
  stepCount: number;
  /** 工具调用次数 */
  toolCallCount: number;
  /** 使用的技能列表 */
  usedSkills: string[];
  /** 会话历史文件路径 */
  conversationPath: string;
}
```

**判断逻辑**（主 Agent 内联判断）:
```typescript
async shouldEnhance(taskContext: TaskContext): Promise<boolean> {
  // 检查开关
  if (!this.settingsManager.get('autoEnhance')) {
    return false;
  }

  // 简单规则判断（不调用 LLM）
  // 至少满足以下条件之一：
  // 1. 任务涉及多步骤（>=3）
  // 2. 工具调用次数较多（>=5）
  // 3. 未使用任何已有技能
  const { stepCount, toolCallCount, usedSkills } = taskContext;

  if (stepCount >= 3) return true;
  if (toolCallCount >= 5) return true;
  if (usedSkills.length === 0 && toolCallCount >= 2) return true;

  return false;
}
```

**验证方式**:
- 单元测试：判断逻辑测试
- 单元测试：开关状态测试

---

#### Task 3.2: 集成自动强化到主 Agent 流程

**文件**: `src/agent/llm-client.ts` 或相关主 Agent 文件

**修改内容**:
1. 在任务完成后调用 `AutoEnhanceManager.onTaskComplete`
2. 将强化报告附加到输出

**集成点**:
```typescript
// 在主 Agent 完成任务后
async completeTask(response: string, taskContext: TaskContext): Promise<string> {
  let output = response;

  // 尝试自动强化
  const enhanceReport = await this.autoEnhanceManager.onTaskComplete(taskContext);

  if (enhanceReport) {
    output += '\n\n' + this.formatEnhanceReport(enhanceReport);
  }

  return output;
}
```

**注意**: 需要先了解现有主 Agent 的任务完成流程，确定最佳集成点

**验证方式**:
- 集成测试：自动强化触发测试
- 集成测试：报告附加测试

---

#### Task 3.3: 更新 ConversationPersistence 支持任务上下文收集

**文件**: `src/agent/conversation-persistence.ts`

**新增功能**:
- 收集任务执行过程中的统计信息
- 提供任务上下文摘要

**新增接口**:
```typescript
export class ConversationPersistence {
  // ... 现有方法

  /**
   * 获取任务上下文摘要
   */
  getTaskContext(): TaskContext {
    const messages = this.readAll();
    return {
      stepCount: this.countSteps(messages),
      toolCallCount: this.countToolCalls(messages),
      usedSkills: this.extractUsedSkills(messages),
      conversationPath: this.filePath,
    };
  }

  private countSteps(messages: ConversationMessage[]): number;
  private countToolCalls(messages: ConversationMessage[]): number;
  private extractUsedSkills(messages: ConversationMessage[]): string[];
}
```

**验证方式**:
- 单元测试：上下文收集测试

---

### 批次 4：元技能支持

> **说明**：脚本转 Extension Shell Command 由后台监听进程自动处理（参考 PRD 4.2.4），无需在强化流程中额外实现。
> 当 Skill 子 Agent 在 `scripts/` 目录下创建脚本文件后，后台进程会自动检测并调用 Skill2Bash 转换器生成 `skill:<skill_name>:<tool>` 命令包装器。

#### Task 4.1: 创建 creating-skills 元技能

**文件**: `~/.synapse/skills/creating-skills/SKILL.md` (运行时创建)

**功能**: 指导 Skill 子 Agent 如何创建新技能

**内容**:
```markdown
---
name: creating-skills
description: 指导如何创建新技能的元技能。当需要从会话历史中提取可复用模式并生成新技能时使用此技能。
---

# Creating Skills

## 技能结构

每个技能是一个目录，包含以下文件：

```
skill-name/
├── SKILL.md          # 必需，主文档
├── references/       # 可选，详细参考资料
└── scripts/          # 可选，可执行脚本
```

## SKILL.md 格式

\`\`\`markdown
---
name: skill-name (动名词格式，如 analyzing-logs)
description: 简要描述功能 + 使用时机 + 关键词 (最多1024字符，第三人称)
---

# 技能标题

## 快速开始

[最常用的执行流程，包含具体的 Shell 命令示例]

\`\`\`bash
# 具体的命令序列
glob "**/*.log"
read error.log
grep "ERROR|WARN" error.log
\`\`\`

## 执行步骤

[详细的工作流程，分步骤说明]

## 最佳实践

- [从任务中总结的经验]
- [特定场景的注意事项]
\`\`\`

## 命名规范

- 使用动名词格式：analyzing-logs, reviewing-code, deploying-app
- 小写字母 + 连字符
- 最多 64 个字符

## 描述写作指南

1. 用第三人称书写
2. 包含功能描述 + 使用时机 + 关键词
3. 最多 1024 个字符

示例：
- ✅ "分析日志文件并提取错误信息。当用户需要调试应用程序、查找系统问题或分析运行日志时使用此技能。关键词：log, error, debug, analysis"
- ❌ "我可以帮你分析日志"（不要用第一人称）
```

**验证方式**:
- 手动验证：元技能格式正确性

---

#### Task 4.2: 创建 enhancing-skills 元技能

**文件**: `~/.synapse/skills/enhancing-skills/SKILL.md` (运行时创建)

**功能**: 指导 Skill 子 Agent 如何强化已有技能

**内容**:
```markdown
---
name: enhancing-skills
description: 指导如何强化已有技能的元技能。当需要更新现有技能以提升其效果时使用此技能。
---

# Enhancing Skills

## 强化策略

### 1. 补充示例
- 添加新的使用场景
- 提供更多输入/输出对
- 覆盖边缘情况

### 2. 优化步骤
- 改进执行顺序
- 移除冗余操作
- 添加并行执行建议

### 3. 添加反馈循环
- 引入验证步骤
- 添加错误处理
- 提供回滚方案

### 4. 更新最佳实践
- 记录新发现的经验
- 更新警告和注意事项
- 添加性能优化建议

## 强化原则

1. **简洁优先**：假设 LLM 已经很聪明，只添加必要信息
2. **具体命令**：提供可直接执行的命令，避免抽象描述
3. **渐进式披露**：主体内容保持在 500 行以内
4. **避免重复**：不要添加与现有内容重复的信息
```

**验证方式**:
- 手动验证：元技能格式正确性

---

#### Task 4.3: 更新 SkillSubAgent 以支持元技能加载

**文件**: `src/skills/skill-sub-agent.ts`

**修改内容**:
1. 在强化时自动加载 creating-skills 或 enhancing-skills 元技能
2. 将元技能内容注入系统提示词

**实现**:
```typescript
private async getEnhanceSystemPrompt(action: 'create' | 'update'): Promise<string> {
  const basePrompt = SKILL_ENHANCE_PROMPT;

  // 加载相应的元技能
  const metaSkillName = action === 'create' ? 'creating-skills' : 'enhancing-skills';
  const metaSkillContent = this.memoryMap.getSkillContent(metaSkillName);

  if (metaSkillContent) {
    return `${basePrompt}\n\n## 参考指南\n\n${metaSkillContent}`;
  }

  return basePrompt;
}
```

**验证方式**:
- 单元测试：元技能加载测试
- 集成测试：使用元技能的强化测试

---

### 批次 5：集成与测试

#### Task 5.1: 更新模块导出

**文件**:
- `src/config/index.ts` (新建)
- `src/skills/index.ts`
- `src/agent/index.ts`

**导出内容**:
- SettingsManager
- ConversationPersistence
- SkillEnhancer
- AutoEnhanceManager

**验证方式**:
- 编译测试：确保导出正确

---

#### Task 5.2: 编写集成测试

**文件**: `tests/skill-enhance-integration.test.ts` (新建)

**测试用例**:
1. 手动强化命令测试
2. 自动强化触发测试
3. 开关切换测试
4. 技能创建测试
5. 技能更新测试

**Mock 策略**:
- Mock LLM 调用
- 使用临时目录进行文件操作测试

---

#### Task 5.3: 更新文档

**文件**: `CLAUDE.md` 或相关文档

**内容**:
1. 添加 skill enhance 命令使用说明
2. 添加自动强化功能说明
3. 更新配置说明

---

## 文件变更总结

### 新建文件
- `src/config/settings.ts` - 设置管理器
- `src/config/index.ts` - 配置模块导出
- `src/agent/conversation-persistence.ts` - 会话历史持久化
- `src/skills/skill-enhancer.ts` - 技能增强器
- `src/skills/auto-enhance-manager.ts` - 自动强化管理器
- `tests/skill-enhance-integration.test.ts` - 集成测试

### 修改文件
- `src/tools/handlers/agent-bash/skill-command.ts` - 添加 enhance 命令
- `src/skills/skill-sub-agent.ts` - 完善 enhance 方法，配置可用工具集（read/write/edit/glob/grep）
- `src/skills/index.ts` - 更新导出
- `src/agent/index.ts` - 更新导出
- 主 Agent 文件 - 集成自动强化

### 运行时创建文件
- `~/.synapse/settings.json` - 用户设置
- `~/.synapse/conversations/<session-id>.jsonl` - 会话历史
- `~/.synapse/skills/creating-skills/SKILL.md` - 元技能
- `~/.synapse/skills/enhancing-skills/SKILL.md` - 元技能

## 依赖关系

```
AutoEnhanceManager
    │
    ├── SettingsManager
    │
    ├── SkillSubAgentManager
    │       │
    │       └── SkillSubAgent
    │               │
    │               └── SkillMemoryMap
    │
    └── SkillEnhancer
            │
            └── SkillIndexer

ConversationPersistence (独立模块)
```

## 验证清单

- [ ] `skill enhance --on` 开启自动强化并显示提示信息
- [ ] `skill enhance --off` 关闭自动强化
- [ ] `skill enhance` 手动触发强化并返回报告
- [ ] 设置持久化到 `~/.synapse/settings.json`
- [ ] 会话历史存储到 `~/.synapse/conversations/`
- [ ] 自动强化在任务完成后触发
- [ ] 创建新技能时生成正确的目录结构
- [ ] 更新技能时保留原有内容并追加新内容
- [ ] 强化报告格式正确
- [ ] SkillSubAgent 可正确使用 read/write/edit/glob/grep 工具
- [ ] 所有单元测试通过
- [ ] 集成测试通过

## 注意事项

1. **LLM 调用成本**: 强化功能会产生额外的 LLM 调用，需要在开启时明确告知用户
2. **会话历史截断**: 确保截断逻辑正确，避免分析过多或过少的上下文
3. **并发安全**: 确保文件操作的原子性，避免并发写入问题
4. **错误恢复**: 强化过程中出错时不应影响主任务的完成
5. **元技能初始化**: 首次使用时需要自动创建元技能文件
6. **脚本自动转换**: 当 Skill 子 Agent 在 `scripts/` 目录下创建脚本时，后台监听进程会自动调用 Skill2Bash 转换器生成 Extension Shell Command，无需在强化流程中额外处理
