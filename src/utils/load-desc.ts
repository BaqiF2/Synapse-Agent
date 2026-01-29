/**
 * Prompt Description Loader
 *
 * Loads tool/prompt descriptions from markdown files with optional template variable substitution.
 *
 * Core Exports:
 * - loadDesc: Loads a markdown file and optionally replaces template variables
 */

import { readFileSync } from 'node:fs';

/**
 * Load a tool/prompt description from a markdown file, with optional substitutions.
 *
 * @param mdPath - Absolute path to the .md file
 * @param substitutions - Optional key-value pairs for template variable replacement (e.g., { "MAX_RESULTS": "20" })
 * @returns The file content with substitutions applied
 *
 * Template syntax uses `${VAR_NAME}` placeholders in the markdown file.
 */
export function loadDesc(
  mdPath: string,
  substitutions?: Record<string, string>
): string {
  let content = readFileSync(mdPath, 'utf-8');
  if (substitutions) {
    for (const [key, value] of Object.entries(substitutions)) {
      content = content.replaceAll(`\${${key}}`, value);
    }
  }
  return content;
}
