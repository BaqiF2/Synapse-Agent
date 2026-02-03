/**
 * E2E Tests - REPL PTY Integration
 *
 * Uses a PTY to exercise the real REPL output stream.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { DEFAULT_SETTINGS } from '../../src/config/settings-schema.ts';
import { startMockAnthropicServer, type MockServerHandle } from './helpers/anthropic-mock.ts';

describe('E2E: REPL PTY', () => {
  let tempDir: string;
  let homeDir: string;
  let synapseDir: string;
  let sessionsDir: string;
  let skillsDir: string;
  let mockServer: MockServerHandle | null;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-pty-e2e-'));
    homeDir = path.join(tempDir, 'home');
    synapseDir = path.join(homeDir, '.synapse');
    sessionsDir = path.join(synapseDir, 'sessions');
    skillsDir = path.join(synapseDir, 'skills');

    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.mkdirSync(skillsDir, { recursive: true });

    mockServer = startMockAnthropicServer({
      replyText: 'Hello! How can I help you today?',
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

    // Environment prepared; REPL will be launched by the PTY runner
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

  it(
    'should emit agent reply in output stream',
    async () => {
      if (!mockServer) {
        throw new Error('Mock server not initialized');
      }

      const runnerPath = path.join(
        process.cwd(),
        'tests',
        'e2e',
        'helpers',
        'repl-pty-runner.mjs'
      );
      const scriptPath = path.join(process.cwd(), 'src', 'cli', 'index.ts');

      const env: NodeJS.ProcessEnv = {
        ...process.env,
        HOME: homeDir,
        SYNAPSE_SESSIONS_DIR: sessionsDir,
        ANTHROPIC_API_KEY: 'test-key',
        ANTHROPIC_BASE_URL: mockServer.baseUrl,
        REPL_BUN_PATH: process.execPath,
        REPL_SCRIPT_PATH: scriptPath,
        REPL_CWD: tempDir,
        REPL_REPLY_TEXT: 'Hello! How can I help you today?',
      };

      const { exitCode, stdout, stderr } = await runNodeRunner(runnerPath, env);
      if (exitCode !== 0) {
        throw new Error(`PTY runner failed (${exitCode})\nstdout:\n${stdout}\nstderr:\n${stderr}`);
      }

      expect(stdout).toContain('PTY_REPL_OK');
    },
    { timeout: 30000 }
  );
});

function runNodeRunner(
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
