/**
 * Script Docstring Parser
 *
 * This module parses docstrings from script files to extract metadata
 * including description, parameters, return values, and examples.
 * Supports Python, Shell, TypeScript, and JavaScript scripts.
 *
 * @module docstring-parser
 *
 * Core Exports:
 * - DocstringParser: Parses script docstrings into structured metadata
 * - parseDocstring: Convenience function for parsing
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ScriptMetadata, ScriptParam, SupportedExtension } from './skill-structure.js';

/**
 * Raw parsed docstring content
 */
interface RawDocstring {
  description: string;
  params: Array<{
    name: string;
    type: string;
    description: string;
    required: boolean;
    default?: string;
  }>;
  returns?: string;
  examples: string[];
}

/**
 * DocstringParser
 *
 * Parses docstrings from various script types to extract metadata.
 * Supports the following formats:
 * - Python: Triple-quoted docstrings (""" ... """)
 * - Shell: Comment blocks starting with #
 * - TypeScript/JavaScript: JSDoc style comments (/** ... *\/)
 */
export class DocstringParser {
  /**
   * Parses a script file and extracts metadata
   *
   * @param scriptPath - Path to the script file
   * @returns Script metadata or null if parsing fails
   */
  public parseFile(scriptPath: string): ScriptMetadata | null {
    if (!fs.existsSync(scriptPath)) {
      return null;
    }

    const content = fs.readFileSync(scriptPath, 'utf-8');
    const ext = path.extname(scriptPath) as SupportedExtension;
    const name = path.basename(scriptPath, ext);

    const rawDocstring = this.extractDocstring(content, ext);

    return {
      name,
      description: rawDocstring.description || undefined,
      params: rawDocstring.params.map((p) => ({
        name: p.name,
        type: this.normalizeType(p.type),
        description: p.description || undefined,
        required: p.required,
        default: p.default !== undefined ? this.parseDefaultValue(p.default) : undefined,
      })),
      returns: rawDocstring.returns,
      examples: rawDocstring.examples,
      extension: ext,
      path: scriptPath,
    };
  }

  /**
   * Extracts docstring based on file extension
   */
  private extractDocstring(content: string, ext: SupportedExtension): RawDocstring {
    switch (ext) {
      case '.py':
        return this.parsePythonDocstring(content);
      case '.sh':
        return this.parseShellDocstring(content);
      case '.ts':
      case '.js':
        return this.parseJSDocstring(content);
      default:
        return { description: '', params: [], examples: [] };
    }
  }

