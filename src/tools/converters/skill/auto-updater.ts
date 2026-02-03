/**
 * Skill Auto Updater
 *
 * This module integrates the SkillWatcher with SkillWrapperGenerator to
 * automatically update tool wrappers when skill scripts change.
 *
 * @module auto-updater
 *
 * Core Exports:
 * - SkillAutoUpdater: Automatic tool wrapper management based on file changes
 * - UpdateEvent: Event emitted when a wrapper is updated
 * - AutoUpdaterConfig: Configuration options
 */

import * as os from 'node:os';
import { SkillWatcher, type WatcherConfig, type WatchEvent } from './watcher.js';
import { SkillWrapperGenerator } from './wrapper-generator.js';

/**
 * Update event types
 */
export type UpdateEventType = 'installed' | 'updated' | 'removed' | 'error';

/**
 * Update event data
 */
export interface UpdateEvent {
  /** Event type */
  type: UpdateEventType;
  /** Command name (e.g., skill:my-skill:my_tool) */
  commandName: string;
  /** Skill name */
  skillName: string;
  /** Script name */
  scriptName: string;
  /** Wrapper path (if installed/updated) */
  wrapperPath?: string;
  /** Error message (if error) */
  error?: string;
  /** Timestamp of the event */
  timestamp: Date;
}

/**
 * Auto updater configuration
 */
export interface AutoUpdaterConfig extends WatcherConfig {
  /** Log events to console (defaults to false) */
  verbose?: boolean;
}

/**
 * Update event handler callback type
 */
export type UpdateEventHandler = (event: UpdateEvent) => void | Promise<void>;

/**
 * SkillAutoUpdater
 *
 * Integrates file watching with wrapper generation to automatically:
 * - Generate and install wrappers when scripts are added
 * - Regenerate wrappers when scripts are modified
 * - Remove wrappers when scripts are deleted
 *
 * Usage:
 * ```typescript
 * const updater = new SkillAutoUpdater();
 * updater.onUpdate((event) => console.log(event));
 * await updater.start();
 * // ... later
 * await updater.stop();
 * ```
 */
export class SkillAutoUpdater {
  private watcher: SkillWatcher;
  private generator: SkillWrapperGenerator;
  private verbose: boolean;
  private running: boolean = false;

  // Event handlers
  private onUpdateHandlers: UpdateEventHandler[] = [];
  private onErrorHandlers: ((error: Error) => void)[] = [];
  private onReadyHandlers: (() => void)[] = [];

  /**
   * Creates a new SkillAutoUpdater
   *
   * @param config - Configuration options
   */
  constructor(config: AutoUpdaterConfig = {}) {
    const homeDir = config.homeDir || os.homedir();
    this.watcher = new SkillWatcher(config);
    this.generator = new SkillWrapperGenerator(homeDir);
    this.verbose = config.verbose ?? false;

    // Set up watcher event handlers
    this.setupWatcherHandlers();
  }

  /**
   * Gets the skills directory being watched
   */
  public getSkillsDir(): string {
    return this.watcher.getSkillsDir();
  }

  /**
   * Gets the bin directory for wrappers
   */
  public getBinDir(): string {
    return this.generator.getBinDir();
  }

  /**
   * Checks if the auto-updater is currently running
   */
  public isRunning(): boolean {
    return this.running;
  }

  /**
   * Starts the auto-updater
   *
   * @returns Promise that resolves when ready
   */
  public async start(): Promise<void> {
    if (this.running) {
      throw new Error('Auto-updater is already running');
    }

    // Ensure bin directory exists
    this.generator.ensureBinDir();

    // Start the watcher
    await this.watcher.start();
    this.running = true;

    if (this.verbose) {
      console.log(`[SkillAutoUpdater] Started watching: ${this.getSkillsDir()}`);
    }
  }

  /**
   * Stops the auto-updater
   *
   * @returns Promise that resolves when stopped
   */
  public async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    await this.watcher.stop();
    this.running = false;

