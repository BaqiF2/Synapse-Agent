import { describe, it, expect } from 'bun:test';
import { getConfig } from '../../src/sub-agents/configs/index.ts';


describe('IT: Sub-agent config flow', () => {
  it('should return configs for supported types', () => {
    const general = getConfig('general');
    const explore = getConfig('explore');

    expect(general.type).toBe('general');
    expect(explore.type).toBe('explore');
  });

  it('should build skill config dynamically', () => {
    const skill = getConfig('skill');

    expect(skill.type).toBe('skill');
    expect(skill.permissions.exclude.length).toBeGreaterThan(0);
  });
});
