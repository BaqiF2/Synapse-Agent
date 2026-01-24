/**
 * Unit tests for ToolResult class.
 *
 * Tests the ToolResult class to ensure proper:
 * - Success/failure result creation
 * - Data serialization (toDict)
 * - Field name alignment with Python version
 */

import { describe, test, expect } from 'bun:test';
import { ToolResult, ToolError, BaseTool, type ToolSchema } from '../../../src/tools/base';

describe('ToolResult', () => {
  test('should create success result correctly', () => {
    const result = ToolResult.success('test output');

    expect(result.success).toBe(true);
    expect(result.output).toBe('test output');
    expect(result.error).toBe(null);
  });

  test('should create failure result correctly', () => {
    const result = ToolResult.failure('test error');

    expect(result.success).toBe(false);
    expect(result.output).toBe(null);
    expect(result.error).toBe('test error');
  });

  test('toDict should return correct structure', () => {
    const successResult = ToolResult.success({ data: 123 });
    const dict = successResult.toDict();

    expect(dict).toEqual({
      success: true,
      output: { data: 123 },
      error: null,
    });
  });

  test('toDict should preserve field names (snake_case alignment)', () => {
    const result = ToolResult.failure('error message');
    const dict = result.toDict();

    // Verify fields match Python version
    expect('success' in dict).toBe(true);
    expect('output' in dict).toBe(true);
    expect('error' in dict).toBe(true);
  });
});

describe('ToolError', () => {
  test('should create error with tool name prefix', () => {
    const error = new ToolError('Something went wrong', 'TestTool');

    expect(error.message).toBe('[TestTool] Something went wrong');
    expect(error.toolName).toBe('TestTool');
    expect(error.name).toBe('ToolError');
  });

  test('should create error without tool name', () => {
    const error = new ToolError('Something went wrong');

    expect(error.message).toBe('Something went wrong');
    expect(error.toolName).toBe(null);
  });
});

describe('BaseTool', () => {
  // Create a concrete test tool for testing
  class TestTool extends BaseTool {
    name = 'test_tool';
    description = 'A test tool for unit testing';

    async execute(kwargs: Record<string, any>): Promise<ToolResult> {
      if (!kwargs.required_param) {
        return ToolResult.failure('Missing required_param');
      }
      return ToolResult.success(`Processed: ${kwargs.required_param}`);
    }

    getSchema(): ToolSchema {
      return {
        name: this.name,
        description: this.description,
        input_schema: {
          type: 'object',
          properties: {
            required_param: {
              type: 'string',
              description: 'A required parameter',
            },
            optional_param: {
              type: 'number',
              description: 'An optional parameter',
            },
          },
          required: ['required_param'],
        },
      };
    }
  }

  test('help should return short help when verbose=false', () => {
    const tool = new TestTool();
    const helpText = tool.help(false);

    expect(helpText).toBe('test_tool: A test tool for unit testing');
  });

  test('help should return detailed help when verbose=true', () => {
    const tool = new TestTool();
    const helpText = tool.help(true);

    expect(helpText).toContain('Tool: test_tool');
    expect(helpText).toContain('Description: A test tool for unit testing');
    expect(helpText).toContain('Usage: test_tool <required_param> [OPTIONS]');
    expect(helpText).toContain('required_param* (string): A required parameter');
    expect(helpText).toContain('--optional_param (number): An optional parameter');
    expect(helpText).toContain('Example:');
  });

  test('validateArgs should detect missing required parameters', () => {
    const tool = new TestTool();
    const errors = tool.validateArgs({ optional_param: 123 });

    expect(errors).toContain('Missing required parameter: required_param');
  });

  test('validateArgs should pass with all required parameters', () => {
    const tool = new TestTool();
    const errors = tool.validateArgs({ required_param: 'test' });

    expect(errors).toEqual([]);
  });

  test('execute should work with valid kwargs', async () => {
    const tool = new TestTool();
    const result = await tool.execute({ required_param: 'test value' });

    expect(result.success).toBe(true);
    expect(result.output).toBe('Processed: test value');
  });
});
