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

  save(content: string, extension?: string): string {
    const extensionName = extension ? normalizeExtension(extension) : this.detectExtension(content);
    const filename = `${randomUUID()}.${extensionName}`;
    const filepath = path.join(this.sessionDir, OFFLOADED_DIR_NAME, filename);

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
