/**
 * 技能系统相关接口定义 — tools 模块使用的抽象接口。
 *
 * 用于打破 tools→skills 跨层依赖：tools 模块仅依赖这些接口，
 * 具体实现由 skills 模块提供，通过 cli 层注入。
 *
 * 核心导出：
 * - ISkillLoader: 技能加载器接口
 * - ISkillManager: 技能管理器接口
 * - ISkillMetadataService: 技能元数据查询接口
 * - ISkillMerger: 技能合并器接口
 * - IMetaSkillInstaller: 内置技能安装器接口
 * - SkillMeta: 技能元信息
 * - VersionInfo: 版本信息
 * - ImportOptions / ImportResult / MergeIntoOption: 导入相关类型
 */

/**
 * 版本信息
 */
export interface VersionInfo {
  /** 版本号（如 2026-02-03-001） */
  version: string;
  /** 版本创建时间 */
  createdAt: Date;
  /** 版本目录路径 */
  dirPath: string;
}

/**
 * 技能元信息
 */
export interface SkillMeta {
  name: string;
  title?: string;
  domain?: string;
  description?: string;
  version: string;
  tags: string[];
  author?: string;
  tools: string[];
  scriptCount: number;
  path: string;
  hasSkillMd: boolean;
  lastModified?: string;
  /** 技能历史版本列表 */
  versions: VersionInfo[];
}

/**
 * 导入冲突信息（同名）
 */
export interface ConflictInfo {
  name: string;
  existingPath: string;
  newPath: string;
}

/**
 * 相似技能信息
 */
export interface SimilarInfo {
  name: string;
  similarTo: string;
  reason: string;
}

/**
 * 导入结果
 */
export interface ImportResult {
  imported: string[];
  skipped: string[];
  conflicts: ConflictInfo[];
  similar: SimilarInfo[];
}

/**
 * merge 选项
 */
export interface MergeIntoOption {
  source: string;
  target: string;
}

/**
 * 导入选项
 */
export interface ImportOptions {
  continueSkills?: string[];
  mergeInto?: MergeIntoOption[];
}

/**
 * Level 2 加载结果（包含 SKILL.md 内容）
 */
export interface SkillLevel2 {
  name: string;
  rawContent?: string;
}

/**
 * 技能加载器接口
 */
export interface ISkillLoader {
  /** 加载完整技能数据（包含 SKILL.md 内容） */
  loadLevel2(name: string): SkillLevel2 | null;
}

/**
 * 技能元数据只读查询接口
 */
export interface ISkillMetadataService {
  /** 列出所有技能及其版本信息 */
  list(): Promise<SkillMeta[]>;
  /** 获取单个技能详情 */
  info(name: string): Promise<SkillMeta | null>;
  /** 获取版本列表（按版本号降序） */
  getVersions(name: string): Promise<VersionInfo[]>;
}

/**
 * 技能管理器接口（写操作）
 */
export interface ISkillManager extends ISkillMetadataService {
  /** 导入技能 */
  import(source: string, options?: ImportOptions): Promise<ImportResult>;
  /** 回滚技能版本 */
  rollback(name: string, version: string): Promise<void>;
  /** 删除技能 */
  delete(name: string): Promise<void>;
}

/**
 * 技能合并器接口 — tools 模块对 SkillMerger 的最小依赖。
 * tools 模块不直接调用 merger 方法，仅透传给 ISkillManager。
 */
export interface ISkillMerger {
  /** 供外部检查是否处于降级模式 */
  getSubAgentManager(): unknown;
}

/**
 * 内置技能安装器接口
 */
export interface IMetaSkillInstaller {
  /** 安装缺失的内置技能 */
  installIfMissing(): { installed: string[]; skipped: string[]; errors: Array<{ skill: string; error: string }> };
}
