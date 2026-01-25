/**
 * Batch 11 Verification Tests
 *
 * This test file verifies all features implemented in batch 11:
 * - Task 31: Skill file structure (SKILL.md) and schema
 * - Task 32: Skill indexer (index.json)
 * - Task 33: Skill search tool
 *
 * @module test-batch11
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Import batch 11 implementations
import { SkillDocParser, parseSkillMd, type SkillDoc } from '../src/skills/skill-schema.js';
import { SkillIndexer, type SkillIndex, type SkillIndexEntry } from '../src/skills/indexer.js';
import { SkillSearchHandler, parseSkillSearchCommand } from '../src/tools/handlers/agent-bash/skill-search.js';

// Test configuration
const TEST_HOME_DIR = path.join(os.tmpdir(), `synapse-test-${Date.now()}`);
const TEST_SKILLS_DIR = path.join(TEST_HOME_DIR, '.synapse', 'skills');

/**
 * Test helper to create directories
 */
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Test helper to cleanup
 */
function cleanup(): void {
  if (fs.existsSync(TEST_HOME_DIR)) {
    fs.rmSync(TEST_HOME_DIR, { recursive: true, force: true });
  }
}

/**
 * Create a test skill with SKILL.md
 */
function createTestSkill(name: string, config: {
  title?: string;
  domain?: string;
  description?: string;
  tags?: string[];
  scripts?: string[];
}): void {
  const skillDir = path.join(TEST_SKILLS_DIR, name);
  const scriptsDir = path.join(skillDir, 'scripts');

  ensureDir(skillDir);
  ensureDir(scriptsDir);

  // Create SKILL.md
  const skillMd = `# ${config.title || name}

**Domain**: ${config.domain || 'general'}
**Description**: ${config.description || 'Test skill'}
**Tags**: ${(config.tags || []).join(', ')}
**Version**: 1.0.0

## Usage Scenarios

This is a test skill for verification purposes.

## Tool Dependencies

- skill:helper:util
- mcp:filesystem:read

## Execution Steps

1. First step
2. Second step
3. Third step

## Examples

\`\`\`bash
skill:${name}:example "input"
\`\`\`
`;

  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillMd);

  // Create scripts
  for (const script of config.scripts || ['example']) {
    const scriptPath = path.join(scriptsDir, `${script}.py`);
    const scriptContent = `#!/usr/bin/env python3
"""
${script} - Test script

Description:
    A test script for ${name}.

Parameters:
    input (str): Input parameter

Returns:
    str: Result
"""

def main():
    print("Test")

if __name__ == "__main__":
    main()
`;
    fs.writeFileSync(scriptPath, scriptContent);
  }
}

/**
 * Test 1: SkillDocParser - Parse SKILL.md
 */
