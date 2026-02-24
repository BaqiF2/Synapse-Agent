/**
 * EditHandler Tests
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { EditHandler } from '../../../../../src/tools/commands/edit-handler.ts';

describe('EditHandler', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-edit-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should replace first occurrence by default', async () => {
    const handler = new EditHandler();
    const filePath = path.join(testDir, 'file.txt');
    fs.writeFileSync(filePath, 'a a a', 'utf-8');

    const result = await handler.execute(`edit ${filePath} a b`);

    expect(result.exitCode).toBe(0);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('b a a');
  });

  it('should replace all occurrences with --all', async () => {
    const handler = new EditHandler();
    const filePath = path.join(testDir, 'file.txt');
    fs.writeFileSync(filePath, 'a a a', 'utf-8');

    const result = await handler.execute(`edit ${filePath} a b --all`);

    expect(result.exitCode).toBe(0);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('b b b');
  });

  it('should return error when old string is missing', async () => {
    const handler = new EditHandler();
    const filePath = path.join(testDir, 'file.txt');
    fs.writeFileSync(filePath, 'hello', 'utf-8');

    const result = await handler.execute(`edit ${filePath} missing replace`);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('String not found');
  });
});
