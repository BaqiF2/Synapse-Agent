/**
 * ReadHandler Tests
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ReadHandler, parseReadCommand } from '../../../../../src/tools/handlers/agent-bash/read.ts';

describe('ReadHandler', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-read-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should parse command arguments', () => {
    const args = parseReadCommand('read ./file.txt --offset 1 --limit 2');

    expect(args.filePath).toBe('./file.txt');
    expect(args.offset).toBe(1);
    expect(args.limit).toBe(2);
  });

  it('should read file with offset and limit', async () => {
    const filePath = path.join(testDir, 'sample.txt');
    fs.writeFileSync(filePath, 'a\nb\nc', 'utf-8');

    const handler = new ReadHandler();
    const result = await handler.execute(`read ${filePath} --offset 1 --limit 1`);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('\t');
    expect(result.stdout).toContain('b');
  });

  it('should return error when file is missing', async () => {
    const handler = new ReadHandler();
    const result = await handler.execute(`read ${path.join(testDir, 'missing.txt')}`);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('File not found');
  });
});
