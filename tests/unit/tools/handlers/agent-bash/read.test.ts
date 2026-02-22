/**
 * ReadHandler Tests
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ReadHandler, parseReadCommand } from '../../../../../src/tools/commands/read-handler.ts';

describe('ReadHandler', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-read-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should parse command arguments', () => {
    const args = parseReadCommand('read ./file.txt --offset 1 --limit 2');

    expect(args.filePath).toBe('./file.txt');
    expect(args.offset).toBe(1);
    expect(args.limit).toBe(2);
  });

  it('should read file with offset and limit', async () => {
    const filePath = path.join(testDir, 'sample.txt');
    fs.writeFileSync(filePath, 'a\nb\nc', 'utf-8');

    const handler = new ReadHandler();
    const result = await handler.execute(`read ${filePath} --offset 1 --limit 1`);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('\t');
    expect(result.stdout).toContain('b');
  });

  it('should return error when file is missing', async () => {
    const handler = new ReadHandler();
    const result = await handler.execute(`read ${path.join(testDir, 'missing.txt')}`);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('File not found');
  });

  it('should expand tilde path to home directory', async () => {
    // 在 testDir 下创建测试文件
    const testFile = path.join(testDir, 'tilde-test.txt');
    fs.writeFileSync(testFile, 'tilde-content', 'utf-8');

    // 将 HOME 临时指向 testDir，确保 ~ 展开到正确位置
    const savedHome = process.env.HOME;
    process.env.HOME = testDir;
    try {
      const handler = new ReadHandler();
      const result = await handler.execute('read ~/tilde-test.txt');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('tilde-content');
    } finally {
      // 必须恢复 HOME
      if (savedHome !== undefined) {
        process.env.HOME = savedHome;
      } else {
        delete process.env.HOME;
      }
    }
  });
});
