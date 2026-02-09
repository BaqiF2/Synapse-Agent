# 技能管理系统设计文档

## 概述

技能管理系统是对现有技能模块的扩展，提供版本管理、批量导入、冲突解决、去重合并等能力。通过 Slash Commands 供用户操作，通过 skill sub agent 实现智能分析。

### 核心特性

- **版本管理** - 每个技能保存历史版本（完整快照），支持回滚
- **批量导入** - 支持本地目录和远程 URL 导入
- **冲突解决** - 同名冲突时中断，用户修改名称后重新导入
- **智能去重** - 导入时通过 skill sub agent 语义分析检测相似技能
- **自动融合** - 复用技能增强机制实现技能合并

---

## 目录结构

### 技能存储结构

```
~/.synapse/skills/
├── git-commit/
│   ├── SKILL.md              # 最新版本（技能定义文件）
│   ├── scripts/              # 技能脚本目录（现有）
│   │   ├── commit.py
│   │   └── validate.sh
│   └── versions/             # 版本历史目录（新增）
│       ├── 2026-02-03-001/   # 历史版本（完整快照）
│       │   ├── SKILL.md
│       │   └── scripts/
│       │       ├── commit.py
│       │       └── validate.sh
│       └── 2026-02-02-001/
│           ├── SKILL.md
│           └── scripts/
│               └── commit.py
├── code-review/
│   ├── SKILL.md
│   ├── scripts/
│   └── versions/
└── index.json                # 技能索引（现有）
```

### 代码文件结构

```
src/skills/
├── skill-loader.ts           # 现有：渐进式技能加载（Level1/Level2），含搜索 searchLevel1()
├── indexer.ts                # 现有：技能索引扫描与管理（SkillIndexer）
├── skill-schema.ts           # 现有：SKILL.md 解析（SkillDocParser, parseSkillMd, SKILL_DOMAINS）
├── skill-generator.ts        # 现有：技能生成与更新（SkillGenerator, SkillSpec）
├── skill-enhancer.ts         # 现有：对话分析与技能增强（SkillEnhancer, EnhanceDecision）
├── conversation-reader.ts    # 现有：对话历史读取（ConversationReader）
├── index-updater.ts          # 现有：SkillIndexer 的向后兼容别名
├── meta-skill-installer.ts   # 现有：元技能安装器（MetaSkillInstaller）
├── index.ts                  # 现有：模块统一导出
├── skill-manager.ts          # 新增：版本管理、导入、删除
├── skill-merger.ts           # 新增：去重、融合
└── types.ts                  # 新增：类型定义

src/tools/handlers/
└── skill-command-handler.ts  # 扩展：添加新命令处理（当前仅支持 skill:load）
```

---

## 数据结构

### VersionInfo

```typescript
/** 版本信息 */
interface VersionInfo {
  /** 版本号：日期+序列号，如 2026-02-03-001 */
  version: string;
  /** 创建时间 */
  createdAt: Date;
  /** 版本目录路径（包含完整技能快照） */
  dirPath: string;
}
```

### SkillMeta

```typescript
/** 技能元信息（扩展 SkillIndexEntry） */
interface SkillMeta extends SkillIndexEntry {
  /** 版本历史 */
  versions: VersionInfo[];
}
```

注：`SkillIndexEntry` 来自现有的 `src/skills/indexer.ts`，包含以下字段：
`name`, `title`, `domain`, `description`, `version`, `tags`, `author`, `tools`, `scriptCount`, `path`, `hasSkillMd`, `lastModified`。

### ImportResult

