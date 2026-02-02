# Skill Enhancement on Agent Loop Exit

## Overview

When the Agent loop exits normally (no tool calls), automatically analyze the conversation history to determine if reusable patterns should be extracted as new skills or used to enhance existing skills.

## Trigger Flow

```
Agent Loop completes normally (no tool calls)
    ↓
Stop Hook: skill-enhance-hook triggered
    ↓
Check ~/.synapse/settings.json → skillEnhance.autoEnhance
    ↓ (false)
Exit without processing
    ↓ (true)
Read and compact conversation history
    ↓
Load meta-skills (skill-creator + enhancing-skills)
    ↓
Build prompt and execute skill sub-agent
    ↓
Output result to user (direct passthrough)
```

## Configuration Management

### Storage Location

`~/.synapse/settings.json`

### Existing Commands (No Changes)

```bash
/skill enhance       # Show auto-enhance status
/skill enhance --on  # Enable auto skill enhance
/skill enhance --off # Disable auto skill enhance
/skill enhance -h    # Show skill enhance help
```

### Implementation

Use existing `SettingsManager`:

```typescript
const settings = new SettingsManager();
settings.isAutoEnhanceEnabled();      // Check status
settings.setAutoEnhance(true/false);  // Set status
settings.getMaxEnhanceContextChars(); // Get context limit
```

## Conversation History Compaction

### Location

Add `compact()` method to existing `src/skills/conversation-reader.ts`

### Compaction Rules

| Message Type | Processing |
|-------------|-----------|
| User message | `[User] {full content}` |
| Assistant text | `[Assistant] {full content}` |
| Tool call | `[Tool] {tool name}` |
| Tool result | `[Result] {first N chars}...` |

### Configuration

Environment variable: `SYNAPSE_TOOL_RESULT_SUMMARY_LIMIT` (default: 200)

### Output Example

```
[User] Help me refactor error handling in this file

[Assistant] Let me read the file first

[Tool] read
[Result] export function parse(input: string)...

[Tool] edit
[Result] ✓ File modified

[Assistant] Refactoring complete, main changes include...
```

## Skill Sub-Agent Enhancement

### Reuse Existing Skill Sub-Agent

No new sub-agent type needed. Reuse `skill` type sub-agent which already loads all skill metadata.

### System Prompt Modification

Update `src/sub-agents/configs/skill-search.md` (use English):

```markdown
# Skill Sub Agent

You are a skill search and enhancement expert.

## Core Capabilities

### 1. Skill Search (Default)
Find matching skills from the skill library based on user needs.

### 2. Skill Enhancement (Triggered on Demand)
When receiving a skill enhancement directive, analyze conversation history to determine:
- Create new skill: Discovered reusable new patterns
- Enhance existing skill: Improve deficiencies in existing skills
- No action: Current conversation has no extractable value

Criteria for evaluation:
- Task complexity: Multi-step operations involved
- Tool diversity: Multiple tools used in combination
- Reusability: Pattern likely to recur in future
- Existing skill coverage: Similar skill already exists

## Available Skills

${SKILL_LIST}
```

### Invocation Prompt Structure

```
[Skill Enhancement Directive]

## Conversation History
${compactedHistory}

## Meta-Skill Content
${metaSkillsContent}

## Task
Analyze the conversation history and determine if a new skill should be created or an existing skill enhanced.
```

## Meta-Skill Loading

### Storage Location

Meta-skills are stored alongside regular skills in `~/.synapse/skills/`, differentiated by `type: meta` in SKILL.md frontmatter.

```
~/.synapse/skills/
├── skill-creator/
│   └── SKILL.md        # type: meta
├── enhancing-skills/
│   └── SKILL.md        # type: meta (modify as needed)
└── ... other skills
```

### Loading Implementation

Use existing `SkillLoader.loadLevel2()`:

```typescript
const loader = new SkillLoader();

const skillCreator = loader.loadLevel2('skill-creator');
const enhancingSkills = loader.loadLevel2('enhancing-skills');

const metaSkillsContent = `
## Meta-Skill: Skill Creator

