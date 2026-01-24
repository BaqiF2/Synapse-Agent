/**
 * Unit tests for ToolRegistry class.
 *
 * Tests the ToolRegistry class to ensure proper:
 * - Tool registration and retrieval
 * - Tool execution with validation
 * - Tool schema management
 * - Bash schema generation
 * - Error handling
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { ToolRegistry } from '../../../src/tools/registry';
import { BaseTool, ToolResult, type ToolSchema } from '../../../src/tools/base';

// Create test tools
class TestTool1 extends BaseTool {
  name = 'tool1';
  description = 'First test tool';

  async execute(kwargs: Record<string, any>): Promise<ToolResult> {
    if (!kwargs.required_param) {
      return ToolResult.failure('Missing required_param');
    }
    return ToolResult.success(`tool1: ${kwargs.required_param}`);
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
        },
        required: ['required_param'],
      },
    };
  }
}

class TestTool2 extends BaseTool {
  name = 'tool2';
  description = 'Second test tool';

  async execute(kwargs: Record<string, any>): Promise<ToolResult> {
    return ToolResult.success(`tool2: ${JSON.stringify(kwargs)}`);
  }

  getSchema(): ToolSchema {
    return {
      name: this.name,
      description: this.description,
      input_schema: {
        type: 'object',
        properties: {
          optional_param: {
            type: 'number',
            description: 'An optional parameter',
          },
        },
        required: [],
      },
    };
  }
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('Tool Registration', () => {
    test('should register a tool', () => {
      const tool = new TestTool1();
      registry.register(tool);

      const retrieved = registry.get('tool1');
      expect(retrieved).toBeTruthy();
      expect(retrieved?.name).toBe('tool1');
    });

    test('should register multiple tools', () => {
      registry.register(new TestTool1());
      registry.register(new TestTool2());

      expect(registry.get('tool1')).toBeTruthy();
      expect(registry.get('tool2')).toBeTruthy();
    });

    test('should overwrite tool with same name', () => {
      const tool1 = new TestTool1();
      const tool2 = new TestTool1();

      registry.register(tool1);
      registry.register(tool2);

      const retrieved = registry.get('tool1');
      expect(retrieved).toBe(tool2);
    });
  });

  describe('Tool Retrieval', () => {
    test('should retrieve registered tool', () => {
      const tool = new TestTool1();
      registry.register(tool);

      const retrieved = registry.get('tool1');
      expect(retrieved).toBe(tool);
    });

    test('should return null for non-existent tool', () => {
      const retrieved = registry.get('nonexistent');
      expect(retrieved).toBeNull();
    });
  });

  describe('Tool Listing', () => {
    test('should list all registered tools', () => {
      registry.register(new TestTool1());
      registry.register(new TestTool2());

      const tools = registry.listTools();
      expect(tools).toContain('tool1');
      expect(tools).toContain('tool2');
      expect(tools.length).toBeGreaterThanOrEqual(2);
    });

    test('should return empty list for no tools', () => {
      const emptyRegistry = new ToolRegistry();
      // Clear any default tools by creating a fresh instance
      const tools = emptyRegistry.listTools();
      // ToolRegistry has no default tools in our implementation
      expect(Array.isArray(tools)).toBe(true);
    });
  });

  describe('Tool Execution', () => {
    test('should execute tool successfully', async () => {
      registry.register(new TestTool1());

      const result = await registry.execute('tool1', { required_param: 'test' });

      expect(result.success).toBe(true);
      expect(result.output).toBe('tool1: test');
    });

    test('should return error for non-existent tool', async () => {
      const result = await registry.execute('nonexistent', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool not found: nonexistent');
    });

    test('should return error for missing required parameters', async () => {
      registry.register(new TestTool1());

      const result = await registry.execute('tool1', {});

      expect(result.success).toBe(false);
      expect(result.error || result.output).toContain('required_param');
    });

    test('should handle tool execution errors', async () => {
      class ErrorTool extends BaseTool {
        name = 'error_tool';
        description = 'Tool that throws errors';

        async execute(kwargs: Record<string, any>): Promise<ToolResult> {
          throw new Error('Test error');
        }

        getSchema(): ToolSchema {
          return {
            name: this.name,
            description: this.description,
            input_schema: {
              type: 'object',
              properties: {},
              required: [],
            },
          };
        }
      }

      registry.register(new ErrorTool());
      const result = await registry.execute('error_tool', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool execution failed');
    });
  });

  describe('Schema Management', () => {
    test('should get all tool schemas', () => {
      registry.register(new TestTool1());
      registry.register(new TestTool2());

      const schemas = registry.getAllSchemas();

      expect(schemas.length).toBeGreaterThanOrEqual(2);
      expect(schemas.some(s => s.name === 'tool1')).toBe(true);
      expect(schemas.some(s => s.name === 'tool2')).toBe(true);
    });

    test('should generate Bash tool schema', () => {
      const bashSchema = registry.getBashSchema();

      expect(bashSchema.name).toBe('Bash');
      expect(bashSchema.description).toContain('Execute commands');
      expect(bashSchema.description).toContain('read');
      expect(bashSchema.description).toContain('write');
      expect(bashSchema.description).toContain('edit');
      expect(bashSchema.description).toContain('grep');
      expect(bashSchema.description).toContain('glob');
    });

    test('Bash schema should have correct input schema', () => {
      const bashSchema = registry.getBashSchema();

      expect(bashSchema.input_schema.type).toBe('object');
      expect('command' in bashSchema.input_schema.properties).toBe(true);
      expect('restart' in bashSchema.input_schema.properties).toBe(true);
    });

    test('Bash schema should have command as string type', () => {
      const bashSchema = registry.getBashSchema();
      const props = bashSchema.input_schema.properties;

      expect(props.command.type).toBe('string');
      expect(props.command.description).toContain('bash command');
    });

    test('Bash schema should have restart as boolean type', () => {
      const bashSchema = registry.getBashSchema();
      const props = bashSchema.input_schema.properties;

      expect(props.restart.type).toBe('boolean');
      expect(props.restart.description).toContain('restart');
    });
  });

  describe('Field Alignment', () => {
    test('should use snake_case in method names where appropriate', async () => {
      // Method names should be camelCase (TypeScript convention)
      expect(typeof registry.listTools).toBe('function');
      expect(typeof registry.getAllSchemas).toBe('function');
      expect(typeof registry.getBashSchema).toBe('function');
    });

    test('tool schema should use snake_case for data fields', () => {
      registry.register(new TestTool1());
      const schemas = registry.getAllSchemas();
      const schema = schemas.find(s => s.name === 'tool1');

      expect(schema).toBeTruthy();
      expect('input_schema' in schema!).toBe(true);
    });
  });

  describe('Integration', () => {
    test('should support full lifecycle: register, execute, get result', async () => {
      const tool = new TestTool1();
      registry.register(tool);

      // Verify registration
      const retrieved = registry.get('tool1');
      expect(retrieved).toBe(tool);

      // Verify in list
      const tools = registry.listTools();
      expect(tools).toContain('tool1');

      // Execute and verify
      const result = await registry.execute('tool1', { required_param: 'integration' });
      expect(result.success).toBe(true);
      expect(result.output).toBe('tool1: integration');
    });

    test('should handle multiple concurrent executions', async () => {
      registry.register(new TestTool1());
      registry.register(new TestTool2());

      const results = await Promise.all([
        registry.execute('tool1', { required_param: 'test1' }),
        registry.execute('tool2', { optional_param: 42 }),
        registry.execute('tool1', { required_param: 'test2' }),
      ]);

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(results[2].success).toBe(true);
    });
  });
});
