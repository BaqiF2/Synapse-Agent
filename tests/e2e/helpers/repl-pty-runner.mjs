import * as pty from 'node-pty';
import * as fs from 'node:fs';
import * as path from 'node:path';

const bunPath = process.env.REPL_BUN_PATH;
const scriptPath = process.env.REPL_SCRIPT_PATH;
const replCwd = process.env.REPL_CWD || process.cwd();
const replyText = process.env.REPL_REPLY_TEXT || 'Hello! How can I help you today?';

if (!bunPath || !scriptPath) {
  console.error('Missing REPL_BUN_PATH or REPL_SCRIPT_PATH');
  process.exit(1);
}

function ensureSpawnHelperExecutable() {
  if (process.platform === 'win32') return;
  const helperPath = path.join(
    process.cwd(),
    'node_modules',
    'node-pty',
    'prebuilds',
    `${process.platform}-${process.arch}`,
    'spawn-helper'
  );
  try {
    if (!fs.existsSync(helperPath)) return;
    const stats = fs.statSync(helperPath);
    if ((stats.mode & 0o111) === 0) {
      fs.chmodSync(helperPath, 0o755);
    }
  } catch {
    // Ignore chmod errors; spawn will fail if this is critical
  }
}

function waitForOutput(bufferRef, pattern, timeoutMs = 15000, intervalMs = 50) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      const buffer = bufferRef.value;
      const matched =
        typeof pattern === 'string' ? buffer.includes(pattern) : pattern.test(buffer);
      if (matched) {
        clearInterval(timer);
        resolve(buffer);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        clearInterval(timer);
        const patternText = typeof pattern === 'string' ? pattern : pattern.source;
        const tail = buffer.slice(-1000);
        reject(
          new Error(
            `Timeout waiting for output: ${patternText}\n--- Output Tail ---\n${tail}`
          )
        );
      }
    }, intervalMs);
  });
}

function waitForExit(term, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for PTY exit (${timeoutMs}ms)`));
    }, timeoutMs);

    term.onExit((event) => {
      clearTimeout(timeout);
      resolve(event);
    });
  });
}

async function run() {
  ensureSpawnHelperExecutable();

  const bufferRef = { value: '' };
  const term = pty.spawn(bunPath, [scriptPath, 'chat'], {
    name: 'xterm-color',
    cols: 120,
    rows: 40,
    cwd: replCwd,
    env: process.env,
  });

  term.onData((data) => {
    bufferRef.value += data;
  });

  try {
    await waitForOutput(bufferRef, 'You> ', 15000);
    term.write(`hello\r`);

    await waitForOutput(bufferRef, replyText, 15000);
    term.write(`/exit\r`);

    const exitResult = await waitForExit(term, 10000);
    if (exitResult.exitCode !== 0) {
      throw new Error(`Unexpected exit code: ${exitResult.exitCode}`);
    }

    process.stdout.write('PTY_REPL_OK\n');
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    return 1;
  } finally {
    try {
      term.kill();
    } catch {
      // Ignore kill errors
    }
  }
}

const code = await run();
process.exit(code);
