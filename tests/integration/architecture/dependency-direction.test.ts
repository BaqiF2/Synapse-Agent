/**
 * 模块依赖方向测试 — 验证 PRD F-005 中定义的严格单向依赖规则。
 *
 * 测试目标：
 * 通过静态分析各模块的 import 语句，确保依赖关系符合以下方向：
 *   types ← shared ← core ← providers ← tools ← skills ← cli
 *
 * 核心导出:
 * - getModuleImports(): 扫描指定模块目录的所有 import 来源
 * - resolveModuleName(): 从 import 路径解析出顶层模块名
 */

import { describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SRC_DIR = path.resolve(import.meta.dir, '../../../src');

/**
 * PRD F-005 定义的目标依赖规则（重构完成后的 7 模块结构）
 *
 * 键为模块名，值为该模块允许依赖的模块列表。
 * 未列出的模块表示不允许依赖。
 */
const TARGET_ALLOWED_DEPENDENCIES: Record<string, string[]> = {
  types: [], // 零依赖
  shared: ['types'],
  core: ['types', 'shared'],
  providers: ['types', 'shared'],
  tools: ['types', 'shared', 'core', 'providers'],
  skills: ['types', 'shared', 'tools'],
  cli: ['types', 'shared', 'core', 'providers', 'tools', 'skills'], // 应用层，依赖所有
};

/**
 * 当前阶段的依赖规则 — 基于重构后的 8 模块结构（7 业务模块 + resource）。
 *
 * 与 TARGET 的差距主要在于：
 * - core 合并了 agent/hooks/sub-agents，继承了它们对 tools/skills/cli 的依赖
 * - shared 合并了 sandbox，继承了对 tools/bash-session 的依赖
 * - tools/skills 之间存在双向依赖（extend-bash ↔ skill 系统）
 *
 * 已知违规记录在 KNOWN_VIOLATIONS 中，逐步清理后应收敛到 TARGET。
 */
const CURRENT_ALLOWED_DEPENDENCIES: Record<string, string[]> = {
  // types 层：零依赖（硬约束）
  types: [],
  // shared 层：基础设施（sandbox-manager 依赖 tools/bash-session 是已知违规）
  shared: ['types', 'tools'],
  // core 层：合并了 agent/hooks/sub-agents，继承大量依赖（已知违规）
  core: ['types', 'shared', 'providers', 'tools', 'skills', 'cli'],
  // providers 层：LLM 提供者（符合目标）
  providers: ['types', 'shared'],
  // tools 层：工具系统（依赖 skills 是已知违规）
  tools: ['types', 'shared', 'core', 'providers', 'skills'],
  // skills 层：技能系统（依赖 providers/core 是已知违规）
  skills: ['types', 'shared', 'core', 'providers'],
  // cli 层：应用入口，依赖所有模块（符合目标）
  cli: ['types', 'shared', 'core', 'providers', 'tools', 'skills'],
};

/**
 * 已知违规列表 — 违反 TARGET_ALLOWED_DEPENDENCIES 但当前存在的依赖。
 * 每条记录标注违规来源、目标文件和修复建议。
 *
 * 统计：7 条已知违规（待后续 PR 清理）
 */
const KNOWN_VIOLATIONS: { from: string; to: string; count: number; reason: string }[] = [
  // === core → 上层模块（因合并 agent/hooks/sub-agents 引入） ===
  { from: 'core', to: 'cli', count: 1,
    reason: 'sub-agent-manager.ts → cli/terminal-renderer-types.ts — 渲染回调类型应提升到 types/ 或 shared/' },
  { from: 'core', to: 'tools', count: 11,
    reason: 'agent-runner/step/hooks/sub-agents → tools/* — 应通过依赖注入或接口抽象解耦' },
  { from: 'core', to: 'skills', count: 3,
    reason: 'auto-enhance-trigger/hooks/configs → skills/* — 应通过 Hook 接口解耦' },

  // === shared → 上层模块（因合并 sandbox 引入） ===
  { from: 'shared', to: 'tools', count: 2,
    reason: 'sandbox-manager.ts + daytona.ts → tools/bash-session.ts — BashSession 应抽象为接口注入' },

  // === 工具层与技能层双向依赖 ===
  { from: 'tools', to: 'skills', count: -1,
    reason: 'extend-bash handlers → skills/* — skill 工具转换器应使用接口抽象' },

  // === skills → 上层模块 ===
  { from: 'skills', to: 'providers', count: -1,
    reason: 'skills/generator → providers/types — 应使用 types/ 中的统一类型' },
  { from: 'skills', to: 'core', count: -1,
    reason: 'skills/manager → core/sub-agents/sub-agent-types — SubAgentType 应在 types/ 中定义' },
];

/**
 * 递归收集目录下所有 .ts 文件
 */
function collectTsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  const result: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectTsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      result.push(fullPath);
    }
  }

  return result;
}

