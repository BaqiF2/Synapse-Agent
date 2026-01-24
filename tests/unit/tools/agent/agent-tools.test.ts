/**
 * Unit tests for Agent Bash tools.
 *
 * Tests all Agent Bash tools (ReadTool, WriteTool, EditTool, GrepTool, GlobTool)
 * to ensure proper functionality and alignment with Python version.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ReadTool } from '../../../../src/tools/agent/read';
import { WriteTool } from '../../../../src/tools/agent/write';
import { EditTool } from '../../../../src/tools/agent/edit';
import { GrepTool } from '../../../../src/tools/agent/grep';
import { GlobTool } from '../../../../src/tools/agent/glob';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Test directory setup
const TEST_DIR = path.join(os.tmpdir(), `synapse-test-${Date.now()}`);

describe('Agent Bash Tools', () => {
  beforeEach(async () => {
    // Create test directory
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('ReadTool', () => {
    const readTool = new ReadTool();

    test('should read entire file', async () => {
      const testFile = path.join(TEST_DIR, 'test.txt');
      await Bun.write(testFile, 'Line 1\nLine 2\nLine 3');

      const result = await readTool.execute({ file_path: testFile });

      expect(result.success).toBe(true);
      expect(result.output).toBe('Line 1\nLine 2\nLine 3');
    });

    test('should read file with offset (1-indexed)', async () => {
      const testFile = path.join(TEST_DIR, 'test.txt');
      await Bun.write(testFile, 'Line 1\nLine 2\nLine 3\nLine 4');

      const result = await readTool.execute({ file_path: testFile, offset: 2 });

      expect(result.success).toBe(true);
      expect(result.output).toBe('Line 2\nLine 3\nLine 4');
    });

    test('should read file with limit', async () => {
      const testFile = path.join(TEST_DIR, 'test.txt');
      await Bun.write(testFile, 'Line 1\nLine 2\nLine 3\nLine 4');

      const result = await readTool.execute({ file_path: testFile, limit: 2 });

      expect(result.success).toBe(true);
      expect(result.output).toBe('Line 1\nLine 2');
    });

    test('should read file with offset and limit', async () => {
      const testFile = path.join(TEST_DIR, 'test.txt');
      await Bun.write(testFile, 'Line 1\nLine 2\nLine 3\nLine 4');

      const result = await readTool.execute({
        file_path: testFile,
        offset: 2,
        limit: 2,
      });

      expect(result.success).toBe(true);
      expect(result.output).toBe('Line 2\nLine 3');
    });

    test('should show line numbers when requested', async () => {
      const testFile = path.join(TEST_DIR, 'test.txt');
      await Bun.write(testFile, 'Line 1\nLine 2');

      const result = await readTool.execute({
        file_path: testFile,
        show_line_numbers: true,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain('1→Line 1');
      expect(result.output).toContain('2→Line 2');
    });

    test('should expand ~ in path', async () => {
      // Create file in home directory temp
      const testFile = path.join(os.homedir(), `.synapse-test-${Date.now()}.txt`);
      await Bun.write(testFile, 'Test content');

      try {
        const relativePath = testFile.replace(os.homedir(), '~');
        const result = await readTool.execute({ file_path: relativePath });

        expect(result.success).toBe(true);
        expect(result.output).toBe('Test content');
      } finally {
        await fs.rm(testFile, { force: true });
      }
    });

    test('should return error for non-existent file', async () => {
      const result = await readTool.execute({
        file_path: '/nonexistent/file.txt',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not exist');
    });

    test('should use snake_case field names', () => {
      const schema = readTool.getSchema();
      const props = schema.input_schema.properties;

      expect('file_path' in props).toBe(true);
      expect('show_line_numbers' in props).toBe(true);
    });
  });

  describe('WriteTool', () => {
    const writeTool = new WriteTool();

    test('should write file successfully', async () => {
      const testFile = path.join(TEST_DIR, 'write-test.txt');

      const result = await writeTool.execute({
        file_path: testFile,
        content: 'Hello World',
      });

      expect(result.success).toBe(true);

      const content = await Bun.file(testFile).text();
      expect(content).toBe('Hello World');
    });

    test('should create parent directories', async () => {
      const testFile = path.join(TEST_DIR, 'nested', 'dir', 'file.txt');

      const result = await writeTool.execute({
        file_path: testFile,
        content: 'Nested content',
      });

      expect(result.success).toBe(true);

      const content = await Bun.file(testFile).text();
      expect(content).toBe('Nested content');
    });

    test('should overwrite existing file', async () => {
      const testFile = path.join(TEST_DIR, 'overwrite.txt');
      await Bun.write(testFile, 'Old content');

      const result = await writeTool.execute({
        file_path: testFile,
        content: 'New content',
      });

      expect(result.success).toBe(true);

      const content = await Bun.file(testFile).text();
      expect(content).toBe('New content');
    });

    test('should expand ~ in path', async () => {
      const testFile = path.join(os.homedir(), `.synapse-test-write-${Date.now()}.txt`);
      const relativePath = testFile.replace(os.homedir(), '~');

      try {
        const result = await writeTool.execute({
          file_path: relativePath,
          content: 'Test content',
        });

        expect(result.success).toBe(true);

        const content = await Bun.file(testFile).text();
        expect(content).toBe('Test content');
      } finally {
        await fs.rm(testFile, { force: true });
      }
    });

    test('should return error for missing parameters', async () => {
      const result = await writeTool.execute({ file_path: '/tmp/test.txt' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('content');
    });

    test('should use snake_case field names', () => {
      const schema = writeTool.getSchema();
      const props = schema.input_schema.properties;

      expect('file_path' in props).toBe(true);
    });
  });

  describe('EditTool', () => {
    const editTool = new EditTool();

    test('should replace string in file', async () => {
      const testFile = path.join(TEST_DIR, 'edit-test.txt');
      await Bun.write(testFile, 'Hello World');

      const result = await editTool.execute({
        file_path: testFile,
        old_string: 'World',
        new_string: 'TypeScript',
      });

      expect(result.success).toBe(true);

      const content = await Bun.file(testFile).text();
      expect(content).toBe('Hello TypeScript');
    });

    test('should enforce uniqueness by default', async () => {
      const testFile = path.join(TEST_DIR, 'unique-test.txt');
      await Bun.write(testFile, 'test test test');

      const result = await editTool.execute({
        file_path: testFile,
        old_string: 'test',
        new_string: 'replaced',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('appears 3 times');
      expect(result.error).toContain('replace_all');
    });

    test('should replace all occurrences when replace_all is true', async () => {
      const testFile = path.join(TEST_DIR, 'replace-all-test.txt');
      await Bun.write(testFile, 'test test test');

      const result = await editTool.execute({
        file_path: testFile,
        old_string: 'test',
        new_string: 'replaced',
        replace_all: true,
      });

      expect(result.success).toBe(true);

      const content = await Bun.file(testFile).text();
      expect(content).toBe('replaced replaced replaced');
    });

    test('should return error for non-existent file', async () => {
      const result = await editTool.execute({
        file_path: '/nonexistent/file.txt',
        old_string: 'test',
        new_string: 'replaced',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not exist');
    });

    test('should return error when string not found', async () => {
      const testFile = path.join(TEST_DIR, 'notfound-test.txt');
      await Bun.write(testFile, 'Hello World');

      const result = await editTool.execute({
        file_path: testFile,
        old_string: 'nonexistent',
        new_string: 'replaced',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('should use snake_case field names', () => {
      const schema = editTool.getSchema();
      const props = schema.input_schema.properties;

      expect('file_path' in props).toBe(true);
      expect('old_string' in props).toBe(true);
      expect('new_string' in props).toBe(true);
      expect('replace_all' in props).toBe(true);
    });
  });

  describe('GrepTool', () => {
    const grepTool = new GrepTool();

    beforeEach(async () => {
      // Create test files
      await Bun.write(path.join(TEST_DIR, 'file1.txt'), 'Hello World\nGoodbye');
      await Bun.write(path.join(TEST_DIR, 'file2.txt'), 'Hello TypeScript\nHello Bun');
      await Bun.write(path.join(TEST_DIR, 'file3.js'), 'console.log("Hello")');
    });

    test('should find pattern in files', async () => {
      const result = await grepTool.execute({
        pattern: 'Hello',
        path: TEST_DIR,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain('Hello');
    });

    test('should filter files by glob pattern', async () => {
      const result = await grepTool.execute({
        pattern: 'Hello',
        path: TEST_DIR,
        glob: '*.txt',
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain('.txt');
      expect(result.output).not.toContain('.js');
    });

    test('should perform case-insensitive search', async () => {
      const result = await grepTool.execute({
        pattern: 'hello',
        path: TEST_DIR,
        ignore_case: true,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain('Hello');
    });

    test('should return success with no matches', async () => {
      const result = await grepTool.execute({
        pattern: 'nonexistent',
        path: TEST_DIR,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain('No matches found');
    });

    test('should use snake_case field names', () => {
      const schema = grepTool.getSchema();
      const props = schema.input_schema.properties;

      expect('ignore_case' in props).toBe(true);
    });
  });

  describe('GlobTool', () => {
    const globTool = new GlobTool();

    beforeEach(async () => {
      // Create test file structure
      await fs.mkdir(path.join(TEST_DIR, 'src'), { recursive: true });
      await Bun.write(path.join(TEST_DIR, 'file1.ts'), '');
      await Bun.write(path.join(TEST_DIR, 'file2.js'), '');
      await Bun.write(path.join(TEST_DIR, 'src', 'file3.ts'), '');
    });

    test('should find files by pattern', async () => {
      const result = await globTool.execute({
        pattern: '*.ts',
        path: TEST_DIR,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain('file1.ts');
      expect(result.output).not.toContain('file2.js');
    });

    test('should support recursive patterns', async () => {
      const result = await globTool.execute({
        pattern: '**/*.ts',
        path: TEST_DIR,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain('file1.ts');
      expect(result.output).toContain(path.join('src', 'file3.ts'));
    });

    test('should return success with no matches', async () => {
      const result = await globTool.execute({
        pattern: '*.py',
        path: TEST_DIR,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain('No files found');
    });

    test('should sort results alphabetically', async () => {
      const result = await globTool.execute({
        pattern: '*.{ts,js}',
        path: TEST_DIR,
      });

      expect(result.success).toBe(true);
      const files = result.output?.split('\n') || [];
      const sorted = [...files].sort();
      expect(files).toEqual(sorted);
    });

    test('should use snake_case field names', () => {
      const schema = globTool.getSchema();
      const props = schema.input_schema.properties;

      // Glob tool has simple parameters (pattern, path)
      expect('pattern' in props).toBe(true);
      expect('path' in props).toBe(true);
    });
  });

  describe('Integration', () => {
    test('should work together: write, read, edit, read', async () => {
      const testFile = path.join(TEST_DIR, 'integration.txt');
      const writeTool = new WriteTool();
      const readTool = new ReadTool();
      const editTool = new EditTool();

      // Write
      let result = await writeTool.execute({
        file_path: testFile,
        content: 'Initial content',
      });
      expect(result.success).toBe(true);

      // Read
      result = await readTool.execute({ file_path: testFile });
      expect(result.success).toBe(true);
      expect(result.output).toBe('Initial content');

      // Edit
      result = await editTool.execute({
        file_path: testFile,
        old_string: 'Initial',
        new_string: 'Modified',
      });
      expect(result.success).toBe(true);

      // Read again
      result = await readTool.execute({ file_path: testFile });
      expect(result.success).toBe(true);
      expect(result.output).toBe('Modified content');
    });
  });
});
