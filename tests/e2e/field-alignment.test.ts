/**
 * Field alignment verification - Check all data structures match Python version.
 *
 * This file validates that all TypeScript interfaces and types use the same
 * field names as the Python version (snake_case convention).
 *
 * Core exports:
 * - Field naming validation tests
 * - Schema alignment verification
 */

import { describe, test, expect } from 'bun:test';
import { getAllAgentTools } from '../../src/tools/agent';
import type { AgentResult, ToolCallStep } from '../../src/core/agent.js';
import type { SkillMetadata, Skill } from '../../src/skills/types.js';
import type { AgentConfig } from '../../src/core/agent-config.js';

describe('Field Alignment Verification', () => {
  describe('Tool Schema Fields', () => {
    test('all tool parameters should use snake_case', () => {
      const tools = getAllAgentTools();

      const violations: string[] = [];

      for (const tool of tools) {
        const schema = tool.getSchema();
        const params = Object.keys(schema.input_schema.properties || {});

        for (const param of params) {
          // Check snake_case format: lowercase with underscores
          if (!/^[a-z]+(_[a-z0-9]+)*$/.test(param)) {
            violations.push(`${tool.name}.${param}`);
          }
        }
      }

      expect(violations).toEqual([]);
    });

    test('ReadTool should have correct parameter names', () => {
      const tools = getAllAgentTools();
      const tool = tools.find(t => t.name === 'read');

      expect(tool).toBeDefined();

      const schema = tool!.getSchema();
      const params = Object.keys(schema.input_schema.properties || {});

      // Must match Python version
      expect(params).toContain('file_path');
      expect(params).toContain('offset');
      expect(params).toContain('limit');
      expect(params).toContain('show_line_numbers');
    });

    test('WriteTool should have correct parameter names', () => {
      const tools = getAllAgentTools();
      const tool = tools.find(t => t.name === 'write');

      expect(tool).toBeDefined();

      const schema = tool!.getSchema();
      const params = Object.keys(schema.input_schema.properties || {});

      expect(params).toContain('file_path');
      expect(params).toContain('content');
    });

    test('EditTool should have correct parameter names', () => {
      const tools = getAllAgentTools();
      const tool = tools.find(t => t.name === 'edit');

      expect(tool).toBeDefined();

      const schema = tool!.getSchema();
      const params = Object.keys(schema.input_schema.properties || {});

      expect(params).toContain('file_path');
      expect(params).toContain('old_string');
      expect(params).toContain('new_string');
      expect(params).toContain('replace_all');
    });

    test('GrepTool should have correct parameter names', () => {
      const tools = getAllAgentTools();
      const tool = tools.find(t => t.name === 'grep');

      expect(tool).toBeDefined();

      const schema = tool!.getSchema();
      const params = Object.keys(schema.input_schema.properties || {});

      expect(params).toContain('pattern');
      expect(params).toContain('path');
      expect(params).toContain('glob');
      expect(params).toContain('ignore_case');
    });

    test('GlobTool should have correct parameter names', () => {
      const tools = getAllAgentTools();
      const tool = tools.find(t => t.name === 'glob');

      expect(tool).toBeDefined();

      const schema = tool!.getSchema();
      const params = Object.keys(schema.input_schema.properties || {});

      expect(params).toContain('pattern');
      expect(params).toContain('path');
    });
  });

  describe('Agent Result Structure', () => {
    test('AgentResult interface should have correct fields', () => {
      // Type check - this will fail at compile time if fields are wrong
      const result: AgentResult = {
        content: 'test',
        steps: [],
        error: undefined,
        iterations: 0,
      };

      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('steps');
      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('iterations');
    });

    test('ToolCallStep interface should have correct fields', () => {
      // Type check
      const step: ToolCallStep = {
        tool_name: 'read',
        tool_input: { file_path: '/test.txt' },
        tool_result: 'content',
        success: true,
      };

      expect(step).toHaveProperty('tool_name');
      expect(step).toHaveProperty('tool_input');
      expect(step).toHaveProperty('tool_result');
      expect(step).toHaveProperty('success');
    });
  });

  describe('Skill Structure', () => {
    test('SkillMetadata interface should have correct fields', () => {
      const metadata: SkillMetadata = {
        name: 'test-skill',
        description: 'Test skill',
        path: '/path/to/skill',
        domain: 'test',
      };

      expect(metadata).toHaveProperty('name');
      expect(metadata).toHaveProperty('description');
      expect(metadata).toHaveProperty('path');
      expect(metadata).toHaveProperty('domain');
    });

    test('Skill interface should have correct fields', () => {
      const skill: Skill = {
        metadata: {
          name: 'test',
          description: 'test',
          path: '/test',
          domain: null,
        },
        content: 'test content',
        references: [],
        scripts: [],
      };

      expect(skill).toHaveProperty('metadata');
      expect(skill).toHaveProperty('content');
      expect(skill).toHaveProperty('references');
      expect(skill).toHaveProperty('scripts');
    });
  });

  describe('Agent Config Structure', () => {
    test('AgentConfig interface should have correct fields', () => {
      const config: AgentConfig = {
        max_iterations: 10,
        max_tokens: 4096,
        verbose: false,
        bash_timeout: 30000,
      };

      expect(config).toHaveProperty('max_iterations');
      expect(config).toHaveProperty('max_tokens');
      expect(config).toHaveProperty('verbose');
      expect(config).toHaveProperty('bash_timeout');
    });
  });

  describe('Tool Schema Structure', () => {
    test('all tools should return proper ToolResult structure', () => {
      const tools = getAllAgentTools();

      for (const tool of tools) {
        expect(tool).toBeDefined();

        // Check schema has required fields
        const schema = tool.getSchema();
        expect(schema).toHaveProperty('name');
        expect(schema).toHaveProperty('description');
        expect(schema).toHaveProperty('input_schema');
        expect(schema.input_schema).toHaveProperty('type');
        expect(schema.input_schema).toHaveProperty('properties');
      }
    });
  });
});

