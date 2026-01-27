# Batch 7: 元技能模板生成

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 `~/.synapse/skills/` 下生成三个元技能模板，供开发者参考和定制。

**Architecture:** 元技能与普通技能同级，不写死到代码中。首次启动时检测并生成模板，开发者可自行修改完善。

**Tech Stack:** TypeScript, Bun

---

## Task 1: 创建元技能生成器

**Files:**
- Create: `src/skills/meta-skill-generator.ts`
- Test: `tests/unit/skills/meta-skill-generator.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/skills/meta-skill-generator.test.ts
/**
 * Meta Skill Generator Tests
 *
 * Tests for meta skill template generation.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MetaSkillGenerator } from '../../../src/skills/meta-skill-generator.ts';

describe('MetaSkillGenerator', () => {
  let testDir: string;
  let skillsDir: string;
  let generator: MetaSkillGenerator;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-meta-skill-test-'));
    skillsDir = path.join(testDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });

    generator = new MetaSkillGenerator(skillsDir);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('generateAll', () => {
    it('should generate all three meta skills', () => {
      generator.generateAll();

      expect(fs.existsSync(path.join(skillsDir, 'creating-skills', 'SKILL.md'))).toBe(true);
      expect(fs.existsSync(path.join(skillsDir, 'enhancing-skills', 'SKILL.md'))).toBe(true);
      expect(fs.existsSync(path.join(skillsDir, 'evaluating-skills', 'SKILL.md'))).toBe(true);
    });

    it('should not overwrite existing meta skills', () => {
      // Create existing skill
      const existingDir = path.join(skillsDir, 'creating-skills');
      fs.mkdirSync(existingDir, { recursive: true });
      fs.writeFileSync(path.join(existingDir, 'SKILL.md'), 'custom content');

      generator.generateAll();

      const content = fs.readFileSync(path.join(existingDir, 'SKILL.md'), 'utf-8');
      expect(content).toBe('custom content');
    });
  });

  describe('generateIfMissing', () => {
    it('should generate only missing meta skills', () => {
      // Create one existing skill
      const existingDir = path.join(skillsDir, 'creating-skills');
      fs.mkdirSync(existingDir, { recursive: true });
      fs.writeFileSync(path.join(existingDir, 'SKILL.md'), 'custom content');

      generator.generateIfMissing();

      // Should not overwrite existing
      const existingContent = fs.readFileSync(path.join(existingDir, 'SKILL.md'), 'utf-8');
      expect(existingContent).toBe('custom content');

      // Should create missing ones
      expect(fs.existsSync(path.join(skillsDir, 'enhancing-skills', 'SKILL.md'))).toBe(true);
      expect(fs.existsSync(path.join(skillsDir, 'evaluating-skills', 'SKILL.md'))).toBe(true);
    });
  });

  describe('meta skill content', () => {
    it('should have valid frontmatter in creating-skills', () => {
      generator.generateAll();

      const content = fs.readFileSync(
        path.join(skillsDir, 'creating-skills', 'SKILL.md'),
        'utf-8'
      );

      expect(content).toContain('name: creating-skills');
      expect(content).toContain('description:');
    });

    it('should have valid frontmatter in enhancing-skills', () => {
      generator.generateAll();

      const content = fs.readFileSync(
        path.join(skillsDir, 'enhancing-skills', 'SKILL.md'),
        'utf-8'
      );

      expect(content).toContain('name: enhancing-skills');
      expect(content).toContain('description:');
    });

    it('should have valid frontmatter in evaluating-skills', () => {
      generator.generateAll();

      const content = fs.readFileSync(
        path.join(skillsDir, 'evaluating-skills', 'SKILL.md'),
        'utf-8'
      );

      expect(content).toContain('name: evaluating-skills');
      expect(content).toContain('description:');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/skills/meta-skill-generator.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/skills/meta-skill-generator.ts
/**
 * Meta Skill Generator
 *
 * Generates template meta skills for skill creation, enhancement, and evaluation.
 * These meta skills are regular skills that guide the Skill Sub-Agent.
 *
 * @module meta-skill-generator
 *
 * Core Exports:
 * - MetaSkillGenerator: Generates meta skill templates
 * - META_SKILL_NAMES: List of meta skill names
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createLogger } from '../utils/logger.ts';

const logger = createLogger('meta-skill-generator');

/**
 * Default skills directory
 */
const DEFAULT_SKILLS_DIR = path.join(os.homedir(), '.synapse', 'skills');

/**
 * Meta skill names
 */
export const META_SKILL_NAMES = [
  'creating-skills',
  'enhancing-skills',
  'evaluating-skills',
] as const;

/**
 * Meta skill template content
 */
const META_SKILL_TEMPLATES: Record<string, string> = {
  'creating-skills': `---
name: creating-skills
description: Guides the creation of new skills from conversation patterns and reusable workflows. Use when the Skill Sub-Agent needs to generate a new skill.
---

# Creating Skills

This meta skill provides guidance for creating new skills based on conversation analysis.

