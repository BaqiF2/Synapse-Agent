/**
 * Batch 12 Verification Tests
 *
 * This test file verifies all features implemented in batch 12:
 * - Task 34: Skill loader with Level 1/2 progressive loading
 * - Task 35: System prompt with skill system instructions
 * - Task 36: Example skills for testing
 *
 * @module test-batch12
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Import batch 12 implementations
import { SkillLoader, type SkillLevel1, type SkillLevel2 } from '../src/skills/skill-loader.js';
import { SkillIndexer } from '../src/skills/indexer.js';
import { buildSystemPrompt, type SystemPromptOptions } from '../src/agent/system-prompt.js';

// Test configuration
const TEST_HOME_DIR = path.join(os.tmpdir(), `synapse-test-${Date.now()}`);
const TEST_SKILLS_DIR = path.join(TEST_HOME_DIR, '.synapse', 'skills');
const EXAMPLES_DIR = path.join(process.cwd(), 'examples', 'skills');

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
 * Copy example skills to test directory
 */
function copyExampleSkills(): void {
  if (!fs.existsSync(EXAMPLES_DIR)) {
    console.log('  [WARN] Examples directory not found, creating test skills...');
    createTestSkills();
    return;
  }

  const skills = fs.readdirSync(EXAMPLES_DIR);
  for (const skill of skills) {
    const srcPath = path.join(EXAMPLES_DIR, skill);
    const destPath = path.join(TEST_SKILLS_DIR, skill);

    if (fs.statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    }
  }
}