${skillCreator?.rawContent || ''}

## Meta-Skill: Enhancing Skills

${enhancingSkills?.rawContent || ''}
`;
```

## Stop Hook Implementation

### Location

`src/hooks/skill-enhance-hook.ts`

### Implementation

```typescript
import { StopHook, StopHookContext } from './stop-hook-types.ts';
import { SettingsManager } from '../config/settings-manager.ts';
import { ConversationReader } from '../skills/conversation-reader.ts';
import { SubAgentManager } from '../sub-agents/sub-agent-manager.ts';
import { SkillLoader } from '../skills/skill-loader.ts';

export function createSkillEnhanceHook(): StopHook {
  return async (context: StopHookContext) => {
    // 1. Check if auto-enhance is enabled
    const settings = new SettingsManager();
    if (!settings.isAutoEnhanceEnabled()) {
      return;
    }

    // 2. Read and compact conversation history
    const reader = new ConversationReader();
    const sessionPath = getSessionPath(context.sessionId);

    if (!sessionPath) {
      console.log('[Skill] Enhancement failed: session not found');
      return;
    }

    const maxChars = settings.getMaxEnhanceContextChars();
    const turns = reader.readTruncated(sessionPath, maxChars);
    const compactedHistory = reader.compact(turns);

    // 3. Load meta-skills
    const loader = new SkillLoader();
    const skillCreator = loader.loadLevel2('skill-creator');
    const enhancingSkills = loader.loadLevel2('enhancing-skills');

    if (!skillCreator || !enhancingSkills) {
      console.log('[Skill] Enhancement failed: meta-skills not found');
      return;
    }

    // 4. Build prompt
    const metaSkillsContent = `
## Meta-Skill: Skill Creator

${skillCreator.rawContent || ''}

## Meta-Skill: Enhancing Skills

${enhancingSkills.rawContent || ''}
`;

    const prompt = buildEnhancePrompt(compactedHistory, metaSkillsContent);

    // 5. Execute skill sub-agent
    const subAgentManager = new SubAgentManager();
    const result = await subAgentManager.execute('skill', { prompt });

    // 6. Output result (direct passthrough)
    console.log(result);

    return { message: result };
  };
}
```

## Output Format

Sub-agent result is passed through directly to user. Output format is controlled by prompt constraints.

Examples:
- `[Skill] Created: git-workflow`
- `[Skill] Enhanced: code-review`
- `[Skill] No enhancement needed`

## Error Handling

| Error Scenario | Behavior |
|---------------|----------|
| Session file not found | Output: `[Skill] Enhancement failed: session not found` |
| Session file corrupted | Output: `[Skill] Enhancement failed: failed to read session` |
| Meta-skill not found | Output: `[Skill] Enhancement failed: meta-skills not found` |
| Sub-agent execution failed | Output: `[Skill] Enhancement failed: {error message}` |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SYNAPSE_TOOL_RESULT_SUMMARY_LIMIT` | 200 | Max chars for tool result in compacted history |

## Concurrency

Each session's enhancement hook runs independently. Multiple sessions can trigger enhancement simultaneously without interference.

## Files to Modify

1. **src/skills/conversation-reader.ts** - Add `compact()` method
2. **src/sub-agents/configs/skill-search.md** - Add skill enhancement capability description
3. **src/hooks/skill-enhance-hook.ts** - New file, implement stop hook
4. **src/agent/agent-runner.ts** - Register skill-enhance-hook
5. **~/.synapse/skills/enhancing-skills/SKILL.md** - Modify content as needed

## Files to Reference (No Changes)

- `src/config/settings-manager.ts` - Use existing SettingsManager
- `src/skills/skill-loader.ts` - Use existing SkillLoader
- `src/sub-agents/sub-agent-manager.ts` - Use existing SubAgentManager
- `src/sub-agents/configs/skill.ts` - Use existing skill sub-agent config
