/**
 * Project version utilities
 *
 * Reads version from package.json so CLI and runtime share a single source.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

let cachedVersion: string | null = null;

const PACKAGE_JSON_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../package.json'
);

export function getProjectVersion(): string {
  if (cachedVersion) {
    return cachedVersion;
  }

  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8')) as {
    version?: string;
  };

  if (!pkg.version) {
    throw new Error('package.json missing version');
  }

  cachedVersion = pkg.version;
  return cachedVersion;
}
