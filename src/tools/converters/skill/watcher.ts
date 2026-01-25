/**
 * Skill Watcher
 *
 * This module provides file system watching for the Skills directory.
 * It automatically detects changes (add/modify/delete) to skill scripts
 * and triggers wrapper regeneration.
 *
 * @module watcher
 *
 * Core Exports:
 * - SkillWatcher: Watches ~/.synapse/skills/ for changes
 * - WatchEvent: Event emitted when a change is detected
 * - WatcherConfig: Configuration options for the watcher
 */

import * as chokidar from 'chokidar';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillStructure, SUPPORTED_EXTENSIONS } from './skill-structure.js';
import type { SupportedExtension } from './skill-structure.js';

/**
 * Default skills directory
 */
const DEFAULT_SKILLS_DIR = '.synapse/skills';

/**
 * Default debounce delay in milliseconds
 */
const DEFAULT_DEBOUNCE_MS = parseInt(process.env.SKILL_WATCHER_DEBOUNCE_MS || '300', 10);

/**
 * Scripts subdirectory name
 */
const SCRIPTS_DIR = 'scripts';

/**
 * Watch event types
 */
export type WatchEventType = 'add' | 'change' | 'unlink';

/**
 * Watch event data
 */
export interface WatchEvent {
  /** Event type */
  type: WatchEventType;
  /** Skill name */
  skillName: string;
  /** Script name (without extension) */
  scriptName: string;
  /** Full path to the script */
  scriptPath: string;
  /** Script extension */
  extension: SupportedExtension;
  /** Timestamp of the event */
  timestamp: Date;
}

/**
 * Watcher configuration
 */
export interface WatcherConfig {
  /** User home directory (defaults to os.homedir()) */
  homeDir?: string;
  /** Debounce delay in milliseconds (defaults to 300) */
  debounceMs?: number;
  /** Whether to ignore initial add events (defaults to true) */
  ignoreInitial?: boolean;
  /** Whether to follow symlinks (defaults to false) */
  followSymlinks?: boolean;
  /** Polling interval for systems without native file watching (defaults to 1000) */
  pollingInterval?: number;
}

/**
 * Event handler callback type
 */
export type WatchEventHandler = (event: WatchEvent) => void | Promise<void>;

/**
 * Debounced event entry
 */
interface DebouncedEvent {
  event: WatchEvent;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * SkillWatcher
 *
 * Watches the ~/.synapse/skills/ directory for changes to script files.
 * Emits events when scripts are added, modified, or deleted.
 *
 * Key features:
 * - Only watches scripts/ subdirectories within each skill
 * - Filters to supported script extensions (.py, .sh, .ts, .js)
 * - Debounces rapid changes to avoid excessive processing
 * - Supports add, change, and unlink event handlers
 */
export class SkillWatcher {
  private skillsDir: string;
  private structure: SkillStructure;
  private watcher: chokidar.FSWatcher | null = null;
  private debounceMs: number;
  private ignoreInitial: boolean;
  private followSymlinks: boolean;
  private pollingInterval: number;

  // Event handlers
  private onAddHandlers: WatchEventHandler[] = [];
  private onChangeHandlers: WatchEventHandler[] = [];
  private onUnlinkHandlers: WatchEventHandler[] = [];
  private onErrorHandlers: ((error: Error) => void)[] = [];
  private onReadyHandlers: (() => void)[] = [];

  // Debounce tracking
  private debouncedEvents: Map<string, DebouncedEvent> = new Map();

  /**
   * Creates a new SkillWatcher
   *
   * @param config - Watcher configuration options
   */
  constructor(config: WatcherConfig = {}) {
    const homeDir = config.homeDir || os.homedir();
    this.skillsDir = path.join(homeDir, DEFAULT_SKILLS_DIR);
    this.structure = new SkillStructure(homeDir);
    this.debounceMs = config.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.ignoreInitial = config.ignoreInitial ?? true;
    this.followSymlinks = config.followSymlinks ?? false;
    this.pollingInterval = config.pollingInterval ?? 1000;
  }

  /**
   * Gets the skills directory being watched
   */
  public getSkillsDir(): string {
    return this.skillsDir;
  }

  /**
   * Checks if the watcher is currently running
   */
  public isWatching(): boolean {
    return this.watcher !== null;
  }