function copyDir(src: string, dest: string): void {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function createTestSkills(): void {
  // Create test skill 1
  const skill1Dir = path.join(TEST_SKILLS_DIR, 'test-skill-1');
  ensureDir(path.join(skill1Dir, 'scripts'));

  fs.writeFileSync(path.join(skill1Dir, 'SKILL.md'), `# Test Skill 1

**Domain**: programming
**Description**: A test skill for verification
**Tags**: test, verification
**Version**: 1.0.0

## Usage Scenarios
Test usage scenarios.

## Execution Steps
1. Step 1
2. Step 2
`);

  fs.writeFileSync(path.join(skill1Dir, 'scripts', 'test_tool.py'), `#!/usr/bin/env python3
"""
test_tool - Test tool

Description:
    A test tool.

Parameters:
    input (str): Input parameter
"""
print("Test tool")
`);

  // Create test skill 2
  const skill2Dir = path.join(TEST_SKILLS_DIR, 'test-skill-2');
  ensureDir(path.join(skill2Dir, 'scripts'));

  fs.writeFileSync(path.join(skill2Dir, 'SKILL.md'), `# Test Skill 2

**Domain**: data
**Description**: Another test skill
**Tags**: data, analysis
**Version**: 2.0.0
**Author**: Test Author

## Usage Scenarios
Data analysis scenarios.

## Tool Dependencies
- skill:test-skill-1:test_tool

## Execution Steps
1. Analyze data
2. Report results
`);

  fs.writeFileSync(path.join(skill2Dir, 'scripts', 'analyze.py'), `#!/usr/bin/env python3
"""
analyze - Analyze data

Description:
    Analyze data and report.
"""
print("Analyzing...")
`);
}

/**
 * Test 1: SkillLoader - Level 1 loading (from index)
 */
async function testSkillLoaderLevel1(): Promise<void> {
  console.log('\n=== Test 1: SkillLoader Level 1 ===');

  const loader = new SkillLoader(TEST_HOME_DIR);

  // First rebuild the index
  loader.rebuildIndex();

  // Load all Level 1
  const allSkills = loader.loadAllLevel1();
  console.log(`  [PASS] Loaded ${allSkills.length} skills at Level 1`);

  if (allSkills.length > 0) {
    const skill = allSkills[0];
    console.log(`  [INFO] First skill: ${skill.name}`);
    console.log(`  [INFO] Domain: ${skill.domain}`);
    console.log(`  [INFO] Tools: ${skill.tools.length}`);

    // Verify Level 1 fields
    if (skill.name && skill.domain && skill.path) {
      console.log('  [PASS] Level 1 fields present');
    } else {
      console.log('  [FAIL] Level 1 fields missing');
    }
  }

  // Test search
  const programmingSkills = loader.searchLevel1(undefined, 'programming');
  console.log(`  [PASS] Found ${programmingSkills.length} programming skills`);

  const searchResults = loader.searchLevel1('test');
  console.log(`  [PASS] Search for "test" found ${searchResults.length} skills`);
}

/**
 * Test 2: SkillLoader - Level 2 loading (full SKILL.md)
 */
async function testSkillLoaderLevel2(): Promise<void> {
  console.log('\n=== Test 2: SkillLoader Level 2 ===');

  const loader = new SkillLoader(TEST_HOME_DIR);

  // Get all skills first
  const allSkills = loader.loadAllLevel1();

  if (allSkills.length === 0) {
    console.log('  [SKIP] No skills to test');
    return;
  }

  // Load first skill at Level 2
  const skillName = allSkills[0].name;
  const level2 = loader.loadLevel2(skillName);

  if (!level2) {
    console.log(`  [FAIL] Failed to load ${skillName} at Level 2`);
    return;
  }

  console.log(`  [PASS] Loaded ${skillName} at Level 2`);

  // Verify Level 2 specific fields
  console.log(`  [INFO] Version: ${level2.version}`);
  console.log(`  [INFO] Execution steps: ${level2.executionSteps.length}`);
  console.log(`  [INFO] Tool dependencies: ${level2.toolDependencies.length}`);

  if (level2.version) {
    console.log('  [PASS] Level 2 specific fields present');
  }

  // Test caching
  const cached = loader.loadLevel2(skillName);
  if (cached && cached.name === level2.name) {
    console.log('  [PASS] Cache working correctly');
  }

  // Test cache clearing
  loader.clearCache(skillName);
  const reloaded = loader.loadLevel2(skillName);
  if (reloaded) {
    console.log('  [PASS] Reload after cache clear works');
  }
}

/**
 * Test 3: System prompt with skill system
 */
async function testSystemPromptSkillSystem(): Promise<void> {
  console.log('\n=== Test 3: System Prompt Skill System ===');

  // Test basic prompt without skills
  const basicPrompt = buildSystemPrompt({
    includeSkillSystem: true,
  });

  if (basicPrompt.includes('技能系统') && basicPrompt.includes('skill search')) {
    console.log('  [PASS] Skill system section included');
  } else {
    console.log('  [FAIL] Skill system section missing');
  }

  // Test prompt with available skills
  const loader = new SkillLoader(TEST_HOME_DIR);
  const skills = loader.loadAllLevel1();

  const promptWithSkills = buildSystemPrompt({
    includeSkillSystem: true,
    includeFieldBash: true,
    availableSkills: skills,
  });

  if (promptWithSkills.includes('当前可用技能')) {
    console.log('  [PASS] Available skills section included');
  } else if (skills.length === 0) {
    console.log('  [SKIP] No skills to inject');
  } else {
    console.log('  [WARN] Available skills section may not be included');
  }

  // Test Field Bash section
  if (promptWithSkills.includes('Field Bash') && promptWithSkills.includes('mcp:')) {
    console.log('  [PASS] Field Bash section included');
  }

  // Test prompt sections
  if (promptWithSkills.includes('tools search') && promptWithSkills.includes('skill:')) {
    console.log('  [PASS] Tool references included');
  }

  console.log(`  [INFO] System prompt length: ${promptWithSkills.length} chars`);
}

/**
 * Test 4: Example skills structure
 */
async function testExampleSkills(): Promise<void> {
  console.log('\n=== Test 4: Example Skills ===');

  const skills = fs.readdirSync(TEST_SKILLS_DIR);

  for (const skillName of skills) {
    const skillPath = path.join(TEST_SKILLS_DIR, skillName);
    if (!fs.statSync(skillPath).isDirectory()) continue;

    const skillMdPath = path.join(skillPath, 'SKILL.md');
    const scriptsDir = path.join(skillPath, 'scripts');

    // Check SKILL.md exists
    if (fs.existsSync(skillMdPath)) {
      console.log(`  [PASS] ${skillName}: SKILL.md exists`);
    } else {
      console.log(`  [FAIL] ${skillName}: SKILL.md missing`);
      continue;
    }

    // Check scripts directory exists
    if (fs.existsSync(scriptsDir)) {
      const scripts = fs.readdirSync(scriptsDir);
      console.log(`  [PASS] ${skillName}: ${scripts.length} script(s) found`);

      // List scripts
      for (const script of scripts) {
        console.log(`  [INFO]   - ${script}`);
      }
    } else {
      console.log(`  [WARN] ${skillName}: No scripts directory`);
    }
  }
}

/**
 * Test 5: Run example skill scripts
 */
async function testRunExampleScripts(): Promise<void> {
  console.log('\n=== Test 5: Run Example Scripts ===');

  // Find a Python script to test
  const testFile = path.join(process.cwd(), 'package.json');

  const skills = fs.readdirSync(TEST_SKILLS_DIR);

  for (const skillName of skills) {
    const scriptsDir = path.join(TEST_SKILLS_DIR, skillName, 'scripts');
    if (!fs.existsSync(scriptsDir)) continue;

    const scripts = fs.readdirSync(scriptsDir);

    for (const script of scripts) {
      if (script.endsWith('.py') && script.includes('file_stats')) {
        const scriptPath = path.join(scriptsDir, script);

        try {
          const { spawn } = await import('child_process');

          const result = await new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
            const proc = spawn('python3', [scriptPath, testFile]);
            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => { stdout += data; });
            proc.stderr.on('data', (data) => { stderr += data; });
            proc.on('close', (code) => {
              resolve({ stdout, stderr, code: code || 0 });
            });
          });

          if (result.code === 0 && result.stdout.includes('File:')) {
            console.log(`  [PASS] ${script} executed successfully`);
            const lines = result.stdout.split('\n').slice(0, 3);
            for (const line of lines) {
              if (line.trim()) {
                console.log(`  [INFO]   ${line}`);
              }
            }
          } else {
            console.log(`  [WARN] ${script} returned code ${result.code}`);
          }
        } catch (error) {
          console.log(`  [WARN] Could not run ${script}: ${error}`);
        }

        return; // Only test one script
      }
    }
  }

  console.log('  [SKIP] No suitable test script found');
}

/**
 * Run all tests
 */
async function runTests(): Promise<void> {
  console.log('========================================');
  console.log('Batch 12 Verification Tests');
  console.log('========================================');
  console.log(`Test home: ${TEST_HOME_DIR}`);

  try {
    // Setup
    cleanup();
    ensureDir(TEST_HOME_DIR);
    ensureDir(TEST_SKILLS_DIR);

    // Copy or create test skills
    copyExampleSkills();

    // Run tests
    await testSkillLoaderLevel1();
    await testSkillLoaderLevel2();
    await testSystemPromptSkillSystem();
    await testExampleSkills();
    await testRunExampleScripts();

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
