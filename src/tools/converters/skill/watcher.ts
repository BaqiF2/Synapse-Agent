/**
 * Skill Watcher
 *
 * 监听 ~/.synapse/skills/ 目录的文件变更（添加/修改/删除），
 * 自动触发 wrapper 重新生成。事件处理支持去抖和多种回调注册。
 *
 * 核心导出:
 * - SkillWatcher: 技能目录文件监听器
 * - WatchEvent: 文件变更事件数据
 * - WatcherConfig: 监听器配置选项
 * - WatchEventType: 事件类型
 * - WatchEventHandler: 事件回调类型
 */

import * as chokidar from 'chokidar';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillStructure, SUPPORTED_EXTENSIONS } from './skill-structure.js';
import type { SupportedExtension } from './skill-structure.js';
import { SkillWrapperGenerator } from './wrapper-generator.js';
import { SkillScriptProcessor } from './script-processor.js';
import type { ProcessResult } from './script-processor.js';
import { parseEnvInt } from '../../../shared/env.ts';

const DEFAULT_SKILLS_DIR = '.synapse/skills';
const DEFAULT_DEBOUNCE_MS = parseEnvInt(process.env.SYNAPSE_SKILL_WATCHER_DEBOUNCE_MS, 1500);
const SCRIPTS_DIR = 'scripts';

/** 文件变更事件类型 */
export type WatchEventType = 'add' | 'change' | 'unlink';

/** 文件变更事件数据 */
export interface WatchEvent {
  type: WatchEventType;
  skillName: string;
  scriptName: string;
  scriptPath: string;
  extension: SupportedExtension;
  timestamp: Date;
}

/** 监听器配置 */
export interface WatcherConfig {
  homeDir?: string;
  debounceMs?: number;
  ignoreInitial?: boolean;
  followSymlinks?: boolean;
  pollingInterval?: number;
}

/** 事件回调类型 */
export type WatchEventHandler = (event: WatchEvent) => void | Promise<void>;

// 从 script-processor 重新导出，保持外部接口兼容
export type { ProcessResult } from './script-processor.js';

/** 去抖事件条目 */
interface DebouncedEvent {
  event: WatchEvent;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * SkillWatcher
 *
 * 监听 ~/.synapse/skills/ 目录下脚本文件的变更。
 * 仅监听 scripts/ 子目录中的受支持扩展名文件（.py, .sh, .ts, .js），
 * 对快速连续变更进行去抖处理。
 */
export class SkillWatcher {
  private skillsDir: string;
  private structure: SkillStructure;
  private scriptProcessor: SkillScriptProcessor;
  private watcher: chokidar.FSWatcher | null = null;
  private debounceMs: number;
  private ignoreInitial: boolean;
  private followSymlinks: boolean;
  private pollingInterval: number;

  // 事件处理器
  private onAddHandlers: WatchEventHandler[] = [];
  private onChangeHandlers: WatchEventHandler[] = [];
  private onUnlinkHandlers: WatchEventHandler[] = [];
  private onErrorHandlers: ((error: Error) => void)[] = [];
  private onReadyHandlers: (() => void)[] = [];

  // 去抖追踪
  private debouncedEvents: Map<string, DebouncedEvent> = new Map();

  constructor(config: WatcherConfig = {}) {
    const homeDir = config.homeDir || os.homedir();
    this.skillsDir = path.join(homeDir, DEFAULT_SKILLS_DIR);
    this.structure = new SkillStructure(homeDir);

    const generator = new SkillWrapperGenerator(homeDir);
    this.scriptProcessor = new SkillScriptProcessor(this.skillsDir, generator);

    this.debounceMs = config.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.ignoreInitial = config.ignoreInitial ?? true;
    this.followSymlinks = config.followSymlinks ?? false;
    this.pollingInterval = config.pollingInterval ?? 1000;
  }

  public getSkillsDir(): string {
    return this.skillsDir;
  }

  public isWatching(): boolean {
    return this.watcher !== null;
  }

