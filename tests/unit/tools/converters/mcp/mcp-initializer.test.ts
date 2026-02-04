import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { cleanupMcpTools } from '../../../../../src/tools/converters/mcp/mcp-initializer.ts';

describe('initializeMcpTools', () => {
  let tempDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-mcp-init-'));
    originalCwd = process.cwd();
    originalHome = process.env.HOME;
    process.env.HOME = tempDir;
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env.HOME = originalHome;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('cleanup should remove zero tools when none exist', () => {
    const removed = cleanupMcpTools();
    expect(removed).toBe(0);
  });
});