## When to Create a New Skill

1. **Reusable Pattern Detected**: The conversation contains a workflow that could be reused
2. **No Existing Coverage**: No existing skill covers this functionality
3. **Clear Structure**: The pattern has clear inputs, steps, and outputs

## Skill File Structure

\`\`\`
~/.synapse/skills/<skill-name>/
├── SKILL.md           # Main skill definition (required)
├── references/        # Reference documents (optional)
│   └── *.md
└── scripts/           # Executable scripts (optional)
    └── *.py|*.ts|*.sh
\`\`\`

## SKILL.md Format

\`\`\`markdown
---
name: skill-name
description: Brief description (what it does and when to use it)
---

# Skill Title

## Quick Start
[Most common usage pattern with examples]

## Execution Steps
1. Step 1
2. Step 2

## Best Practices
- Practice 1
- Practice 2

## Examples
[Input/output examples]
\`\`\`

## Creation Checklist

- [ ] Clear, descriptive name (lowercase, hyphens)
- [ ] Concise description (under 1024 characters)
- [ ] Well-defined execution steps
- [ ] At least one example
- [ ] Tags for discoverability

## Tips

- Keep skills focused on one task
- Use clear, imperative language
- Include error handling guidance
- Reference related skills if applicable
`,

  'enhancing-skills': `---
name: enhancing-skills
description: Guides the enhancement and improvement of existing skills based on usage feedback and new patterns. Use when the Skill Sub-Agent needs to update a skill.
---

# Enhancing Skills

This meta skill provides guidance for enhancing existing skills.

## When to Enhance a Skill

1. **New Pattern Discovered**: Found a better approach or additional use case
2. **Feedback Integration**: User feedback suggests improvements
3. **Error Correction**: Skill has incorrect or outdated information
4. **Completeness**: Missing steps or examples that should be added

## Enhancement Process

1. **Read Current Skill**: Load the existing SKILL.md content
2. **Identify Gaps**: Compare with new information/patterns
3. **Plan Changes**: Determine what to add/modify/remove
4. **Apply Updates**: Edit the skill file
5. **Verify**: Ensure the skill is still coherent

## Types of Enhancements

### Adding New Sections
- New execution paths
- Additional examples
- Best practices

### Improving Existing Content
- Clearer explanations
- Better examples
- Updated references

### Structural Changes
- Reorganizing sections
- Adding subsections
- Improving flow

## Enhancement Checklist

- [ ] Preserve existing working content
- [ ] Add clear version notes if significant change
- [ ] Update description if scope changed
- [ ] Verify all examples still work
- [ ] Check for consistency

## Tips

- Make incremental changes
- Don't remove working content without reason
- Add comments for non-obvious changes
- Test enhanced skills when possible
`,

  'evaluating-skills': `---
name: evaluating-skills
description: Guides the evaluation and quality assessment of skills to determine their effectiveness and areas for improvement. Use when assessing skill quality.
---

# Evaluating Skills

This meta skill provides guidance for evaluating skill quality and effectiveness.

## Evaluation Criteria

### 1. Clarity (1-5)
- Is the description clear?
- Are execution steps unambiguous?
- Are examples helpful?

### 2. Completeness (1-5)
- Are all necessary steps included?
- Are edge cases covered?
- Are prerequisites documented?

### 3. Usability (1-5)
- Is the skill easy to follow?
- Is the structure logical?
- Are best practices included?

### 4. Accuracy (1-5)
- Is the information correct?
- Are examples valid?
- Are references up to date?

## Evaluation Process

1. **Read the Skill**: Load and understand the SKILL.md
2. **Score Each Criterion**: Rate 1-5 for each criterion
3. **Identify Issues**: List specific problems found
4. **Suggest Improvements**: Provide actionable recommendations
5. **Calculate Overall Score**: Average of all criteria

## Evaluation Output Format

\`\`\`json
{
  "skillName": "skill-name",
  "scores": {
    "clarity": 4,
    "completeness": 3,
    "usability": 4,
    "accuracy": 5
  },
  "overallScore": 4.0,
  "issues": [
    "Missing edge case handling",
    "Example output not shown"
  ],
  "recommendations": [
    "Add error handling section",
    "Include expected output in examples"
  ]
}
\`\`\`

## Quality Thresholds

- **Excellent**: 4.5-5.0
- **Good**: 3.5-4.4
- **Needs Improvement**: 2.5-3.4
- **Poor**: Below 2.5

## Tips

- Be objective and consistent
- Focus on actionable feedback
- Consider the skill's intended audience
- Check for outdated information
`,
};

/**
 * MetaSkillGenerator - Generates meta skill templates
 *
 * Usage:
 * ```typescript
 * const generator = new MetaSkillGenerator();
 * generator.generateIfMissing();
 * ```
 */
export class MetaSkillGenerator {
  private skillsDir: string;

  /**
   * Creates a new MetaSkillGenerator
   *
   * @param skillsDir - Skills directory (defaults to ~/.synapse/skills)
   */
  constructor(skillsDir: string = DEFAULT_SKILLS_DIR) {
    this.skillsDir = skillsDir;
  }