    if (this.verbose) {
      console.log('[SkillAutoUpdater] Stopped');
    }
  }

  /**
   * Performs an initial sync of all skills
   *
   * This generates wrappers for all existing scripts that don't have wrappers.
   *
   * @returns Array of update events
   */
  public async syncAll(): Promise<UpdateEvent[]> {
    const events: UpdateEvent[] = [];
    const allWrappers = this.generator.generateAllWrappers();

    for (const [skillName, wrappers] of allWrappers) {
      for (const wrapper of wrappers) {
        const result = this.generator.install(wrapper);
        const event = this.createUpdateEvent(
          result.success ? 'installed' : 'error',
          wrapper.commandName,
          skillName,
          wrapper.toolName,
          result.success ? result.path : undefined,
          result.error
        );
        events.push(event);
        await this.notifyUpdate(event);
      }
    }

    return events;
  }

  /**
   * Registers an event handler for update events
   *
   * @param handler - Event handler function
   * @returns This instance for chaining
   */
  public onUpdate(handler: UpdateEventHandler): this {
    this.onUpdateHandlers.push(handler);
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
   * Registers an event handler for when auto-updater is ready
   *
   * @param handler - Ready handler function
   * @returns This instance for chaining
   */
  public onReady(handler: () => void): this {
    this.onReadyHandlers.push(handler);
    return this;
  }

  /**
   * Sets up event handlers for the watcher
   */
  private setupWatcherHandlers(): void {
    // Handle add events - generate and install wrapper
    this.watcher.onAdd(async (event) => {
      await this.handleScriptAdd(event);
    });

    // Handle change events - regenerate wrapper
    this.watcher.onChange(async (event) => {
      await this.handleScriptChange(event);
    });

    // Handle unlink events - remove wrapper
    this.watcher.onUnlink(async (event) => {
      await this.handleScriptUnlink(event);
    });

    // Forward error events
    this.watcher.onError((error) => {
      this.handleError(error);
    });

    // Forward ready events
    this.watcher.onReady(() => {
      this.notifyReady();
    });
  }

  /**
   * Handles a script add event
   */
  private async handleScriptAdd(watchEvent: WatchEvent): Promise<void> {
    if (this.verbose) {
      console.log(`[SkillAutoUpdater] Script added: ${watchEvent.scriptPath}`);
    }

    const wrapper = this.generator.generateWrapper(watchEvent.skillName, watchEvent.scriptPath);

    if (!wrapper) {
      const event = this.createUpdateEvent(
        'error',
        `skill:${watchEvent.skillName}:${watchEvent.scriptName}`,
        watchEvent.skillName,
        watchEvent.scriptName,
        undefined,
        'Failed to generate wrapper: could not parse script metadata'
      );
      await this.notifyUpdate(event);
      return;
    }

    const result = this.generator.install(wrapper);
    const event = this.createUpdateEvent(
      result.success ? 'installed' : 'error',
      wrapper.commandName,
      watchEvent.skillName,
      watchEvent.scriptName,
      result.success ? result.path : undefined,
      result.error
    );

    await this.notifyUpdate(event);
  }

  /**
   * Handles a script change event
   */
  private async handleScriptChange(watchEvent: WatchEvent): Promise<void> {
    if (this.verbose) {
      console.log(`[SkillAutoUpdater] Script changed: ${watchEvent.scriptPath}`);
    }

    const wrapper = this.generator.generateWrapper(watchEvent.skillName, watchEvent.scriptPath);

    if (!wrapper) {
      const event = this.createUpdateEvent(
        'error',
        `skill:${watchEvent.skillName}:${watchEvent.scriptName}`,
        watchEvent.skillName,
        watchEvent.scriptName,
        undefined,
        'Failed to regenerate wrapper: could not parse script metadata'
      );
      await this.notifyUpdate(event);
      return;
    }

    const result = this.generator.install(wrapper);
    const event = this.createUpdateEvent(
      result.success ? 'updated' : 'error',
      wrapper.commandName,
      watchEvent.skillName,
      watchEvent.scriptName,
      result.success ? result.path : undefined,
      result.error
    );

    await this.notifyUpdate(event);
  }

  /**
   * Handles a script unlink event
   */
  private async handleScriptUnlink(watchEvent: WatchEvent): Promise<void> {
    if (this.verbose) {
      console.log(`[SkillAutoUpdater] Script removed: ${watchEvent.scriptPath}`);
    }

    const commandName = `skill:${watchEvent.skillName}:${watchEvent.scriptName}`;
    const removed = this.generator.remove(commandName);

    const event = this.createUpdateEvent(
      removed ? 'removed' : 'error',
      commandName,
      watchEvent.skillName,
      watchEvent.scriptName,
      undefined,
      removed ? undefined : 'Wrapper not found'
    );

    await this.notifyUpdate(event);
  }

  /**
   * Creates an update event
   */
  private createUpdateEvent(
    type: UpdateEventType,
    commandName: string,
    skillName: string,
    scriptName: string,
    wrapperPath?: string,
    error?: string
  ): UpdateEvent {
    return {
      type,
      commandName,
      skillName,
      scriptName,
      wrapperPath,
      error,
      timestamp: new Date(),
    };
  }

  /**
   * Notifies update handlers
   */
  private async notifyUpdate(event: UpdateEvent): Promise<void> {
    if (this.verbose) {
      const status = event.type === 'error' ? `Error: ${event.error}` : event.type;
      console.log(`[SkillAutoUpdater] ${event.commandName}: ${status}`);
    }

    for (const handler of this.onUpdateHandlers) {
      try {
        await handler(event);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.handleError(err);
      }
    }
  }

  /**
   * Handles an error
   */
  private handleError(error: Error): void {
    if (this.verbose) {
      console.error(`[SkillAutoUpdater] Error: ${error.message}`);
    }

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
    if (this.verbose) {
      console.log('[SkillAutoUpdater] Ready');
    }

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
export default SkillAutoUpdater;
