# 第六部分：技能系统设计

## ⚠️ 强制验证法则

**在本部分的实施过程中，必须严格遵循以下验证流程：**

### 1. 迁移前检查（Pre-Migration Check）
- [ ] **技能加载流程**：详细阅读 Python `skill_loader.py` 的三层加载机制
- [ ] **Frontmatter 解析**：理解 Python 如何解析 YAML frontmatter
- [ ] **技能索引机制**：分析 Python `skill_index.py` 的索引和持久化实现
- [ ] **SKILL.md 格式**：确认技能文件的完整格式规范

### 2. 迁移后检查（Post-Migration Check）
- [ ] **加载机制验证**：测试 loadMetadata/loadSkill/loadFull 三层加载
- [ ] **Frontmatter 解析**：验证 YAML 解析结果与 Python 版本一致
- [ ] **技能搜索测试**：验证按名称、描述、域的搜索功能
- [ ] **持久化验证**：测试索引的保存和加载功能

### 3. PRD 符合性检查（PRD Compliance Check）
- [ ] **文件系统记忆**：验证技能通过文件系统持久化，符合"记忆载体"理念
- [ ] **技能自我成长**：确认架构支持技能的自动生成和强化
- [ ] **外源技能融合**：验证支持外部技能库的导入和融合能力
- [ ] **工具关联机制**：确认技能可以关联 scripts 和 references

**❌ 未完成上述检查清单的任何一项，不得进入下一阶段**

---

## 6.1 技能数据结构

### SkillMetadata (src/skills/types.ts)

```typescript
import { z } from 'zod';

export const SkillMetadataSchema = z.object({
  name: z.string(),
  description: z.string(),
  path: z.string(),
  domain: z.string().nullable(),
});

export type SkillMetadata = z.infer<typeof SkillMetadataSchema>;
```

### Skill 接口

```typescript
export interface Skill {
  metadata: SkillMetadata;
  content: string;              // SKILL.md body 内容
  references: string[];         // 引用文件内容列表
  scripts: string[];            // 脚本文件路径列表
}
```

### 字段对齐

| Python | TypeScript | 说明 |
|--------|-----------|------|
| `name` | `name` | ✅ |
| `description` | `description` | ✅ |
| `path` | `path` | ✅ |
| `domain` | `domain` | ✅ nullable |
| `content` | `content` | ✅ |
| `references` | `references` | ✅ |
| `scripts` | `scripts` | ✅ |

## 6.2 技能加载器 (src/skills/loader.ts)

### 三层加载机制

```typescript
export class SkillLoader {
  private static SKILL_FILE = 'SKILL.md';
  private static REFERENCE_FILE = 'REFERENCE.md';
  private static SCRIPTS_DIR = 'scripts';

  constructor(private skillsDir: string) {}

  // Level 1: 只加载 frontmatter
  async loadMetadata(skillDir: string): Promise<SkillMetadata> {
    const skillPath = `${skillDir}/${SkillLoader.SKILL_FILE}`;
    const content = await Bun.file(skillPath).text();

    const frontmatter = this.parseFrontmatterOnly(content);
    // 返回元数据
  }

  // Level 2: 加载完整 SKILL.md
  async loadSkill(skillDir: string): Promise<Skill> {
    const skillPath = `${skillDir}/${SkillLoader.SKILL_FILE}`;
    const content = await Bun.file(skillPath).text();

    const { frontmatter, body } = this.parseFrontmatter(content);
    // 返回技能对象
  }

  // Level 3: 加载所有内容
  async loadFull(skillDir: string): Promise<Skill> {
    const skill = await this.loadSkill(skillDir);
    const references = await this.loadReferences(skillDir);
    const scripts = await this.discoverScripts(skillDir);

    return { ...skill, references, scripts };
  }
}
```

### Frontmatter 解析

```typescript
private parseFrontmatter(content: string): {
  frontmatter: Record<string, any> | null;
  body: string;
} {
  const pattern = /^---\s*\n(.*?)\n---\s*\n(.*)$/s;
  const match = content.match(pattern);

  if (!match) {
    return { frontmatter: null, body: content };
  }

  try {
    const frontmatter = parseYaml(match[1]) as Record<string, any>;
    return { frontmatter, body: match[2].trim() };
  } catch {
    return { frontmatter: null, body: content };
  }
}
```

### 技能发现

