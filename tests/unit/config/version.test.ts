/**
 * Project version tests
 *
 * Ensures project version is sourced from package.json.
 */

import { describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getProjectVersion } from '../../../src/shared/config/version.ts';

describe('getProjectVersion', () => {
  it('should read version from package.json', () => {
    const packageJsonPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../package.json'
    );
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as {
      version?: string;
    };

    if (!pkg.version) {
      throw new Error('package.json missing version');
    }

    expect(getProjectVersion()).toBe(pkg.version);
  });
});
