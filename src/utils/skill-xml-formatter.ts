/**
 * Skill XML Formatter
 *
 * Formats skill search results as XML for injection into LLM context.
 *
 * @module skill-xml-formatter
 *
 * Core Exports:
 * - formatSkillsAsXml: Format skills as XML
 * - SkillMatch: Skill match type
 */

/**
 * Skill match structure
 */
export interface SkillMatch {
  name: string;
  description: string;
}

/**
 * Escape special XML characters
 *
 * @param text - Text to escape
 * @returns Escaped text
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Format skills as XML for LLM context injection
 *
 * Output format:
 * ```xml
 * <available-skills>
 *   <skill name="skill-name">
 *     Skill description
 *   </skill>
 * </available-skills>
 * ```
 *
 * @param skills - Array of skill matches
 * @returns XML formatted string
 */
export function formatSkillsAsXml(skills: SkillMatch[]): string {
  const lines: string[] = ['<available-skills>'];

  for (const skill of skills) {
    lines.push(`  <skill name="${escapeXml(skill.name)}">`);
    lines.push(`    ${escapeXml(skill.description)}`);
    lines.push('  </skill>');
  }

  lines.push('</available-skills>');
  return lines.join('\n');
}

// Default export
export default formatSkillsAsXml;