  /**
   * Parses Python triple-quoted docstring
   */
  private parsePythonDocstring(content: string): RawDocstring {
    const result: RawDocstring = { description: '', params: [], examples: [] };

    // Match triple-quoted docstring
    const docstringMatch = content.match(/^[^'"]*?(['"]){3}([\s\S]*?)\1{3}/m);
    if (!docstringMatch) {
      return result;
    }

    const docstring = docstringMatch[2];
    if (!docstring) {
      return result;
    }
    const lines = docstring.split('\n');

    let currentSection = 'description';
    let descriptionLines: string[] = [];
    let currentParam: { name: string; type: string; description: string; required: boolean; default?: string } | null =
      null;

    for (const line of lines) {
      const trimmed = line.trim();

      // Detect section headers
      if (/^(Parameters?|Args?|Arguments?):?\s*$/i.test(trimmed)) {
        currentSection = 'params';
        continue;
      }
      if (/^(Returns?|Return value):?\s*$/i.test(trimmed)) {
        currentSection = 'returns';
        continue;
      }
      if (/^(Examples?|Usage):?\s*$/i.test(trimmed)) {
        currentSection = 'examples';
        continue;
      }
      if (/^(Description):?\s*$/i.test(trimmed)) {
        currentSection = 'description';
        continue;
      }

      switch (currentSection) {
        case 'description':
          if (trimmed) {
            descriptionLines.push(trimmed);
          }
          break;

        case 'params': {
          // Match parameter: name (type): description
          // Or: --name (type): description
          const paramMatch = trimmed.match(/^[-]*([\w-]+)\s*\(([^)]+)\):\s*(.*)$/);
          if (paramMatch) {
            if (currentParam) {
              result.params.push(currentParam);
            }
            const name = paramMatch[1] ?? '';
            const typeStr = paramMatch[2] ?? 'string';
            const desc = paramMatch[3] ?? '';
            if (!name) {
              break;
            }
            const { type, required, defaultValue } = this.parseParamType(typeStr);
            currentParam = {
              name: name.replace(/^-+/, ''),
              type,
              description: desc,
              required,
              default: defaultValue,
            };
          } else if (currentParam && trimmed) {
            // Continuation of previous param description
            currentParam.description += ' ' + trimmed;
          }
          break;
        }

        case 'returns':
          if (trimmed) {
            result.returns = (result.returns || '') + trimmed + ' ';
          }
          break;

        case 'examples':
          if (trimmed) {
            result.examples.push(trimmed);
          }
          break;
      }
    }

    if (currentParam) {
      result.params.push(currentParam);
    }

    result.description = descriptionLines.join(' ').trim();
    result.returns = result.returns?.trim();

    return result;
  }

  /**
   * Parses Shell comment-based docstring
   */
  private parseShellDocstring(content: string): RawDocstring {
    const result: RawDocstring = { description: '', params: [], examples: [] };

    // Extract header comments (lines starting with #)
    const lines = content.split('\n');
    const commentLines: string[] = [];
    let foundShebang = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('#!')) {
        foundShebang = true;
        continue;
      }

      if (trimmed.startsWith('#')) {
        commentLines.push(trimmed.replace(/^#\s?/, ''));
      } else if (trimmed && foundShebang) {
        // Stop at first non-comment line after shebang
        break;
      }
    }

    let currentSection = 'description';
    let descriptionLines: string[] = [];
    let currentParam: { name: string; type: string; description: string; required: boolean; default?: string } | null =
      null;

    for (const line of commentLines) {
      const trimmed = line.trim();

      // Detect section headers
      if (/^(Parameters?|Args?|Arguments?):?\s*$/i.test(trimmed)) {
        currentSection = 'params';
        continue;
      }
      if (/^(Returns?|Return value):?\s*$/i.test(trimmed)) {
        currentSection = 'returns';
        continue;
      }
      if (/^(Examples?|Usage):?\s*$/i.test(trimmed)) {
        currentSection = 'examples';
        continue;
      }
      if (/^(Description):?\s*$/i.test(trimmed)) {
        currentSection = 'description';
        continue;
      }

      switch (currentSection) {
        case 'description':
          if (trimmed && !trimmed.match(/^[\w-]+ - /)) {
            descriptionLines.push(trimmed);
          } else if (trimmed.match(/^[\w-]+ - /)) {
            // Script name - description format
            const match = trimmed.match(/^[\w-]+ - (.+)$/);
            const summary = match?.[1];
            if (summary) {
              descriptionLines.push(summary);
            }
          }
          break;

        case 'params': {
          // Match: $1 (type): description or --option=value (type): description
          const paramMatch = trimmed.match(/^[\$]*(\d+|[\w-]+)(?:=\w+)?\s*\(([^)]+)\):\s*(.*)$/);
          if (paramMatch) {
            if (currentParam) {
              result.params.push(currentParam);
            }
            const name = paramMatch[1] ?? '';
            const typeStr = paramMatch[2] ?? 'string';
            const desc = paramMatch[3] ?? '';
            if (!name) {
              break;
            }
            const { type, required, defaultValue } = this.parseParamType(typeStr);
            currentParam = {
              name: name.replace(/^-+/, ''),
              type,
              description: desc,
              required,
              default: defaultValue,
            };
          } else if (currentParam && trimmed) {
            currentParam.description += ' ' + trimmed;
          }
          break;
        }

        case 'returns':
          if (trimmed) {
            result.returns = (result.returns || '') + trimmed + ' ';
          }
          break;

        case 'examples':
          if (trimmed) {
            result.examples.push(trimmed);
          }
          break;
      }
    }

    if (currentParam) {
      result.params.push(currentParam);
    }

    result.description = descriptionLines.join(' ').trim();
    result.returns = result.returns?.trim();

    return result;
  }

