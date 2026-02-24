import { describe, expect, it } from 'bun:test';
import { parseTaskSummaryCommand, summarizeTaskError } from '../../../src/shared/task-summary.ts';

describe('task-summary utils', () => {
  describe('parseTaskSummaryCommand', () => {
    it('should parse supported task type and description', () => {
      const parsed = parseTaskSummaryCommand(
        'task:skill:search --prompt "find" --description "Search skills"'
      );
      expect(parsed).toEqual({
        taskType: 'skill:search',
        description: 'Search skills',
      });
    });

    it('should support short -d description flag', () => {
      const parsed = parseTaskSummaryCommand(
        'task:general -p "hello" -d "General task"'
      );
      expect(parsed).toEqual({
        taskType: 'general',
        description: 'General task',
      });
    });

    it('should fallback to default description when missing', () => {
      const parsed = parseTaskSummaryCommand('task:explore --prompt "scan src"');
      expect(parsed).toEqual({
        taskType: 'explore',
        description: 'Unnamed task',
      });
    });

    it('should return null for unsupported task command', () => {
      expect(parseTaskSummaryCommand('task:skill:list --description "x"')).toBeNull();
      expect(parseTaskSummaryCommand('read ./README.md')).toBeNull();
    });

    it('should return null for malformed command quotes', () => {
      expect(parseTaskSummaryCommand('task:explore --description "oops')).toBeNull();
    });
  });

  describe('summarizeTaskError', () => {
    it('should prefer message first meaningful line', () => {
      const summary = summarizeTaskError('[stderr]\nstack', 'Failed with timeout\nmore');
      expect(summary).toBe('Failed with timeout');
    });

    it('should fallback to output first meaningful line', () => {
      const summary = summarizeTaskError('[stderr]\nConnection refused', '');
      expect(summary).toBe('Connection refused');
    });

    it('should normalize whitespace and truncate long line', () => {
      const long = `line  ${'x'.repeat(200)}`;
      const summary = summarizeTaskError(long, undefined, 20);
      expect(summary).toBe('line xxxxxxxxxxxx...');
    });
  });
});