```typescript
/** 导入结果 */
interface ImportResult {
  /** 成功导入的技能 */
  imported: string[];
  /** 跳过的技能（用户选择跳过） */
  skipped: string[];
  /** 同名冲突的技能（需要用户修改名称） */
  conflicts: ConflictInfo[];
  /** 语义相似的技能（需要用户决定） */
  similar: SimilarInfo[];
}

/** 同名冲突信息 */
interface ConflictInfo {
  /** 技能名称 */
  name: string;
  /** 现有技能路径 */
  existingPath: string;
  /** 新技能路径 */
  newPath: string;
}

/** 相似技能信息 */
interface SimilarInfo {
  /** 新技能名称 */
  name: string;
  /** 相似的现有技能名称 */
  similarTo: string;
  /** 相似原因 */
  reason: string;
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

## 组件架构

### 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                      BashRouter                                  │
│  handlerRegistry.registerHandler('skill:', ...)                  │
│  findHandler() 匹配 → SkillCommandHandler.execute() 内部路由    │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                   SkillCommandHandler                            │
│  - 命令解析与参数验证                                            │
│  - 输出格式化                                                    │
│  - 持有 SkillManager 实例（组合模式）                            │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                      SkillManager                                │
│  - 版本管理（创建、回滚、清理）                                  │
│  - 导入处理（本地、远程、冲突检测）                              │
│  - 删除技能                                                      │
│  - 持有 SkillMerger 实例                                        │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                      SkillMerger                                 │
│  - 调用 SubAgentManager 分析语义相似度                          │
│  - 调用技能增强机制实现融合                                      │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                      SkillIndexer                                │
│  - 现有实现，复用 rebuild() / updateSkill() / removeSkill()     │
└─────────────────────────────────────────────────────────────────┘
```

### SkillCommandHandler 扩展

```typescript
// src/tools/handlers/skill-command-handler.ts

/**
 * SkillCommandHandler 配置选项（扩展现有 SkillCommandHandlerOptions）
 *
 * 现有：homeDir?: string
 * 新增：subAgentManager 相关依赖（参考 TaskCommandHandler 的模式）
 */
export interface SkillCommandHandlerOptions {
  homeDir?: string;
  /** LLM 客户端（用于 SkillMerger 创建 SubAgentManager） */
  llmClient?: LLMClient;
  /** BashTool 实例（用于 SubAgentManager 创建受限 Toolset） */
  toolExecutor?: BashTool;
  /** SubAgent 回调 */
  onSubAgentToolStart?: (event: SubAgentToolCallEvent) => void;
  onSubAgentToolEnd?: (event: ToolResultEvent) => void;
  onSubAgentComplete?: (event: SubAgentCompleteEvent) => void;
  onSubAgentUsage?: OnUsage;
}

export class SkillCommandHandler {
  private skillLoader: SkillLoader;
  private skillManager: SkillManager;

  constructor(options: SkillCommandHandlerOptions = {}) {
    const homeDir = options.homeDir ?? os.homedir();
    const skillsDir = path.join(homeDir, '.synapse', 'skills');

    this.skillLoader = new SkillLoader(homeDir);

    // 初始化 SkillManager 及其依赖
    // 注意：SkillMerger 需要 SubAgentManager，参考 BashRouter.createTaskHandler() 模式
    // 从 BashRouterOptions 中传递 llmClient 和 toolExecutor
    const indexer = new SkillIndexer(homeDir);
    const merger = this.createMerger(options);
    this.skillManager = new SkillManager(skillsDir, indexer, merger);
  }

  /**
   * 创建 SkillMerger（参考 BashRouter.createTaskHandler() 的依赖传递模式）
   * 当缺少 llmClient 或 toolExecutor 时，merger 将以降级模式运行（跳过相似检测）
   */
  private createMerger(options: SkillCommandHandlerOptions): SkillMerger {
    if (!options.llmClient || !options.toolExecutor) {
      // 降级模式：无法执行 SubAgent 调用
      return new SkillMerger(null);
    }

    const subAgentManager = new SubAgentManager({
      client: options.llmClient,
      bashTool: options.toolExecutor,
      onToolStart: options.onSubAgentToolStart,
      onToolEnd: options.onSubAgentToolEnd,
      onComplete: options.onSubAgentComplete,
      onUsage: options.onSubAgentUsage,
    });

    return new SkillMerger(subAgentManager);
  }

  async execute(command: string): Promise<CommandResult> {
    const trimmed = command.trim();

    if (trimmed.startsWith('skill:load')) {
      return this.handleLoad(trimmed);
    }
    if (trimmed.startsWith('skill:list')) {
      return this.handleList();
    }
    if (trimmed.startsWith('skill:info')) {
      return this.handleInfo(trimmed);
    }
    if (trimmed.startsWith('skill:import')) {
      return this.handleImport(trimmed);
    }
    if (trimmed.startsWith('skill:rollback')) {
      return this.handleRollback(trimmed);
    }
    if (trimmed.startsWith('skill:delete')) {
      return this.handleDelete(trimmed);
    }

    return {
      stdout: '',
      stderr: `Unknown skill command: ${command}`,
      exitCode: 1,
    };
  }

  private async handleList(): Promise<CommandResult> {
    const skills = await this.skillManager.list();
    const lines = skills.map(s =>
      `${s.name.padEnd(20)} - ${s.description || 'No description'} (${s.versions.length} versions)`
    );
    return { stdout: lines.join('\n'), stderr: '', exitCode: 0 };
  }

  // ... 其他 handle 方法
}
```

