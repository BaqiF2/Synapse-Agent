/**
 * Unit tests for BashRouter class.
 *
 * Tests the BashRouter class to ensure proper:
 * - Command parsing (positional args, named args, flags)
 * - Help request detection (-h, --help)
 * - Command routing (Agent Bash, Field Bash, Native Bash)
 * - Value type conversion (string, number, boolean)
 * - Tool execution
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { BashRouter, type ParsedCommand } from '../../../src/tools/bash-router';
import { ToolRegistry } from '../../../src/tools/registry';
import { BashSession } from '../../../src/tools/bash-session';
import { BaseTool, ToolResult, type ToolSchema } from '../../../src/tools/base';

// Create a test tool for testing
class TestTool extends BaseTool {
  name = 'test';
  description = 'A test tool';

  async execute(kwargs: Record<string, any>): Promise<ToolResult> {
    return ToolResult.success(JSON.stringify(kwargs));
  }

  getSchema(): ToolSchema {
    return {
      name: this.name,
      description: this.description,
      input_schema: {
        type: 'object',
        properties: {
          param1: { type: 'string', description: 'First parameter' },
          param2: { type: 'number', description: 'Second parameter' },
        },
        required: ['param1'],
      },
    };
  }
}

describe('BashRouter', () => {
  let router: BashRouter;
  let registry: ToolRegistry;
  let session: BashSession;

  beforeEach(() => {
    registry = new ToolRegistry();
    session = new BashSession();
    router = new BashRouter(registry, session);

    // Register test tool
    registry.register(new TestTool());
  });

  describe('Command Parsing', () => {
    test('should parse simple command', () => {
      const parsed = router.parse('read test.txt');

      expect(parsed.name).toBe('read');
      expect(parsed.args).toEqual(['test.txt']);
      expect(parsed.kwargs).toEqual({});
      expect(parsed.raw).toBe('read test.txt');
    });

    test('should parse command with --key=value', () => {
      const parsed = router.parse('read test.txt --offset=10');

      expect(parsed.name).toBe('read');
      expect(parsed.args).toEqual(['test.txt']);
      expect(parsed.kwargs).toEqual({ offset: 10 });
    });

    test('should parse command with --key value', () => {
      const parsed = router.parse('read test.txt --offset 10 --limit 20');

      expect(parsed.name).toBe('read');
      expect(parsed.args).toEqual(['test.txt']);
      expect(parsed.kwargs).toEqual({ offset: 10, limit: 20 });
    });

    test('should parse command with boolean flags', () => {
      const parsed = router.parse('read test.txt --verbose');

      expect(parsed.name).toBe('read');
      expect(parsed.kwargs.verbose).toBe(true);
    });

    test('should parse command with mixed arguments', () => {
      const parsed = router.parse('read test.txt 10 20 --verbose --format=json');

      expect(parsed.name).toBe('read');
      expect(parsed.args).toEqual(['test.txt', '10', '20']);
      expect(parsed.kwargs).toEqual({ verbose: true, format: 'json' });
    });

    test('should handle quoted arguments', () => {
      const parsed = router.parse('write "test file.txt" "Hello World"');

      expect(parsed.name).toBe('write');
      expect(parsed.args).toEqual(['test file.txt', 'Hello World']);
    });

    test('should handle empty command', () => {
      const parsed = router.parse('');

      expect(parsed.name).toBe('');
      expect(parsed.args).toEqual([]);
      expect(parsed.kwargs).toEqual({});
    });

    test('should convert dashes to underscores in kwargs', () => {
      const parsed = router.parse('read test.txt --show-line-numbers');

      expect(parsed.kwargs.show_line_numbers).toBe(true);
    });
  });

  describe('Help Request Detection', () => {
    test('should detect -h flag', () => {
      const parsed = router.parse('read -h');

      expect(parsed.is_help_request).toBe(true);
      expect(parsed.help_verbose).toBe(false);
    });

    test('should detect --help flag', () => {
      const parsed = router.parse('read --help');

      expect(parsed.is_help_request).toBe(true);
      expect(parsed.help_verbose).toBe(true);
    });

    test('should detect help with other arguments', () => {
      const parsed = router.parse('read test.txt --help');

      expect(parsed.is_help_request).toBe(true);
      expect(parsed.args).toEqual(['test.txt']);
    });
  });

  describe('Command Type Detection', () => {
    test('should detect agent bash command', () => {
      const parsed = router.parse('read test.txt');

      expect(parsed.is_native_bash).toBe(false);
    });

    test('should detect native bash command', () => {
      const parsed = router.parse('ls -la');

      expect(parsed.is_native_bash).toBe(true);
    });

    test('should detect field bash command', () => {
      const parsed = router.parse('field:domain:tool arg1');

      expect(parsed.is_native_bash).toBe(false);
      expect(parsed.name).toBe('field:domain:tool');
    });

    test('should detect plain field command', () => {
      const parsed = router.parse('field -h');

      expect(parsed.is_native_bash).toBe(false);
      expect(parsed.name).toBe('field');
    });
  });

  describe('Value Type Conversion', () => {
    test('should convert integer values', () => {
      const parsed = router.parse('test --num=42');

      expect(parsed.kwargs.num).toBe(42);
      expect(typeof parsed.kwargs.num).toBe('number');
    });

    test('should convert float values', () => {
      const parsed = router.parse('test --num=3.14');

      expect(parsed.kwargs.num).toBe(3.14);
      expect(typeof parsed.kwargs.num).toBe('number');
    });

    test('should convert boolean true values', () => {
      const tests = [
        'test --flag=true',
        'test --flag=yes',
        'test --flag=1',
      ];

      for (const cmd of tests) {
        const parsed = router.parse(cmd);
        expect(parsed.kwargs.flag).toBe(true);
      }
    });

    test('should convert boolean false values', () => {
      const tests = [
        'test --flag=false',
        'test --flag=no',
        'test --flag=0',
      ];

      for (const cmd of tests) {
        const parsed = router.parse(cmd);
        expect(parsed.kwargs.flag).toBe(false);
      }
    });

    test('should keep string values as strings', () => {
      const parsed = router.parse('test --name=hello');

      expect(parsed.kwargs.name).toBe('hello');
      expect(typeof parsed.kwargs.name).toBe('string');
    });
  });

  describe('Tool Execution', () => {
    test('should execute agent tool with named args', async () => {
      const result = await router.execute('test --param1=value1 --param2=42');

      expect(result.success).toBe(true);
      const output = JSON.parse(result.output);
      expect(output.param1).toBe('value1');
      expect(output.param2).toBe(42);
    });

    test('should execute agent tool with positional args', async () => {
      const result = await router.execute('test value1');

      expect(result.success).toBe(true);
      const output = JSON.parse(result.output);
      expect(output.param1).toBe('value1');
    });

    test('should return error for unknown tool', async () => {
      const result = await router.execute('nonexistent');

      expect(result.success).toBe(false);
      // Unknown commands are routed to native bash and fail there
      expect(result.error).toContain('Command failed');
    });

    test('should handle help request', async () => {
      const result = await router.execute('test -h');

      expect(result.success).toBe(true);
      expect(result.output).toContain('test: A test tool');
    });

    test('should handle verbose help request', async () => {
      const result = await router.execute('test --help');

      expect(result.success).toBe(true);
      expect(result.output).toContain('Tool: test');
      expect(result.output).toContain('Description: A test tool');
    });
  });

  describe('Native Bash Routing', () => {
    test('should execute native bash command', async () => {
      const result = await router.execute('echo "hello"');

      expect(result.success).toBe(true);
      expect(result.output).toContain('hello');
    });

    test('should handle native bash command failure', async () => {
      // Use a command that fails without exiting the shell
      const result = await router.execute('ls /nonexistent/path 2>&1');

      expect(result.success).toBe(false);
    });
  });

  describe('Field Bash Routing', () => {
    test('should return error for field command without colon', async () => {
      const result = await router.execute('field');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Usage: field:domain:tool');
    });

    test('should show domains help for field -h', async () => {
      const result = await router.execute('field -h');

      expect(result.success).toBe(true);
      expect(result.output).toContain('Field Bash Domains');
    });

    test('should return error for invalid field command format', async () => {
      const result = await router.execute('field:invalid');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid field command');
    });

    test('should return error for unimplemented field tool', async () => {
      const result = await router.execute('field:test:tool');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Field tool not implemented');
    });
  });

  describe('Available Commands', () => {
    test('should return list of agent commands', () => {
      const commands = router.getAvailableCommands();

      expect(commands).toContain('read');
      expect(commands).toContain('write');
      expect(commands).toContain('edit');
      expect(commands).toContain('grep');
      expect(commands).toContain('glob');
      expect(commands).toContain('skill');
    });
  });

  describe('Field Alignment', () => {
    test('should use snake_case field names in ParsedCommand', () => {
      const parsed = router.parse('read test.txt');

      // Verify field names match Python version
      expect('is_native_bash' in parsed).toBe(true);
      expect('is_help_request' in parsed).toBe(true);
      expect('help_verbose' in parsed).toBe(true);
    });
  });
});
