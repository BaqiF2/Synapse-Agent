import { describe, it, expect } from 'bun:test';
import { TreeBuilder } from '../../../src/cli/tree-builder.ts';

function stripAnsi(text: string): string {
  return text.replace(new RegExp('\\x1b\\[[0-9;]*m', 'g'), '');
}

describe('TreeBuilder', () => {
  it('should build prefix for root depth', () => {
    const builder = new TreeBuilder();
    const prefix = stripAnsi(builder.getPrefix(0, false));

    expect(prefix).toBe('• ');
  });

  it('should build prefix for nested depth', () => {
    const builder = new TreeBuilder();
    const prefix = stripAnsi(builder.getPrefix(2, false));

    expect(prefix).toBe('│ │ ├─ ');
  });

  it('should build prefix for last item at depth', () => {
    const builder = new TreeBuilder();
    const prefix = stripAnsi(builder.getPrefix(2, true));

    expect(prefix).toBe('│ │ └─ ');
  });

  it('should build result prefix', () => {
    const builder = new TreeBuilder();
    const prefix = stripAnsi(builder.getResultPrefix(0, false));

    expect(prefix).toBe('└─ ');
  });

  it('should build result prefix for nested depth', () => {
    const builder = new TreeBuilder();
    const prefix = stripAnsi(builder.getResultPrefix(1, true));

    expect(prefix).toBe('│   └─ ');
  });

  it('should build sub-agent end prefix', () => {
    const builder = new TreeBuilder();
    const prefix = stripAnsi(builder.getSubAgentEndPrefix());

    expect(prefix).toBe('└─ ');
  });
});