---

## 核心组件实现

### SkillManager

```typescript
// src/skills/skill-manager.ts

import * as crypto from 'node:crypto';

/** 版本号最大数量 */
const MAX_VERSIONS = parseInt(process.env.SYNAPSE_SKILL_MAX_VERSIONS || '20', 10);

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
  async import(
    source: string,
    options: ImportOptions = {}
  ): Promise<ImportResult> {
    const isUrl = source.startsWith('http://') || source.startsWith('https://');

    if (isUrl) {
      return this.importFromUrl(source, options);
    } else {
      return this.importFromDirectory(source, options);
    }
  }

  /**
   * 导入选项
   */
  interface ImportOptions {
    /** 跳过相似检测，继续导入指定技能 */
    continueSkills?: string[];
    /** 合并到现有技能 */
    mergeInto?: { source: string; target: string }[];
  }

  /**
   * 从本地目录导入
   */
  private async importFromDirectory(
    dirPath: string,
    options: ImportOptions = {}
  ): Promise<ImportResult> {
    const result: ImportResult = {
      imported: [],
      skipped: [],
      conflicts: [],
      similar: [],
    };

    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      // 只处理目录（每个目录是一个技能）
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

      const skillName = entry.name;
      const sourcePath = path.join(dirPath, skillName);
      const targetDir = path.join(this.skillsDir, skillName);

      // 1. 检查同名冲突
      if (await this.exists(targetDir)) {
        result.conflicts.push({
          name: skillName,
          existingPath: targetDir,
          newPath: sourcePath,
        });
        continue;
      }

      // 2. 检查用户是否已选择跳过相似检测
      if (options.continueSkills?.includes(skillName)) {
        await this.copySkillSnapshot(sourcePath, targetDir);
        result.imported.push(skillName);
        continue;
      }

      // 3. 检查用户是否已选择合并
      const mergeTarget = options.mergeInto?.find(m => m.source === skillName);
      if (mergeTarget) {
        await this.merger.merge(sourcePath, mergeTarget.target);
        result.imported.push(`${skillName} → ${mergeTarget.target}`);
        continue;
      }

      // 4. 语义相似检测（异常时跳过，视为无相似）
      const skillContent = await this.readSkillContent(sourcePath);
      const existingSkills = await this.list();
      let similarSkills: MergeCandidate[] = [];
      try {
        similarSkills = await this.merger.findSimilar(skillContent, existingSkills);
      } catch {
        // SubAgent 调用失败时跳过相似检测，继续导入
        logger.warn('Similarity detection failed, skipping', { skillName });
      }

      if (similarSkills.length > 0) {
        result.similar.push({
          name: skillName,
          similarTo: similarSkills[0].target,
          reason: similarSkills[0].similarity,
        });
        continue; // 中断，等待用户决定
      }

      // 5. 无冲突，直接导入（单个失败不影响其他技能）
      try {
        await this.copySkillSnapshot(sourcePath, targetDir);
        result.imported.push(skillName);
      } catch (err) {
        result.skipped.push(skillName);
        logger.error('Failed to import skill', { skillName, error: err });
      }
    }

    // 有冲突或相似时中断，否则更新索引
    if (result.conflicts.length === 0 && result.similar.length === 0) {
      await this.indexer.rebuild();
    }

    return result;
  }

  /**
   * 从远程 URL 导入（Git 仓库）
   * 注意：URL 安全性由用户自行负责
   * 克隆失败时直接抛出错误，由 SkillCommandHandler 捕获并返回错误信息
   */
  private async importFromUrl(
    url: string,
    options: ImportOptions = {}
  ): Promise<ImportResult> {
    const IMPORT_TIMEOUT = parseInt(process.env.SYNAPSE_SKILL_IMPORT_TIMEOUT || '60000', 10);

    // 克隆到临时目录（失败时抛出错误）
    const tempDir = path.join(os.tmpdir(), `skill-import-${Date.now()}`);
    await execAsync(`git clone --depth 1 ${url} ${tempDir}`, { timeout: IMPORT_TIMEOUT });

    try {
      return await this.importFromDirectory(tempDir, options);
    } finally {
      // 清理临时目录
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * 创建新版本（保存当前版本到历史）
   * 复制整个技能目录（排除 versions/）
   */
  async createVersion(name: string): Promise<string> {
    const skillDir = path.join(this.skillsDir, name);
    const versionsDir = path.join(skillDir, 'versions');

    await fs.mkdir(versionsDir, { recursive: true });

    const version = await this.generateVersionNumber(name);
    const versionDir = path.join(versionsDir, version);

    // 复制技能目录（排除 versions/）
    await this.copySkillSnapshot(skillDir, versionDir);

    // 清理旧版本
    await this.cleanOldVersions(name);

    return version;
  }

  /**
   * 回滚到指定版本（智能备份）
   */
  async rollback(name: string, version: string): Promise<void> {
    const skillDir = path.join(this.skillsDir, name);
    const versionDir = path.join(skillDir, 'versions', version);

    if (!await this.exists(versionDir)) {
      throw new Error(`Version ${version} not found for skill ${name}`);
    }

    // 智能判断：当前版本是否已在历史中存在
    const currentHash = await this.hashDirectory(skillDir);
    const existingVersions = await this.getVersions(name);
    const alreadyExists = await this.anyVersionMatches(existingVersions, currentHash);

    if (!alreadyExists) {
      await this.createVersion(name);
    }

    // 清空当前目录（保留 versions/）并恢复目标版本
    await this.restoreFromVersion(skillDir, versionDir);

    await this.indexer.updateSkill(name);
  }

  /**
   * 获取版本列表
   */
  async getVersions(name: string): Promise<VersionInfo[]> {
    const versionsDir = path.join(this.skillsDir, name, 'versions');

    if (!await this.exists(versionsDir)) {
      return [];
    }

    const entries = await fs.readdir(versionsDir, { withFileTypes: true });
    const versions: VersionInfo[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const version = entry.name;
      const dirPath = path.join(versionsDir, version);
      const stat = await fs.stat(dirPath);

      versions.push({
        version,
        createdAt: stat.birthtime,
        dirPath,
      });
    }

    // 按版本号降序排列（最新在前）
    return versions.sort((a, b) => b.version.localeCompare(a.version));
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
      await fs.rm(v.dirPath, { recursive: true, force: true });
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
    await this.indexer.removeSkill(name);
  }

  /**
   * 计算目录内容的 hash（排除 versions/）
   */
  private async hashDirectory(dirPath: string): Promise<string> {
    const hash = crypto.createHash('sha256');
    const files = await this.listFilesRecursive(dirPath, ['versions']);

    for (const file of files.sort()) {
      const content = await fs.readFile(file);
      hash.update(file.replace(dirPath, '')); // 相对路径
      hash.update(content);
    }

    return hash.digest('hex');
  }

  /**
   * 复制技能快照（排除 versions/）
   */
  private async copySkillSnapshot(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name === 'versions') continue;

      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copySkillSnapshot(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * 检查是否有版本与给定 hash 匹配
   */
  private async anyVersionMatches(
    versions: VersionInfo[],
    targetHash: string
  ): Promise<boolean> {
    for (const v of versions) {
      const hash = await this.hashDirectory(v.dirPath);
      if (hash === targetHash) return true;
    }
    return false;
  }

  /**
   * 从版本恢复（保留 versions/ 目录）
   */
  private async restoreFromVersion(skillDir: string, versionDir: string): Promise<void> {
    const entries = await fs.readdir(skillDir, { withFileTypes: true });

    // 删除当前内容（保留 versions/）
    for (const entry of entries) {
      if (entry.name === 'versions') continue;
      await fs.rm(path.join(skillDir, entry.name), { recursive: true, force: true });
    }

    // 复制版本内容
    await this.copySkillSnapshot(versionDir, skillDir);
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
  private subAgentManager: SubAgentManager | null;

  constructor(subAgentManager: SubAgentManager | null) {
    this.subAgentManager = subAgentManager;
  }

  /**
   * 检查技能是否与现有技能相似
   * 通过 skill sub agent 进行语义分析
   */
  async findSimilar(skillContent: string, existingSkills: SkillMeta[]): Promise<MergeCandidate[]> {
    if (!this.subAgentManager || existingSkills.length === 0) {
      return [];
    }

    // 构建提示词
    const prompt = this.buildSimilarityPrompt(skillContent, existingSkills);

    // 调用 skill sub agent 分析（使用 search action：纯文本推理，无工具权限）
    const result = await this.subAgentManager.execute('skill', {
      prompt,
      description: 'Analyze skill similarity',
      action: 'search',
    });

    // 解析结果
    return this.parseSimilarityResult(result);
  }

  /**
   * 融合两个相似技能
   * 复用技能增强机制
   */
  async merge(sourcePath: string, targetName: string): Promise<void> {
    if (!this.subAgentManager) {
      throw new Error('SubAgentManager is required for skill merging');
    }

    // 构建融合提示词
    const prompt = this.buildMergePrompt(sourcePath, targetName);

    // 调用 skill sub agent 执行融合（使用 enhance action：允许文件操作）
    await this.subAgentManager.execute('skill', {
      prompt,
      description: 'Merge similar skills',
      action: 'enhance',
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

  private buildMergePrompt(sourcePath: string, targetName: string): string {
    return `Merge the skill from "${sourcePath}" into "${targetName}".

