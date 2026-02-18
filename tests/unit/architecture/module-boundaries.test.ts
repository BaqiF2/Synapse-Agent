/**
 * 模块导出边界 BDD 测试 — 验证 F-008 的 5 个场景。
 *
 * 测试目标:
 * 1. core 模块不依赖 cli/skills/sub-agents 模块
 * 2. providers 模块不依赖 tools/skills/cli 模块
 * 3. 模块间只通过 index.ts 引用（新代码验证）
 * 4. 每个模块有 index.ts 导出文件
 * 5. 依赖方向符合架构约束（通过 dependency-cruiser 验证）
 */

import { describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SRC_DIR = path.resolve(import.meta.dir, '../../../src');

// BDD 规定需要 index.ts 的模块
const REQUIRED_MODULES = [
  'core',
  'providers',
  'tools',
  'skills',
  'sub-agents',
  'cli',
  'config',
];

// 架构允许的依赖方向（key 模块可依赖 value 列表中的模块）
// types 和 common 是共享模块，所有模块均可依赖
const SHARED_MODULES = ['common', 'types'];
const ALLOWED_DEPENDENCIES: Record<string, string[]> = {
  cli: ['core', 'providers', 'tools', 'skills', 'sub-agents', 'config', ...SHARED_MODULES],
  'sub-agents': ['core', 'providers', 'tools', ...SHARED_MODULES],
  skills: ['core', 'providers', ...SHARED_MODULES],
  tools: ['core', 'providers', ...SHARED_MODULES],
  providers: [...SHARED_MODULES],
  core: [...SHARED_MODULES],
  config: [...SHARED_MODULES],
  common: [],
  types: [],
};

// ========== 辅助工具 ==========

/** 递归获取指定目录下所有 .ts 文件 */
function getAllTsFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      results.push(...getAllTsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

/** 提取文件中的所有跨模块 import 路径 */
function extractCrossModuleImports(
  filePath: string,
): Array<{ source: string; targetModule: string; importPath: string; isDeep: boolean }> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const relToSrc = path.relative(SRC_DIR, filePath);
  const sourceModule = relToSrc.split(path.sep)[0]!;
  const results: Array<{
    source: string;
    targetModule: string;
    importPath: string;
    isDeep: boolean;
  }> = [];

  // 匹配 import ... from '...' 和 import '...'
  const importRegex = /(?:import|export)\s+(?:type\s+)?(?:\{[^}]*\}|[^;'"]*)\s*from\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;

  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1]!;
    // 只关心相对路径（跨模块）
    if (!importPath.startsWith('.')) continue;

    const resolvedTarget = path.resolve(path.dirname(filePath), importPath);
    const relTarget = path.relative(SRC_DIR, resolvedTarget);
    const targetParts = relTarget.split(path.sep);
    const targetModule = targetParts[0]!;

    // 跨模块引用
    if (
      targetModule !== sourceModule &&
      Object.keys(ALLOWED_DEPENDENCIES).includes(targetModule)
    ) {
      // 判断是否为深度导入（直接引用了模块内部文件而非 index）
      const afterModule = targetParts.slice(1).join(path.sep);
      const isDeep =
        afterModule !== '' &&
        afterModule !== 'index' &&
        afterModule !== 'index.ts' &&
        afterModule !== 'index.js';

      results.push({
        source: relToSrc,
        targetModule,
        importPath,
        isDeep,
      });
    }
  }

  return results;
}

// ========== BDD 场景测试 ==========

