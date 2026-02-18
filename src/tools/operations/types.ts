/**
 * 可插拔操作接口 — 定义工具执行的环境抽象。
 * 使工具逻辑与执行环境解耦，支持本地/远程等不同执行策略。
 *
 * 核心导出:
 * - FileOperations: 文件操作接口
 * - BashOperations: 命令执行接口
 * - ExecOptions: 执行选项
 * - ExecResult: 执行结果
 * - FileEdit: 文件编辑描述
 * - SearchOptions / SearchResult: 搜索相关类型
 */

/** 文件操作接口 */
export interface FileOperations {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  editFile(path: string, edits: FileEdit[]): Promise<string>;
  fileExists(path: string): Promise<boolean>;
  listFiles(pattern: string): Promise<string[]>;
  searchContent(pattern: string, options?: SearchOptions): Promise<SearchResult[]>;
}

/** 命令执行接口 */
export interface BashOperations {
  execute(command: string, options?: ExecOptions): Promise<ExecResult>;
  isAvailable(): Promise<boolean>;
}

/** 文件编辑描述 */
export interface FileEdit {
  /** 要替换的旧文本 */
  oldText: string;
  /** 替换后的新文本 */
  newText: string;
}

/** 命令执行选项 */
export interface ExecOptions {
  /** 工作目录 */
  cwd?: string;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 环境变量 */
  env?: Record<string, string>;
  /** 中止信号 */
  abortSignal?: AbortSignal;
}

/** 命令执行结果 */
export interface ExecResult {
  /** 标准输出 */
  stdout: string;
  /** 标准错误 */
  stderr: string;
  /** 退出码 */
  exitCode: number;
  /** 执行时长（毫秒） */
  duration: number;
}

/** 内容搜索选项 */
export interface SearchOptions {
  /** 搜索的文件模式 */
  filePattern?: string;
  /** 最大结果数 */
  maxResults?: number;
  /** 是否区分大小写 */
  caseSensitive?: boolean;
}

/** 搜索结果 */
export interface SearchResult {
  /** 文件路径 */
  filePath: string;
  /** 匹配行号 */
  lineNumber: number;
  /** 匹配行内容 */
  lineContent: string;
}
