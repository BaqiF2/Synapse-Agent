# 技能系统与强化功能实现计划 - 概览

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现完整的技能系统（4.4）和技能强化功能（4.5），包括 Skill 子 Agent、语义搜索、技能加载、自动强化等核心能力。

**Architecture:** 采用持久化子 Agent 架构，Skill 子 Agent 拥有独立的 LLM 会话，负责技能搜索和强化。主 Agent 通过 `skill` 命令与子 Agent 交互，`skill load` 命令直接从内存映射读取不经过子 Agent。

**Tech Stack:** TypeScript, Bun, Anthropic SDK, Zod

---

## 批次概览

| 批次 | 文件 | 主要内容 | 预估复杂度 |
|------|------|----------|------------|
| Batch 1 | [01-settings-infrastructure.md](./01-settings-infrastructure.md) | 设置管理基础设施 | 低 |
| Batch 2 | [02-skill-sub-agent-core.md](./02-skill-sub-agent-core.md) | Skill 子 Agent 核心架构 | 高 |
| Batch 3 | [03-skill-commands.md](./03-skill-commands.md) | skill load/search 命令路由 | 中 |
| Batch 4 | [04-skill-enhance-basic.md](./04-skill-enhance-basic.md) | skill enhance 基础功能 | 高 |
| Batch 5 | [05-auto-enhance-integration.md](./05-auto-enhance-integration.md) | 自动强化触发与脚本转换集成 | 中 |
| Batch 6 | [06-e2e-testing.md](./06-e2e-testing.md) | 集成测试和端到端验证 | 中 |
| Batch 7 | [07-meta-skills.md](./07-meta-skills.md) | 元技能模板生成 | 低 |
| Batch 8 | [08-documentation.md](./08-documentation.md) | 文档更新（README 等） | 低 |

## 依赖关系

```
Batch 1 (设置基础设施)
    │
    ▼
Batch 2 (Skill 子 Agent 核心)
    │
    ▼
Batch 3 (skill 命令路由)
    │
    ├──────────────┬──────────────┐
    ▼              ▼              ▼
Batch 4        Batch 5        Batch 7
(enhance)      (自动强化)      (元技能)
    │              │              │
    └──────┬───────┴──────────────┘
           ▼
       Batch 6
      (E2E 测试)
           │
           ▼
       Batch 8
      (文档更新)
```

## 现有代码基础

### 已实现的组件

| 组件 | 文件 | 状态 |
|------|------|------|
| SkillLoader | `src/skills/skill-loader.ts` | ✅ 完整 |
| SkillIndexer | `src/skills/indexer.ts` | ✅ 完整 |
| SkillDocParser | `src/skills/skill-schema.ts` | ✅ 完整 |
| SkillSearchHandler | `src/tools/handlers/agent-bash/skill-search.ts` | ✅ 基于关键词 |
| BashRouter | `src/tools/bash-router.ts` | ✅ 三层路由 |
| ContextPersistence | `src/agent/context-persistence.ts` | ✅ 会话持久化 |
| LlmClient | `src/agent/llm-client.ts` | ✅ LLM 通信 |

### 需要新增的组件

| 组件 | 文件 | 功能 |
|------|------|------|
| SettingsManager | `src/config/settings-manager.ts` | 设置持久化管理 |
| SkillSubAgent | `src/agent/skill-sub-agent.ts` | Skill 子 Agent 核心 |
| SkillCommandHandler | `src/tools/handlers/skill-command-handler.ts` | 统一 skill 命令处理 |
| SkillEnhancer | `src/skills/skill-enhancer.ts` | 技能强化逻辑 |
| AutoEnhanceTrigger | `src/agent/auto-enhance-trigger.ts` | 自动强化触发 |

## 关键接口定义

### SkillMetadata（子 Agent 内存结构）

```typescript
interface SkillMetadata {
  name: string;        // 技能名称
  description: string; // 技能描述
  body: string;        // SKILL.md 正文（按需加载）
  path: string;        // SKILL.md 完整路径
  dir: string;         // 技能目录路径
}
```

### Settings（设置结构）

```typescript
interface SynapseSettings {
  version: string;
  skillEnhance: {
    autoEnhance: boolean;
    maxEnhanceContextTokens: number;
  };
  // 其他设置...
}
```

## 测试策略

- 每个批次完成后运行对应的单元测试
- Batch 6 执行完整的 E2E 测试
- 使用 `bun test` 运行测试

## 执行顺序

1. 从 Batch 1 开始，按顺序执行
2. 每个批次完成后进行代码审查
3. 确保测试通过后再进入下一批次
