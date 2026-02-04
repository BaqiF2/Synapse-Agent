# 技能管理系统设计文档

## 概述

技能管理系统是对现有技能模块的扩展，提供版本管理、批量导入、冲突解决、去重合并等能力。通过 Slash Commands 供用户操作，通过 skill sub agent 实现智能分析。

### 核心特性

- **版本管理** - 每个技能保存历史版本，支持回滚
- **批量导入** - 支持本地目录和远程 URL 导入
- **冲突解决** - 导入冲突时中断提醒用户
- **智能去重** - 通过 skill sub agent 语义分析判断重复
- **自动融合** - 复用技能增强机制实现技能合并

---

## 数据结构

### SkillMeta

```typescript
/** 技能元信息 */
interface SkillMeta {
  /** 技能名称（目录名） */
  name: string;
  /** 技能描述（从 skill.md 提取） */
  description: string;
  /** 创建时间 */
  createdAt: Date;
  /** 最后更新时间 */
  updatedAt: Date;
  /** 版本历史 */
  versions: VersionInfo[];
}
```

### VersionInfo

```typescript
/** 版本信息 */
interface VersionInfo {
  /** 版本号：日期+序列号，如 2026-02-03-001 */
  version: string;
  /** 创建时间 */
  createdAt: Date;
  /** 文件路径 */
  filePath: string;
}
```

### ImportResult

```typescript
/** 导入结果 */
interface ImportResult {
  /** 成功导入的技能 */
  imported: string[];
  /** 跳过的技能（已存在） */
  skipped: string[];
  /** 冲突的技能（需要用户处理） */
  conflicts: ConflictInfo[];
}

/** 冲突信息 */
interface ConflictInfo {
  /** 技能名称 */
  name: string;
  /** 现有技能路径 */
  existingPath: string;
  /** 新技能路径 */
  newPath: string;
}
```

### MergeCandidate

```typescript
/** 合并候选 */
interface MergeCandidate {
  /** 源技能 */
  source: string;
  /** 目标技能（相似的） */
  target: string;
  /** 相似度描述 */
  similarity: string;
}
```

---

## 目录结构

### 技能存储结构

```
skills/
├── git-commit/
│   ├── skill.md              # 最新版本
│   └── versions/
│       ├── 2026-02-03-001.md # 历史版本
│       └── 2026-02-02-001.md
├── code-review/
│   ├── skill.md
│   └── versions/
│       └── 2026-02-01-001.md
└── index.json                # 技能索引（现有）
```

### 代码文件结构

```
src/skills/
├── skill-loader.ts       # 现有：技能加载
├── skill-indexer.ts      # 现有：技能索引
├── skill-search.ts       # 现有：技能搜索
├── skill-manager.ts      # 新增：版本管理、导入、删除
├── skill-merger.ts       # 新增：去重、融合
└── types.ts              # 新增：类型定义
```

---

## 组件架构

### 架构图

```
┌─────────────────────────────────────────────────────────┐
│                   Slash Commands                        │
│  /skill:list  /skill:import  /skill:rollback  ...      │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│                   SkillManager                          │
│  - 版本管理（创建、回滚、清理）                          │
│  - 导入处理（本地、远程）                               │
│  - 删除技能                                             │
│  - 技能信息查询                                         │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│                   SkillMerger                           │
│  - 调用 skill sub agent 分析相似度                      │
│  - 调用技能增强机制实现融合                             │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│                   SkillIndexer                          │
│  - 更新 index.json                                      │
│  - 维护技能索引                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 核心组件实现

### SkillManager

```typescript
// src/skills/skill-manager.ts

/** 版本号最大数量 */
const MAX_VERSIONS = parseInt(process.env.SKILL_MAX_VERSIONS || '20', 10);

export class SkillManager {
  private skillsDir: string;
  private indexer: SkillIndexer;
  private merger: SkillMerger;