  /**
   * Parses JSDoc-style docstring (TypeScript/JavaScript)
   */
  private parseJSDocstring(content: string): RawDocstring {
    const result: RawDocstring = { description: '', params: [], examples: [] };

    // Match JSDoc comment block
    const jsdocMatch = content.match(/\/\*\*([\s\S]*?)\*\//);
    if (!jsdocMatch) {
      return result;
    }

    const jsdoc = jsdocMatch[1];
    if (!jsdoc) {
      return result;
    }
    const lines = jsdoc.split('\n').map((l) => l.replace(/^\s*\*\s?/, '').trim());

    let currentSection = 'description';
    let descriptionLines: string[] = [];

    for (const line of lines) {
      // Check for JSDoc tags
      if (line.startsWith('@param')) {
        const paramMatch = line.match(/@param\s+(?:\{([^}]+)\}\s+)?(\w+)\s*-?\s*(.*)$/);
        if (paramMatch) {
          const type = paramMatch[1] ?? 'string';
          const name = paramMatch[2] ?? '';
          const desc = paramMatch[3] ?? '';
          if (!name) {
            continue;
          }
          const { type: normalizedType, required, defaultValue } = this.parseParamType(type);
          result.params.push({
            name,
            type: normalizedType,
            description: desc,
            required,
            default: defaultValue,
          });
        }
        continue;
      }

      if (line.startsWith('@returns') || line.startsWith('@return')) {
        const returnMatch = line.match(/@returns?\s+(?:\{([^}]+)\}\s+)?(.*)$/);
        if (returnMatch) {
          const returns = returnMatch[2] || returnMatch[1];
          if (returns) {
            result.returns = returns;
          }
        }
        continue;
      }

      if (line.startsWith('@example')) {
        currentSection = 'examples';
        continue;
      }

      if (line.startsWith('@')) {
        currentSection = 'other';
        continue;
      }

      switch (currentSection) {
        case 'description':
          if (line && !line.startsWith('*')) {
            descriptionLines.push(line);
          }
          break;
        case 'examples':
          if (line) {
            result.examples.push(line);
          }
          break;
      }
    }

    result.description = descriptionLines.join(' ').trim();

    return result;
  }

  /**
   * Parses parameter type string to extract type, required flag, and default
   */
  private parseParamType(typeStr: string): { type: string; required: boolean; defaultValue?: string } {
    let type = typeStr.trim();
    let required = true;
    let defaultValue: string | undefined;

    // Check for default value: (type, default: "value")
    const defaultMatch = type.match(/,?\s*default:?\s*["']?([^"')]+)["']?/i);
    if (defaultMatch) {
      const rawDefault = defaultMatch[1];
      if (rawDefault) {
        defaultValue = rawDefault.trim();
      }
      type = type.replace(defaultMatch[0], '').trim();
      required = false;
    }

    // Check for optional marker
    if (type.includes('optional') || type.includes('?')) {
      required = false;
      type = type.replace(/\s*,?\s*optional\s*/i, '').replace(/\?/g, '').trim();
    }

    return { type, required, defaultValue };
  }

  /**
   * Normalizes type string to standard type
   */
  private normalizeType(type: string): ScriptParam['type'] {
    const lower = type.toLowerCase();

    if (lower.includes('str') || lower.includes('text')) return 'string';
    if (lower.includes('int') || lower.includes('float') || lower.includes('num')) return 'number';
    if (lower.includes('bool')) return 'boolean';
    if (lower.includes('array') || lower.includes('list')) return 'array';
    if (lower.includes('object') || lower.includes('dict') || lower.includes('map')) return 'object';

    return 'string';
  }

  /**
   * Parses default value string to appropriate type
   */
  private parseDefaultValue(value: string): unknown {
    // Try to parse as JSON
    try {
      return JSON.parse(value);
    } catch {
      // Return as string
      return value;
    }
  }
}

/**
 * Convenience function to parse a script file
 */
export function parseDocstring(scriptPath: string): ScriptMetadata | null {
  const parser = new DocstringParser();
  return parser.parseFile(scriptPath);
}

// Default export
export default DocstringParser;
