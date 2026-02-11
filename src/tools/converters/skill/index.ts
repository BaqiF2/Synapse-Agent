/**
 * 文件功能说明：
 * - 该文件位于 `src/tools/converters/skill/index.ts`，主要负责 索引 相关实现。
 * - 模块归属 工具、转换器、技能 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `SkillStructure`
 * - `SkillMetadataSchema`
 * - `ScriptMetadataSchema`
 * - `ScriptParamSchema`
 * - `SUPPORTED_EXTENSIONS`
 * - `SKILL_DOMAINS`
 * - `SkillMetadata`
 * - `ScriptMetadata`
 * - `ScriptParam`
 * - `SkillDomain`
 * - `SupportedExtension`
 * - `SkillEntry`
 * - `DocstringParser`
 * - `parseDocstring`
 * - `SkillWrapperGenerator`
 * - `GeneratedSkillWrapper`
 * - `SkillInstallResult`
 * - `SkillWatcher`
 * - `WatchEvent`
 * - `WatchEventType`
 * - `WatcherConfig`
 * - `WatchEventHandler`
 * - `SkillAutoUpdater`
 * - `UpdateEvent`
 * - `UpdateEventType`
 * - `AutoUpdaterConfig`
 * - `UpdateEventHandler`
 * - `initializeSkillTools`
 * - `cleanupSkillTools`
 * - `refreshSkillTools`
 * - `SkillInitResult`
 * - `SkillsInitResult`
 * - `SkillInitOptions`
 *
 * 作用说明：
 * - `SkillStructure`：聚合并对外暴露其它模块的能力。
 * - `SkillMetadataSchema`：聚合并对外暴露其它模块的能力。
 * - `ScriptMetadataSchema`：聚合并对外暴露其它模块的能力。
 * - `ScriptParamSchema`：聚合并对外暴露其它模块的能力。
 * - `SUPPORTED_EXTENSIONS`：聚合并对外暴露其它模块的能力。
 * - `SKILL_DOMAINS`：聚合并对外暴露其它模块的能力。
 * - `SkillMetadata`：聚合并对外暴露其它模块的能力。
 * - `ScriptMetadata`：聚合并对外暴露其它模块的能力。
 * - `ScriptParam`：聚合并对外暴露其它模块的能力。
 * - `SkillDomain`：聚合并对外暴露其它模块的能力。
 * - `SupportedExtension`：聚合并对外暴露其它模块的能力。
 * - `SkillEntry`：聚合并对外暴露其它模块的能力。
 * - `DocstringParser`：聚合并对外暴露其它模块的能力。
 * - `parseDocstring`：聚合并对外暴露其它模块的能力。
 * - `SkillWrapperGenerator`：聚合并对外暴露其它模块的能力。
 * - `GeneratedSkillWrapper`：聚合并对外暴露其它模块的能力。
 * - `SkillInstallResult`：聚合并对外暴露其它模块的能力。
 * - `SkillWatcher`：聚合并对外暴露其它模块的能力。
 * - `WatchEvent`：聚合并对外暴露其它模块的能力。
 * - `WatchEventType`：聚合并对外暴露其它模块的能力。
 * - `WatcherConfig`：聚合并对外暴露其它模块的能力。
 * - `WatchEventHandler`：聚合并对外暴露其它模块的能力。
 * - `SkillAutoUpdater`：聚合并对外暴露其它模块的能力。
 * - `UpdateEvent`：聚合并对外暴露其它模块的能力。
 * - `UpdateEventType`：聚合并对外暴露其它模块的能力。
 * - `AutoUpdaterConfig`：聚合并对外暴露其它模块的能力。
 * - `UpdateEventHandler`：聚合并对外暴露其它模块的能力。
 * - `initializeSkillTools`：聚合并对外暴露其它模块的能力。
 * - `cleanupSkillTools`：聚合并对外暴露其它模块的能力。
 * - `refreshSkillTools`：聚合并对外暴露其它模块的能力。
 * - `SkillInitResult`：聚合并对外暴露其它模块的能力。
 * - `SkillsInitResult`：聚合并对外暴露其它模块的能力。
 * - `SkillInitOptions`：聚合并对外暴露其它模块的能力。
 */

export {
  SkillStructure,
  SkillMetadataSchema,
  ScriptMetadataSchema,
  ScriptParamSchema,
  SUPPORTED_EXTENSIONS,
  SKILL_DOMAINS,
  type SkillMetadata,
  type ScriptMetadata,
  type ScriptParam,
  type SkillDomain,
  type SupportedExtension,
  type SkillEntry,
} from './skill-structure.js';

export {
  DocstringParser,
  parseDocstring,
} from './docstring-parser.js';

export {
  SkillWrapperGenerator,
  type GeneratedSkillWrapper,
  type SkillInstallResult,
} from './wrapper-generator.js';

export {
  SkillWatcher,
  type WatchEvent,
  type WatchEventType,
  type WatcherConfig,
  type WatchEventHandler,
} from './watcher.js';

export {
  SkillAutoUpdater,
  type UpdateEvent,
  type UpdateEventType,
  type AutoUpdaterConfig,
  type UpdateEventHandler,
} from './auto-updater.js';

export {
  initializeSkillTools,
  cleanupSkillTools,
  refreshSkillTools,
  type SkillInitResult,
  type SkillsInitResult,
  type SkillInitOptions,
} from './skill-initializer.js';