```typescript
async discoverSkills(basePath?: string): Promise<SkillMetadata[]> {
  const base = basePath || this.skillsDir;
  const skillFiles = await glob(`${base}/**/SKILL.md`);

  const skills: SkillMetadata[] = [];
  for (const skillFile of skillFiles) {
    const skillDir = skillFile.replace('/SKILL.md', '');
    try {
      const metadata = await this.loadMetadata(skillDir);
      skills.push(metadata);
    } catch {
      // 跳过无效技能
    }
  }

  return skills;
}
```

## 6.3 技能索引 (src/skills/index.ts)

### SkillIndex 类

```typescript
export class SkillIndex {
  private skills: Map<string, Skill> = new Map();

  add(skill: Skill): void {
    this.skills.set(skill.metadata.name, skill);
  }

  addMetadata(metadata: SkillMetadata): void {
    const skill: Skill = {
      metadata,
      content: '',
      references: [],
      scripts: [],
    };
    this.skills.set(metadata.name, skill);
  }

  get(name: string): Skill | null {
    return this.skills.get(name) ?? null;
  }

  search(query: string): Skill[] {
    const queryLower = query.toLowerCase();
    return Array.from(this.skills.values()).filter(skill =>
      skill.metadata.name.toLowerCase().includes(queryLower) ||
      skill.metadata.description.toLowerCase().includes(queryLower)
    );
  }

  searchByDomain(domain: string): Skill[] {
    return Array.from(this.skills.values()).filter(
      skill => skill.metadata.domain === domain
    );
  }

  listDomains(): string[] {
    const domains = new Set<string>();
    for (const skill of this.skills.values()) {
      if (skill.metadata.domain) {
        domains.add(skill.metadata.domain);
      }
    }
    return Array.from(domains).sort();
  }
}
```

### 持久化

```typescript
async save(path: string): Promise<void> {
  const data: Record<string, any> = {};

  for (const skill of this.skills.values()) {
    const domain = skill.metadata.domain || 'general';

    if (!data[domain]) {
      data[domain] = {
        description: `${domain} related skills`,
        skills: [],
      };
    }

    data[domain].skills.push({
      name: skill.metadata.name,
      description: skill.metadata.description,
      path: skill.metadata.path,
      scripts: skill.scripts,
    });
  }

  await Bun.write(path, JSON.stringify(data, null, 2));
}

static async load(path: string): Promise<SkillIndex> {
  const index = new SkillIndex();

  try {
    const file = Bun.file(path);
    if (!(await file.exists())) return index;

    const data = await file.json();

    // 解析数据并添加到索引
    for (const [domain, domainData] of Object.entries(data)) {
      const skills = (domainData as any).skills || [];
      for (const skillData of skills) {
        const metadata: SkillMetadata = {
          name: skillData.name,
          description: skillData.description,
          path: skillData.path,
          domain,
        };
        index.addMetadata(metadata);
      }
    }
  } catch {
    // 返回空索引
  }

  return index;
}
```

## 6.4 SKILL.md 格式

### 示例

```markdown
---
name: example-skill
description: 示例技能说明
domain: programming
---

# Example Skill

这是技能的详细内容...

## 使用方法

...

## 示例

...
```

### 目录结构

```
~/.synapse/skills/
├── programming/              # domain
│   ├── code-quality/        # skill-name
│   │   ├── SKILL.md
│   │   ├── REFERENCE.md     # 可选
│   │   └── scripts/         # 可选
│   │       └── analyze.py
```

## 6.5 与 Python 版本对齐

### 类和方法

| Python | TypeScript | 对齐 |
|--------|-----------|-----|
| `class SkillLoader` | `class SkillLoader` | ✅ |
| `load_metadata()` | `loadMetadata()` | ✅ |
| `load_skill()` | `loadSkill()` | ✅ |
| `load_full()` | `loadFull()` | ✅ |
| `discover_skills()` | `discoverSkills()` | ✅ |
| `class SkillIndex` | `class SkillIndex` | ✅ |
| `search_by_domain()` | `searchByDomain()` | ✅ |
| `list_domains()` | `listDomains()` | ✅ |

### 文件结构

| Python | TypeScript | 对齐 |
|--------|-----------|-----|
| `skills/base.py` | `skills/types.ts` | ✅ |
| `skills/loader.py` | `skills/loader.ts` | ✅ |
| `skills/index.py` | `skills/index.ts` | ✅ |