  /**
   * Generate all meta skill templates
   * Does not overwrite existing skills
   */
  generateAll(): void {
    this.ensureSkillsDir();

    for (const name of META_SKILL_NAMES) {
      this.generateSkill(name, false);
    }
  }

  /**
   * Generate only missing meta skills
   */
  generateIfMissing(): void {
    this.ensureSkillsDir();

    for (const name of META_SKILL_NAMES) {
      this.generateSkill(name, true);
    }
  }

  /**
   * Generate a single meta skill
   *
   * @param name - Skill name
   * @param skipExisting - Skip if already exists
   */
  private generateSkill(name: string, skipExisting: boolean): void {
    const skillDir = path.join(this.skillsDir, name);
    const skillMdPath = path.join(skillDir, 'SKILL.md');

    if (skipExisting && fs.existsSync(skillMdPath)) {
      logger.debug('Meta skill already exists, skipping', { name });
      return;
    }

    const template = META_SKILL_TEMPLATES[name];
    if (!template) {
      logger.warn('No template found for meta skill', { name });
      return;
    }

    // Create directory
    if (!fs.existsSync(skillDir)) {
      fs.mkdirSync(skillDir, { recursive: true });
    }

    // Write skill file (only if doesn't exist or not skipping)
    if (!fs.existsSync(skillMdPath)) {
      fs.writeFileSync(skillMdPath, template, 'utf-8');
      logger.info('Generated meta skill', { name, path: skillMdPath });
    }
  }

  /**
   * Ensure skills directory exists
   */
  private ensureSkillsDir(): void {
    if (!fs.existsSync(this.skillsDir)) {
      fs.mkdirSync(this.skillsDir, { recursive: true });
      logger.info('Created skills directory', { dir: this.skillsDir });
    }
  }

  /**
   * Check if a meta skill exists
   *
   * @param name - Skill name
   * @returns true if skill exists
   */
  exists(name: string): boolean {
    const skillMdPath = path.join(this.skillsDir, name, 'SKILL.md');
    return fs.existsSync(skillMdPath);
  }

  /**
   * Get list of missing meta skills
   *
   * @returns Array of missing meta skill names
   */
  getMissing(): string[] {
    return META_SKILL_NAMES.filter((name) => !this.exists(name));
  }
}

// Default export
export default MetaSkillGenerator;
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/skills/meta-skill-generator.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/skills/meta-skill-generator.ts tests/unit/skills/meta-skill-generator.test.ts
git commit -m "$(cat <<'EOF'
feat(skills): add meta skill generator

Generates three meta skill templates:
- creating-skills: guides new skill creation
- enhancing-skills: guides skill enhancement
- evaluating-skills: guides skill evaluation

Meta skills are regular skills stored in ~/.synapse/skills/

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 集成到启动流程

**Files:**
- Modify: `src/agent/agent.ts` (or main entry point)

**Step 1: Add meta skill generation on startup**

在 Agent 初始化时调用 `MetaSkillGenerator.generateIfMissing()`，确保元技能模板已生成。

```typescript
// Add to agent initialization
import { MetaSkillGenerator } from '../skills/meta-skill-generator.ts';

// In constructor or initialize method
const metaSkillGenerator = new MetaSkillGenerator();
metaSkillGenerator.generateIfMissing();
```

**Step 2: Run full test suite**

Run: `bun test`
Expected: All PASS

**Step 3: Commit**

```bash
git add src/agent/agent.ts
git commit -m "$(cat <<'EOF'
feat(agent): generate meta skills on startup

Ensures meta skill templates exist when agent starts.
Does not overwrite user-customized meta skills.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 更新模块导出

**Files:**
- Modify: `src/skills/index.ts`

**Step 1: Add exports**

```typescript
// Add to src/skills/index.ts
export {
  MetaSkillGenerator,
  META_SKILL_NAMES,
} from './meta-skill-generator.ts';
```

**Step 2: Run tests**

Run: `bun test tests/unit/skills/`
Expected: All PASS

**Step 3: Commit**

```bash
git add src/skills/index.ts
git commit -m "$(cat <<'EOF'
feat(skills): export meta skill generator

Adds MetaSkillGenerator and META_SKILL_NAMES to skills module exports.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Batch 7 完成检查

- [ ] `src/skills/meta-skill-generator.ts` 创建并测试通过
- [ ] 启动流程集成完成
- [ ] `src/skills/index.ts` 更新
- [ ] 所有提交完成

**验证命令:**

```bash
bun test tests/unit/skills/meta-skill-generator.test.ts
```

Expected: All tests PASS

**手动验证:**

```bash
# 删除已有元技能（如果存在）
rm -rf ~/.synapse/skills/creating-skills
rm -rf ~/.synapse/skills/enhancing-skills
rm -rf ~/.synapse/skills/evaluating-skills

# 启动 Agent，检查元技能是否生成
ls -la ~/.synapse/skills/
```