Analyze both skills and create an enhanced version that combines:
1. All capabilities from both skills
2. Best practices from each
3. Remove redundant content

Use the skill enhancement mechanism to update "${targetName}" with the merged content.`;
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

### 命令注册

在 `src/tools/bash-router.ts` 中扩展命令注册，将现有的 `skill:load` 注册改为统一的 `skill:` 前缀：

```typescript
// BashRouter.registerBuiltinHandlers() 中修改注册方式
// 现有：registerHandler('skill:load', ..., 'prefix', () => this.createSkillHandler())
// 改为：注册更通用的前缀，所有 skill:* 管理命令由 SkillCommandHandler 内部路由

// 方案 B（推荐）：统一 skill: 前缀，SkillCommandHandler 内部路由
// 需要同时修改 findHandler() 中对 skill: 的特殊处理逻辑：
// - skill:name:tool（三段式）→ SkillToolHandler（Extend Shell）
// - skill:load/list/info/import/rollback/delete → SkillCommandHandler（Agent Shell）
// - 其他 skill:xxx → 兜底到 SkillCommandHandler 返回错误

private registerBuiltinHandlers(): void {
  // ... 其他注册不变 ...

  // Agent Shell — skill 管理命令
  // 注意：注册 'skill:' 前缀但在 findHandler() 中需要特殊处理
  // 以避免与 SkillToolHandler（三段式 skill:name:tool）冲突
  this.registerHandler('skill:', CommandType.AGENT_SHELL_COMMAND, null, 'prefix',
    () => this.createSkillHandler());

  // Extend Shell — skill tool（三段式 skill:name:tool）
  // findHandler() 会优先匹配三段式到此 handler
  this.registerHandler('skill:', CommandType.EXTEND_SHELL_COMMAND,
    new SkillToolHandler(), 'prefix');
}