  constructor(skillsDir: string, indexer: SkillIndexer, merger: SkillMerger) {
    this.skillsDir = skillsDir;
    this.indexer = indexer;
    this.merger = merger;
  }

  /**
   * 列出所有技能
   */
  async list(): Promise<SkillMeta[]> {
    const dirs = await fs.readdir(this.skillsDir, { withFileTypes: true });
    const skills: SkillMeta[] = [];

    for (const dir of dirs) {
      if (dir.isDirectory() && !dir.name.startsWith('.')) {
        const meta = await this.getSkillMeta(dir.name);
        if (meta) skills.push(meta);
      }
    }

    return skills;
  }

  /**
   * 获取技能详情和版本历史
   */
  async info(name: string): Promise<SkillMeta | null> {
    return this.getSkillMeta(name);
  }

  /**
   * 导入技能（本地目录或远程 URL）
   */
  async import(source: string): Promise<ImportResult> {
    const isUrl = source.startsWith('http://') || source.startsWith('https://');

    if (isUrl) {
      return this.importFromUrl(source);
    } else {
      return this.importFromDirectory(source);
    }
  }

  /**
   * 从本地目录导入
   */
  private async importFromDirectory(dirPath: string): Promise<ImportResult> {
    const result: ImportResult = { imported: [], skipped: [], conflicts: [] };
    const files = await fs.readdir(dirPath);

    for (const file of files) {
      if (!file.endsWith('.md')) continue;

      const skillName = file.replace('.md', '');
      const targetDir = path.join(this.skillsDir, skillName);

      // 检查是否存在冲突
      if (await this.exists(targetDir)) {
        result.conflicts.push({
          name: skillName,
          existingPath: targetDir,
          newPath: path.join(dirPath, file),
        });
        continue;
      }

      // 创建技能目录并导入
      await fs.mkdir(targetDir, { recursive: true });
      await fs.mkdir(path.join(targetDir, 'versions'), { recursive: true });
      await fs.copyFile(
        path.join(dirPath, file),
        path.join(targetDir, 'skill.md')
      );

      result.imported.push(skillName);
    }

    // 如果有冲突，中断并提醒用户
    if (result.conflicts.length > 0) {
      return result; // 调用方需要处理冲突提示
    }

    // 更新索引
    await this.indexer.rebuild();

    return result;
  }