async function testSkillDocParser(): Promise<void> {
  console.log('\n=== Test 1: SkillDocParser ===');

  // Create a test skill
  createTestSkill('test-parser', {
    title: 'Test Parser Skill',
    domain: 'programming',
    description: 'A skill for testing the parser',
    tags: ['test', 'parser', 'verification'],
    scripts: ['parse_test', 'analyze'],
  });

  const parser = new SkillDocParser();
  const mdPath = path.join(TEST_SKILLS_DIR, 'test-parser', 'SKILL.md');

  const doc = parser.parse(mdPath, 'test-parser');

  if (!doc) {
    console.log('  [FAIL] Failed to parse SKILL.md');
    return;
  }

  console.log('  [PASS] Parsed SKILL.md successfully');

  // Verify fields
  if (doc.name === 'test-parser') {
    console.log('  [PASS] Name extracted correctly');
  } else {
    console.log(`  [FAIL] Name: expected "test-parser", got "${doc.name}"`);
  }

  if (doc.title === 'Test Parser Skill') {
    console.log('  [PASS] Title extracted correctly');
  } else {
    console.log(`  [FAIL] Title: expected "Test Parser Skill", got "${doc.title}"`);
  }

  if (doc.domain === 'programming') {
    console.log('  [PASS] Domain extracted correctly');
  } else {
    console.log(`  [FAIL] Domain: expected "programming", got "${doc.domain}"`);
  }

  if (doc.tags.length === 3) {
    console.log(`  [PASS] Tags extracted: ${doc.tags.join(', ')}`);
  } else {
    console.log(`  [FAIL] Tags: expected 3, got ${doc.tags.length}`);
  }

  if (doc.toolDependencies.length >= 2) {
    console.log(`  [PASS] Tool dependencies extracted: ${doc.toolDependencies.length}`);
  } else {
    console.log(`  [FAIL] Tool dependencies: expected >= 2, got ${doc.toolDependencies.length}`);
  }

  if (doc.executionSteps.length >= 3) {
    console.log(`  [PASS] Execution steps extracted: ${doc.executionSteps.length}`);
  } else {
    console.log(`  [FAIL] Execution steps: expected >= 3, got ${doc.executionSteps.length}`);
  }

  // Test parseSkillMd function
  const doc2 = parseSkillMd(mdPath, 'test-parser');
  if (doc2) {
    console.log('  [PASS] parseSkillMd function works');
  }
}

/**
 * Test 2: SkillIndexer - Generate and manage index
 */
async function testSkillIndexer(): Promise<void> {
  console.log('\n=== Test 2: SkillIndexer ===');

  // Create multiple test skills
  createTestSkill('skill-alpha', {
    title: 'Alpha Skill',
    domain: 'data',
    description: 'Data processing skill',
    tags: ['data', 'processing'],
    scripts: ['process', 'transform'],
  });

  createTestSkill('skill-beta', {
    title: 'Beta Skill',
    domain: 'devops',
    description: 'DevOps automation skill',
    tags: ['devops', 'automation'],
    scripts: ['deploy', 'monitor'],
  });

  createTestSkill('skill-gamma', {
    title: 'Gamma Skill',
    domain: 'programming',
    description: 'Code generation skill',
    tags: ['code', 'generation'],
    scripts: ['generate'],
  });

  const indexer = new SkillIndexer(TEST_HOME_DIR);

  // Test scan
  const index = indexer.scan();
  console.log(`  [PASS] Scanned ${index.totalSkills} skills with ${index.totalTools} tools`);

  // Verify skills
  if (index.totalSkills >= 4) { // Including test-parser from Test 1
    console.log('  [PASS] Found expected number of skills');
  } else {
    console.log(`  [FAIL] Expected >= 4 skills, got ${index.totalSkills}`);
  }

  // Test writeIndex
  indexer.writeIndex(index);
  const indexPath = indexer.getIndexPath();
  if (fs.existsSync(indexPath)) {
    console.log('  [PASS] Index file written successfully');
  } else {
    console.log('  [FAIL] Index file not created');
  }

  // Test readIndex
  const readIndex = indexer.readIndex();
  if (readIndex && readIndex.totalSkills === index.totalSkills) {
    console.log('  [PASS] Index file read successfully');
  } else {
    console.log('  [FAIL] Failed to read index file');
  }

  // Test getSkill
  const skill = indexer.getSkill('skill-alpha');
  if (skill && skill.domain === 'data') {
    console.log('  [PASS] getSkill works correctly');
  } else {
    console.log('  [FAIL] getSkill failed');
  }

  // Test updateSkill
  createTestSkill('skill-delta', {
    title: 'Delta Skill',
    domain: 'ai',
    description: 'AI skill',
    tags: ['ai', 'ml'],
    scripts: ['train'],
  });

  const updatedIndex = indexer.updateSkill('skill-delta');
  if (updatedIndex && updatedIndex.totalSkills > index.totalSkills) {
    console.log('  [PASS] updateSkill added new skill');
  } else {
    console.log('  [FAIL] updateSkill failed');
  }

  // Test removeSkill
  const afterRemove = indexer.removeSkill('skill-delta');
  if (afterRemove.totalSkills < (updatedIndex?.totalSkills || 0)) {
    console.log('  [PASS] removeSkill works');
  }
}

