# Skill Search Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate skill search from Agent Shell Command to Sub Agent for LLM-based semantic matching.

**Architecture:** Replace keyword-based `skill search` with `task:skill:search` that injects all skill metadata into sub-agent's systemPrompt, allowing LLM to perform semantic matching.

**Tech Stack:** TypeScript, Zod, Node.js fs module

---

## Task 1: Create skill-search.md Prompt Template

**Files:**
- Create: `src/sub-agents/configs/skill-search.md`

**Step 1: Create the prompt template file**

```markdown
skill-search - Search for matching skills by semantic similarity

ROLE:
    Skill Search Expert - Analyze user query and find semantically matching skills

AVAILABLE SKILLS:
${SKILL_LIST}

TASK:
    Given a user query, identify skills that semantically match the intent.
    Consider:
    - Semantic similarity, not just keyword matching
    - The user's underlying goal
    - Skill capabilities described in the description

OUTPUT FORMAT:
    Return JSON only, no additional text:

    When matches found:
        {"matched_skills": [{"name": "skill-name", "description": "..."}]}

    When no matches:
        {"matched_skills": []}

EXAMPLES:
    Query: "help me write unit tests"
    Output: {"matched_skills": [{"name": "testing", "description": "Unit testing utilities"}]}

    Query: "random unrelated topic"
    Output: {"matched_skills": []}
```

**Step 2: Verify file created**

Run: `cat src/sub-agents/configs/skill-search.md | head -5`
Expected: First 5 lines of the template

**Step 3: Commit**

```bash
git add src/sub-agents/configs/skill-search.md
git commit -m "feat(sub-agents): add skill-search prompt template"
```

---

## Task 2: Modify skill.ts to Dynamic Config Generation

**Files:**
- Modify: `src/sub-agents/configs/skill.ts`

**Step 1: Update imports and add helper types**

Replace the entire file with:

```typescript
/**
 * Skill Sub Agent 配置
 *
 * 功能：动态生成 Skill 类型 Sub Agent 的配置，注入技能元数据到 systemPrompt
 *
 * 核心导出：
 * - createSkillConfig: 动态生成 Skill Sub Agent 配置
 */

import * as path from 'node:path';
import type { SubAgentConfig } from '../sub-agent-types.ts';
import { SkillIndexer, type SkillIndexEntry } from '../../skills/indexer.js';
import { loadDesc } from '../../utils/load-desc.js';

/**
 * 技能元数据（用于 systemPrompt 注入）
 */
interface SkillMetadata {
  name: string;
  description?: string;
}

/**
 * 从索引加载所有技能元数据
 */
function loadAllSkillMetadata(): SkillMetadata[] {
  const indexer = new SkillIndexer();
  const index = indexer.getIndex();
  return index.skills.map((s: SkillIndexEntry) => ({
    name: s.name,
    description: s.description,
  }));
}

/**
 * 构建 systemPrompt，注入技能列表
 */
function buildSystemPrompt(metadata: SkillMetadata[]): string {
  const skillList =
    metadata.length > 0
      ? metadata.map((s, i) => `${i + 1}. ${s.name}: ${s.description || 'No description'}`).join('\n')
      : 'No skills available.';

  return loadDesc(path.join(import.meta.dirname, 'skill-search.md'), {
    SKILL_LIST: skillList,
  });
}

/**
 * 动态创建 Skill Sub Agent 配置
 *
 * 工具权限：主 Agent 全部命令，移除 task:skill:*（防止递归）
 */
export function createSkillConfig(): SubAgentConfig {
  const metadata = loadAllSkillMetadata();

  return {
    type: 'skill',
    permissions: {
      include: 'all',
      exclude: ['task:skill:search', 'task:skill:enhance'],
    },
    systemPrompt: buildSystemPrompt(metadata),
  };
}

/**
 * 保留静态导出以保持向后兼容（但实际使用时应调用 createSkillConfig）
 * @deprecated Use createSkillConfig() instead
 */
export const skillConfig: SubAgentConfig = {
  type: 'skill',
  permissions: {
    include: 'all',
    exclude: ['task:skill:search', 'task:skill:enhance'],
  },
  systemPrompt: 'Use createSkillConfig() for dynamic prompt generation.',
};
```

**Step 2: Verify TypeScript compiles**

Run: `cd /Users/wuwenjun/WebstormProjects/Synapse-Agent && npx tsc --noEmit src/sub-agents/configs/skill.ts 2>&1 | head -20`
Expected: No errors or only unrelated warnings

**Step 3: Commit**

```bash
git add src/sub-agents/configs/skill.ts
git commit -m "feat(sub-agents): dynamic skill config with metadata injection"
```

---

## Task 3: Modify configs/index.ts to Use Dynamic Config

**Files:**
- Modify: `src/sub-agents/configs/index.ts`

**Step 1: Update to call createSkillConfig for skill type**

Replace the entire file with:

```typescript
/**
 * Sub Agent 配置索引
 *
 * 功能：导出所有 Sub Agent 配置
 *
 * 核心导出：
 * - configs: 类型到配置的映射（用于非 skill 类型）
 * - getConfig: 获取指定类型的配置（skill 类型动态生成）
 */

import type { SubAgentConfig, SubAgentType } from '../sub-agent-types.ts';
import { createSkillConfig, skillConfig } from './skill.ts';
import { exploreConfig } from './explore.ts';
import { generalConfig } from './general.ts';

/**
 * 静态 Sub Agent 配置（不包含需要动态生成的 skill）
 */
const staticConfigs: Record<Exclude<SubAgentType, 'skill'>, SubAgentConfig> = {
  explore: exploreConfig,
  general: generalConfig,
};

/**
 * 所有 Sub Agent 配置（向后兼容）
 * @deprecated 对于 skill 类型，请使用 getConfig('skill') 获取动态配置
 */
export const configs: Record<SubAgentType, SubAgentConfig> = {
  skill: skillConfig,
  explore: exploreConfig,
  general: generalConfig,
};

/**
 * 获取指定类型的 Sub Agent 配置
 *
 * 注意：skill 类型会动态生成配置，注入最新的技能元数据
 */
export function getConfig(type: SubAgentType): SubAgentConfig {
  if (type === 'skill') {
    return createSkillConfig();
  }
  return staticConfigs[type];
}

export { skillConfig, createSkillConfig, exploreConfig, generalConfig };
```

**Step 2: Verify TypeScript compiles**

Run: `cd /Users/wuwenjun/WebstormProjects/Synapse-Agent && npx tsc --noEmit src/sub-agents/configs/index.ts 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add src/sub-agents/configs/index.ts
git commit -m "feat(sub-agents): use dynamic config for skill type"
```

---

## Task 4: Remove skill-search Handler Files

**Files:**
- Delete: `src/tools/handlers/agent-bash/skill-search.ts`
- Delete: `src/tools/handlers/agent-bash/skill-search.md`

**Step 1: Delete the files**

```bash
rm src/tools/handlers/agent-bash/skill-search.ts
rm src/tools/handlers/agent-bash/skill-search.md
```

**Step 2: Verify files deleted**

Run: `ls src/tools/handlers/agent-bash/skill-search* 2>&1`
Expected: "No such file or directory"

**Step 3: Commit**

```bash
git add -A src/tools/handlers/agent-bash/
git commit -m "refactor(tools): remove deprecated skill-search handler"
```

---

## Task 5: Update agent-bash/index.ts Exports

**Files:**
- Modify: `src/tools/handlers/agent-bash/index.ts`

**Step 1: Remove SkillSearchHandler export**

Replace the entire file with:

```typescript
/**
 * Agent Shell Command 处理器索引
 *
 * 功能：导出所有 Agent Shell Command Layer 2 工具处理器
 *
 * 核心导出：
 * - ReadHandler: 文件读取处理器
 * - WriteHandler: 文件写入处理器
 * - EditHandler: 文件编辑处理器
 * - GlobHandler: 文件模式匹配处理器
 * - GrepHandler: 代码搜索处理器
 * - BashWrapperHandler: Bash 命令包装器处理器
 */

export { ReadHandler, parseReadCommand } from './read.ts';
export { WriteHandler, parseWriteCommand } from './write.ts';
export { EditHandler, parseEditCommand } from './edit.ts';
export { GlobHandler, parseGlobCommand } from './glob.ts';
export { GrepHandler, parseGrepCommand } from './grep.ts';
export { BashWrapperHandler, parseBashCommand } from './bash-wrapper.ts';
```

**Step 2: Verify TypeScript compiles**

Run: `cd /Users/wuwenjun/WebstormProjects/Synapse-Agent && npx tsc --noEmit src/tools/handlers/agent-bash/index.ts 2>&1 | head -10`
Expected: No errors

**Step 3: Commit**

```bash
git add src/tools/handlers/agent-bash/index.ts
git commit -m "refactor(tools): remove SkillSearchHandler export"
```

---

## Task 6: Verify Full Build and Tests

**Files:**
- None (verification only)

**Step 1: Run TypeScript type check**

Run: `cd /Users/wuwenjun/WebstormProjects/Synapse-Agent && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors related to skill-search

**Step 2: Run existing tests**

Run: `cd /Users/wuwenjun/WebstormProjects/Synapse-Agent && npm test 2>&1 | tail -30`
Expected: All tests pass (or only unrelated failures)

**Step 3: Final commit if any fixes needed**

If fixes were made:
```bash
git add -A
git commit -m "fix: resolve build/test issues from skill-search migration"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Create prompt template | +skill-search.md |
| 2 | Dynamic skill.ts | ~skill.ts |
| 3 | Update configs/index.ts | ~index.ts |
| 4 | Delete old handler | -skill-search.ts, -skill-search.md |
| 5 | Update exports | ~agent-bash/index.ts |
| 6 | Verify build/tests | (none) |
