/**
 * WriteHandler Tests
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { WriteHandler } from '../../../../../src/tools/handlers/agent-bash/write.ts';

describe('WriteHandler', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-write-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should create parent directories and write file', async () => {
    const handler = new WriteHandler();
    const filePath = path.join(testDir, 'nested', 'file.txt');

    const result = await handler.execute(`write ${filePath} "hello"`);

    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('hello');
  });

  it('should overwrite existing file', async () => {
    const handler = new WriteHandler();
    const filePath = path.join(testDir, 'file.txt');

    await handler.execute(`write ${filePath} "first"`);
    await handler.execute(`write ${filePath} "second"`);

    expect(fs.readFileSync(filePath, 'utf-8')).toBe('second');
  });

  it('should return error when target is a directory', async () => {
    const handler = new WriteHandler();
    const dirPath = path.join(testDir, 'dir');
    fs.mkdirSync(dirPath, { recursive: true });

    const result = await handler.execute(`write ${dirPath} "content"`);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Cannot write to directory');
  });
});
