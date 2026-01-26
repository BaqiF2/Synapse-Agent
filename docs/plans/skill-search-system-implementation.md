# 技能搜索系统实现计划

## 概述

基于 `02-architecture-and-features-part2.md` 文档中 4.4 节的设计，实现完整的技能搜索 Agent 系统。

## 当前实现状态

### 已实现的组件

| 组件 | 文件 | 状态 | 说明 |
|------|------|------|------|
| SkillLoader | `src/skills/skill-loader.ts` | ✅ 完成 | Level 1/2 渐进式加载 |
| SkillIndexer | `src/skills/indexer.ts` | ✅ 完成 | 技能索引管理 |
| SkillMemoryMap | `src/skills/skill-memory-map.ts` | ✅ 完成 | 技能内存映射 |
| SkillSubAgent | `src/skills/skill-sub-agent.ts` | ⚠️ 部分 | 有基础框架，需要完善 |
| SkillSearchHandler | `src/tools/handlers/agent-bash/skill-search.ts` | ⚠️ 部分 | 仅支持本地关键词搜索 |
| BashRouter | `src/tools/bash-router.ts` | ⚠️ 部分 | 缺少 skill 命令路由 |

### 需要实现的功能

1. **skill 命令路由** - 在 BashRouter 中添加对 `skill search/load` 命令的支持
2. **LLM 语义搜索** - 将 `skill search` 命令路由到 SkillSubAgent
3. **skill load 命令** - 实现直接从内存映射加载技能的功能
4. **SkillSubAgent 单例管理** - 实现持久化子 Agent 的生命周期管理

## 实现任务列表

### 批次 1：基础设施准备

#### Task 1.1: 添加 skill 命令识别到 BashRouter

**文件**: `src/tools/bash-router.ts`

**修改内容**:
1. 在 `identifyCommandType` 方法中添加 `skill search` 和 `skill load` 命令的识别
2. 将这两个命令归类为 `AGENT_SHELL_COMMAND` 类型
3. 在 `executeAgentShellCommand` 方法中添加路由逻辑

**具体步骤**:
```typescript
// 在 identifyCommandType 方法中添加
const agentShellCommandCommands = ['read', 'write', 'edit', 'glob', 'grep', 'bash', 'skill'];
```

```typescript
// 在 executeAgentShellCommand 方法中添加
if (trimmed.startsWith('skill ') || trimmed === 'skill') {
  return await this.executeSkillCommand(command);
}

private async executeSkillSubAgentCommand(command: string): Promise<CommandResult> {
  // 解析 skill search 或 skill load
  // 路由到对应处理器
}
```

**验证方式**:
- 单元测试：验证命令识别逻辑
- 集成测试：验证命令路由正确性

---

#### Task 1.2: 创建 SkillCommandHandler 处理器

**文件**: `src/tools/handlers/agent-bash/skill-command.ts` (新建)

**功能**:
- 解析 skill 命令的子命令（search、load）
- 路由到对应的处理逻辑

**接口设计**:
```typescript
export interface SkillCommandArgs {
  subcommand: 'search' | 'load' | 'help';
  query?: string;  // search 时的查询描述
  name?: string;   // load 时的技能名称
}

export class SkillCommandHandler {
  private skillSubAgentManager: SkillSubAgentManager;

  async execute(command: string): Promise<CommandResult>;
  private parseCommand(command: string): SkillCommandArgs;
}
```

**命令语法**:
```
skill search "<功能描述>"   # 语义搜索
skill load <skill-name>     # 加载技能内容
skill -h | --help           # 显示帮助
```

**验证方式**:
- 单元测试：命令解析测试
- 单元测试：help 输出测试

---

#### Task 1.3: 创建 SkillSubAgentManager 单例管理器

**文件**: `src/skills/skill-sub-agent-manager.ts` (新建)

**功能**:
- 管理 SkillSubAgent 的生命周期
- 实现单例模式，确保 session 内复用同一个 Agent
- 提供初始化和销毁方法

**接口设计**:
```typescript
export class SkillSubAgentManager {
  private static instance: SkillSubAgentManager | null = null;
  private skillSubAgent: SkillSubAgent | null = null;
  private isInitialized: boolean = false;

  static getInstance(): SkillSubAgentManager;

  async getAgent(): Promise<SkillSubAgent>;
  async initialize(): Promise<void>;
  destroy(): void;
}
```