// findHandler() 中的匹配逻辑修改：
private findHandler(trimmed: string): HandlerEntry | null {
  // 对 skill: 命令的判断顺序：
  // 1. skill:name:tool（三段式）→ SkillToolHandler（Extend Shell）
  // 2. skill:load|list|info|import|rollback|delete → SkillCommandHandler（Agent Shell）
  // 实现方式：维持当前 isSkillToolCommand() 检查，三段式走 Extend Shell，
  // 非三段式的 skill:* 走 Agent Shell（SkillCommandHandler 内部路由子命令）
}
```

注意：`BashRouter.createSkillHandler()` 需要同步修改，传递 `llmClient` 和 `toolExecutor` 等依赖，
参考现有的 `createTaskHandler()` 方法。具体见上方 SkillCommandHandler 构造函数的修改说明。

```typescript
/** 创建 SkillCommandHandler（惰性，参考 createTaskHandler 的依赖传递模式） */
private createSkillHandler(): SkillCommandHandler {
  const { llmClient, toolExecutor, onSubAgentToolStart, onSubAgentToolEnd,
          onSubAgentComplete, onSubAgentUsage } = this.options;

  return new SkillCommandHandler({
    homeDir: path.dirname(this.options.synapseDir ?? DEFAULT_SYNAPSE_DIR),
    llmClient,
    toolExecutor,
    onSubAgentToolStart,
    onSubAgentToolEnd,
    onSubAgentComplete,
    onSubAgentUsage,
  });
}
```

### 命令说明

#### /skill:list

```
skill:list - 列出所有已安装的技能