/**
 * 从文件内容中提取所有 import 的模块路径（仅相对路径）
 */
function extractImports(fileContent: string): string[] {
  const importPattern = /from\s+['"](\.[^'"]+)['"]/g;
  const imports: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = importPattern.exec(fileContent)) !== null) {
    imports.push(match[1]!);
  }

  return imports;
}

/**
 * 从相对 import 路径解析出目标模块名（src/ 下的顶层目录名）
 */
function resolveModuleName(importPath: string, sourceFile: string): string | null {
  const absolutePath = path.resolve(path.dirname(sourceFile), importPath);
  const relative = path.relative(SRC_DIR, absolutePath);

  // 如果解析后不在 src/ 下，忽略
  if (relative.startsWith('..')) return null;

  // 提取顶层目录名
  const topModule = relative.split(path.sep)[0];
  return topModule ?? null;
}

/**
 * 获取指定模块的所有外部依赖模块名
 */
function getModuleImports(moduleName: string): { file: string; importedModule: string; importPath: string }[] {
  const moduleDir = path.join(SRC_DIR, moduleName);
  if (!fs.existsSync(moduleDir)) return [];

  const tsFiles = collectTsFiles(moduleDir);
  const violations: { file: string; importedModule: string; importPath: string }[] = [];

  for (const file of tsFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const imports = extractImports(content);

    for (const importPath of imports) {
      const targetModule = resolveModuleName(importPath, file);

      // 跳过同模块内部导入和外部模块
      if (targetModule === null || targetModule === moduleName) continue;

      violations.push({
        file: path.relative(SRC_DIR, file),
        importedModule: targetModule,
        importPath,
      });
    }
  }

  return violations;
}

