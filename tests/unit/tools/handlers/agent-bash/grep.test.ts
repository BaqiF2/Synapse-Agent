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

  it('should accept path as second positional argument', async () => {
    const handler = new GrepHandler();
    const result = await handler.execute(`search hello ${testDir}`);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('sample.txt');
    expect(result.stdout).toContain('hello');
  });

  it('should prefer --path over positional path argument', async () => {
    const handler = new GrepHandler();
    const result = await handler.execute(`search hello --path ${testDir}`);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('sample.txt');
    expect(result.stdout).toContain('hello');
  });

  it('should search in a specific file when path is a file', async () => {
    const filePath = path.join(testDir, 'sample.txt');
    const handler = new GrepHandler();
    const result = await handler.execute(`search hello ${filePath}`);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello');
  });

  it('should support -A option for after-context lines', async () => {
    fs.writeFileSync(path.join(testDir, 'ctx.txt'), 'aaa\nbbb\nccc\nddd\neee', 'utf-8');
    const handler = new GrepHandler();
    const result = await handler.execute(`search bbb --path ${testDir} -A 1 -B 0`);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('bbb');
    expect(result.stdout).toContain('ccc');
    expect(result.stdout).not.toContain('aaa');
  });

  it('should support -B option for before-context lines', async () => {
    fs.writeFileSync(path.join(testDir, 'ctx.txt'), 'aaa\nbbb\nccc\nddd\neee', 'utf-8');
    const handler = new GrepHandler();
    const result = await handler.execute(`search ccc --path ${testDir} -B 1 -A 0`);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('ccc');
    expect(result.stdout).toContain('bbb');
    expect(result.stdout).not.toContain('ddd');
  });

  it('should support -C option for symmetric context lines', async () => {
    fs.writeFileSync(path.join(testDir, 'ctx.txt'), 'aaa\nbbb\nccc\nddd\neee', 'utf-8');
    const handler = new GrepHandler();
    const result = await handler.execute(`search ccc --path ${testDir} -C 1`);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('bbb');
    expect(result.stdout).toContain('ccc');
    expect(result.stdout).toContain('ddd');
  });

  it('should handle -i flag at any position', async () => {
    fs.writeFileSync(path.join(testDir, 'case.txt'), 'Hello\nWORLD', 'utf-8');
    const handler = new GrepHandler();

    // -i 在 pattern 之前
    const result1 = await handler.execute(`search -i hello ${testDir}`);
    expect(result1.exitCode).toBe(0);
    expect(result1.stdout).toContain('Hello');

    // -i 在 pattern 之后
    const result2 = await handler.execute(`search hello ${testDir} -i`);
    expect(result2.exitCode).toBe(0);
    expect(result2.stdout).toContain('Hello');
  });

  it('should normalize backslash-pipe to alternation', async () => {
    fs.writeFileSync(path.join(testDir, 'alt.txt'), 'foo\nbar\nbaz', 'utf-8');
    const handler = new GrepHandler();
    const result = await handler.execute(`search "foo\\|bar" --path ${testDir} -A 0 -B 0`);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('foo');
    expect(result.stdout).toContain('bar');
    expect(result.stdout).not.toContain('baz');
  });

  it('should truncate output when exceeding max lines', async () => {
    // 生成大量匹配行的文件
    const lines = Array.from({ length: 300 }, (_, i) => `match_line_${i}`);
    fs.writeFileSync(path.join(testDir, 'large.txt'), lines.join('\n'), 'utf-8');
    const handler = new GrepHandler();
    const result = await handler.execute(`search match_line --path ${testDir} --max 300`);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('truncated');
  });
});