  /**
   * 从远程 URL 导入（Git 仓库）
   */
  private async importFromUrl(url: string): Promise<ImportResult> {
    // 克隆到临时目录
    const tempDir = path.join(os.tmpdir(), `skill-import-${Date.now()}`);
    await execAsync(`git clone --depth 1 ${url} ${tempDir}`);

    try {
      // 从临时目录导入
      return await this.importFromDirectory(tempDir);
    } finally {
      // 清理临时目录
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * 回滚到指定版本
   */
  async rollback(name: string, version: string): Promise<void> {
    const skillDir = path.join(this.skillsDir, name);
    const versionsDir = path.join(skillDir, 'versions');
    const currentPath = path.join(skillDir, 'skill.md');
    const versionPath = path.join(versionsDir, `${version}.md`);

    // 验证版本存在
    if (!await this.exists(versionPath)) {
      throw new Error(`Version ${version} not found for skill ${name}`);
    }

    // 将当前版本保存为新的历史版本
    await this.createVersion(name);

    // 将目标版本复制为当前版本
    await fs.copyFile(versionPath, currentPath);

    // 更新索引
    await this.indexer.rebuild();
  }

  /**
   * 获取版本列表（用于回滚选择）
   */
  async getVersions(name: string): Promise<VersionInfo[]> {
    const versionsDir = path.join(this.skillsDir, name, 'versions');

    if (!await this.exists(versionsDir)) {
      return [];
    }

    const files = await fs.readdir(versionsDir);
    const versions: VersionInfo[] = [];

    for (const file of files) {
      if (!file.endsWith('.md')) continue;

      const version = file.replace('.md', '');
      const filePath = path.join(versionsDir, file);
      const stat = await fs.stat(filePath);

      versions.push({
        version,
        createdAt: stat.birthtime,
        filePath,
      });
    }

    // 按版本号降序排列（最新在前）
    return versions.sort((a, b) => b.version.localeCompare(a.version));
  }

  /**
   * 创建新版本（保存当前版本到历史）
   */
  async createVersion(name: string): Promise<string> {
    const skillDir = path.join(this.skillsDir, name);
    const versionsDir = path.join(skillDir, 'versions');
    const currentPath = path.join(skillDir, 'skill.md');

    // 确保 versions 目录存在
    await fs.mkdir(versionsDir, { recursive: true });

    // 生成版本号
    const version = await this.generateVersionNumber(name);
    const versionPath = path.join(versionsDir, `${version}.md`);

    // 复制当前版本
    await fs.copyFile(currentPath, versionPath);

    // 清理旧版本
    await this.cleanOldVersions(name);

    return version;
  }

  /**
   * 生成版本号：日期+序列号
   */
  private async generateVersionNumber(name: string): Promise<string> {
    const today = new Date().toISOString().split('T')[0]; // 2026-02-03
    const versions = await this.getVersions(name);

    // 查找今天的版本数量
    const todayVersions = versions.filter(v => v.version.startsWith(today));
    const sequence = String(todayVersions.length + 1).padStart(3, '0');

    return `${today}-${sequence}`;
  }

  /**
   * 清理旧版本（保留最新 MAX_VERSIONS 个）
   */
  private async cleanOldVersions(name: string): Promise<void> {
    const versions = await this.getVersions(name);

    if (versions.length <= MAX_VERSIONS) return;

    // 删除最旧的版本（FIFO）
    const toDelete = versions.slice(MAX_VERSIONS);
    for (const v of toDelete) {
      await fs.unlink(v.filePath);
    }
  }

  /**
   * 删除技能
   */
  async delete(name: string): Promise<void> {
    const skillDir = path.join(this.skillsDir, name);

    if (!await this.exists(skillDir)) {
      throw new Error(`Skill ${name} not found`);
    }

    await fs.rm(skillDir, { recursive: true, force: true });
    await this.indexer.rebuild();
  }

  /**
   * 获取技能元信息
   */
  private async getSkillMeta(name: string): Promise<SkillMeta | null> {
    const skillDir = path.join(this.skillsDir, name);
    const skillPath = path.join(skillDir, 'skill.md');

    if (!await this.exists(skillPath)) {
      return null;
    }

    const content = await fs.readFile(skillPath, 'utf-8');
    const stat = await fs.stat(skillPath);
    const versions = await this.getVersions(name);

    // 从内容提取描述（第一行或 description 字段）
    const description = this.extractDescription(content);

    return {
      name,
      description,
      createdAt: stat.birthtime,
      updatedAt: stat.mtime,
      versions,
    };
  }

  private extractDescription(content: string): string {
    const lines = content.split('\n');
    // 尝试提取第一个非空行作为描述
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        return trimmed.slice(0, 100);
      }
    }
    return '';
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }
}
```

### SkillMerger

```typescript
// src/skills/skill-merger.ts

export class SkillMerger {
  private subAgentManager: SubAgentManager;

  constructor(subAgentManager: SubAgentManager) {
    this.subAgentManager = subAgentManager;
  }

  /**
   * 检查技能是否与现有技能相似
   * 通过 skill sub agent 进行语义分析
   */
  async findSimilar(skillContent: string, existingSkills: SkillMeta[]): Promise<MergeCandidate[]> {
    if (existingSkills.length === 0) {
      return [];
    }

    // 构建提示词
    const prompt = this.buildSimilarityPrompt(skillContent, existingSkills);

    // 调用 skill sub agent 分析
    const result = await this.subAgentManager.execute('skill', {
      description: 'Analyze skill similarity',
      prompt,
    });

    // 解析结果
    return this.parseSimilarityResult(result);
  }

