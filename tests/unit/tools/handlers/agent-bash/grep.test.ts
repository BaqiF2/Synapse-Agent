/**
 * GrepHandler Tests
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { GrepHandler } from '../../../../../src/tools/handlers/agent-bash/grep.ts';

describe('GrepHandler', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-grep-'));
    fs.writeFileSync(path.join(testDir, 'sample.txt'), 'hello\nworld', 'utf-8');
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should find matches in files', async () => {
    const handler = new GrepHandler();
    const result = await handler.execute(`search hello --path ${testDir}`);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('sample.txt');
    expect(result.stdout).toContain('hello');
  });

  it('should return message when no matches found', async () => {
    const handler = new GrepHandler();
    const result = await handler.execute(`search nomatch --path ${testDir}`);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('No matches found');
  });

  it('should return error for invalid regex', async () => {
    const handler = new GrepHandler();
    const result = await handler.execute(`search [ --path ${testDir}`);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid regex pattern');
  });

  it('should return error for unknown file type', async () => {
    const handler = new GrepHandler();
    const result = await handler.execute(`search hello --type unknown --path ${testDir}`);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown file type');
  });
});
