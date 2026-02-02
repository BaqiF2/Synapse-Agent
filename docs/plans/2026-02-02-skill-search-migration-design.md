# Skill Search Migration Design

## Overview

将技能搜索从 Agent Shell Command (`skill search`) 迁移到 Sub Agent (`task:skill:search`)，实现基于 LLM 的语义搜索。

## Problem

当前 `task:skill:search` 子代理启动后没有进行实际的技能检索，因为子代理没有收到任何技能元数据。

## Solution

在创建 skill 子代理时，将所有技能的元数据（name, description）静态注入到 systemPrompt 中，让 LLM 进行语义匹配。

## Architecture

```
┌─────────────────┐    task:skill:search    ┌──────────────────┐
│   Main Agent    │ ──────────────────────> │   Skill SubAgent │
└─────────────────┘                         └──────────────────┘
                                                    │
                                            systemPrompt contains:
                                            - All skills' name + description
                                            - Search instructions and output format
                                                    │
                                                    ▼
                                            LLM semantic matching
                                                    │
                                                    ▼
                                            {"matched_skills": [...]}
```

## Design Decisions

### 1. Metadata Injection

- **Location**: systemPrompt (static injection at sub-agent creation time)
- **Fields**: `name` and `description` only (no domain or tags)
- **Timing**: First creation only, reuse cached sub-agent instance

### 2. Output Format

```json
{"matched_skills": [{"name": "skill-name", "description": "..."}]}
```

Empty result:
```json
{"matched_skills": []}
```

### 3. Prompt Template

Static prompt saved in markdown file (`skill-search.md`), loaded at runtime with `{{SKILL_LIST}}` placeholder replaced by actual metadata.

### 4. Sub-Agent Reuse

- Reuse sub-agent instance within session
- Use metadata from first creation
- Do not consider skill changes after sub-agent creation

## File Changes

### Delete

| File | Reason |
|------|--------|
| `src/tools/handlers/agent-bash/skill-search.ts` | Replaced by sub-agent |
| `src/tools/handlers/agent-bash/skill-search.md` | Help doc for deleted handler |

### Modify

| File | Change |
|------|--------|
| `src/tools/handlers/agent-bash/index.ts` | Remove `SkillSearchHandler` export |
| `src/sub-agents/configs/skill.ts` | Change to dynamic `createSkillConfig()` function |
| `src/sub-agents/configs/index.ts` | Adjust `getConfig()` to call `createSkillConfig()` |

### Add

| File | Purpose |
|------|---------|
| `src/sub-agents/configs/skill-search.md` | systemPrompt template file |

### No Change

| File | Reason |
|------|--------|
| `src/tools/bash-router.ts` | Already routes `task:skill:search` to `TaskCommandHandler` |

## Prompt Template Format

Reference: `src/tools/handlers/agent-bash/read.md`

```markdown
skill-search - Search for matching skills by semantic similarity

ROLE:
    Skill Search Expert - Analyze user query and find semantically matching skills

AVAILABLE SKILLS:
{{SKILL_LIST}}

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

## Implementation Notes

### skill.ts Changes

```typescript
import { loadDesc } from '../../utils/load-desc.js';
import { SkillIndexer } from '../../skills/indexer.js';

interface SkillMetadata {
  name: string;
  description?: string;
}

function loadAllSkillMetadata(): SkillMetadata[] {
  const indexer = new SkillIndexer();
  const index = indexer.getIndex();
  return index.skills.map(s => ({
    name: s.name,
    description: s.description
  }));
}

function buildSystemPrompt(metadata: SkillMetadata[]): string {
  const skillList = metadata
    .map((s, i) => `${i + 1}. ${s.name}: ${s.description || 'No description'}`)
    .join('\n');

  return loadDesc(
    path.join(import.meta.dirname, 'skill-search.md'),
    { SKILL_LIST: skillList }
  );
}

export function createSkillConfig(): SubAgentConfig {
  const metadata = loadAllSkillMetadata();

  return {
    type: 'skill',
    permissions: {
      include: 'all',
      exclude: ['task:skill:search', 'task:skill:enhance'],
    },
    systemPrompt: buildSystemPrompt(metadata)
  };
}
```

### configs/index.ts Changes

```typescript
export function getConfig(type: SubAgentType): SubAgentConfig {
  if (type === 'skill') {
    return createSkillConfig();
  }
  return configs[type];
}
```
