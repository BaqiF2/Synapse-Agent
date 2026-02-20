/**
 * DocstringParser Unit Tests
 *
 * Tests for parsing docstrings from Python, Shell, TypeScript/JavaScript scripts.
 * Covers parameter extraction, type normalization, edge cases, and error handling.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { DocstringParser, parseDocstring } from '../../../../../src/tools/converters/skill/docstring-parser.ts';

describe('DocstringParser', () => {
  let tempDir: string;
  let parser: DocstringParser;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-docparse-'));
    parser = new DocstringParser();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /** 辅助函数：写入临时文件并解析 */
  function parseContent(filename: string, content: string) {
    const filePath = path.join(tempDir, filename);
    fs.writeFileSync(filePath, content, 'utf-8');
    return parser.parseFile(filePath);
  }

  // ===== Python docstring 解析 =====

  describe('Python docstring parsing', () => {
    it('should parse basic Python triple-quoted docstring', () => {
      const meta = parseContent('basic.py', `"""
Simple script description.

Parameters:
    name (str): The name to greet
    count (int): Number of times to greet

Returns:
    str: Greeting message

Examples:
    skill:example:basic "World" 3
"""
print("hello")
`);

      expect(meta).not.toBeNull();
      expect(meta!.name).toBe('basic');
      expect(meta!.description).toContain('Simple script description');
      expect(meta!.params.length).toBe(2);
      expect(meta!.params[0]!.name).toBe('name');
      expect(meta!.params[0]!.type).toBe('string');
      expect(meta!.params[1]!.name).toBe('count');
      expect(meta!.params[1]!.type).toBe('number');
      expect(meta!.returns).toContain('Greeting message');
      expect(meta!.examples.length).toBeGreaterThan(0);
      expect(meta!.extension).toBe('.py');
    });

    it('should parse Python docstring with optional parameters', () => {
      const meta = parseContent('optional.py', `"""
Optional param test.

Parameters:
    required_param (str): Required parameter
    optional_param (str, optional): Optional parameter
    default_param (str, default: "hello"): Parameter with default
"""
pass
`);

      expect(meta!.params.length).toBe(3);
      expect(meta!.params[0]!.required).toBe(true);
      expect(meta!.params[1]!.required).toBe(false);
      expect(meta!.params[2]!.required).toBe(false);
    });

    it('should parse Python docstring with dashed parameter names', () => {
      const meta = parseContent('dashed.py', `"""
Dashed params test.

Parameters:
    --output-dir (str): Output directory
    --verbose (boolean): Enable verbose mode
"""
pass
`);

      expect(meta!.params.length).toBe(2);
      // 前缀的 -- 应被去除
      expect(meta!.params[0]!.name).toBe('output-dir');
      expect(meta!.params[1]!.name).toBe('verbose');
      expect(meta!.params[1]!.type).toBe('boolean');
    });

    it('should handle empty Python docstring', () => {
      const meta = parseContent('empty.py', `"""
"""
pass
`);

      expect(meta).not.toBeNull();
      expect(meta!.description).toBeFalsy();
      expect(meta!.params.length).toBe(0);
    });

    it('should handle Python file without docstring', () => {
      const meta = parseContent('nodoc.py', `print("no docstring here")
x = 1 + 2
`);

      expect(meta).not.toBeNull();
      // 没有 docstring 应返回空描述和空参数
      expect(meta!.params.length).toBe(0);
    });

    it('should parse multi-line parameter descriptions', () => {
      const meta = parseContent('multiline.py', `"""
Multi-line test.

Parameters:
    path (str): The path to the file
        that needs to be processed
"""
pass
`);

      expect(meta!.params.length).toBe(1);
      expect(meta!.params[0]!.description).toContain('path to the file');
      expect(meta!.params[0]!.description).toContain('needs to be processed');
    });

    it('should handle single-quoted triple docstring', () => {
      const meta = parseContent('singlequote.py', `'''
Single quoted docstring.

Parameters:
    value (str): A value
'''
pass
`);

      expect(meta).not.toBeNull();
      expect(meta!.description).toContain('Single quoted docstring');
      expect(meta!.params.length).toBe(1);
    });
  });

  // ===== Shell docstring 解析 =====

  describe('Shell docstring parsing', () => {
    it('should parse shell script with shebang and comments', () => {
      const meta = parseContent('deploy.sh', `#!/bin/bash
# deploy - Deploy application
#
# Description:
#   Deploys the application to the target environment
#
# Parameters:
#   env (string): Target environment
#   version (string): Version to deploy
#
# Returns:
#   string: Deployment result
#
# Examples:
#   skill:deploy:main production v1.0
`);

      expect(meta).not.toBeNull();
      expect(meta!.description).toContain('Deploys the application');
      expect(meta!.params.length).toBe(2);
      expect(meta!.params[0]!.name).toBe('env');
      expect(meta!.params[0]!.type).toBe('string');
      expect(meta!.params[1]!.name).toBe('version');
      expect(meta!.returns).toContain('Deployment result');
      expect(meta!.examples.length).toBeGreaterThan(0);
    });

    it('should parse shell script name-description format', () => {
      const meta = parseContent('backup.sh', `#!/bin/bash
# backup - Backup database to S3
echo "backing up"
`);

      expect(meta!.description).toContain('Backup database to S3');
    });

    it('should handle shell script without shebang', () => {
      const meta = parseContent('noshebang.sh', `# noshebang - Script without shebang
#
# Description:
#   Still works
echo "ok"
`);

      expect(meta).not.toBeNull();
      // 没有 shebang 时仍然解析注释
      expect(meta!.description).toBeDefined();
    });

    it('should stop parsing at first non-comment line', () => {
      const meta = parseContent('stop.sh', `#!/bin/bash
# stop - First section
echo "code starts here"
# This comment should be ignored
`);

      expect(meta!.description).toContain('First section');
    });

    it('should handle shell parameter with positional syntax', () => {
      const meta = parseContent('positional.sh', `#!/bin/bash
# pos - Positional params
#
# Parameters:
#   $1 (string): First argument
#   $2 (number): Second argument
echo "$1 $2"
`);

      expect(meta!.params.length).toBe(2);
    });
  });

  // ===== JSDoc (TypeScript/JavaScript) 解析 =====

  describe('JSDoc parsing (TypeScript/JavaScript)', () => {
    it('should parse JSDoc-style comment in TypeScript', () => {
      const meta = parseContent('analyze.ts', `/**
 * Analyze code quality metrics
 *
 * @param {string} path - Path to analyze
 * @param {number} threshold - Quality threshold
 * @returns {object} Analysis results
 * @example
 * skill:analyze:main /src 80
 */
export function analyze() {}
`);

      expect(meta).not.toBeNull();
      expect(meta!.description).toContain('Analyze code quality metrics');
      expect(meta!.params.length).toBe(2);
      expect(meta!.params[0]!.name).toBe('path');
      expect(meta!.params[0]!.type).toBe('string');
      expect(meta!.params[1]!.name).toBe('threshold');
      expect(meta!.params[1]!.type).toBe('number');
      expect(meta!.returns).toContain('Analysis results');
      expect(meta!.examples.length).toBeGreaterThan(0);
    });

    it('should parse JSDoc in JavaScript file', () => {
      const meta = parseContent('transform.js', `/**
 * Transform data
 *
 * @param {string} input - Input data
 * @param {boolean} verbose - Enable verbose output
 * @returns {string} Transformed data
 */
function transform() {}
`);

      expect(meta).not.toBeNull();
      expect(meta!.extension).toBe('.js');
      expect(meta!.params.length).toBe(2);
      expect(meta!.params[1]!.type).toBe('boolean');
    });

    it('should handle JSDoc without type annotations', () => {
      const meta = parseContent('notype.ts', `/**
 * Script without types
 *
 * @param input - Just a description
 * @returns Some result
 */
console.log("hi");
`);

      expect(meta).not.toBeNull();
      expect(meta!.params.length).toBe(1);
      // 没有指定类型时默认为 string
      expect(meta!.params[0]!.type).toBe('string');
    });

    it('should handle JSDoc with optional type', () => {
      const meta = parseContent('optjsdoc.ts', `/**
 * Optional JSDoc test
 *
 * @param {string?} name - Optional name
 * @param {string, optional} label - Also optional
 */
console.log("test");
`);

      expect(meta!.params.length).toBe(2);
      expect(meta!.params[0]!.required).toBe(false);
      expect(meta!.params[1]!.required).toBe(false);
    });

    it('should handle file without any JSDoc', () => {
      const meta = parseContent('nojsdoc.ts', `// just a regular comment
console.log("no jsdoc");
`);

      expect(meta).not.toBeNull();
      expect(meta!.params.length).toBe(0);
      expect(meta!.description).toBeFalsy();
    });

    it('should handle @return (without s) alias', () => {
      const meta = parseContent('returnalias.ts', `/**
 * Return alias test
 *
 * @return {string} The result
 */
export default {};
`);

      expect(meta!.returns).toContain('The result');
    });
  });

  // ===== 类型规范化测试 =====

  describe('type normalization', () => {
    it('should normalize str/text to string', () => {
      const meta = parseContent('types1.py', `"""
Types test.

Parameters:
    a (str): String param
    b (text): Text param
"""
pass
`);

      expect(meta!.params[0]!.type).toBe('string');
      expect(meta!.params[1]!.type).toBe('string');
    });

    it('should normalize int/float/num to number', () => {
      const meta = parseContent('types2.py', `"""
Number types.

Parameters:
    a (int): Integer
    b (float): Float
    c (number): Number
"""
pass
`);

      expect(meta!.params[0]!.type).toBe('number');
      expect(meta!.params[1]!.type).toBe('number');
      expect(meta!.params[2]!.type).toBe('number');
    });

    it('should normalize bool to boolean', () => {
      const meta = parseContent('types3.py', `"""
Bool type.

Parameters:
    flag (bool): A flag
"""
pass
`);

      expect(meta!.params[0]!.type).toBe('boolean');
    });

    it('should normalize list/array to array', () => {
      const meta = parseContent('types4.py', `"""
Array type.

Parameters:
    items (list): A list
    data (array): An array
"""
pass
`);

      expect(meta!.params[0]!.type).toBe('array');
      expect(meta!.params[1]!.type).toBe('array');
    });

    it('should normalize dict/map/object to object', () => {
      const meta = parseContent('types5.py', `"""
Object type.

Parameters:
    config (dict): A dictionary
    mapping (map): A map
    obj (object): An object
"""
pass
`);

      expect(meta!.params[0]!.type).toBe('object');
      expect(meta!.params[1]!.type).toBe('object');
      expect(meta!.params[2]!.type).toBe('object');
    });
  });

  // ===== 边界情况测试 =====

  describe('edge cases', () => {
    it('should return null for non-existent file', () => {
      const result = parser.parseFile('/nonexistent/file.py');
      expect(result).toBeNull();
    });

    it('should handle completely empty file', () => {
      const meta = parseContent('empty_file.py', '');
      expect(meta).not.toBeNull();
      expect(meta!.params.length).toBe(0);
    });

    it('should set correct name from filename without extension', () => {
      const meta = parseContent('my-tool.py', '"""A tool."""\npass');
      expect(meta!.name).toBe('my-tool');
    });

    it('should set correct path in metadata', () => {
      const filePath = path.join(tempDir, 'pathtest.ts');
      fs.writeFileSync(filePath, '/** Test */\nconsole.log("x");', 'utf-8');
      const meta = parser.parseFile(filePath);

      expect(meta!.path).toBe(filePath);
    });
  });

  // ===== 便利函数测试 =====

  describe('parseDocstring convenience function', () => {
    it('should work as standalone function', () => {
      const filePath = path.join(tempDir, 'convenient.py');
      fs.writeFileSync(filePath, `"""
Convenience function test.

Parameters:
    x (str): A param
"""
pass
`, 'utf-8');

      const meta = parseDocstring(filePath);
      expect(meta).not.toBeNull();
      expect(meta!.description).toContain('Convenience function test');
      expect(meta!.params.length).toBe(1);
    });

    it('should return null for non-existent file', () => {
      const meta = parseDocstring('/no/such/file.py');
      expect(meta).toBeNull();
    });
  });

  // ===== 默认值解析测试 =====

  describe('default value parsing', () => {
    it('should parse JSON-compatible default values', () => {
      const meta = parseContent('defaults.py', `"""
Defaults test.

Parameters:
    count (int, default: 10): A count
    flag (bool, default: true): A flag
"""
pass
`);

      expect(meta!.params[0]!.default).toBe(10);
      expect(meta!.params[1]!.default).toBe(true);
    });

    it('should keep string defaults as-is when not valid JSON', () => {
      const meta = parseContent('strdefault.py', `"""
String default.

Parameters:
    mode (str, default: "fast"): Processing mode
"""
pass
`);

      expect(meta!.params[0]!.required).toBe(false);
    });
  });
});