**设计要点**:
- 延迟初始化：首次调用 `getAgent()` 时才创建 SkillSubAgent
- 会话复用：后续调用复用同一个实例
- 资源清理：提供 `destroy()` 方法供 session 结束时调用

**验证方式**:
- 单元测试：单例模式验证
- 单元测试：延迟初始化验证

---

### 批次 2：skill search 命令实现

#### Task 2.1: 实现 skill search 命令处理

**文件**: `src/tools/handlers/agent-bash/skill-command.ts`

**功能**:
- 解析 `skill search "<描述>"` 命令
- 调用 SkillSubAgent 的 search 方法
- 格式化返回结果

**处理流程**:
```
用户输入: skill search "分析 Python 代码质量"
    │
    ▼
SkillCommandHandler.execute()
    │
    ▼
SkillSubAgentManager.getAgent()
    │
    ├─ 首次调用: 创建并初始化 SkillSubAgent
    │
    └─ 后续调用: 复用现有实例
    │
    ▼
SkillSubAgent.search("分析 Python 代码质量")
    │
    ▼
返回 JSON 格式结果
```

**输出格式** (与 PRD 对齐):
```json
{
  "matched_skills": [
    {
      "name": "code-quality-analyzer",
      "description": "分析代码质量并提供改进建议"
    }
  ]
}
```

**验证方式**:
- 集成测试：调用 search 命令并验证返回格式
- Mock 测试：验证与 SkillSubAgent 的交互

---

#### Task 2.2: 完善 SkillSubAgent.search 方法

**文件**: `src/skills/skill-sub-agent.ts`

**当前状态**: 基础实现已存在，需要优化

**优化内容**:
1. 改进 LLM 提示词，确保返回格式一致
2. 添加错误处理和重试逻辑
3. 优化技能描述列表的注入方式

**系统提示词优化**:
```typescript
const SKILL_SUB_AGENT_SYSTEM_PROMPT = `你是一个技能搜索助手，负责根据用户的任务描述匹配相关技能。

## 可用技能

{SKILL_DESCRIPTIONS}

## 搜索规则

1. 仔细分析用户的任务描述
2. 从可用技能中选择语义上最匹配的技能
3. 只返回真正相关的技能，不要勉强匹配
4. 如果没有匹配的技能，返回空数组

## 返回格式

必须返回以下 JSON 格式：
\`\`\`json
{
  "matched_skills": [
    {"name": "技能名称", "description": "技能描述"}
  ]
}
\`\`\`
`;
```

**验证方式**:
- 单元测试：提示词格式验证
- 集成测试：实际搜索测试（需要 API key）

---

#### Task 2.3: 添加搜索结果的 XML 格式转换

**文件**: `src/skills/skill-sub-agent.ts` 或 `src/tools/handlers/agent-bash/skill-command.ts`

**功能**: 将搜索结果转换为 XML 格式，用于注入主 Agent 上下文

**当前状态**: SkillSubAgent 已有 `formatSearchResultAsXml` 方法

**验证内容**:
- 确认 XML 格式与 PRD 一致：
```xml
<available-skills>
  <skill name="code-quality-analyzer">
    分析代码质量并提供改进建议
  </skill>
</available-skills>
```

**验证方式**:
- 单元测试：XML 格式输出验证

---

### 批次 3：skill load 命令实现

#### Task 3.1: 实现 skill load 命令处理

**文件**: `src/tools/handlers/agent-bash/skill-command.ts`

**功能**:
- 解析 `skill load <name>` 命令
- 从 SkillMemoryMap 读取技能内容
- 返回完整的 SKILL.md 内容

**处理流程**:
```
用户输入: skill load code-quality-analyzer
    │
    ▼
SkillCommandHandler.execute()
    │
    ▼
从 SkillSubAgent/SkillMemoryMap 获取技能内容
    │
    ├─ 技能存在: 返回完整 SKILL.md 内容
    │
    └─ 技能不存在: 返回错误信息
```

**关键设计点**:
- `skill load` 是纯代码逻辑，不经过 LLM
- 直接从内存映射读取，确保快速响应
- 返回格式化的技能内容

**输出格式**:
```
# Skill: code-quality-analyzer

