/**
 * Skill System Full Integration Tests
 *
 * Complete end-to-end tests for the entire skill system.
 * Tests complete skill lifecycle, settings persistence,
 * multi-skill scenarios, and error handling.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillCommandHandler } from '../../src/tools/handlers/skill-command-handler.ts';
import { SkillSubAgent } from '../../src/agent/skill-sub-agent.ts';
import { SkillEnhancer } from '../../src/skills/skill-enhancer.ts';
import { SkillGenerator } from '../../src/skills/skill-generator.ts';
import { SkillIndexUpdater } from '../../src/skills/index-updater.ts';
import { SettingsManager } from '../../src/config/settings-manager.ts';

describe('Skill System Full Integration', () => {
  let testHomeDir: string;
  let testDir: string;
  let skillsDir: string;
  let conversationsDir: string;
  let handler: SkillCommandHandler;

  beforeEach(() => {
    // testHomeDir simulates user home dir
    // testDir is .synapse directory inside testHomeDir
    testHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-full-integration-'));
    testDir = path.join(testHomeDir, '.synapse');
    skillsDir = path.join(testDir, 'skills');
    conversationsDir = path.join(testDir, 'conversations');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.mkdirSync(conversationsDir, { recursive: true });

    handler = new SkillCommandHandler({ skillsDir, synapseDir: testDir });
  });

  afterEach(() => {
    handler.shutdown();
    fs.rmSync(testHomeDir, { recursive: true, force: true });
  });

  describe('Complete Skill Lifecycle', () => {
    it('should handle skill creation -> indexing -> search -> load', async () => {
      // 1. Create a skill programmatically
      const generator = new SkillGenerator(skillsDir);
      const createResult = generator.createSkill({
        name: 'file-processor',
        description: 'Processes files in batches',
        quickStart: '```bash\nfile-processor --input *.txt\n```',
        executionSteps: ['Find files', 'Process each file', 'Generate report'],
        bestPractices: ['Use glob patterns', 'Handle errors gracefully'],
        examples: ['Process all text files: file-processor *.txt'],
        domain: 'automation',
        tags: ['files', 'batch', 'processing'],
      });

      expect(createResult.success).toBe(true);
      expect(fs.existsSync(path.join(skillsDir, 'file-processor', 'SKILL.md'))).toBe(true);

      // 2. Update index (using testHomeDir as home directory)
      const indexUpdater = new SkillIndexUpdater(testHomeDir);
      indexUpdater.addSkill('file-processor');

      expect(fs.existsSync(path.join(skillsDir, 'index.json'))).toBe(true);

      // 3. Create new handler to pick up new skill
      handler.shutdown();
      handler = new SkillCommandHandler({ skillsDir, synapseDir: testDir });

      // 4. Search for skill
      const searchResult = await handler.execute('skill:search batch');
      expect(searchResult.exitCode).toBe(0);
      expect(searchResult.stdout).toContain('file-processor');

      // 5. Load skill (body content doesn't include frontmatter description)
      const loadResult = await handler.execute('skill:load file-processor');
      expect(loadResult.exitCode).toBe(0);
      expect(loadResult.stdout).toContain('File Processor'); // Title from body
    });

    it('should handle skill update', async () => {
      // Create initial skill
      const generator = new SkillGenerator(skillsDir);
      generator.createSkill({
        name: 'test-skill',
        description: 'A test skill',
        quickStart: 'test-skill --help',
        executionSteps: ['Step 1'],
        bestPractices: [],
        examples: [],
      });

      // Update skill
      const updateResult = generator.updateSkill('test-skill', {
        bestPractices: ['Use glob patterns', 'Handle errors gracefully', 'NEW: Log progress'],
      });
      expect(updateResult.success).toBe(true);

      // Verify update via sub-agent
      const subAgent = new SkillSubAgent({ skillsDir });
      const content = subAgent.getSkillContent('test-skill');
      expect(content).toContain('Log progress');
      subAgent.shutdown();
    });
  });

  describe('Settings Persistence Across Components', () => {
    it('should share settings between components', async () => {
      // 1. Enable auto-enhance via handler
      const enableResult = await handler.execute('skill:enhance --on');
      expect(enableResult.exitCode).toBe(0);

      // 2. Verify settings persisted
      const settings = new SettingsManager(testDir);
      expect(settings.isAutoEnhanceEnabled()).toBe(true);

      // 3. Disable via handler
      const disableResult = await handler.execute('skill:enhance --off');
      expect(disableResult.exitCode).toBe(0);

      // 4. Verify via fresh settings instance
      const settings2 = new SettingsManager(testDir);
      expect(settings2.isAutoEnhanceEnabled()).toBe(false);
    });

    it('should maintain settings across handler restarts', async () => {
      await handler.execute('skill:enhance --on');

      // Restart handler
      handler.shutdown();
      handler = new SkillCommandHandler({ skillsDir, synapseDir: testDir });

      // Check status
      const statusResult = await handler.execute('skill:enhance');
      expect(statusResult.stdout).toContain('enabled');
    });
  });

  describe('Multi-Skill Search and Selection', () => {
    it('should search and select among multiple skills', async () => {
      // Create multiple skills
      const generator = new SkillGenerator(skillsDir);
      const indexUpdater = new SkillIndexUpdater(testHomeDir);

      const skills = [
        { name: 'python-linter', description: 'Lints Python code', domain: 'programming', tags: ['python', 'lint'] },
        { name: 'js-formatter', description: 'Formats JavaScript code', domain: 'programming', tags: ['javascript', 'format'] },
        { name: 'code-reviewer', description: 'Reviews code for issues', domain: 'programming', tags: ['review', 'code'] },
      ];

      for (const skill of skills) {
        generator.createSkill({
          ...skill,
          quickStart: '',
          executionSteps: [],
          bestPractices: [],
          examples: [],
        });
        indexUpdater.addSkill(skill.name);
      }

      // Restart handler to pick up new skills
      handler.shutdown();
      handler = new SkillCommandHandler({ skillsDir, synapseDir: testDir });

      // Search for Python-related
      const pythonResult = await handler.execute('skill:search python');
      expect(pythonResult.stdout).toContain('python-linter');

      // Search for code-related (should return multiple)
      const codeResult = await handler.execute('skill:search code');
      expect(codeResult.stdout).toContain('code-reviewer');

      // Search for "format" to find js-formatter via description
      const formatResult = await handler.execute('skill:search format');
      expect(formatResult.stdout).toContain('js-formatter');
    });
  });

  describe('Enhancement from Real Conversation', () => {
    it('should analyze conversation for enhancement opportunities', () => {
      // Create initial skill
      const generator = new SkillGenerator(skillsDir);
      generator.createSkill({
        name: 'log-analyzer',
        description: 'Analyzes log files',
        quickStart: 'search ERROR *.log',
        executionSteps: ['Find logs', 'Search errors'],
        bestPractices: [],
        examples: [],
      });

      // Create conversation that uses tools
      const convPath = path.join(conversationsDir, 'improve-skill.jsonl');
      const messages = [
        { id: 'm1', timestamp: '2025-01-27T10:00:00Z', role: 'user', content: 'Analyze the logs but also check for warnings' },
        { id: 'm2', timestamp: '2025-01-27T10:00:01Z', role: 'assistant', content: [
          { type: 'tool_use', id: 't1', name: 'search', input: { pattern: 'ERROR|WARN' } },
        ]},
        { id: 'm3', timestamp: '2025-01-27T10:00:02Z', role: 'user', content: [
          { type: 'tool_result', tool_use_id: 't1', content: 'ERROR: fail\nWARN: slow' },
        ]},
        { id: 'm4', timestamp: '2025-01-27T10:00:03Z', role: 'assistant', content: [
          { type: 'tool_use', id: 't2', name: 'read', input: { path: 'app.log' } },
        ]},
        { id: 'm5', timestamp: '2025-01-27T10:00:04Z', role: 'user', content: [
          { type: 'tool_result', tool_use_id: 't2', content: 'Full log content...' },
        ]},
        { id: 'm6', timestamp: '2025-01-27T10:00:05Z', role: 'assistant', content: 'Found errors and warnings.' },
      ];
      fs.writeFileSync(convPath, messages.map(m => JSON.stringify(m)).join('\n'));

      // Analyze
      const enhancer = new SkillEnhancer({ skillsDir, homeDir: testDir });
      const analysis = enhancer.analyzeConversation(convPath);

      // Should detect tool usage
      expect(analysis.summary.toolCalls).toBeGreaterThanOrEqual(2);
      expect(analysis.summary.uniqueTools.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing skill gracefully', async () => {
      const result = await handler.execute('skill:load nonexistent-skill');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('not found');
    });

    it('should require query for skill:search', async () => {
      // skill:search without query should return error
      const result = await handler.execute('skill:search');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('<query> is required');
    });

    it('should handle corrupted skill files', () => {
      // Create corrupted skill
      const skillDir = path.join(skillsDir, 'corrupted');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'not valid yaml frontmatter');

      const subAgent = new SkillSubAgent({ skillsDir });
      // Should not crash, just skip the corrupted skill
      expect(subAgent.isInitialized()).toBe(true);
      subAgent.shutdown();
    });

    it('should handle empty skills directory', () => {
      const emptyDir = path.join(testDir, 'empty-skills');
      fs.mkdirSync(emptyDir, { recursive: true });

      const subAgent = new SkillSubAgent({ skillsDir: emptyDir });
      expect(subAgent.isInitialized()).toBe(true);
      expect(subAgent.getSkillCount()).toBe(0);
      subAgent.shutdown();
    });

    it('should prevent duplicate skill creation', () => {
      const generator = new SkillGenerator(skillsDir);

      // Create first skill
      const result1 = generator.createSkill({
        name: 'unique-skill',
        description: 'A unique skill',
        quickStart: '',
        executionSteps: [],
        bestPractices: [],
        examples: [],
      });
      expect(result1.success).toBe(true);

      // Try to create duplicate
      const result2 = generator.createSkill({
        name: 'unique-skill',
        description: 'Duplicate',
        quickStart: '',
        executionSteps: [],
        bestPractices: [],
        examples: [],
      });
      expect(result2.success).toBe(false);
      expect(result2.error).toContain('already exists');
    });
  });

  describe('Component Integration', () => {
    it('should integrate SkillGenerator with SkillIndexUpdater', () => {
      const generator = new SkillGenerator(skillsDir);
      const indexUpdater = new SkillIndexUpdater(testHomeDir);

      // Create skill
      generator.createSkill({
        name: 'integrated-skill',
        description: 'Tests component integration',
        quickStart: '',
        executionSteps: [],
        bestPractices: [],
        examples: [],
      });

      // Add to index
      indexUpdater.addSkill('integrated-skill');

      // Verify in index
      const index = indexUpdater.getIndex();
      expect(index).not.toBeNull();
      expect(index?.skills.some(s => s.name === 'integrated-skill')).toBe(true);
    });

    it('should integrate SkillSubAgent with SkillCommandHandler', async () => {
      // Create skill
      const generator = new SkillGenerator(skillsDir);
      generator.createSkill({
        name: 'handler-test',
        description: 'Tests handler integration',
        quickStart: '',
        executionSteps: [],
        bestPractices: [],
        examples: [],
      });

      // Restart handler
      handler.shutdown();
      handler = new SkillCommandHandler({ skillsDir, synapseDir: testDir });

      // Access through handler
      const loadResult = await handler.execute('skill:load handler-test');
      expect(loadResult.exitCode).toBe(0);
      expect(loadResult.stdout).toContain('handler-test');

      // Get sub-agent directly
      const subAgent = handler.getSubAgent();
      expect(subAgent.getSkillCount()).toBeGreaterThanOrEqual(1);
    });

    it('should integrate SettingsManager with AutoEnhanceTrigger', async () => {
      const { AutoEnhanceTrigger } = await import('../../src/agent/auto-enhance-trigger.ts');

      const trigger = new AutoEnhanceTrigger({ synapseDir: testDir });
      const settings = new SettingsManager(testDir);

      // Initially disabled
      expect(trigger.isEnabled()).toBe(false);
      expect(settings.isAutoEnhanceEnabled()).toBe(false);

      // Enable via trigger
      trigger.enable();

      // Verify via settings
      settings.clearCache();
      expect(settings.isAutoEnhanceEnabled()).toBe(true);

      // Disable via settings
      settings.setAutoEnhance(false);

      // Verify via trigger (creates new instance to check)
      const trigger2 = new AutoEnhanceTrigger({ synapseDir: testDir });
      expect(trigger2.isEnabled()).toBe(false);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple skills being created', () => {
      const generator = new SkillGenerator(skillsDir);

      const skillNames = ['skill-a', 'skill-b', 'skill-c', 'skill-d', 'skill-e'];

      for (const name of skillNames) {
        const result = generator.createSkill({
          name,
          description: `Description for ${name}`,
          quickStart: '',
          executionSteps: [],
          bestPractices: [],
          examples: [],
        });
        expect(result.success).toBe(true);
      }

      // Verify all created
      const subAgent = new SkillSubAgent({ skillsDir });
      expect(subAgent.getSkillCount()).toBe(5);
      subAgent.shutdown();
    });

    it('should handle rapid search operations', async () => {
      // Create some skills first
      const generator = new SkillGenerator(skillsDir);
      generator.createSkill({
        name: 'search-target',
        description: 'A skill to search for',
        quickStart: '',
        executionSteps: [],
        bestPractices: [],
        examples: [],
      });

      handler.shutdown();
      handler = new SkillCommandHandler({ skillsDir, synapseDir: testDir });

      // Perform multiple searches
      const results = await Promise.all([
        handler.execute('skill:search search'),
        handler.execute('skill:search target'),
        handler.execute('skill:search skill'),
      ]);

      // All should succeed
      for (const result of results) {
        expect(result.exitCode).toBe(0);
      }
    });
  });
});
