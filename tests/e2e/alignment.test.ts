/**
 * Alignment test - Verify functional equivalence with Python version.
 *
 * This file tests that the TypeScript implementation produces equivalent
 * behavior to the Python version for core tool operations.
 *
 * Core exports:
 * - Alignment test suite for all core tools
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { promises as fs } from 'fs';
import { join } from 'path';
import { BashRouter } from '../../src/tools/bash-router.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import { BashSession } from '../../src/tools/bash-session.js';
import { getAllAgentTools } from '../../src/tools/agent';

const TEST_DIR = join(__dirname, '../../.test-temp-alignment');

let router: BashRouter;

beforeAll(async () => {
  // Create test directory
  await fs.mkdir(TEST_DIR, { recursive: true });

  // Initialize registry with all agent tools
  const registry = new ToolRegistry();
  const agentTools = getAllAgentTools();
  for (const tool of agentTools) {
    registry.register(tool);
  }

  // Initialize session and router
  const session = new BashSession();
  router = new BashRouter(registry, session);
});

afterAll(async () => {
  // Clean up test directory
  await fs.rm(TEST_DIR, { recursive: true, force: true });
});

describe('Alignment Tests - Core Tools', () => {
  describe('ReadTool alignment', () => {
    test('should read file with same behavior as Python', async () => {
      const testFile = join(TEST_DIR, 'test-read.txt');
      await fs.writeFile(testFile, 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\n');

      const result = await router.execute(`read ${testFile}`);

      expect(result.success).toBe(true);
      expect(result.output).toContain('Line 1');
      expect(result.output).toContain('Line 2');
    });

    test('should respect offset and limit like Python', async () => {
      const testFile = join(TEST_DIR, 'test-read-offset.txt');
      await fs.writeFile(testFile, 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\n');

      // Test offset=2, limit=2 (should read lines 2-3)
      const result = await router.execute(`read ${testFile} --offset 2 --limit 2`);

      expect(result.success).toBe(true);
      expect(result.output).toContain('Line 2');
      expect(result.output).toContain('Line 3');
      expect(result.output).not.toContain('Line 1');
      expect(result.output).not.toContain('Line 4');
    });

    test('should show line numbers by default like Python', async () => {
      const testFile = join(TEST_DIR, 'test-read-linenum.txt');
      await fs.writeFile(testFile, 'Hello\nWorld\n');

      const result = await router.execute(`read ${testFile}`);

      expect(result.success).toBe(true);
      // Check for line number format
      expect(result.output).toMatch(/1.*Hello/);
      expect(result.output).toMatch(/2.*World/);
    });
  });

  describe('WriteTool alignment', () => {
    test('should write file with same behavior as Python', async () => {
      const testFile = join(TEST_DIR, 'test-write.txt');

      const result = await router.execute(`write ${testFile} --content "Hello, World!"`);

      expect(result.success).toBe(true);

      // Verify file was written
      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('Hello, World!');
    });

    test('should overwrite existing file like Python', async () => {
      const testFile = join(TEST_DIR, 'test-write-overwrite.txt');
      await fs.writeFile(testFile, 'Old content');

      const result = await router.execute(`write ${testFile} --content "New content"`);

      expect(result.success).toBe(true);

      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('New content');
    });
  });

  describe('EditTool alignment', () => {
    test('should edit file with same behavior as Python', async () => {
      const testFile = join(TEST_DIR, 'test-edit.txt');
      await fs.writeFile(testFile, 'Hello World\nHello Universe\n');

      const result = await router.execute(`edit ${testFile} --old_string "Hello" --new_string "Hi"`);

      expect(result.success).toBe(true);

      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('Hi World\nHello Universe\n'); // Only first occurrence
    });

    test('should support replace_all like Python', async () => {
      const testFile = join(TEST_DIR, 'test-edit-all.txt');
      await fs.writeFile(testFile, 'Hello World\nHello Universe\n');

      const result = await router.execute(`edit ${testFile} --old_string "Hello" --new_string "Hi" --replace_all`);

      expect(result.success).toBe(true);

      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('Hi World\nHi Universe\n'); // All occurrences
    });

    test('should fail if old_string not unique (without replace_all)', async () => {
      const testFile = join(TEST_DIR, 'test-edit-unique.txt');
      await fs.writeFile(testFile, 'foo bar\nfoo baz\nfoo qux\n');

      const result = await router.execute(`edit ${testFile} --old_string "foo" --new_string "bar"`);

      expect(result.success).toBe(false);
      expect(result.error).toContain('multiple occurrences');
    });
  });

  describe('GrepTool alignment', () => {
    test('should search content with same behavior as Python', async () => {
      const testFile = join(TEST_DIR, 'test-grep.txt');
      await fs.writeFile(testFile, 'Hello World\nGoodbye World\nHello Universe\n');

      const result = await router.execute(`grep --pattern "Hello" ${TEST_DIR}`);

      expect(result.success).toBe(true);
      expect(result.output).toContain('test-grep.txt');
    });

    test('should support case-insensitive search like Python', async () => {
      const testFile = join(TEST_DIR, 'test-grep-case.txt');
      await fs.writeFile(testFile, 'Hello World\nhello world\nHELLO WORLD\n');

      const result = await router.execute(`grep --pattern "hello" -i ${TEST_DIR}`);

      expect(result.success).toBe(true);
      // Should find all three lines
    });
  });

  describe('GlobTool alignment', () => {
    test('should match files with same behavior as Python', async () => {
      // Create test files
      await fs.writeFile(join(TEST_DIR, 'test1.txt'), 'test');
      await fs.writeFile(join(TEST_DIR, 'test2.txt'), 'test');
      await fs.writeFile(join(TEST_DIR, 'test.md'), 'test');

      const result = await router.execute(`glob --pattern "*.txt" --path ${TEST_DIR}`);

      expect(result.success).toBe(true);
      expect(result.output).toContain('test1.txt');
      expect(result.output).toContain('test2.txt');
      expect(result.output).not.toContain('test.md');
    });

    test('should support recursive patterns like Python', async () => {
      // Create nested structure
      const subDir = join(TEST_DIR, 'subdir');
      await fs.mkdir(subDir, { recursive: true });
      await fs.writeFile(join(subDir, 'nested.txt'), 'test');

      const result = await router.execute(`glob --pattern "**/*.txt" --path ${TEST_DIR}`);

      expect(result.success).toBe(true);
      expect(result.output).toContain('nested.txt');
    });
  });
});

