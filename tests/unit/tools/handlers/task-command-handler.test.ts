/**
 * Task Command Handler 测试
 *
 * 测试目标：验证 task:* 命令解析逻辑
 */

import { describe, it, expect } from 'vitest';
import { parseTaskCommand } from '../../../../src/tools/handlers/task-command-handler.ts';

describe('parseTaskCommand', () => {
  describe('basic parsing', () => {
    it('should parse task:skill:search command', () => {
      const result = parseTaskCommand('task:skill:search --prompt "test" --description "desc"');
      expect(result.type).toBe('skill');
      expect(result.action).toBe('search');
      expect(result.params.prompt).toBe('test');
      expect(result.params.description).toBe('desc');
    });

    it('should parse task:explore command', () => {
      const result = parseTaskCommand('task:explore --prompt "find files" --description "explore"');
      expect(result.type).toBe('explore');
      expect(result.action).toBeNull();
      expect(result.params.prompt).toBe('find files');
    });

    it('should parse task:general command', () => {
      const result = parseTaskCommand('task:general -p "research" -d "general task"');
      expect(result.type).toBe('general');
      expect(result.params.prompt).toBe('research');
      expect(result.params.description).toBe('general task');
    });
  });

  describe('short flags', () => {
    it('should handle -p shorthand for --prompt', () => {
      const result = parseTaskCommand('task:explore -p "test prompt" -d "desc"');
      expect(result.params.prompt).toBe('test prompt');
    });

    it('should handle -d shorthand for --description', () => {
      const result = parseTaskCommand('task:explore -p "prompt" -d "short desc"');
      expect(result.params.description).toBe('short desc');
    });
  });

  describe('help flag', () => {
    it('should handle --help flag', () => {
      const result = parseTaskCommand('task:skill --help');
      expect(result.help).toBe(true);
    });

    it('should handle -h flag', () => {
      const result = parseTaskCommand('task:explore -h');
      expect(result.help).toBe(true);
    });
  });

  describe('optional parameters', () => {
    it('should parse --model parameter', () => {
      const result = parseTaskCommand('task:general --prompt "test" --description "desc" --model claude-3-opus');
      expect(result.params.model).toBe('claude-3-opus');
    });

    it('should parse --max-turns parameter', () => {
      const result = parseTaskCommand('task:general --prompt "test" --description "desc" --max-turns 10');
      expect(result.params.maxTurns).toBe(10);
    });
  });

  describe('invalid commands', () => {
    it('should return null type for non-task command', () => {
      const result = parseTaskCommand('invalid command');
      expect(result.type).toBeNull();
    });

    it('should return null type for command not starting with task:', () => {
      const result = parseTaskCommand('skill:search test');
      expect(result.type).toBeNull();
    });

    it('should return null type for invalid agent type', () => {
      const result = parseTaskCommand('task:invalid --prompt "test" --description "desc"');
      expect(result.type).toBeNull();
    });
  });

  describe('quote handling', () => {
    it('should handle double quotes', () => {
      const result = parseTaskCommand('task:explore --prompt "multi word prompt" --description "desc"');
      expect(result.params.prompt).toBe('multi word prompt');
    });

    it('should handle single quotes', () => {
      const result = parseTaskCommand("task:explore --prompt 'single quoted' --description 'desc'");
      expect(result.params.prompt).toBe('single quoted');
    });

    it('should handle mixed quotes', () => {
      const result = parseTaskCommand('task:explore --prompt "double" --description \'single\'');
      expect(result.params.prompt).toBe('double');
      expect(result.params.description).toBe('single');
    });
  });
});