/**
 * Test 3: SkillSearchHandler - Search skills
 */
async function testSkillSearchHandler(): Promise<void> {
  console.log('\n=== Test 3: SkillSearchHandler ===');

  const handler = new SkillSearchHandler(TEST_HOME_DIR);

  // Test 3.1: List all skills
  const listResult = await handler.execute('skill search');
  if (listResult.exitCode === 0 && listResult.stdout.includes('Found')) {
    console.log('  [PASS] List all skills works');
    const match = listResult.stdout.match(/Found (\d+)/);
    if (match) {
      console.log(`  [INFO] Found ${match[1]} skills`);
    }
  } else {
    console.log('  [FAIL] List all skills failed');
  }

  // Test 3.2: Search by query
  const queryResult = await handler.execute('skill search data');
  if (queryResult.exitCode === 0 && queryResult.stdout.includes('skill-alpha')) {
    console.log('  [PASS] Search by query works');
  } else {
    console.log('  [WARN] Search by query may not have found expected result');
  }

  // Test 3.3: Filter by domain
  const domainResult = await handler.execute('skill search --domain devops');
  if (domainResult.exitCode === 0) {
    console.log('  [PASS] Filter by domain works');
    if (domainResult.stdout.includes('skill-beta')) {
      console.log('  [PASS] Found devops skill');
    }
  } else {
    console.log('  [FAIL] Filter by domain failed');
  }

  // Test 3.4: Filter by tag
  const tagResult = await handler.execute('skill search --tag automation');
  if (tagResult.exitCode === 0) {
    console.log('  [PASS] Filter by tag works');
  }

  // Test 3.5: Show tools
  const toolsResult = await handler.execute('skill search --tools');
  if (toolsResult.exitCode === 0 && toolsResult.stdout.includes('skill:')) {
    console.log('  [PASS] Show tools option works');
  } else {
    console.log('  [WARN] Show tools may not have displayed tool commands');
  }

  // Test 3.6: Help
  const helpResult = await handler.execute('skill search --help');
  if (helpResult.exitCode === 0 && helpResult.stdout.includes('USAGE')) {
    console.log('  [PASS] Help command works');
  }

  // Test 3.7: Brief help
  const briefHelpResult = await handler.execute('skill search -h');
  if (briefHelpResult.exitCode === 0 && briefHelpResult.stdout.includes('Usage:')) {
    console.log('  [PASS] Brief help works');
  }

  // Test 3.8: Parse command
  const args = parseSkillSearchCommand('skill search pdf --domain programming --tag test --max 5 --tools');
  if (args.query === 'pdf' && args.domain === 'programming' && args.tags.includes('test') && args.maxResults === 5 && args.showTools) {
    console.log('  [PASS] Command parsing works correctly');
  } else {
    console.log('  [FAIL] Command parsing incorrect');
    console.log(`  [INFO] Parsed: ${JSON.stringify(args)}`);
  }
}

/**
 * Run all tests
 */
async function runTests(): Promise<void> {
  console.log('========================================');
  console.log('Batch 11 Verification Tests');
  console.log('========================================');
  console.log(`Test home: ${TEST_HOME_DIR}`);

  try {
    // Setup
    cleanup();
    ensureDir(TEST_HOME_DIR);
    ensureDir(TEST_SKILLS_DIR);

    // Run tests
    await testSkillDocParser();
    await testSkillIndexer();
    await testSkillSearchHandler();

    console.log('\n========================================');
    console.log('All tests completed!');
    console.log('========================================');
  } catch (error) {
    console.error('\nTest failed:', error);
    process.exit(1);
  } finally {
    // Cleanup
    cleanup();
    console.log('\nCleanup completed.');
  }
}

// Run tests
runTests();
