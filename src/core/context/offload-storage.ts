import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const OFFLOADED_DIR_NAME = 'offloaded';

function isJsonLike(content: string): boolean {
  try {
    JSON.parse(content);
    return true;
  } catch {
    return false;
  }
}

function normalizeExtension(extension: string): string {
  const trimmed = extension.trim();
  const withoutDot = trimmed.startsWith('.') ? trimmed.slice(1) : trimmed;
  return withoutDot || 'txt';
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class OffloadStorage {
  constructor(private readonly sessionDir: string) {}

  getOffloadedDirPath(): string {
    return path.join(this.sessionDir, OFFLOADED_DIR_NAME);
  }

  listFiles(): string[] {
    const offloadDir = this.getOffloadedDirPath();
    if (!fs.existsSync(offloadDir)) {
      return [];
    }

    const entries = fs.readdirSync(offloadDir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => path.join(offloadDir, entry.name));
  }

  remove(filepath: string): void {
    fs.unlinkSync(filepath);
  }

  save(content: string, extension?: string): string {
    const extensionName = extension ? normalizeExtension(extension) : this.detectExtension(content);
    const filename = `${randomUUID()}.${extensionName}`;
    const filepath = path.join(this.getOffloadedDirPath(), filename);

    try {
      fs.mkdirSync(path.dirname(filepath), { recursive: true });
      fs.writeFileSync(filepath, content, 'utf-8');
      return filepath;
    } catch (error) {
      throw new Error(`Failed to save offloaded content: ${toErrorMessage(error)}`);
    }
  }

  private detectExtension(content: string): string {
    return isJsonLike(content) ? 'json' : 'txt';
  }
}