  /**
   * 启动目录监听
   */
  public async start(): Promise<void> {
    if (this.watcher) {
      throw new Error('Watcher is already running');
    }

    this.structure.ensureSkillsDir();

    const pattern = path.join(this.skillsDir, '**', SCRIPTS_DIR, '*');

    this.watcher = chokidar.watch(pattern, {
      persistent: true,
      ignoreInitial: this.ignoreInitial,
      followSymlinks: this.followSymlinks,
      awaitWriteFinish: {
        stabilityThreshold: this.pollingInterval,
        pollInterval: 100,
      },
      ignored: (filePath: string) => {
        const ext = path.extname(filePath);
        if (ext && !SUPPORTED_EXTENSIONS.includes(ext as SupportedExtension)) {
          return true;
        }
        return false;
      },
    });

    this.watcher.on('add', (filePath: string) => this.handleEvent('add', filePath));
    this.watcher.on('change', (filePath: string) => this.handleEvent('change', filePath));
    this.watcher.on('unlink', (filePath: string) => this.handleEvent('unlink', filePath));
    this.watcher.on('error', (error: unknown) => this.handleError(error));

    return new Promise<void>((resolve) => {
      this.watcher!.on('ready', () => {
        this.notifyReady();
        resolve();
      });
    });
  }

  /**
   * 停止目录监听
   */
  public async stop(): Promise<void> {
    if (!this.watcher) {
      return;
    }

    for (const [, entry] of this.debouncedEvents) {
      clearTimeout(entry.timer);
    }
    this.debouncedEvents.clear();

    await this.watcher.close();
    this.watcher = null;
  }

  // --- 事件注册 ---

  public onAdd(handler: WatchEventHandler): this {
    this.onAddHandlers.push(handler);
    return this;
  }

  public onChange(handler: WatchEventHandler): this {
    this.onChangeHandlers.push(handler);
    return this;
  }

  public onUnlink(handler: WatchEventHandler): this {
    this.onUnlinkHandlers.push(handler);
    return this;
  }

  public onError(handler: (error: Error) => void): this {
    this.onErrorHandlers.push(handler);
    return this;
  }

  public onReady(handler: () => void): this {
    this.onReadyHandlers.push(handler);
    return this;
  }

  // --- 脚本处理（委托给 SkillScriptProcessor）---

  public async processScript(scriptPath: string, skillName: string): Promise<ProcessResult> {
    return this.scriptProcessor.processScript(scriptPath, skillName);
  }

  public async processNewSkill(skillName: string): Promise<ProcessResult[]> {
    return this.scriptProcessor.processNewSkill(skillName);
  }

  public async removeSkillWrappers(skillName: string): Promise<number> {
    return this.scriptProcessor.removeSkillWrappers(skillName);
  }

  // --- 内部事件处理 ---

  /** 解析脚本路径为事件数据 */
  private parseScriptPath(filePath: string): Omit<WatchEvent, 'type' | 'timestamp'> | null {
    const relativePath = path.relative(this.skillsDir, filePath);
    const parts = relativePath.split(path.sep);
    // 格式: skill-name/scripts/script-name.ext
    if (parts.length < 3) return null;

    const skillName = parts[0];
    const scriptsDir = parts[1];
    const fileName = parts[parts.length - 1];
    if (!skillName || !scriptsDir || !fileName || scriptsDir !== SCRIPTS_DIR) return null;

    const extension = path.extname(fileName) as SupportedExtension;
    if (!SUPPORTED_EXTENSIONS.includes(extension)) return null;

    return { skillName, scriptName: path.basename(fileName, extension), scriptPath: filePath, extension };
  }

  private handleEvent(type: WatchEventType, filePath: string): void {
    const parsed = this.parseScriptPath(filePath);
    if (!parsed) {
      return;
    }

    const event: WatchEvent = {
      type,
      ...parsed,
      timestamp: new Date(),
    };

    this.debounceEvent(event);
  }

  private debounceEvent(event: WatchEvent): void {
    const key = `${event.type}:${event.scriptPath}`;

    const existing = this.debouncedEvents.get(key);
    if (existing) {
      clearTimeout(existing.timer);
    }

    const timer = setTimeout(() => {
      this.debouncedEvents.delete(key);
      this.processEvent(event);
    }, this.debounceMs);

    this.debouncedEvents.set(key, { event, timer });
  }

  private async processEvent(event: WatchEvent): Promise<void> {
    const handlers = this.getHandlersForType(event.type);

    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.handleError(err);
      }
    }
  }

  private getHandlersForType(type: WatchEventType): WatchEventHandler[] {
    switch (type) {
      case 'add':
        return this.onAddHandlers;
      case 'change':
        return this.onChangeHandlers;
      case 'unlink':
        return this.onUnlinkHandlers;
    }
  }

  private handleError(error: unknown): void {
    const err = error instanceof Error ? error : new Error(String(error));
    this.onErrorHandlers.forEach((h) => { try { h(err); } catch { /* ignore */ } });
  }

  private notifyReady(): void {
    this.onReadyHandlers.forEach((h) => { try { h(); } catch { /* ignore */ } });
  }
}

export default SkillWatcher;