  /**
   * 融合两个相似技能
   * 复用技能增强机制
   */
  async merge(sourceName: string, targetName: string): Promise<void> {
    // 构建融合提示词
    const prompt = this.buildMergePrompt(sourceName, targetName);

    // 调用 skill sub agent 执行融合（使用技能增强机制）
    await this.subAgentManager.execute('skill', {
      description: 'Merge similar skills',
      prompt,
    });
  }

  private buildSimilarityPrompt(newSkill: string, existing: SkillMeta[]): string {
    const skillList = existing.map(s => `- ${s.name}: ${s.description}`).join('\n');

    return `Analyze if the following new skill is similar to any existing skills.

New skill content:
${newSkill}

Existing skills:
${skillList}

If similar skills exist, respond with JSON format:
{"similar": [{"name": "existing-skill-name", "reason": "why they are similar"}]}

If no similar skills, respond with:
{"similar": []}`;
  }

  private buildMergePrompt(source: string, target: string): string {
    return `Merge the skill "${source}" into "${target}".

Analyze both skills and create an enhanced version that combines:
1. All capabilities from both skills
2. Best practices from each
3. Remove redundant content

Use the skill enhancement mechanism to update "${target}" with the merged content.`;
  }

  private parseSimilarityResult(result: string): MergeCandidate[] {
    try {
      const parsed = JSON.parse(result);
      return (parsed.similar || []).map((item: any) => ({
        source: '',
        target: item.name,
        similarity: item.reason,
      }));
    } catch {
      return [];
    }
  }
}
```

---

## Slash Commands

### 命令说明文档

#### /skill:list

```markdown
skill:list - List all available skills

USAGE:
    /skill:list

OUTPUT:
    List of skills with name and description:
        git-commit      - Commit changes with conventional format
        code-review     - Review code changes
        ...

EXAMPLES:
    /skill:list
```

#### /skill:import

```markdown
skill:import - Import skills from directory or URL

USAGE:
    /skill:import <source>

ARGUMENTS:
    <source>    Local directory path or Git repository URL

OUTPUT:
    Import result summary:
        Imported: skill1, skill2
        Skipped: skill3 (already exists)
        Conflicts: skill4 (manual resolution required)

NOTES:
    - Conflicts will interrupt import and require manual resolution
    - Remote URLs are cloned temporarily and cleaned up after import

EXAMPLES:
    /skill:import /path/to/skills/
    /skill:import https://github.com/user/skills-repo
```

#### /skill:rollback

```markdown
skill:rollback - Rollback skill to a previous version

USAGE:
    /skill:rollback <name>

ARGUMENTS:
    <name>    Skill name to rollback

FLOW:
    1. Display available versions
    2. User selects version number
    3. Current version saved to history
    4. Selected version becomes current

OUTPUT:
    Available versions for git-commit:
      1. 2026-02-03-001 (current backup)
      2. 2026-02-02-001
      3. 2026-02-01-002
    Select version to restore: _

EXAMPLES:
    /skill:rollback git-commit
```

#### /skill:info

```markdown
skill:info - Show skill details and version history

USAGE:
    /skill:info <name>

ARGUMENTS:
    <name>    Skill name

OUTPUT:
    Skill: git-commit
    Description: Commit changes with conventional format
    Created: 2026-01-15
    Updated: 2026-02-03

    Versions (5):
      1. 2026-02-03-001
      2. 2026-02-02-001
      3. 2026-02-01-002
      4. 2026-01-20-001
      5. 2026-01-15-001

EXAMPLES:
    /skill:info git-commit
```

#### /skill:delete

```markdown
skill:delete - Delete a skill and all its versions

USAGE:
    /skill:delete <name>

ARGUMENTS:
    <name>    Skill name to delete

NOTES:
    - Requires confirmation before deletion
    - Deletes all version history

OUTPUT:
    Delete skill "git-commit" and all 5 versions? (y/N): _
    Skill "git-commit" deleted.

