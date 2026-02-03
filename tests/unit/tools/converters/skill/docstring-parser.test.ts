import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { DocstringParser } from '../../../../../src/tools/converters/skill/docstring-parser.ts';

describe('DocstringParser', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-doc-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should parse python docstring parameters', () => {
    const content = `"""
Description:
    Example script

Parameters:
    input (str): The input parameter
    --option (str): Optional parameter (default: \"default\")

Returns:
    str: Result

Examples:
    skill:example:test "hello"
"""
`;
    const filePath = path.join(tempDir, 'script.py');
    fs.writeFileSync(filePath, content, 'utf-8');

    const parser = new DocstringParser();
    const meta = parser.parseFile(filePath);

    expect(meta?.description).toContain('Example script');
    expect(meta?.params.length).toBe(2);
    expect(meta?.params[0]?.name).toBe('input');
    expect(meta?.params[1]?.name).toBe('option');
    expect(meta?.returns).toContain('Result');
    expect(meta?.examples.length).toBeGreaterThan(0);
  });

  it('should parse shell comment docstring', () => {
    const content = `#!/bin/bash
# test - Example script
#
# Description:
#   Shell script
#
# Parameters:
#   input (string): The input
#
# Returns:
#   string: Result
`;
    const filePath = path.join(tempDir, 'script.sh');
    fs.writeFileSync(filePath, content, 'utf-8');

    const parser = new DocstringParser();
    const meta = parser.parseFile(filePath);

    expect(meta?.description).toContain('Shell script');
    expect(meta?.params[0]?.name).toBe('input');
    expect(meta?.returns).toContain('Result');
  });

  it('should parse jsdoc comment', () => {
    const content = `/**
 * Example script
 *
 * @param {string} input The input
 * @returns {string} Result
 */
console.log('hi');
`;
    const filePath = path.join(tempDir, 'script.ts');
    fs.writeFileSync(filePath, content, 'utf-8');

    const parser = new DocstringParser();
    const meta = parser.parseFile(filePath);

    expect(meta?.description).toContain('Example script');
    expect(meta?.params[0]?.name).toBe('input');
    expect(meta?.returns).toContain('Result');
  });
});
