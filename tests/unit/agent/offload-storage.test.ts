import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { OffloadStorage } from '../../../src/core/offload-storage.ts';

describe('OffloadStorage', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(
      os.tmpdir(),
      `synapse-offload-storage-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    );
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('save 保存纯文本内容并返回 .txt 路径', () => {
    const storage = new OffloadStorage(testDir);
    const filepath = storage.save('plain text content');

    expect(filepath).toMatch(/offloaded\/[a-f0-9-]+\.txt$/);
    expect(fs.existsSync(filepath)).toBe(true);
    expect(fs.readFileSync(filepath, 'utf-8')).toBe('plain text content');
  });

  it('save 自动检测 JSON 内容并使用 .json 扩展名', () => {
    const storage = new OffloadStorage(testDir);
    const filepath = storage.save('{"key":"value"}');

    expect(filepath).toMatch(/\.json$/);
  });

  it('save 首次保存时自动创建 offloaded 目录', () => {
    const storage = new OffloadStorage(testDir);
    const offloadedDir = path.join(testDir, 'offloaded');

    expect(fs.existsSync(offloadedDir)).toBe(false);
    storage.save('content');
    expect(fs.existsSync(offloadedDir)).toBe(true);
  });

  it('save 文件写入失败时抛出异常', () => {
    const readOnlyDir = path.join(testDir, 'readonly');
    const offloadedDir = path.join(readOnlyDir, 'offloaded');
    fs.mkdirSync(offloadedDir, { recursive: true });
    fs.chmodSync(offloadedDir, 0o500);

    const storage = new OffloadStorage(readOnlyDir);

    try {
      expect(() => storage.save('content')).toThrow();
    } finally {
      fs.chmodSync(offloadedDir, 0o700);
    }
  });
});