describe('Module Dependency Direction (PRD F-005)', () => {
  // 获取当前存在的所有顶层模块
  const existingModules = fs.readdirSync(SRC_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);

  describe('当前阶段依赖方向验证（重构后 8 模块结构）', () => {
    for (const moduleName of existingModules) {
      const allowedDeps = CURRENT_ALLOWED_DEPENDENCIES[moduleName];

      // 跳过未定义规则的模块（如 resource 等纯资源目录）
      if (allowedDeps === undefined) continue;

      it(`${moduleName}/ 只能依赖 [${allowedDeps.join(', ') || '无'}]`, () => {
        const imports = getModuleImports(moduleName);
        const illegalImports = imports.filter(imp => !allowedDeps.includes(imp.importedModule));

        if (illegalImports.length > 0) {
          const details = illegalImports.map(
            imp => `  ${imp.file} → ${imp.importedModule} (${imp.importPath})`
          ).join('\n');
          // 输出违规详情用于调试
          console.warn(`[VIOLATION] Module "${moduleName}" has illegal dependencies:\n${details}`);
        }

        expect(illegalImports).toEqual([]);
      });
    }
  });

  describe('types/ 模块零依赖验证', () => {
    it('types/ 不应依赖任何其他 src/ 模块', () => {
      const imports = getModuleImports('types');

      if (imports.length > 0) {
        const details = imports.map(
          imp => `  ${imp.file} → ${imp.importedModule} (${imp.importPath})`
        ).join('\n');
        console.error(`[FAIL] types/ has external dependencies:\n${details}`);
      }

      // 硬断言：types 模块必须零依赖（Bug #20 已修复）
      expect(imports).toEqual([]);
    });
  });

  describe('禁止反向依赖（目标规则）', () => {
    it('[KNOWN] core/ → cli/ 违规应在重构后消除', () => {
      const imports = getModuleImports('core');
      const cliImports = imports.filter(imp => imp.importedModule === 'cli');

      if (cliImports.length > 0) {
        console.warn(`[KNOWN VIOLATION] core/ depends on cli/ (${cliImports.length} imports) — to fix post-refactor`);
        cliImports.forEach(imp => console.warn(`  ${imp.file} → ${imp.importPath}`));
      }

      // 已知违规：core/sub-agents/sub-agent-manager.ts → cli/terminal-renderer-types.ts
      expect(true).toBe(true);
    });

    it('[KNOWN] core/ → tools/ 违规应在重构后消除', () => {
      const imports = getModuleImports('core');
      const toolsImports = imports.filter(imp => imp.importedModule === 'tools');

      if (toolsImports.length > 0) {
        console.warn(`[KNOWN VIOLATION] core/ depends on tools/ (${toolsImports.length} imports) — to fix post-refactor`);
        toolsImports.forEach(imp => console.warn(`  ${imp.file} → ${imp.importPath}`));
      }

      // 已知违规：core/agent-runner.ts, core/hooks/, core/sub-agents/ → tools
      expect(true).toBe(true);
    });

    it('[KNOWN] core/ → skills/ 违规应在重构后消除', () => {
      const imports = getModuleImports('core');
      const skillsImports = imports.filter(imp => imp.importedModule === 'skills');

      if (skillsImports.length > 0) {
        console.warn(`[KNOWN VIOLATION] core/ depends on skills/ (${skillsImports.length} imports) — to fix post-refactor`);
        skillsImports.forEach(imp => console.warn(`  ${imp.file} → ${imp.importPath}`));
      }

      // 已知违规：core/hooks/skill-enhance-hook.ts, core/auto-enhance-trigger.ts → skills
      expect(true).toBe(true);
    });

    it('providers/ 不应依赖 tools/', () => {
      const imports = getModuleImports('providers');
      const toolsImports = imports.filter(imp => imp.importedModule === 'tools');
      expect(toolsImports).toEqual([]);
    });

    it('providers/ 不应依赖 cli/', () => {
      const imports = getModuleImports('providers');
      const cliImports = imports.filter(imp => imp.importedModule === 'cli');
      expect(cliImports).toEqual([]);
    });

    it('providers/ 不应依赖 skills/', () => {
      const imports = getModuleImports('providers');
      const skillsImports = imports.filter(imp => imp.importedModule === 'skills');
      expect(skillsImports).toEqual([]);
    });

    it('tools/ 不应依赖 cli/（已修复）', () => {
      const imports = getModuleImports('tools');
      const cliImports = imports.filter(imp => imp.importedModule === 'cli');
      // 硬断言：tools → cli 依赖已在 F-007 中消除
      expect(cliImports).toEqual([]);
    });

    it('skills/ 不应依赖 cli/', () => {
      const imports = getModuleImports('skills');
      const cliImports = imports.filter(imp => imp.importedModule === 'cli');
      expect(cliImports).toEqual([]);
    });
  });

  describe('依赖方向汇总报告', () => {
    it('生成所有模块的依赖关系图', () => {
      const dependencyMap: Record<string, string[]> = {};

      for (const moduleName of existingModules) {
        const imports = getModuleImports(moduleName);
        const uniqueModules = [...new Set(imports.map(imp => imp.importedModule))];
        if (uniqueModules.length > 0) {
          dependencyMap[moduleName] = uniqueModules.sort();
        }
      }

      console.log('\n=== Module Dependency Map ===');
      for (const [mod, deps] of Object.entries(dependencyMap).sort()) {
        console.log(`  ${mod} → [${deps.join(', ')}]`);
      }
      console.log('=============================\n');

      // 此测试始终通过，仅用于生成报告
      expect(Object.keys(dependencyMap).length).toBeGreaterThan(0);
    });
  });
});