用法：
    skill:list

输出：
    git-commit      - Commit changes with conventional format (v1.0.0, 3 versions)
    code-review     - Review code changes (v1.2.0, 5 versions)
    ...
```

#### /skill:info

```
skill:info - 显示技能详情和版本历史

用法：
    skill:info <name>

输出：
    Skill: git-commit
    Description: Commit changes with conventional format
    Version: 1.0.0
    Created: 2026-01-15
    Updated: 2026-02-03
    Tools: skill:git-commit:commit, skill:git-commit:validate

    Version History (5):
      1. 2026-02-03-001  (latest backup)
      2. 2026-02-02-001
      3. 2026-02-01-002
      4. 2026-01-20-001
      5. 2026-01-15-001
```

#### /skill:import

```
skill:import - 从目录或 URL 导入技能

用法：
    skill:import <source> [options]

参数：
    <source>              本地目录路径或 Git 仓库 URL

选项：
    --continue=<names>    跳过相似检测，继续导入指定技能（逗号分隔）
    --merge=<src>:<dst>   将源技能合并到目标技能

流程：
    1. 检测同名冲突 → 中断，提示用户修改源目录中的技能名称
    2. 检测语义相似 → 中断，提示用户选择操作
    3. 无冲突 → 完成导入

示例：
    skill:import /path/to/skills/
    skill:import https://github.com/user/skills-repo
    skill:import /path/to/skills/ --continue=new-skill
    skill:import /path/to/skills/ --merge=new-commit:git-commit

注意：远程 URL 的安全性由用户自行负责。
```

#### /skill:rollback

```
skill:rollback - 回滚技能到历史版本

用法：
    skill:rollback <name> [version]

参数：
    <name>       技能名称
    [version]    目标版本号（可选）

流程：
    1. 不指定版本 → 显示版本列表
    2. 指定版本 → 执行回滚（智能备份当前版本）

示例：
    skill:rollback git-commit                    # 显示版本列表
    skill:rollback git-commit 2026-02-02-001     # 回滚到指定版本
```

#### /skill:delete

```
skill:delete - 删除技能及所有版本历史

用法：
    skill:delete <name> [--confirm]

参数：
    <name>       技能名称
    --confirm    确认删除（跳过确认提示）

流程：
    1. 不带 --confirm → 显示确认提示
    2. 带 --confirm → 直接删除

示例：
    skill:delete git-commit              # 显示确认提示
    skill:delete git-commit --confirm    # 直接删除
