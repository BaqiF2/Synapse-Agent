/**
 * Unit tests for system prompts.
 *
 * Tests the DEFAULT_SYSTEM_PROMPT to ensure it contains all required sections
 * and guidance for the LLM.
 */

import { describe, test, expect } from 'bun:test';
import { DEFAULT_SYSTEM_PROMPT } from '../../../src/core/prompts';

describe('DEFAULT_SYSTEM_PROMPT', () => {
  test('should contain core principle section', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toContain('Core Principle');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('persistent bash session');
  });

  test('should describe three-layer Bash architecture', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toContain('Three-Layer Bash Architecture');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('Base Bash');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('Agent Bash');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('Field Bash');
  });

  test('should describe Agent Bash tools', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toContain('read <file_path>');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('write <file_path>');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('edit <file_path>');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('glob <pattern>');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('grep <pattern>');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('skill <action>');
  });

  test('should describe self-description feature', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toContain('Self-Description');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('-h');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('--help');
  });

  test('should contain execution principles', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toContain('Execution Principles');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('Tool Priority');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('Command Learning');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('Single execution');
  });

  test('should emphasize single execution principle', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toContain('Execute exactly what is requested, nothing more');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('execute it ONCE');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('Never return multiple identical tool_use blocks');
  });

  test('should provide examples of correct behavior', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toContain('Example of correct behavior');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('Example of correct learning');
  });

  test('should warn against common mistakes', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toContain('WRONG:');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('Do NOT:');
  });

  test('should be a non-empty string', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toBeDefined();
    expect(typeof DEFAULT_SYSTEM_PROMPT).toBe('string');
    expect(DEFAULT_SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });
});