describe('F-008: 模块导出边界', () => {
  // 场景 1: core 模块不依赖 cli 模块
  describe('场景 1: core 模块不依赖 cli/skills/sub-agents 模块', () => {
    const coreDir = path.join(SRC_DIR, 'core');
    const coreFiles = getAllTsFiles(coreDir);
    const forbiddenModules = ['cli', 'skills', 'sub-agents'];

    it('Given: core/ 目录下的所有 TypeScript 源文件', () => {
      expect(coreFiles.length).toBeGreaterThan(0);
    });

    it('Then: 不存在从 core/ 到 cli/ 的 import', () => {
      const violations: string[] = [];
      for (const file of coreFiles) {
        const imports = extractCrossModuleImports(file);
        for (const imp of imports) {
          if (imp.targetModule === 'cli') {
            violations.push(`${imp.source} -> ${imp.importPath}`);
          }
        }
      }
      expect(violations).toEqual([]);
    });

    it('Then: 不存在从 core/ 到 skills/ 的 import', () => {
      const violations: string[] = [];
      for (const file of coreFiles) {
        const imports = extractCrossModuleImports(file);
        for (const imp of imports) {
          if (imp.targetModule === 'skills') {
            violations.push(`${imp.source} -> ${imp.importPath}`);
          }
        }
      }
      expect(violations).toEqual([]);
    });

    it('Then: 不存在从 core/ 到 sub-agents/ 的 import', () => {
      const violations: string[] = [];
      for (const file of coreFiles) {
        const imports = extractCrossModuleImports(file);
        for (const imp of imports) {
          if (imp.targetModule === 'sub-agents') {
            violations.push(`${imp.source} -> ${imp.importPath}`);
          }
        }
      }
      expect(violations).toEqual([]);
    });
  });

  // 场景 2: providers 模块不依赖 tools 模块
  describe('场景 2: providers 模块不依赖 tools/skills/cli 模块', () => {
    const providersDir = path.join(SRC_DIR, 'providers');
    const providerFiles = getAllTsFiles(providersDir);

    it('Given: providers/ 目录下的所有 TypeScript 源文件', () => {
      expect(providerFiles.length).toBeGreaterThan(0);
    });

    it('Then: 不存在从 providers/ 到 tools/ 的 import', () => {
      const violations: string[] = [];
      for (const file of providerFiles) {
        const imports = extractCrossModuleImports(file);
        for (const imp of imports) {
          if (imp.targetModule === 'tools') {
            violations.push(`${imp.source} -> ${imp.importPath}`);
          }
        }
      }
      expect(violations).toEqual([]);
    });

    it('Then: 不存在从 providers/ 到 skills/ 的 import', () => {
      const violations: string[] = [];
      for (const file of providerFiles) {
        const imports = extractCrossModuleImports(file);
        for (const imp of imports) {
          if (imp.targetModule === 'skills') {
            violations.push(`${imp.source} -> ${imp.importPath}`);
          }
        }
      }
      expect(violations).toEqual([]);
    });

    it('Then: 不存在从 providers/ 到 cli/ 的 import', () => {
      const violations: string[] = [];
      for (const file of providerFiles) {
        const imports = extractCrossModuleImports(file);
        for (const imp of imports) {
          if (imp.targetModule === 'cli') {
            violations.push(`${imp.source} -> ${imp.importPath}`);
          }
        }
      }
      expect(violations).toEqual([]);
    });
  });

  // 场景 3: 模块间只通过 index.ts 引用
  describe('场景 3: 模块间只通过 index.ts 引用', () => {
    // 验证新增的模块代码（core, common, providers/types.ts 等）遵循此规则
    // 已有大量旧代码使用深度导入（106处），此测试仅验证新模块代码
    const newModuleDirs = ['core', 'common'];

    for (const moduleName of newModuleDirs) {
      it(`Then: ${moduleName}/ 内部的跨模块 import 均指向模块根目录`, () => {
        const moduleDir = path.join(SRC_DIR, moduleName);
        const files = getAllTsFiles(moduleDir);
        const deepViolations: string[] = [];

        for (const file of files) {
          const imports = extractCrossModuleImports(file);
          for (const imp of imports) {
            if (imp.isDeep) {
              deepViolations.push(`${imp.source} -> ${imp.importPath} (deep import to ${imp.targetModule})`);
            }
          }
        }

        expect(deepViolations).toEqual([]);
      });
    }

    it('Then: 不存在 import { X } from "../module/internal-file" 形式（新模块代码中）', () => {
      // 综合检查所有新模块
      const allDeepViolations: string[] = [];
      for (const moduleName of newModuleDirs) {
        const moduleDir = path.join(SRC_DIR, moduleName);
        const files = getAllTsFiles(moduleDir);
        for (const file of files) {
          const imports = extractCrossModuleImports(file);
          for (const imp of imports) {
            if (imp.isDeep) {
              allDeepViolations.push(
                `${imp.source} -> ${imp.importPath}`,
              );
            }
          }
        }
      }
      expect(allDeepViolations).toEqual([]);
    });
  });

  // 场景 4: 每个模块有 index.ts 导出文件
  describe('场景 4: 每个模块有 index.ts 导出文件', () => {
    it('Given: src/ 下的一级子目录列表', () => {
      for (const mod of REQUIRED_MODULES) {
        const modDir = path.join(SRC_DIR, mod);
        expect(fs.existsSync(modDir)).toBe(true);
      }
    });

    for (const mod of REQUIRED_MODULES) {
      it(`Then: ${mod}/ 包含 index.ts`, () => {
        const indexPath = path.join(SRC_DIR, mod, 'index.ts');
        expect(fs.existsSync(indexPath)).toBe(true);
      });
    }

    it('Then: 每个模块的 index.ts 至少导出一个符号', () => {
      for (const mod of REQUIRED_MODULES) {
        const indexPath = path.join(SRC_DIR, mod, 'index.ts');
        const content = fs.readFileSync(indexPath, 'utf-8');
        const hasExport = /export\s+/.test(content);
        expect(hasExport).toBe(true);
      }
    });
  });

  // 场景 5: 依赖方向符合架构约束
  describe('场景 5: 依赖方向符合架构约束', () => {
    it('Given: 预定义的合法依赖规则', () => {
      // 验证配置本身完整
      expect(Object.keys(ALLOWED_DEPENDENCIES)).toContain('core');
      expect(Object.keys(ALLOWED_DEPENDENCIES)).toContain('providers');
      expect(Object.keys(ALLOWED_DEPENDENCIES)).toContain('tools');
      expect(Object.keys(ALLOWED_DEPENDENCIES)).toContain('skills');
      expect(Object.keys(ALLOWED_DEPENDENCIES)).toContain('cli');
      expect(Object.keys(ALLOWED_DEPENDENCIES)).toContain('config');
      expect(Object.keys(ALLOWED_DEPENDENCIES)).toContain('common');
    });

    it('Then: 实际依赖图中不存在违反预定义规则的边（新模块代码）', () => {
      // 扫描新重构的模块，检查依赖方向
      const modulesToCheck = ['core', 'providers', 'common', 'config'];
      const violations: string[] = [];

      for (const moduleName of modulesToCheck) {
        const moduleDir = path.join(SRC_DIR, moduleName);
        const files = getAllTsFiles(moduleDir);
        const allowed = ALLOWED_DEPENDENCIES[moduleName] ?? [];

        for (const file of files) {
          const imports = extractCrossModuleImports(file);
          for (const imp of imports) {
            if (!allowed.includes(imp.targetModule)) {
              violations.push(
                `${imp.source} -> ${imp.targetModule} (${moduleName} should not depend on ${imp.targetModule})`,
              );
            }
          }
        }
      }

      expect(violations).toEqual([]);
    });

    it('Then: dependency-cruiser 架构检查通过（无新违规）', async () => {
      // 通过运行 dependency-cruiser 验证
      const proc = Bun.spawn(
        ['npx', 'dependency-cruise', 'src/', '-c', '.dependency-cruiser.cjs', '--ignore-known', '--output-type', 'json'],
        {
          cwd: path.resolve(SRC_DIR, '..'),
          stdout: 'pipe',
          stderr: 'pipe',
        },
      );

      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      // exitCode === 0 表示无新违规
      if (exitCode !== 0) {
        // 解析输出找到具体违规
        try {
          const result = JSON.parse(stdout);
          const violationSummary = (result.summary?.violations ?? [])
            .map((v: { from: string; to: string; rule: { name: string } }) =>
              `${v.from} -> ${v.to} [${v.rule.name}]`,
            )
            .join('\n');
          expect(violationSummary).toBe('');
        } catch {
          // JSON 解析失败时直接断言 exitCode
          expect(exitCode).toBe(0);
        }
      }

      expect(exitCode).toBe(0);
    });

    it('Then: core 模块无外部模块依赖（除共享模块 common/types）', () => {
      const coreDir = path.join(SRC_DIR, 'core');
      const files = getAllTsFiles(coreDir);
      const violations: string[] = [];
      const allowed = ALLOWED_DEPENDENCIES['core']!;

      for (const file of files) {
        const imports = extractCrossModuleImports(file);
        for (const imp of imports) {
          if (!allowed.includes(imp.targetModule)) {
            violations.push(
              `${imp.source} -> ${imp.targetModule}`,
            );
          }
        }
      }

      expect(violations).toEqual([]);
    });

    it('Then: providers 模块无外部模块依赖（除共享模块 common/types）', () => {
      const providersDir = path.join(SRC_DIR, 'providers');
      const files = getAllTsFiles(providersDir);
      const violations: string[] = [];
      const allowed = ALLOWED_DEPENDENCIES['providers']!;

      for (const file of files) {
        const imports = extractCrossModuleImports(file);
        for (const imp of imports) {
          if (!allowed.includes(imp.targetModule)) {
            violations.push(
              `${imp.source} -> ${imp.targetModule}`,
            );
          }
        }
      }

      expect(violations).toEqual([]);
    });
  });
});
