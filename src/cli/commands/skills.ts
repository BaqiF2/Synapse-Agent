/**
 * Skills command - Manage and inspect skills.
 *
 * This file implements the skills command for listing and searching skills.
 *
 * Core exports:
 * - SkillsOptions: Options interface for skills command
 * - skillsCommand: Main function to manage skills
 */

import { SkillLoader } from '../../skills/loader.js';
import { SkillIndex } from '../../skills/skill-index.js';
import { getConfig } from '../../core/config.js';
import chalk from 'chalk';

export interface SkillsOptions {
  list?: boolean;
  search?: string;
  domain?: string;
  info?: string; // Skill name to show info for
}

export async function skillsCommand(options: SkillsOptions): Promise<void> {
  const config = getConfig();
  const loader = new SkillLoader(config.skillsDir);

  // Show detailed info for specific skill
  if (options.info) {
    const skills = await loader.discoverSkills();
    const skillMetadata = skills.find(s => s.name === options.info);

    if (!skillMetadata) {
      console.error(chalk.red(`Skill not found: ${options.info}`));
      console.log(chalk.gray('Available skills:'), skills.map(s => s.name).join(', '));
      return;
    }

    // Load full skill with content
    const fullSkill = await loader.loadFull(skillMetadata.path);

    console.log(chalk.green.bold(fullSkill.metadata.name));
    console.log(chalk.gray(fullSkill.metadata.description));
    console.log('');
    console.log(chalk.dim('Path:'), fullSkill.metadata.path);
    if (fullSkill.metadata.domain) {
      console.log(chalk.dim('Domain:'), fullSkill.metadata.domain);
    }
    if (fullSkill.references && fullSkill.references.length > 0) {
      console.log(chalk.dim('References:'), `${fullSkill.references.length} file(s)`);
    }
    if (fullSkill.scripts && fullSkill.scripts.length > 0) {
      console.log(chalk.dim('Scripts:'), fullSkill.scripts.join(', '));
    }
    console.log('');
    console.log(chalk.blue('Content Preview:'));
    const preview = fullSkill.content.length > 200
      ? fullSkill.content.slice(0, 200) + '...'
      : fullSkill.content;
    console.log(chalk.dim(preview));
    return;
  }

  // Search skills
  if (options.search) {
    const indexPath = `${config.synapseHome}/skills-index.json`;
    const index = await SkillIndex.load(indexPath);
    const results = index.search(options.search);

    console.log(chalk.blue.bold(`Search results for: ${options.search}`));
    console.log('');

    if (results.length === 0) {
      console.log(chalk.gray('No skills found'));
      return;
    }

    results.forEach((skill, i) => {
      console.log(chalk.green(`${i + 1}. ${skill.metadata.name}`));
      console.log(chalk.gray(`   Domain: ${skill.metadata.domain || 'general'}`));
      console.log(chalk.gray(`   ${skill.metadata.description}`));
      console.log('');
    });
    return;
  }

  // Filter by domain
  if (options.domain) {
    const indexPath = `${config.synapseHome}/skills-index.json`;
    const index = await SkillIndex.load(indexPath);
    const results = index.searchByDomain(options.domain);

    console.log(chalk.blue.bold(`Skills in domain: ${options.domain}`));
    console.log('');

    if (results.length === 0) {
      console.log(chalk.gray('No skills found in this domain'));
      return;
    }

    results.forEach((skill, i) => {
      console.log(chalk.green(`${i + 1}. ${skill.metadata.name}`));
      console.log(chalk.gray(`   ${skill.metadata.description}`));
      console.log('');
    });
    return;
  }

  // List all skills (default)
  const skills = await loader.discoverSkills();

  if (skills.length === 0) {
    console.log(chalk.yellow('No skills found.'));
    console.log(chalk.gray('Skills directory:'), config.skillsDir);
    return;
  }

  console.log(chalk.blue.bold('Available Skills'));
  console.log('');

  skills.forEach((skill, i) => {
    const desc = skill.description.length > 50
      ? skill.description.slice(0, 47) + '...'
      : skill.description;
    const domain = skill.domain || 'general';

    console.log(`${chalk.cyan((i + 1).toString().padStart(2))}. ${chalk.yellow(skill.name.padEnd(25))} ${chalk.blue(domain.padEnd(12))} ${chalk.gray(desc)}`);
  });

  console.log('');
  console.log(chalk.gray(`Total: ${skills.length} skills`));
  console.log(chalk.gray('Use --info <skill-name> for details'));
}
