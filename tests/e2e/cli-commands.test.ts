/**
 * End-to-End tests for CLI commands.
 *
 * This file tests the complete CLI command execution flow,
 * verifying that all commands work correctly in an integrated environment.
 *
 * Core exports:
 * - CLI command integration tests
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';

const CLI_PATH = join(__dirname, '../../src/entrypoints/cli.ts');
const TEST_DIR = join(__dirname, '../../.test-temp');

/**
 * Execute CLI command and capture output
 */
async function execCLI(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn('bun', ['run', CLI_PATH, ...args], {
      cwd: process.cwd(),
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code || 0,
      });
    });
  });
}

beforeAll(async () => {
  // Create test directory
  await fs.mkdir(TEST_DIR, { recursive: true });
});

afterAll(async () => {
  // Clean up test directory
  await fs.rm(TEST_DIR, { recursive: true, force: true });
});

describe('CLI Commands E2E', () => {
  describe('config command', () => {
    test('should display configuration', async () => {
      const result = await execCLI(['config']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('SYNAPSE_HOME');
      expect(result.stdout).toContain('Tools directory');
      expect(result.stdout).toContain('Skills directory');
    });
  });

  describe('tools command', () => {
    test('should list all tools', async () => {
      const result = await execCLI(['tools']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Available Tools');
      expect(result.stdout).toContain('read');
      expect(result.stdout).toContain('write');
      expect(result.stdout).toContain('edit');
      expect(result.stdout).toContain('grep');
      expect(result.stdout).toContain('glob');
    });

    test('should show detailed info with --verbose', async () => {
      const result = await execCLI(['tools', '--verbose']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Parameters');
      expect(result.stdout).toContain('file_path');
    });

    test('should show specific tool info with --info', async () => {
      const result = await execCLI(['tools', '--info', 'read']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('read');
      expect(result.stdout).toContain('file_path');
      expect(result.stdout).toContain('Parameters');
    });
  });

  describe('skills command', () => {
    test('should list all skills', async () => {
      const result = await execCLI(['skills']);

      expect(result.exitCode).toBe(0);
      // skills may or may not exist, so just check command runs
      expect(result.stdout).toMatch(/(Available Skills|No skills found)/);
    });

    test('should handle search with --search', async () => {
      const result = await execCLI(['skills', '--search', 'test']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Search results');
    });
  });
});

describe('CLI Error Handling', () => {
  test('should show help with --help', async () => {
    const result = await execCLI(['--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage');
  });

  test('should show version with --version', async () => {
    const result = await execCLI(['--version']);

    expect(result.exitCode).toBe(0);
    // Should output version number
  });

  test('should handle invalid command gracefully', async () => {
    const result = await execCLI(['invalid-command']);

    expect(result.exitCode).not.toBe(0);
  });
});
