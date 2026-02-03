/**
 * E2E Tests - REPL PTY Integration
 *
 * Uses PTY runner with improved direct testing approach.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawn } from 'node:child_process';
import { DEFAULT_SETTINGS } from '../../../src/config/settings-schema.ts';
import { startMockAnthropicServer, type MockServerHandle } from '../helpers/anthropic-mock.ts';

describe('E2E: REPL PTY', () => {
  let tempDir: string;
  let homeDir: string;
  let synapseDir: string;
  let sessionsDir: string;
  let skillsDir: string;
  let mockServer: MockServerHandle | null;
  let bunPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-pty-e2e-'));
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
      replyText: 'Hello from PTY test!',
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
  //  Test Runner Helper
  // ═══════════════════════════════════════════════════════════════

  async function runPtyTest(
    testName: string,
    testFn: (env: NodeJS.ProcessEnv) => Promise<void>
  ): Promise<boolean> {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: homeDir,
      SYNAPSE_SESSIONS_DIR: sessionsDir,
      ANTHROPIC_API_KEY: 'test-key',
      ANTHROPIC_BASE_URL: mockServer!.baseUrl,
      REPL_BUN_PATH: bunPath,
      REPL_SCRIPT_PATH: path.join(process.cwd(), 'src', 'cli', 'index.ts'),
      REPL_CWD: tempDir,
      REPL_TEST_NAME: testName,
    };

    try {
      await testFn(env);
      return true;
    } catch (error) {
      console.log(`❌ ${testName}: ${error}`);
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  Test Cases
  // ═══════════════════════════════════════════════════════════════

  it(
    'should start REPL and show prompt',
    async () => {
      const passed = await runPtyTest('prompt-test', async (env) => {
        const runnerPath = path.join(process.cwd(), 'tests', 'e2e', 'cli', 'direct-runner.mjs');

        const { stdout } = await runScript(runnerPath, {
          ...env,
          REPL_INPUT: 'hello\r\n/exit\r\n',
          REPL_EXPECT: 'You>',
        });

        expect(stdout).toContain('You>');
        expect(stdout).toContain('Synapse Agent');
      });

      expect(passed).toBe(true);
    },
    { timeout: 60000 }
  );

  it(
    'should execute shell command !echo',
    async () => {
      const passed = await runPtyTest('shell-test', async (env) => {
        const runnerPath = path.join(process.cwd(), 'tests', 'e2e', 'cli', 'direct-runner.mjs');

        const { stdout } = await runScript(runnerPath, {
          ...env,
          REPL_INPUT: '!echo "hello-pty"\r\n/exit\r\n',
          REPL_EXPECT: 'hello-pty',
        });

        expect(stdout).toContain('hello-pty');
      });

      expect(passed).toBe(true);
    },
    { timeout: 60000 }
  );

  it(
    'should read file using read tool',
    async () => {
      const testFile = path.join(tempDir, 'test-file.txt');
      fs.writeFileSync(testFile, 'Line 1\nLine 2\nLine 3\n', 'utf-8');

      const passed = await runPtyTest('read-test', async (env) => {
        const runnerPath = path.join(process.cwd(), 'tests', 'e2e', 'cli', 'direct-runner.mjs');

        const { stdout } = await runScript(runnerPath, {
          ...env,
          REPL_INPUT: `read ${testFile}\r\n/exit\r\n`,
          REPL_EXPECT: 'Line 1',
        });

        expect(stdout).toContain('Line 1');
        expect(stdout).toContain('Line 3');
      });

      expect(passed).toBe(true);
    },
    { timeout: 60000 }
  );

  it(
    'should write file using write tool',
    async () => {
      const testFile = path.join(tempDir, 'write-test.txt');

      const passed = await runPtyTest('write-test', async (env) => {
        const runnerPath = path.join(process.cwd(), 'tests', 'e2e', 'cli', 'direct-runner.mjs');

        const { stdout } = await runScript(runnerPath, {
          ...env,
          REPL_INPUT: `write ${testFile} "P1 content"\r\n/exit\r\n`,
          REPL_EXPECT: 'success',
        });

        expect(stdout).toContain('success');
        expect(fs.existsSync(testFile)).toBe(true);
      });

      expect(passed).toBe(true);
    },
    { timeout: 60000 }
  );

  it(
    'should handle special command /help',
    async () => {
      const passed = await runPtyTest('help-test', async (env) => {
        const runnerPath = path.join(process.cwd(), 'tests', 'e2e', 'cli', 'direct-runner.mjs');

        const { stdout } = await runScript(runnerPath, {
          ...env,
          REPL_INPUT: '/help\r\n/exit\r\n',
          REPL_EXPECT: '/exit',
        });

        expect(stdout).toContain('/exit');
        expect(stdout).toContain('/clear');
      });

      expect(passed).toBe(true);
    },
    { timeout: 60000 }
  );

  it(
    'should receive agent response',
    async () => {
      const passed = await runPtyTest('agent-test', async (env) => {
        const runnerPath = path.join(process.cwd(), 'tests', 'e2e', 'cli', 'direct-runner.mjs');

        const { stdout } = await runScript(runnerPath, {
          ...env,
          REPL_INPUT: 'Hello\r\n/exit\r\n',
          REPL_EXPECT: 'Hello from PTY test!',
        });

        expect(stdout).toContain('Hello from PTY test!');
      });

      expect(passed).toBe(true);
    },
    { timeout: 90000 }
  );
});

// ═══════════════════════════════════════════════════════════════
//  Helper Functions
// ═══════════════════════════════════════════════════════════════

function runScript(
  runnerPath: string,
  env: NodeJS.ProcessEnv
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [runnerPath], {
      cwd: process.cwd(),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      resolve({ exitCode: code ?? -1, stdout, stderr });
    });
  });
}
