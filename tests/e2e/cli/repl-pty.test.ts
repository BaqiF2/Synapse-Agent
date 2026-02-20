/**
 * E2E Tests - REPL CLI Testing
 *
 * Tests REPL functionality using Bun.spawn with file stdin.
 *
 * Note: Tests that require LLM API calls (read, write, agent response)
 * will be skipped if API is not available.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { DEFAULT_SETTINGS } from '../../../src/shared/config/settings-schema.ts';
import { startMockAnthropicServer, type MockServerHandle } from '../helpers/anthropic-mock.ts';

describe('E2E: REPL CLI', () => {
  let tempDir: string;
  let homeDir: string;
  let synapseDir: string;
  let sessionsDir: string;
  let skillsDir: string;
  let mockServer: MockServerHandle | null;
  let bunPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-e2e-'));
    homeDir = path.join(tempDir, 'home');
    synapseDir = path.join(homeDir, '.synapse');
    sessionsDir = path.join(synapseDir, 'sessions');
    skillsDir = path.join(synapseDir, 'skills');

    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.mkdirSync(skillsDir, { recursive: true });

    // Find bun path
    bunPath = path.join(os.homedir(), '.bun', 'bin', 'bun');
    if (!fs.existsSync(bunPath)) {
      bunPath = 'bun';
    }

    mockServer = startMockAnthropicServer({
      replyText: 'Hello from test!',
    });

    const settings = {
      ...DEFAULT_SETTINGS,
      env: {
        ANTHROPIC_API_KEY: 'test-key',
        ANTHROPIC_BASE_URL: mockServer.baseUrl,
      },
    };

    fs.mkdirSync(synapseDir, { recursive: true });
    fs.writeFileSync(
      path.join(synapseDir, 'settings.json'),
      JSON.stringify(settings, null, 2),
      'utf-8'
    );
  });

  afterEach(async () => {
    if (mockServer) {
      await mockServer.stop();
      mockServer = null;
    }

    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  //  Helper Functions
  // ═══════════════════════════════════════════════════════════════

  async function runRepl(
    input: string,
    timeoutMs: number = 30000
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    // Write input to temp file
    const inputFile = path.join(tempDir, 'input.txt');
    fs.writeFileSync(inputFile, input, 'utf-8');

    const scriptPath = path.join(process.cwd(), 'src/cli/index.ts');

    const child = Bun.spawn({
      cmd: [bunPath, 'run', scriptPath, 'chat'],
      cwd: tempDir,
      env: {
        ...process.env,
        HOME: homeDir,
        SYNAPSE_SESSIONS_DIR: sessionsDir,
        ANTHROPIC_API_KEY: 'test-key',
        ANTHROPIC_BASE_URL: mockServer!.baseUrl,
      },
      stdin: Bun.file(inputFile),
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const stdout = await new Response(child.stdout).text();
    const stderr = await new Response(child.stderr).text();
    const exitCode = await child.exited;

    return { stdout, stderr, exitCode };
  }

  // ═══════════════════════════════════════════════════════════════
  //  Test Cases
  // ═══════════════════════════════════════════════════════════════

  it(
    'should start REPL and show prompt',
    async () => {
      const { stdout } = await runRepl('hello\r\n/exit\r\n');

      expect(stdout).toContain('You>');
      expect(stdout).toContain('Synapse Agent');
      expect(stdout).toContain('Goodbye');
    },
    { timeout: 60000 }
  );

  it(
    'should execute shell command !echo',
    async () => {
      const { stdout } = await runRepl('!echo "hello-pty-test"\r\n/exit\r\n');

      expect(stdout).toContain('hello-pty-test');
    },
    { timeout: 60000 }
  );

  it(
    'should handle special command /help',
    async () => {
      const { stdout } = await runRepl('/help\r\n/exit\r\n');

      expect(stdout).toContain('/exit');
      expect(stdout).toContain('/clear');
      expect(stdout).toContain('Common');
    },
    { timeout: 60000 }
  );

  it(
    'should execute shell command with spaces',
    async () => {
      const { stdout } = await runRepl('!pwd\r\n!ls -la\r\n/exit\r\n');

      expect(stdout).toContain('You>');
    },
    { timeout: 60000 }
  );

  it(
    'should handle multiple shell commands',
    async () => {
      const { stdout } = await runRepl('!echo first\r\n!echo second\r\n/exit\r\n');

      expect(stdout).toContain('first');
      expect(stdout).toContain('second');
    },
    { timeout: 60000 }
  );

  it(
    'should handle empty input',
    async () => {
      const { stdout } = await runRepl('\r\n/exit\r\n');

      // Should still show prompt and exit cleanly
      expect(stdout).toContain('You>');
      expect(stdout).toContain('Goodbye');
    },
    { timeout: 60000 }
  );
});