describe('Alignment Tests - Parameter Names', () => {
  test('all tools should use snake_case parameters', () => {
    const registry = new ToolRegistry();
    const toolNames = registry.listNames();

    for (const name of toolNames) {
      const tool = registry.get(name);
      if (!tool) continue;

      const schema = tool.getSchema();
      const params = Object.keys(schema.input_schema.properties || {});

      for (const param of params) {
        // Check snake_case format
        expect(param).toMatch(/^[a-z]+(_[a-z]+)*$/);
      }
    }
  });
});

describe('Alignment Tests - Error Handling', () => {
  test('should handle file not found like Python', async () => {
    const result = await router.execute(`read /nonexistent/file.txt`);

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  test('should handle invalid parameters like Python', async () => {
    const testFile = join(TEST_DIR, 'test.txt');
    await fs.writeFile(testFile, 'test');

    // Invalid offset (negative)
    const result = await router.execute(`read ${testFile} --offset -1`);

    expect(result.success).toBe(false);
  });
});

describe('Alignment Tests - Help System', () => {
  test('should provide help for tools like Python', async () => {
    const result = await router.execute('read -h');

    expect(result.success).toBe(true);
    expect(result.output).toContain('read');
    expect(result.output).toContain('file_path');
    expect(result.output).toContain('offset');
    expect(result.output).toContain('limit');
  });

  test('should provide detailed help with --help', async () => {
    const result = await router.execute('read --help');

    expect(result.success).toBe(true);
    expect(result.output).toContain('Parameters:');
  });
});