[SKILL.md 完整内容]
```

**验证方式**:
- 单元测试：加载存在的技能
- 单元测试：加载不存在的技能（错误处理）
- 集成测试：完整流程测试

---

#### Task 3.2: 确保 SkillMemoryMap 正确加载 body 内容

**文件**: `src/skills/skill-memory-map.ts`

**当前状态**: 已有 `loadBody` 和 `getSkillContent` 方法

**验证内容**:
1. 确认 body 内容是懒加载的
2. 确认 `getSkillContent` 返回正确格式
3. 确认缓存机制正常工作

**验证方式**:
- 单元测试：验证懒加载行为
- 单元测试：验证内容格式

---

### 批次 4：集成与测试

#### Task 4.1: 更新 BashRouter 集成

**文件**: `src/tools/bash-router.ts`

**修改内容**:
1. 引入 SkillCommandHandler
2. 在构造函数中初始化 handler
3. 在 `executeAgentShellCommand` 中添加路由

**代码示例**:
```typescript
import { SkillCommandHandler } from './handlers/agent-bash/skill-command.js';

export class BashRouter {
  private skillCommandHandler: SkillCommandHandler;

  constructor(private session: BashSession) {
    // ... 现有代码
    this.skillCommandHandler = new SkillCommandHandler();
  }

  private async executeAgentShellCommand(command: string): Promise<CommandResult> {
    const trimmed = command.trim();

    // 添加 skill 命令路由
    if (trimmed.startsWith('skill ') || trimmed === 'skill') {
      return await this.skillCommandHandler.execute(command);
    }

    // ... 现有代码
  }
}
```

**验证方式**:
- 集成测试：完整命令执行测试

---

#### Task 4.2: 更新模块导出

**文件**:
- `src/skills/index.ts`
- `src/tools/handlers/agent-bash/index.ts`

**修改内容**:
1. 导出 SkillSubAgentManager
2. 导出 SkillCommandHandler

**验证方式**:
- 编译测试：确保导出正确

---

#### Task 4.3: 编写集成测试

**文件**: `tests/skill-search-integration.test.ts` (新建)

**测试用例**:
1. `skill search` 基本功能测试
2. `skill load` 基本功能测试
3. 错误处理测试
4. 单例管理器测试

**Mock 策略**:
- Mock LLM 调用，确保测试稳定性
- 使用测试 fixtures 中的示例技能

---

#### Task 4.4: 更新文档

**文件**: `CLAUDE.md` 或相关文档

**内容**:
1. 添加 skill 命令使用说明
2. 更新命令参考文档

---

## 文件变更总结

### 新建文件
- `src/tools/handlers/agent-bash/skill-command.ts` - Skill 命令处理器
- `src/skills/skill-sub-agent-manager.ts` - SkillSubAgent 单例管理器
- `tests/skill-search-integration.test.ts` - 集成测试

### 修改文件
- `src/tools/bash-router.ts` - 添加 skill 命令路由
- `src/skills/skill-sub-agent.ts` - 完善搜索逻辑
- `src/skills/index.ts` - 更新导出
- `src/tools/handlers/agent-bash/index.ts` - 更新导出

## 依赖关系

```
BashRouter
    │
    ├── SkillCommandHandler (新建)
    │       │
    │       └── SkillSubAgentManager (新建)
    │               │
    │               └── SkillSubAgent (现有)
    │                       │
    │                       ├── SkillMemoryMap (现有)
    │                       │
    │                       └── LlmClient (现有)
    │
    └── 其他现有 handlers...
```

## 验证清单

- [ ] `skill search "<描述>"` 返回 JSON 格式的匹配技能列表
- [ ] `skill load <name>` 返回完整的 SKILL.md 内容
- [ ] `skill -h` 显示帮助信息
- [ ] SkillSubAgent 在 session 内持久化运行
- [ ] 后续 skill 命令复用同一个 SkillSubAgent 实例
- [ ] 错误处理：技能不存在时返回友好的错误信息
- [ ] 所有单元测试通过
- [ ] 集成测试通过

## 注意事项

1. **LLM 调用成本**: skill search 会调用 LLM，注意在测试中使用 mock
2. **错误处理**: 确保 LLM 调用失败时有友好的降级策略
3. **性能**: SkillMemoryMap 的初始化可能耗时，确保只在首次调用时执行
4. **向后兼容**: 现有的 `skill:*` 命令（执行技能脚本）不受影响
