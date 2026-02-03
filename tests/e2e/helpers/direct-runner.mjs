/**
 * Direct REPL PTY Runner
 *
 * Simplified PTY runner for direct REPL testing.
 */

import * as pty from 'node-pty';
import * as fs from 'node:fs';
import * as path from 'node:path';

const bunPath = process.env.REPL_BUN_PATH || 'bun';
const scriptPath = process.env.REPL_SCRIPT_PATH || path.join(process.cwd(), 'src', 'cli', 'index.ts');
const replCwd = process.env.REPL_CWD || process.cwd();
const input = process.env.REPL_INPUT || '/exit\r\n';
const expectPattern = process.env.REPL_EXPECT || 'You>';

if (!fs.existsSync(bunPath)) {
  console.error(`❌ Bun not found: ${bunPath}`);
  process.exit(1);
}

if (!fs.existsSync(scriptPath)) {
  console.error(`❌ Script not found: ${scriptPath}`);
  process.exit(1);
}

async function run() {
  const buffer = { value: '' };

  console.log(`🚀 Starting REPL (${path.basename(scriptPath)})...`);

  const term = pty.spawn(bunPath, ['run', scriptPath, 'chat'], {
    name: 'xterm-color',
    cols: 120,
    rows: 40,
    cwd: replCwd,
    env: process.env,
  });

  term.onData((data) => {
    buffer.value += data;
    process.stdout.write(data);
  });

  try {
    // Wait for prompt
    console.log('⏳ Waiting for prompt...');
    await waitFor(buffer, 'You>', 30000);

    // Send input
    console.log('📤 Sending input...');
    term.write(input);

    // Wait for expected pattern
    console.log(`⏳ Waiting for: ${expectPattern}...`);
    await waitFor(buffer, expectPattern, 30000);

    // Check if exit
    if (input.includes('/exit')) {
      await waitForExit(term, 10000);
    }

    console.log('✅ PTY_TEST_OK');
    term.kill();
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Error: ${message}`);
    console.log('--- Output ---');
    console.log(buffer.value.slice(-500));
    term.kill();
    process.exit(1);
  }
}

function waitFor(
  buffer: { value: string },
  pattern: string,
  timeoutMs: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      if (buffer.value.includes(pattern)) {
        clearInterval(interval);
        resolve(buffer.value);
        return;
      }

      if (Date.now() - start >= timeoutMs) {
        clearInterval(interval);
        reject(new Error(`Timeout waiting for: ${pattern}`));
      }
    }, 100);
  });
}

function waitForExit(term: pty.IPty, timeoutMs: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout waiting for exit'));
    }, timeoutMs);

    term.onExit(() => {
      clearTimeout(timeout);
      resolve(0);
    });
  });
}

run();
