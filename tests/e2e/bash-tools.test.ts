/**
 * E2E Tests - Bash Tools Integration
 *
 * Tests the complete flow of Bash tool execution including:
 * - Native Shell Command commands (Layer 1)
 * - Agent Shell Command tools (Layer 2): read, write, edit, glob, grep
 * - Bash session persistence
 *
 * @module tests/e2e/bash-tools
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { BashSession } from '../../src/tools/bash-session.js';
import { BashRouter, CommandType } from '../../src/tools/bash-router.js';

// Test configuration
const TEST_DIR = path.join(os.tmpdir(), `synapse-e2e-${Date.now()}`);
const TEST_FILE = path.join(TEST_DIR, 'test-file.txt');

describe('E2E: Bash Tools Integration', () => {
  let session: BashSession;
  let router: BashRouter;

  beforeAll(() => {
    // Create test directory
    fs.mkdirSync(TEST_DIR, { recursive: true });

    // Initialize session and router
    session = new BashSession();
    router = new BashRouter(session);
  });

  afterAll(() => {
    // Cleanup
    session.cleanup();
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('Scenario 1: Native Shell Command Commands', () => {
    test('should execute pwd command', async () => {
      const result = await router.route('pwd');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBeTruthy();
    });

    test('should execute ls command', async () => {
      const result = await router.route('ls -la');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('total');
    });

    test('should execute echo command', async () => {
      const result = await router.route('echo "Hello Synapse"');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Hello Synapse');
    });

    test('should maintain session state (cd + pwd)', async () => {
      await router.route(`cd ${TEST_DIR}`);
      const result = await router.route('pwd');
      expect(result.stdout).toContain(TEST_DIR);
    });

    test('should persist environment variables', async () => {
      await router.route('export TEST_VAR="synapse_test"');
      const result = await router.route('echo $TEST_VAR');
      expect(result.stdout).toContain('synapse_test');
    });
  });

  describe('Scenario 2: Agent Shell Command - Read Tool', () => {
    beforeAll(() => {
      // Create test file
      fs.writeFileSync(TEST_FILE, 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\n');
    });

    test('should read entire file', async () => {
      const result = await router.route(`read ${TEST_FILE}`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Line 1');
      expect(result.stdout).toContain('Line 5');
    });

    test('should read file with offset', async () => {
      // offset 2 means start from line 3 (0-based indexing)
      const result = await router.route(`read ${TEST_FILE} --offset 2`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Line 3');
    });

    test('should read file with limit', async () => {
      const result = await router.route(`read ${TEST_FILE} --limit 2`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Line 1');
      expect(result.stdout).toContain('Line 2');
    });

    test('should handle non-existent file gracefully', async () => {
      const result = await router.route(`read ${TEST_DIR}/nonexistent.txt`);
      expect(result.exitCode).not.toBe(0);
    });
  });

  describe('Scenario 2: Agent Shell Command - Write Tool', () => {
    const writeTestFile = path.join(TEST_DIR, 'write-test.txt');

    test('should write content to new file', async () => {
      const content = 'Test content written by Synapse';
      const result = await router.route(`write ${writeTestFile} "${content}"`);
      expect(result.exitCode).toBe(0);

      const fileContent = fs.readFileSync(writeTestFile, 'utf-8');
      expect(fileContent).toBe(content);
    });

    test('should overwrite existing file', async () => {
      const newContent = 'New content';
      const result = await router.route(`write ${writeTestFile} "${newContent}"`);
      expect(result.exitCode).toBe(0);

      const fileContent = fs.readFileSync(writeTestFile, 'utf-8');
      expect(fileContent).toBe(newContent);
    });

    test('should create parent directories', async () => {
      const nestedFile = path.join(TEST_DIR, 'nested', 'deep', 'file.txt');
      const result = await router.route(`write ${nestedFile} "Nested content"`);
      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(nestedFile)).toBe(true);
    });
  });

  describe('Scenario 2: Agent Shell Command - Edit Tool', () => {
    const editTestFile = path.join(TEST_DIR, 'edit-test.txt');

    beforeAll(() => {
      fs.writeFileSync(editTestFile, 'Hello World\nGoodbye World\nHello Again');
    });

    test('should replace first occurrence', async () => {
      const result = await router.route(`edit ${editTestFile} "Hello" "Hi"`);
      expect(result.exitCode).toBe(0);

      const content = fs.readFileSync(editTestFile, 'utf-8');
      expect(content).toContain('Hi World');
      expect(content).toContain('Hello Again'); // Second occurrence unchanged
    });

    test('should replace all occurrences with --all flag', async () => {
      // Reset file
      fs.writeFileSync(editTestFile, 'Hello World\nGoodbye World\nHello Again');

      const result = await router.route(`edit ${editTestFile} "Hello" "Hi" --all`);
      expect(result.exitCode).toBe(0);

      const content = fs.readFileSync(editTestFile, 'utf-8');
      expect(content).toContain('Hi World');
      expect(content).toContain('Hi Again');
      expect(content).not.toContain('Hello');
    });
  });

  describe('Scenario 2: Agent Shell Command - Glob Tool', () => {
    beforeAll(() => {
      // Create test files
      fs.writeFileSync(path.join(TEST_DIR, 'file1.ts'), '');
      fs.writeFileSync(path.join(TEST_DIR, 'file2.ts'), '');
      fs.writeFileSync(path.join(TEST_DIR, 'file3.js'), '');
      fs.mkdirSync(path.join(TEST_DIR, 'subdir'), { recursive: true });
      fs.writeFileSync(path.join(TEST_DIR, 'subdir', 'nested.ts'), '');
    });

    test('should find files matching pattern', async () => {
      const result = await router.route(`glob "*.ts" --path ${TEST_DIR}`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('file1.ts');
      expect(result.stdout).toContain('file2.ts');
    });

    test('should find files recursively', async () => {
      const result = await router.route(`glob "**/*.ts" --path ${TEST_DIR}`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('nested.ts');
    });
  });

  describe('Scenario 2: Agent Shell Command - Grep Tool', () => {
    beforeAll(() => {
      // Create a subdirectory with a test file for grep
      const grepDir = path.join(TEST_DIR, 'grep-test-dir');
      fs.mkdirSync(grepDir, { recursive: true });
      fs.writeFileSync(
        path.join(grepDir, 'test.js'),
        'function hello() {\n  console.log("Hello");\n}\n\nfunction world() {\n  return "World";\n}'
      );
    });

    test('should search for pattern in directory', async () => {
      const grepDir = path.join(TEST_DIR, 'grep-test-dir');
      const result = await router.route(`grep "function" --path ${grepDir}`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('function');
    });

    test('should support regex patterns', async () => {
      const grepDir = path.join(TEST_DIR, 'grep-test-dir');
      const result = await router.route(`grep "console\\.log" --path ${grepDir}`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('console.log');
    });
  });

  describe('Session Management', () => {
    test('should restart session when requested', async () => {
      // Set a variable
      await router.route('export RESTART_TEST="before"');
      let result = await router.route('echo $RESTART_TEST');
      expect(result.stdout).toContain('before');

      // Restart and check variable is gone
      result = await router.route('echo $RESTART_TEST', true);
      expect(result.stdout.trim()).toBe('');
    });
  });
});
