/**
 * Skill Command Handler
 *
 * 技能命令的统一入口（Dispatcher），将各 skill:* 命令路由到专职子处理器。
 * 只读操作委托给 skill-command-read-handlers，写入操作委托给 skill-command-write-handlers。
 *
 * 核心导出：
 * - SkillCommandHandler: 技能命令分发器
 * - SkillCommandHandlerOptions: 配置选项
 */

import * as os from 'node:os';
import * as path from 'node:path';
import type { CommandResult } from './native-command-handler.ts';
import { SkillLoader } from '../../skills/skill-loader.js';
import { SkillIndexer } from '../../skills/indexer.js';
import { SkillMerger } from '../../skills/skill-merger.js';
import { SkillManager } from '../../skills/skill-manager.js';
import { SkillMetadataService, type ISkillMetadataService } from '../../skills/skill-metadata-service.js';
import type { ISubAgentExecutor } from '../../sub-agents/sub-agent-types.ts';
import { handleLoad, handleList, handleInfo } from './skill-command-read-handlers.ts';
import { handleImport, handleRollback, handleDelete } from './skill-command-write-handlers.ts';

/** SkillCommandHandler 配置选项 */
export interface SkillCommandHandlerOptions {
  homeDir?: string;
  /** SubAgentManager 工厂函数，解耦循环依赖 */
  createSubAgentManager?: () => ISubAgentExecutor;
  /** 测试注入 */
  skillLoader?: SkillLoader;
  skillManager?: SkillManager;
  metadataService?: ISkillMetadataService;
  skillMerger?: SkillMerger;
}

/** 命令路由条目 */
interface SkillSubcommand {
  prefix: string;
  handle: (command: string) => CommandResult | Promise<CommandResult>;
}

/**
 * SkillCommandHandler - 技能命令分发器
 *
 * 只读操作通过 ISkillMetadataService 接口查询，
 * 写入操作通过 SkillManager（惰性创建）执行。
 */
export class SkillCommandHandler {
  private skillLoader: SkillLoader;
  private metadataService: ISkillMetadataService;
  private skillManager: SkillManager | null;
  private skillMerger: SkillMerger;
  private subAgentManager: ISubAgentExecutor | null = null;
  private readonly homeDir: string;
  private readonly subcommands: SkillSubcommand[];

  constructor(options: SkillCommandHandlerOptions = {}) {
    this.homeDir = options.homeDir ?? os.homedir();
    this.skillLoader = options.skillLoader ?? new SkillLoader(this.homeDir);
    this.skillMerger = options.skillMerger ?? this.createMerger(options);

    if (options.skillManager) {
      this.skillManager = options.skillManager;
      this.metadataService = options.metadataService ?? options.skillManager;
    } else {
      const skillsDir = path.join(this.homeDir, '.synapse', 'skills');
      const indexer = new SkillIndexer(this.homeDir);
      this.metadataService = options.metadataService ?? new SkillMetadataService(skillsDir, indexer);
      this.skillManager = null;
    }

    // 声明式子命令路由表（按优先级顺序匹配）
    this.subcommands = [
      { prefix: 'skill:load', handle: (cmd) => handleLoad(cmd, this.skillLoader) },
      { prefix: 'skill:list', handle: () => handleList(this.metadataService) },
      { prefix: 'skill:info', handle: (cmd) => handleInfo(cmd, this.metadataService) },
      { prefix: 'skill:import', handle: (cmd) => handleImport(cmd, () => this.getOrCreateSkillManager()) },
      { prefix: 'skill:rollback', handle: (cmd) => handleRollback(cmd, () => this.getOrCreateSkillManager(), this.metadataService) },
      { prefix: 'skill:delete', handle: (cmd) => handleDelete(cmd, () => this.getOrCreateSkillManager()) },
    ];
  }

  /** 执行 skill 命令 */
  async execute(command: string): Promise<CommandResult> {
    const trimmed = command.trim();
    for (const sub of this.subcommands) {
      if (trimmed.startsWith(sub.prefix)) {
        return sub.handle(trimmed);
      }
    }
    return this.unknownCommand(command);
  }

  getSkillMerger(): SkillMerger { return this.skillMerger; }
  getSkillManager(): SkillManager { return this.getOrCreateSkillManager(); }

  shutdown(): void { this.subAgentManager?.shutdown(); }

  private getOrCreateSkillManager(): SkillManager {
    if (!this.skillManager) {
      const skillsDir = path.join(this.homeDir, '.synapse', 'skills');
      const indexer = new SkillIndexer(this.homeDir);
      this.skillManager = new SkillManager(skillsDir, indexer, this.skillMerger);
    }
    return this.skillManager;
  }

  private createMerger(options: SkillCommandHandlerOptions): SkillMerger {
    if (!options.createSubAgentManager) {
      this.subAgentManager = null;
      return new SkillMerger(null);
    }

    this.subAgentManager = options.createSubAgentManager();
    return new SkillMerger(this.subAgentManager);
  }

  private unknownCommand(command: string): CommandResult {
    return {
      stdout: '',
      stderr: `Unknown skill command: ${command}\nAvailable: skill:load <name>, skill:list, skill:info <name>, skill:import <source>, skill:rollback <name> [version], skill:delete <name>`,
      exitCode: 1,
    };
  }
}

export default SkillCommandHandler;
