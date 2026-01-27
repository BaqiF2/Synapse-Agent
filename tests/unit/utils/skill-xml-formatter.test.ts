/**
 * Skill XML Formatter Tests
 *
 * Tests for formatting skill search results as XML.
 */

import { describe, expect, it } from 'bun:test';
import { formatSkillsAsXml, type SkillMatch } from '../../../src/utils/skill-xml-formatter.ts';

describe('formatSkillsAsXml', () => {
  it('should format skills as XML', () => {
    const skills: SkillMatch[] = [
      { name: 'code-analyzer', description: 'Analyzes code quality' },
      { name: 'test-runner', description: 'Runs test suites' },
    ];

    const xml = formatSkillsAsXml(skills);

    expect(xml).toContain('<available-skills>');
    expect(xml).toContain('</available-skills>');
    expect(xml).toContain('<skill name="code-analyzer">');
    expect(xml).toContain('Analyzes code quality');
    expect(xml).toContain('<skill name="test-runner">');
  });

  it('should handle empty skills list', () => {
    const xml = formatSkillsAsXml([]);
    expect(xml).toContain('<available-skills>');
    expect(xml).toContain('</available-skills>');
    expect(xml).not.toContain('<skill');
  });

  it('should escape special XML characters', () => {
    const skills: SkillMatch[] = [
      { name: 'test', description: 'Handles <xml> & "quotes"' },
    ];

    const xml = formatSkillsAsXml(skills);

    expect(xml).toContain('&lt;xml&gt;');
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&quot;quotes&quot;');
  });
});