EXAMPLES:
    /skill:delete git-commit
```

---

## 执行流程

### 导入流程

```
┌─────────────────────────────────────────────────────────┐
│ 用户执行 /skill:import <source>                         │
└────────────────────────┬────────────────────────────────┘
                         ↓
              ┌──────────┴──────────┐
              │ 判断 source 类型     │
              └──────────┬──────────┘
           ┌─────────────┼─────────────┐
           ↓                           ↓
       本地目录                      远程 URL
           ↓                           ↓
      直接读取文件              克隆到临时目录
           └─────────────┬─────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 遍历技能文件                                            │
└────────────────────────┬────────────────────────────────┘
                         ↓
              ┌──────────┴──────────┐
              │ 检查是否存在同名技能  │
              └──────────┬──────────┘
           ┌─────────────┼─────────────┐
           ↓                           ↓
         存在                        不存在
           ↓                           ↓
      记录到 conflicts              创建技能目录
           ↓                        复制技能文件
           ↓                           ↓
           └─────────────┬─────────────┘
                         ↓
              ┌──────────┴──────────┐
              │ 是否有 conflicts?    │
              └──────────┬──────────┘
           ┌─────────────┼─────────────┐
           ↓                           ↓
          是                          否
           ↓                           ↓
    中断并提示用户                 更新索引
    手动处理冲突                  返回成功结果
```

### 回滚流程

```
┌─────────────────────────────────────────────────────────┐
│ 用户执行 /skill:rollback <name>                         │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 获取版本列表                                            │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 展示版本列表，等待用户选择                              │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 将当前版本保存到历史（创建新版本号）                    │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 将选中版本复制为当前版本                                │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 更新索引，返回成功                                      │
└─────────────────────────────────────────────────────────┘
```

### 去重融合流程

```
┌─────────────────────────────────────────────────────────┐
│ 技能增强或导入时触发                                    │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ SkillMerger.findSimilar() - 调用 skill sub agent       │
│ 分析新技能与现有技能的语义相似度                        │
└────────────────────────┬────────────────────────────────┘
                         ↓
              ┌──────────┴──────────┐
              │ 是否存在相似技能?    │
              └──────────┬──────────┘
           ┌─────────────┼─────────────┐
           ↓                           ↓
          是                          否
           ↓                           ↓
    SkillMerger.merge()           正常保存技能
    调用技能增强机制融合
           ↓
    生成增强后的合并版本
           ↓
    更新索引
```

---

## 测试用例

### 版本管理

1. 创建版本 → 验证版本号格式正确（日期+序列号）
2. 同一天多次创建 → 验证序列号递增
3. 获取版本列表 → 验证按版本号降序排列
4. 回滚版本 → 验证当前版本被保存，目标版本成为当前
5. 超过 20 个版本 → 验证 FIFO 清理最旧版本

### 导入功能

6. 本地目录导入 → 验证技能正确创建
7. 远程 URL 导入 → 验证克隆和清理
8. 导入冲突 → 验证中断并提示用户
9. 空目录导入 → 验证处理空结果

### 去重融合

10. 相似技能检测 → 验证 skill sub agent 调用
11. 技能融合 → 验证增强机制被调用
12. 无相似技能 → 验证正常保存

### Slash Commands

13. /skill:list → 验证列表格式正确
14. /skill:info → 验证详情和版本历史显示
15. /skill:delete → 验证确认和删除
16. /skill:rollback → 验证版本选择交互

### 边界情况

17. 技能不存在 → 验证错误提示
18. 版本不存在 → 验证错误提示
19. 无版本历史的技能回滚 → 验证处理

---

## 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `SKILL_MAX_VERSIONS` | 20 | 每个技能最大版本数 |
| `SKILLS_DIR` | `~/.synapse/skills/` | 技能存储目录 |
| `SKILL_IMPORT_TIMEOUT` | 60000 | 远程导入超时时间（毫秒） |