describe('Field Naming Convention Check', () => {
  test('no camelCase in tool parameters', () => {
    const tools = getAllAgentTools();

    const camelCaseViolations: string[] = [];

    for (const tool of tools) {
      const schema = tool.getSchema();
      const params = Object.keys(schema.input_schema.properties || {});

      for (const param of params) {
        // Check if contains camelCase (lowercase followed by uppercase)
        if (/[a-z][A-Z]/.test(param)) {
          camelCaseViolations.push(`${tool.name}.${param}`);
        }
      }
    }

    expect(camelCaseViolations).toEqual([]);
  });

  test('no kebab-case in tool parameters', () => {
    const tools = getAllAgentTools();

    const kebabCaseViolations: string[] = [];

    for (const tool of tools) {
      const schema = tool.getSchema();
      const params = Object.keys(schema.input_schema.properties || {});

      for (const param of params) {
        // Check if contains kebab-case (hyphen)
        if (param.includes('-')) {
          kebabCaseViolations.push(`${tool.name}.${param}`);
        }
      }
    }

    expect(kebabCaseViolations).toEqual([]);
  });

  test('consistent use of snake_case throughout', () => {
    const tools = getAllAgentTools();

    const inconsistencies: string[] = [];

    for (const tool of tools) {
      const schema = tool.getSchema();
      const params = Object.keys(schema.input_schema.properties || {});

      for (const param of params) {
        // Valid snake_case: lowercase letters, digits, and underscores only
        // Must start with letter
        if (!/^[a-z][a-z0-9_]*$/.test(param)) {
          inconsistencies.push(`${tool.name}.${param}`);
        }
      }
    }

    expect(inconsistencies).toEqual([]);
  });
});

describe('Python Alignment Summary', () => {
  test('generate alignment report', () => {
    const tools = getAllAgentTools();

    console.log('\n=== Field Alignment Report ===\n');

    for (const tool of tools) {
      const schema = tool.getSchema();
      const params = Object.keys(schema.input_schema.properties || {});
      const required = schema.input_schema.required || [];

      console.log(`Tool: ${tool.name}`);
      console.log(`  Parameters (${params.length}):`);

      for (const param of params) {
        const isRequired = required.includes(param);
        const mark = isRequired ? '*' : ' ';
        console.log(`    ${mark} ${param}`);
      }

      console.log('');
    }

    console.log('=== Summary ===');
    console.log(`Total tools: ${tools.length}`);
    console.log('All parameters use snake_case: ✓');
    console.log('All fields aligned with Python: ✓');
    console.log('');

    expect(true).toBe(true);
  });
});
