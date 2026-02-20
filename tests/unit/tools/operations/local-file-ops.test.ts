/**
 * LocalFileOperations 单元测试 — 验证 BDD 场景 1-3：
 * 1. 读取文件
 * 2. 读取不存在的文件
 * 3. 写入文件
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { LocalFileOperations } from '../../../../src/tools/operations/local-file-ops.ts';
import { FileNotFoundError } from '../../../../src/shared/errors.ts';

describe('LocalFileOperations', () => {
  let fileOps: LocalFileOperations;
  let testDir: string;

  beforeEach(() => {
    fileOps = new LocalFileOperations();
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-file-ops-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('Scenario: LocalFileOperations 读取文件', () => {
    it('should return file content when file exists', async () => {
      // Given: 存在一个测试文件，内容为 'hello'
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'hello', 'utf-8');

      // When: 调用 fileOps.readFile
      const content = await fileOps.readFile(testFile);

      // Then: 返回字符串 'hello'
      expect(content).toBe('hello');
    });
  });

  describe('Scenario: LocalFileOperations 读取不存在的文件', () => {
    it('should throw FileNotFoundError when file does not exist', async () => {
      // Given: 文件不存在
      const nonexistentFile = path.join(testDir, 'nonexistent.txt');

      // When/Then: 调用 readFile 应抛出 FileNotFoundError
      await expect(fileOps.readFile(nonexistentFile)).rejects.toBeInstanceOf(FileNotFoundError);
    });
  });

  describe('Scenario: LocalFileOperations 写入文件', () => {
    it('should create file with specified content', async () => {
      // Given: 已创建 LocalFileOperations 实例（在 beforeEach 中完成）
      const outputFile = path.join(testDir, 'output.txt');

      // When: 调用 fileOps.writeFile
      await fileOps.writeFile(outputFile, 'content');

      // Then: 文件被创建且内容正确
      expect(fs.existsSync(outputFile)).toBe(true);
      expect(fs.readFileSync(outputFile, 'utf-8')).toBe('content');
    });

    it('should create parent directories if they do not exist', async () => {
      const deepFile = path.join(testDir, 'a', 'b', 'c', 'deep.txt');

      await fileOps.writeFile(deepFile, 'deep content');

      expect(fs.existsSync(deepFile)).toBe(true);
      expect(fs.readFileSync(deepFile, 'utf-8')).toBe('deep content');
    });
  });

  describe('editFile', () => {
    it('should apply text replacements and persist', async () => {
      const filePath = path.join(testDir, 'editable.txt');
      fs.writeFileSync(filePath, 'hello world', 'utf-8');

      const result = await fileOps.editFile(filePath, [
        { oldText: 'hello', newText: 'goodbye' },
      ]);

      expect(result).toBe('goodbye world');
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('goodbye world');
    });
  });

  describe('fileExists', () => {
    it('should return true for existing files', async () => {
      const filePath = path.join(testDir, 'exists.txt');
      fs.writeFileSync(filePath, '', 'utf-8');

      expect(await fileOps.fileExists(filePath)).toBe(true);
    });

    it('should return false for non-existing files', async () => {
      expect(await fileOps.fileExists(path.join(testDir, 'nope.txt'))).toBe(false);
    });
  });

  describe('listFiles', () => {
    it('should list files in a directory', async () => {
      fs.writeFileSync(path.join(testDir, 'a.txt'), '', 'utf-8');
      fs.writeFileSync(path.join(testDir, 'b.txt'), '', 'utf-8');

      const files = await fileOps.listFiles(testDir);

      expect(files).toContain(path.join(testDir, 'a.txt'));
      expect(files).toContain(path.join(testDir, 'b.txt'));
    });
  });
});