```

---

## 执行流程

### 导入流程

```
┌─────────────────────────────────────────────────────────────────┐
│ 用户执行 skill:import <source> [options]                        │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
              ┌──────────────┴──────────────┐
              │ 判断 source 类型             │
              └──────────────┬──────────────┘
           ┌─────────────────┼─────────────────┐
           ↓                                   ↓
       本地目录                             远程 URL
           ↓                                   ↓
      直接读取目录                    克隆到临时目录（用户负责安全）
           └─────────────────┬─────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│ 遍历技能目录                                                    │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
              ┌──────────────┴──────────────┐
              │ 检查是否存在同名技能          │
              └──────────────┬──────────────┘
           ┌─────────────────┼─────────────────┐
           ↓                                   ↓
         存在                               不存在
           ↓                                   ↓
      记录到 conflicts                 检查 --continue 选项
           ↓                                   ↓
           ↓                    ┌──────────────┴──────────────┐
           ↓                    ↓                              ↓
           ↓              已指定跳过                     调用 findSimilar()
           ↓                    ↓                              ↓
           ↓               直接导入              ┌─────────────┴─────────────┐
           ↓                    ↓                ↓                           ↓
           ↓                    ↓           发现相似                      无相似
           ↓                    ↓                ↓                           ↓
           ↓                    ↓        检查 --merge 选项              直接导入
           ↓                    ↓                ↓                           ↓
           ↓                    ↓    ┌──────────┴──────────┐                ↓
           ↓                    ↓    ↓                      ↓                ↓
           ↓                    ↓ 已指定合并          记录到 similar         ↓
           ↓                    ↓    ↓                      ↓                ↓
           ↓                    ↓ 执行合并                  ↓                ↓
           └────────────────────┴────┴──────────────────────┴────────────────┘
                                              ↓
              ┌──────────────────────────────┴──────────────────────────────┐
              │ 有 conflicts 或 similar？                                    │
              └──────────────────────────────┬──────────────────────────────┘
           ┌─────────────────────────────────┼─────────────────────────────────┐
           ↓                                                                   ↓
          是                                                                  否
           ↓                                                                   ↓
    返回结果，中断导入                                                   更新索引
    提示用户处理后重新执行                                             返回成功结果
    - conflicts: 修改源目录中的技能名称
    - similar: 使用 --continue 或 --merge 选项
```

### 回滚流程

```
┌─────────────────────────────────────────────────────────────────┐
│ 用户执行 skill:rollback <name> [version]                        │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
              ┌──────────────┴──────────────┐
              │ 是否指定 version？           │
              └──────────────┬──────────────┘
           ┌─────────────────┼─────────────────┐
           ↓                                   ↓
         未指定                              已指定
           ↓                                   ↓
    获取并显示版本列表                   验证版本存在
    等待用户选择版本                          ↓
                                    ┌─────────┴─────────┐
                                    │ 计算当前版本 hash  │
                                    └─────────┬─────────┘
                                              ↓
                                    ┌─────────┴─────────┐
                                    │ 历史中已存在相同？  │
                                    └─────────┬─────────┘
                                 ┌────────────┼────────────┐
                                 ↓                         ↓
                               存在                      不存在
                                 ↓                         ↓
                            跳过备份                  创建版本备份
                                 └────────────┬────────────┘
                                              ↓
                                    ┌─────────┴─────────┐
                                    │ 恢复目标版本内容   │
                                    │ （保留 versions/） │
                                    └─────────┬─────────┘
                                              ↓
                                    ┌─────────┴─────────┐
                                    │ 更新索引，返回成功 │
                                    └───────────────────┘
