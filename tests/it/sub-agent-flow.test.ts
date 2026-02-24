import { describe, it, expect } from 'bun:test';
import { getConfig } from '../../src/core/sub-agents/configs/index.ts';


describe('IT: Sub-agent config flow', () => {
  it('should return configs for supported types', async () => {
    const general = await getConfig('general');
    const explore = await getConfig('explore');

    expect(general.type).toBe('general');
    expect(explore.type).toBe('explore');
  });

  it('should build skill config dynamically', async () => {
    const skill = await getConfig('skill');

    expect(skill.type).toBe('skill');
    expect(skill.permissions.exclude.length).toBeGreaterThan(0);
  });
});