  /**
   * Starts watching the skills directory
   *
   * @returns Promise that resolves when watcher is ready
   */
  public async start(): Promise<void> {
    if (this.watcher) {
      throw new Error('Watcher is already running');
    }

    // Ensure the skills directory exists
    this.structure.ensureSkillsDir();

    // Build the watch pattern to match scripts/ directories
    // Pattern: ~/.synapse/skills/**/scripts/*.(py|sh|ts|js)
    const pattern = path.join(this.skillsDir, '**', SCRIPTS_DIR, '*');

    // Create the watcher
    this.watcher = chokidar.watch(pattern, {
      persistent: true,
      ignoreInitial: this.ignoreInitial,
      followSymlinks: this.followSymlinks,
      awaitWriteFinish: {
        stabilityThreshold: this.pollingInterval,
        pollInterval: 100,
      },
      ignored: (filePath: string) => {
        // Ignore non-script files
        const ext = path.extname(filePath);
        if (ext && !SUPPORTED_EXTENSIONS.includes(ext as SupportedExtension)) {
          return true;
        }
        return false;
      },
    });

    // Set up event handlers
    this.watcher.on('add', (filePath: string) => this.handleEvent('add', filePath));
    this.watcher.on('change', (filePath: string) => this.handleEvent('change', filePath));
    this.watcher.on('unlink', (filePath: string) => this.handleEvent('unlink', filePath));
    this.watcher.on('error', (error: Error) => this.handleError(error));

    // Wait for ready event
    return new Promise<void>((resolve) => {
      this.watcher!.on('ready', () => {
        this.notifyReady();
        resolve();
      });
    });
  }

  /**
   * Stops watching the skills directory
   *
   * @returns Promise that resolves when watcher is closed
   */
  public async stop(): Promise<void> {
    if (!this.watcher) {
      return;
    }

    // Clear all pending debounced events
    for (const [, entry] of this.debouncedEvents) {
      clearTimeout(entry.timer);
    }
    this.debouncedEvents.clear();

    // Close the watcher
    await this.watcher.close();
    this.watcher = null;
  }

  /**
   * Registers an event handler for 'add' events
   *
   * @param handler - Event handler function
   * @returns This instance for chaining
   */
  public onAdd(handler: WatchEventHandler): this {
    this.onAddHandlers.push(handler);
    return this;
  }

  /**
   * Registers an event handler for 'change' events
   *
   * @param handler - Event handler function
   * @returns This instance for chaining
   */
  public onChange(handler: WatchEventHandler): this {
    this.onChangeHandlers.push(handler);
    return this;
  }

  /**
   * Registers an event handler for 'unlink' events
   *
   * @param handler - Event handler function
   * @returns This instance for chaining
   */
  public onUnlink(handler: WatchEventHandler): this {
    this.onUnlinkHandlers.push(handler);
    return this;
  }

  /**
   * Registers an event handler for errors
   *
   * @param handler - Error handler function
   * @returns This instance for chaining
   */
  public onError(handler: (error: Error) => void): this {
    this.onErrorHandlers.push(handler);
    return this;
  }

  /**
   * Registers an event handler for when watcher is ready
   *
   * @param handler - Ready handler function
   * @returns This instance for chaining
   */
  public onReady(handler: () => void): this {
    this.onReadyHandlers.push(handler);
    return this;
  }

  /**
   * Parses a script path into event data
   *
   * @param filePath - Full path to the script file
   * @returns Parsed event data or null if invalid
   */
  private parseScriptPath(filePath: string): Omit<WatchEvent, 'type' | 'timestamp'> | null {
    // Expected path format: ~/.synapse/skills/<skill-name>/scripts/<script-name>.<ext>
    const relativePath = path.relative(this.skillsDir, filePath);
    const parts = relativePath.split(path.sep);

    // Should have at least 3 parts: skill-name/scripts/script-name.ext
    if (parts.length < 3) {
      return null;
    }

    const skillName = parts[0];
    const scriptsDir = parts[1];

    // Verify it's in the scripts directory
    if (scriptsDir !== SCRIPTS_DIR) {
      return null;
    }

    const fileName = parts[parts.length - 1];
    const extension = path.extname(fileName) as SupportedExtension;

    // Verify supported extension
    if (!SUPPORTED_EXTENSIONS.includes(extension)) {
      return null;
    }

    const scriptName = path.basename(fileName, extension);

    return {
      skillName,
      scriptName,
      scriptPath: filePath,
      extension,
    };
  }

  /**
   * Handles a file system event
   */
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

    // Debounce the event
    this.debounceEvent(event);
  }

  /**
   * Debounces an event to avoid excessive processing
   */
  private debounceEvent(event: WatchEvent): void {
    const key = `${event.type}:${event.scriptPath}`;

    // Clear existing timer if any
    const existing = this.debouncedEvents.get(key);
    if (existing) {
      clearTimeout(existing.timer);
    }

    // Set up new timer
    const timer = setTimeout(() => {
      this.debouncedEvents.delete(key);
      this.processEvent(event);
    }, this.debounceMs);

    this.debouncedEvents.set(key, { event, timer });
  }

  /**
   * Processes an event after debouncing
   */
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

  /**
   * Gets handlers for a specific event type
   */
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

  /**
   * Handles an error
   */
  private handleError(error: Error): void {
    for (const handler of this.onErrorHandlers) {
      try {
        handler(error);
      } catch {
        // Ignore errors in error handlers
      }
    }
  }

  /**
   * Notifies ready handlers
   */
  private notifyReady(): void {
    for (const handler of this.onReadyHandlers) {
      try {
        handler();
      } catch {
        // Ignore errors in ready handlers
      }
    }
  }
}

// Default export
export default SkillWatcher;
