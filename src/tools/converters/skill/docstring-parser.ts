/**
 * Script Docstring Parser
 *
 * 从脚本文件中解析 docstring 提取元数据，包括描述、参数、返回值和示例。
 * 支持 Python、Shell、TypeScript 和 JavaScript 脚本。
 *
 * 核心导出:
 * - DocstringParser: 脚本 docstring 解析器
 * - parseDocstring: 便捷解析函数
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ScriptMetadata, ScriptParam, SupportedExtension } from './skill-structure.js';
import {
  parsePythonDocstring,
  parseShellDocstring,
  parseJSDocstring,
} from './language-parsers.js';
import type { RawDocstring } from './language-parsers.js';

/**
 * DocstringParser
 *
 * 解析各类脚本文件的 docstring 以提取结构化元数据。
 * 支持以下格式：
 * - Python: 三引号 docstring（""" ... """）
 * - Shell: # 开头的注释块
 * - TypeScript/JavaScript: JSDoc 风格注释
 */
export class DocstringParser {
  /**
   * 解析脚本文件并提取元数据
   *
   * @param scriptPath - 脚本文件路径
   * @returns 脚本元数据，解析失败返回 null
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
   * 根据文件扩展名分发到对应的语言解析器
   */
  private extractDocstring(content: string, ext: SupportedExtension): RawDocstring {
    switch (ext) {
      case '.py':
        return parsePythonDocstring(content);
      case '.sh':
        return parseShellDocstring(content);
      case '.ts':
      case '.js':
        return parseJSDocstring(content);
      default:
        return { description: '', params: [], examples: [] };
    }
  }

  /**
   * 标准化类型字符串
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
   * 解析默认值字符串为对应类型
   */
  private parseDefaultValue(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
}

/**
 * 便捷函数：解析脚本文件的 docstring
 */
export function parseDocstring(scriptPath: string): ScriptMetadata | null {
  const parser = new DocstringParser();
  return parser.parseFile(scriptPath);
}

export default DocstringParser;
