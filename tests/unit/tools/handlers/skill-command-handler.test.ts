/**
 * Skill Command Handler Tests
 *
 * Tests for unified skill command routing.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillCommandHandler, parseSkillCommand, type SkillSearchLlmClient } from '../../../../src/tools/handlers/skill-command-handler.ts';

describe('parseSkillCommand', () => {
  // New format: skill:search, skill:load, skill:enhance
  it('should parse skill:search command', () => {
    const result = parseSkillCommand('skill:search pdf');
    expect(result.subcommand).toBe('search');
    expect(result.args).toContain('pdf');
  });

  it('should parse skill:load command', () => {
    const result = parseSkillCommand('skill:load code-analyzer');
    expect(result.subcommand).toBe('load');
    expect(result.args).toContain('code-analyzer');
  });

  it('should parse skill:enhance command', () => {
    const result = parseSkillCommand('skill:enhance --reason "test"');
    expect(result.subcommand).toBe('enhance');
    expect(result.options.reason).toBe('test');
  });

  it('should NOT parse skill:list (removed)', () => {
    const result = parseSkillCommand('skill:list');
    // skill:list is not a valid subcommand, should return null subcommand
    expect(result.subcommand).toBeNull();
  });

  // Legacy format: skill search, skill load, skill enhance
  it('should parse skill search command', () => {
    const result = parseSkillCommand('skill search "code analysis"');
    expect(result.subcommand).toBe('search');
    expect(result.args).toEqual(['code analysis']);
  });

  it('should parse skill load command', () => {
    const result = parseSkillCommand('skill load my-skill');
    expect(result.subcommand).toBe('load');
    expect(result.args).toEqual(['my-skill']);
  });

  it('should parse skill enhance command', () => {
    const result = parseSkillCommand('skill enhance --on');
    expect(result.subcommand).toBe('enhance');
    expect(result.options.on).toBe(true);
  });

  it('should parse skill enhance with path', () => {
    const result = parseSkillCommand('skill enhance --conversation /path/to/session.jsonl');
    expect(result.subcommand).toBe('enhance');
    expect(result.options.conversation).toBe('/path/to/session.jsonl');
  });

  it('should handle help flag', () => {
    const result = parseSkillCommand('skill --help');
    expect(result.options.help).toBe(true);
  });

  it('should handle help flag with subcommand', () => {
    const result = parseSkillCommand('skill load --help');
    expect(result.subcommand).toBe('load');
    expect(result.options.help).toBe(true);
  });

  it('should handle short help flag with subcommand', () => {
    const result = parseSkillCommand('skill search -h');
    expect(result.subcommand).toBe('search');
    expect(result.options.help).toBe(true);
  });
});

describe('SkillCommandHandler', () => {
  let testDir: string;
  let skillsDir: string;
  let handler: SkillCommandHandler;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-skill-cmd-test-'));
    skillsDir = path.join(testDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });

    // Create test skill
    const skillDir = path.join(skillsDir, 'test-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      `---
name: test-skill
description: A test skill
---

# Test Skill

Content here.
`
    );

    handler = new SkillCommandHandler({ skillsDir, synapseDir: testDir });
  });

  afterEach(() => {
    handler.shutdown();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('execute', () => {
    it('should handle skill:search with no query (lists all)', async () => {
      const result = await handler.execute('skill:search');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('test-skill');
    });

    it('should handle skill load command', async () => {
      const result = await handler.execute('skill load test-skill');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('# Skill: test-skill');
      expect(result.stdout).toContain('Content here');
    });

    it('should handle skill load for non-existent skill', async () => {
      const result = await handler.execute('skill load non-existent');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('not found');
    });

    it('should handle skill search command', async () => {
      const result = await handler.execute('skill search test');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('test-skill');
    });

    it('should handle skill help command', async () => {
      const result = await handler.execute('skill --help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('USAGE');
      expect(result.stdout).toContain('skill:search');
      expect(result.stdout).toContain('skill:load');
      expect(result.stdout).toContain('skill:enhance');
    });

    it('should handle skill enhance --on command', async () => {
      const result = await handler.execute('skill enhance --on');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('enabled');
    });

    it('should handle skill enhance --off command', async () => {
      await handler.execute('skill enhance --on');
      const result = await handler.execute('skill enhance --off');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('disabled');
    });

    it('should handle skill load --help command', async () => {
      const result = await handler.execute('skill load --help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('USAGE');
      expect(result.stdout).toContain('skill:load <skill-name>');
      expect(result.stdout).toContain('ARGUMENTS');
    });

    it('should handle skill search -h command', async () => {
      const result = await handler.execute('skill search -h');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('USAGE');
      expect(result.stdout).toContain('skill:search <query>');
      expect(result.stdout).toContain('semantic search');
    });

    it('should handle skill:search --help command', async () => {
      const result = await handler.execute('skill:search --help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('USAGE');
      expect(result.stdout).toContain('skill:search');
    });

    it('should handle skill enhance --help command', async () => {
      const result = await handler.execute('skill enhance --help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('USAGE');
      expect(result.stdout).toContain('skill:enhance');
      expect(result.stdout).toContain('--on');
      expect(result.stdout).toContain('--off');
    });
  });

  describe('semantic search with llmClient', () => {
    let testDirWithLlm: string;
    let skillsDirWithLlm: string;
    let handlerWithLlm: SkillCommandHandler;
    let searchCallCount: number;

    beforeEach(() => {
      testDirWithLlm = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-skill-llm-test-'));
      skillsDirWithLlm = path.join(testDirWithLlm, 'skills');
      fs.mkdirSync(skillsDirWithLlm, { recursive: true });

      // Create test skill (skill-creator)
      const skillCreatorDir = path.join(skillsDirWithLlm, 'skill-creator');
      fs.mkdirSync(skillCreatorDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillCreatorDir, 'SKILL.md'),
        `---
name: skill-creator
description: Guide for creating effective skills
---

# Skill Creator

This skill helps you create new skills.
`
      );

      searchCallCount = 0;

      // Create mock LLM client that returns semantic search results
      const mockLlmClient: SkillSearchLlmClient = {
        sendMessage: async (messages, _systemPrompt, _tools) => {
          searchCallCount++;
          // Simulate LLM understanding "创建新技能" means "create skill"
          const lastMessage = messages[messages.length - 1];
          const query = typeof lastMessage?.content === 'string'
            ? lastMessage.content
            : '';

          // If query contains Chinese for "create skill", return skill-creator
          if (query.includes('创建新技能') || query.includes('create skill')) {
            return {
              content: JSON.stringify({
                matched_skills: [
                  { name: 'skill-creator', description: 'Guide for creating effective skills' }
                ]
              }),
              toolCalls: [],
              stopReason: 'end_turn',
            };
          }

          if (query.includes('invalid')) {
            return {
              content: JSON.stringify({
                skills: [
                  { name: 'bad-shape', description: 'Invalid payload shape' }
                ]
              }),
              toolCalls: [],
              stopReason: 'end_turn',
            };
          }

          return {
            content: JSON.stringify({ matched_skills: [] }),
            toolCalls: [],
            stopReason: 'end_turn',
          };
        }
      };

      handlerWithLlm = new SkillCommandHandler({
        skillsDir: skillsDirWithLlm,
        synapseDir: testDirWithLlm,
        llmClient: mockLlmClient,
      });
    });

    afterEach(() => {
      handlerWithLlm.shutdown();
      fs.rmSync(testDirWithLlm, { recursive: true, force: true });
    });

    it('should use LLM semantic search when llmClient is provided', async () => {
      const result = await handlerWithLlm.execute('skill search "创建新技能"');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('skill-creator');
      expect(searchCallCount).toBe(1); // LLM was called
    });

    it('should find skill-creator with Chinese query via LLM', async () => {
      const result = await handlerWithLlm.execute('skill search "创建新技能"');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('skill-creator');
      expect(result.stdout).toContain('Guide for creating effective skills');
    });

    it('should return no results when LLM returns invalid payload', async () => {
      const result = await handlerWithLlm.execute('skill search invalid');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('No skills found matching');
    });
  });
});
