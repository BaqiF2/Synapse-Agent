/**
 * GlobHandler Tests
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { GlobHandler } from '../../../../../src/tools/handlers/agent-bash/glob.ts';

describe('GlobHandler', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-glob-'));
    fs.writeFileSync(path.join(testDir, 'a.txt'), 'a', 'utf-8');
    fs.writeFileSync(path.join(testDir, 'b.txt'), 'b', 'utf-8');
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should return files matching pattern', async () => {
    const handler = new GlobHandler();
    const result = await handler.execute(`glob "*.txt" --path ${testDir}`);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('a.txt');
    expect(result.stdout).toContain('b.txt');
  });

  it('should respect max results', async () => {
    const handler = new GlobHandler();
    const result = await handler.execute(`glob "*.txt" --path ${testDir} --max 1`);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Showing 1 of');
  });

  it('should return message for empty match', async () => {
    const handler = new GlobHandler();
    const result = await handler.execute(`glob "nope-*.txt" --path ${testDir}`);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('No files found');
  });
});