```

---

## 测试用例

### 版本管理

1. **创建版本** → 验证版本目录结构正确（包含 SKILL.md 和 scripts/）
2. **同一天多次创建** → 验证序列号递增（001, 002, 003...）
3. **获取版本列表** → 验证按版本号降序排列
4. **回滚版本** → 验证整个目录被恢复（SKILL.md + scripts/）
5. **回滚时智能备份** → 当前版本内容已在历史中存在时，不创建重复备份
6. **回滚时自动备份** → 当前版本是新内容时，先创建备份再回滚
7. **超过 20 个版本** → 验证 FIFO 清理最旧的版本目录

### 导入功能

8. **本地目录导入** → 验证技能目录正确复制
9. **远程 URL 导入** → 验证克隆、导入、临时目录清理
10. **同名冲突** → 验证返回 conflicts，不执行导入
11. **语义相似检测** → 验证调用 SkillMerger.findSimilar()
12. **相似技能中断** → 验证返回 similar，等待用户决定
13. **--continue 选项** → 验证跳过相似检测，继续导入
14. **--merge 选项** → 验证调用 merger.merge() 融合技能
15. **空目录导入** → 验证返回空结果，无错误

### 去重融合

16. **相似技能检测** → 验证 SubAgentManager 调用正确
17. **技能融合** → 验证目标技能被更新，源技能不导入
18. **无相似技能** → 验证返回空数组，正常导入

### Slash Commands

19. **skill:list** → 验证列表格式包含版本数量
20. **skill:info** → 验证详情和版本历史显示
21. **skill:import 冲突提示** → 验证提示用户修改名称
22. **skill:import 相似提示** → 验证提示 --continue 或 --merge 选项
23. **skill:rollback 无版本参数** → 验证显示版本列表
24. **skill:rollback 有版本参数** → 验证执行回滚
25. **skill:delete 无确认** → 验证显示确认提示
26. **skill:delete --confirm** → 验证直接删除

### 边界情况

27. **技能不存在** → 验证返回友好错误提示
28. **版本不存在** → 验证返回错误提示
29. **无版本历史的技能回滚** → 验证提示无可用版本
30. **导入时目标目录无写权限** → 验证返回权限错误
31. **版本 hash 计算** → 验证排除 versions/ 目录

### 错误处理

32. **远程克隆失败（网络超时）** → 验证抛出错误，返回超时错误信息
33. **远程克隆失败（仓库不存在）** → 验证抛出错误，返回 git 错误信息
34. **SubAgent 调用超时** → 验证跳过相似检测，继续导入
35. **SubAgent 返回格式异常** → 验证 parseSimilarityResult 返回空数组，继续导入
36. **导入中途单个技能失败** → 验证已成功的技能保留，失败的记录到 skipped
37. **批量导入部分成功** → 验证 imported 和 skipped 各自正确记录

---

## 与现有模块的关系

### 组件职责划分

| 组件 | 职责 | 触发方式 |
|------|------|----------|
| **SkillManager** (新增) | 版本管理、导入、删除 | 用户通过 skill:* 命令主动操作 |
| **SkillMerger** (新增) | 语义相似检测、技能融合 | SkillManager 导入时调用 |
| **SkillLoader** (现有) | 渐进式技能加载（Level1/Level2）、搜索 | SkillCommandHandler 的 skill:load 命令 |
| **SkillIndexer** (现有) | 索引扫描、增量更新、删除 | SkillManager 导入/删除/回滚后更新索引 |
| **SkillEnhancer** (现有) | 对话分析、自动技能增强 | Agent 退出循环时的 hook 自动触发 |
| **SkillGenerator** (现有) | 生成/更新 SKILL.md 文件 | SkillEnhancer 增强时调用 |
| **ConversationReader** (现有) | 读取对话历史 | SkillEnhancer 分析时调用 |
| **MetaSkillInstaller** (现有) | 安装内置元技能 | Agent 初始化时检查并安装 |

### SkillMerger vs SkillEnhancer

- **SkillEnhancer**：自动模式。在 Agent 退出循环时由 hook 触发，分析对话历史决定是否创建/增强技能。内部使用 `SkillGenerator` 生成 SKILL.md。
- **SkillMerger**：用户主动模式。在 `skill:import` 导入时检测相似技能，通过 SubAgent 执行语义分析和融合。不直接调用 SkillEnhancer。

### SkillManager vs SkillLoader

- **SkillLoader**：读取层。加载技能内容（Level1 元数据 / Level2 完整文档），提供缓存和搜索。
- **SkillManager**：管理层。处理技能的生命周期操作（版本创建、回滚、导入、删除），操作完成后通过 SkillIndexer 更新索引。

### 依赖关系图

```
SkillCommandHandler
├── SkillLoader          # 处理 skill:load 命令
└── SkillManager         # 处理 skill:list/info/import/rollback/delete 命令
    ├── SkillIndexer     # 索引管理（rebuild/updateSkill/removeSkill）
    └── SkillMerger      # 导入时的相似检测与融合
        └── SubAgentManager (可选)  # 调用 skill SubAgent 分析
```

---

## 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `SYNAPSE_SKILL_MAX_VERSIONS` | 20 | 每个技能最大版本数 |
| `SYNAPSE_SKILL_IMPORT_TIMEOUT` | 60000 | 远程导入超时时间（毫秒） |

注：技能目录固定为 `~/.synapse/skills/`，与现有系统保持一致，不支持通过环境变量修改。
