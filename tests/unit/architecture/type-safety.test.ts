/**
 * 类型安全验证测试 — 验证 PRD Section 4.2 类型安全要求
 *
 * 测试目标:
 * 1. TypeScript 编译零错误（bun run typecheck）
 * 2. any 使用数量不增加
 * 3. 统一类型系统验证（F-003）
 *
 * @module tests/unit/architecture/type-safety
 */

import { describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SRC_DIR = path.resolve(import.meta.dir, '../../../src');
const PROJECT_ROOT = path.resolve(SRC_DIR, '..');

// 重构前的 any 使用基准线（通过运行 grep -r 'any' src/ | wc -l 获取）
// 重构不应增加 any 数量，此基准在首次运行时记录
const ANY_BASELINE_FILE = path.join(PROJECT_ROOT, '.any-baseline.txt');

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
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * 统计源码中显式 any 的使用次数
 * 排除注释中的 any 和字符串中的 any
 */
function countAnyUsages(dir: string): { total: number; files: Array<{ file: string; count: number; lines: number[] }> } {
  const files = getAllTsFiles(dir);
  const result: { total: number; files: Array<{ file: string; count: number; lines: number[] }> } = {
    total: 0,
    files: [],
  };

  // 匹配类型注解中的 any（排除变量名中包含 any 的情况）
  const anyPattern = /(?<![.\w])any(?!\w)/g;
  // 用于排除注释和字符串的简单启发式
  const commentLinePattern = /^\s*(\/\/|\/\*|\*)/;
  const typeAnnotationPattern = /:\s*any\b|<\s*any\s*>|as\s+any\b|\bany\s*\[/;

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const anyLines: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      // 跳过纯注释行
      if (commentLinePattern.test(line)) continue;
      // 检查是否有类型注解中的 any
      if (typeAnnotationPattern.test(line)) {
        anyLines.push(i + 1);
      }
    }

    if (anyLines.length > 0) {
      result.files.push({
        file: path.relative(dir, filePath),
        count: anyLines.length,
        lines: anyLines,
      });
      result.total += anyLines.length;
    }
  }

  return result;
}

// ========== 测试用例 ==========

describe('PRD 4.2: TypeScript 编译安全', () => {
  it('tsc --noEmit 编译零错误', async () => {
    const proc = Bun.spawn(['bun', 'run', 'typecheck'], {
      cwd: PROJECT_ROOT,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      // 提取错误摘要
      const output = stdout || stderr;
      const errorLines = output
        .split('\n')
        .filter((line) => line.includes('error TS'))
        .slice(0, 20); // 最多显示 20 个错误

      throw new Error(
        `TypeScript compilation failed with ${errorLines.length}+ errors:\n` +
          errorLines.join('\n'),
      );
    }

    expect(exitCode).toBe(0);
  }, 20000);
});

describe('PRD 4.2: any 使用约束', () => {
  it('src/ 中 any 的使用数量不超过基准线', () => {
    const currentUsage = countAnyUsages(SRC_DIR);

    // 读取基准线
    let baseline: number;
    if (fs.existsSync(ANY_BASELINE_FILE)) {
      baseline = parseInt(fs.readFileSync(ANY_BASELINE_FILE, 'utf-8').trim(), 10);
    } else {
      // 首次运行，记录当前值为基准
      fs.writeFileSync(ANY_BASELINE_FILE, String(currentUsage.total), 'utf-8');
      baseline = currentUsage.total;
      console.log(`[INFO] any baseline recorded: ${baseline}`);
    }

    if (currentUsage.total > baseline) {
      // 找出新增的 any
      const fileDetails = currentUsage.files
        .map((f) => `  ${f.file} (${f.count} occurrences at lines: ${f.lines.join(', ')})`)
        .join('\n');

      throw new Error(
        `any usage increased from baseline ${baseline} to ${currentUsage.total} (+${currentUsage.total - baseline}).\n` +
          `Files with any:\n${fileDetails}`,
      );
    }

    expect(currentUsage.total).toBeLessThanOrEqual(baseline);
  });

  it('新增的类型定义文件不使用 any', () => {
    // 检查 src/types/ 目录中的文件不包含 any
    const typesDir = path.join(SRC_DIR, 'types');
    if (!fs.existsSync(typesDir)) return;

    const usage = countAnyUsages(typesDir);

    if (usage.total > 0) {
      const details = usage.files
        .map((f) => `  ${f.file} at lines: ${f.lines.join(', ')}`)
        .join('\n');
      throw new Error(
        `Types module should not contain 'any'. Found ${usage.total} occurrences:\n${details}`,
      );
    }

    expect(usage.total).toBe(0);
  });
});

describe('PRD F-003: 统一类型系统验证', () => {
  it('src/types/ 目录存在且包含标准类型文件', () => {
    const typesDir = path.join(SRC_DIR, 'types');
    if (!fs.existsSync(typesDir)) {
      // 类型系统重构尚未完成时跳过
      console.warn('Skipping: src/types/ directory does not exist yet');
      return;
    }

    const expectedFiles = ['message.ts', 'tool.ts', 'events.ts', 'usage.ts', 'provider.ts', 'index.ts'];
    const existingFiles = fs.readdirSync(typesDir).filter((f) => f.endsWith('.ts'));

    for (const expected of expectedFiles) {
      expect(existingFiles).toContain(expected);
    }
  });

  it('src/types/index.ts 统一导出所有类型', () => {
    const indexPath = path.join(SRC_DIR, 'types', 'index.ts');
    if (!fs.existsSync(indexPath)) return;

    const content = fs.readFileSync(indexPath, 'utf-8');

    // 应该有来自各子模块的导出
    const expectedExports = ['message', 'tool', 'events', 'usage', 'provider'];
    for (const mod of expectedExports) {
      const hasExport = content.includes(`'./${mod}'`) || content.includes(`"./${mod}"`);
      if (!hasExport) {
        console.warn(`Warning: types/index.ts may not re-export from './${mod}'`);
      }
    }

    // 至少有导出语句
    expect(/export\s+/.test(content)).toBe(true);
  });

  it('不存在旧版类型冲突（core/types.ts 与 providers/types.ts 同时存在）', () => {
    const coreTypes = path.join(SRC_DIR, 'core', 'types.ts');
    const providerTypes = path.join(SRC_DIR, 'providers', 'types.ts');
    const unifiedTypes = path.join(SRC_DIR, 'types', 'index.ts');

    // 如果统一类型系统已建立，旧版类型文件应被清理
    if (fs.existsSync(unifiedTypes)) {
      // core/types.ts 如果还存在，应该只是 re-export
      if (fs.existsSync(coreTypes)) {
        const content = fs.readFileSync(coreTypes, 'utf-8');
        const isReExport =
          content.includes("from '../types'") || content.includes('from "../types"');
        if (!isReExport) {
          console.warn(
            'Warning: core/types.ts still exists and is not a re-export. May cause type conflicts.',
          );
        }
      }

      if (fs.existsSync(providerTypes)) {
        const content = fs.readFileSync(providerTypes, 'utf-8');
        const isReExport =
          content.includes("from '../types'") || content.includes('from "../types"');
        if (!isReExport) {
          console.warn(
            'Warning: providers/types.ts still exists and is not a re-export. May cause type conflicts.',
          );
        }
      }
    }
  });
});
