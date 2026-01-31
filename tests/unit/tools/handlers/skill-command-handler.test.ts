/**
 * Skill Command Handler Tests
 *
 * Tests for unified skill command routing (skill: format only).
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillCommandHandler, parseSkillCommand } from '../../../../src/tools/handlers/skill-command-handler.ts';
import type { AnthropicClient } from '../../../../src/providers/anthropic/anthropic-client.ts';
import { DEFAULT_SETTINGS } from '../../../../src/config/settings-schema.ts';

describe('parseSkillCommand', () => {
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

  it('should parse skill:search with quoted args', () => {
    const result = parseSkillCommand('skill:search "code analysis"');
    expect(result.subcommand).toBe('search');
    expect(result.args).toEqual(['code analysis']);
  });

  it('should parse skill:enhance --on', () => {
    const result = parseSkillCommand('skill:enhance --on');
    expect(result.subcommand).toBe('enhance');
    expect(result.options.on).toBe(true);
  });

  it('should parse skill:enhance --conversation', () => {
    const result = parseSkillCommand('skill:enhance --conversation /path/to/session.jsonl');
    expect(result.subcommand).toBe('enhance');
    expect(result.options.conversation).toBe('/path/to/session.jsonl');
  });

  it('should parse help flag', () => {
    const result = parseSkillCommand('skill:search --help');
    expect(result.subcommand).toBe('search');
    expect(result.options.help).toBe(true);
  });

  it('should parse short help flag', () => {
    const result = parseSkillCommand('skill:load -h');
    expect(result.subcommand).toBe('load');
    expect(result.options.help).toBe(true);
  });

  it('should NOT parse old space format', () => {
    const result = parseSkillCommand('skill search pdf');
    // 'skill' is not skill:*, so subcommand stays null
    expect(result.subcommand).toBeNull();
  });

  it('should NOT parse skill:list (removed)', () => {
    const result = parseSkillCommand('skill:list');
    expect(result.subcommand).toBeNull();
  });
});

describe('SkillCommandHandler', () => {
  let testDir: string;
  let skillsDir: string;
  let handler: SkillCommandHandler;

  const writeSettingsFile = (dir: string) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'settings.json'),
      JSON.stringify(DEFAULT_SETTINGS, null, 2)
    );
  };

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-skill-cmd-test-'));
    skillsDir = path.join(testDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    writeSettingsFile(testDir);

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
    it('should handle skill:search with query', async () => {
      const result = await handler.execute('skill:search test');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('test-skill');
    });

    it('should return error for skill:search without query', async () => {
      const result = await handler.execute('skill:search');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('<query> is required');
    });

    it('should handle skill:load command', async () => {
      const result = await handler.execute('skill:load test-skill');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('# Skill: test-skill');
      expect(result.stdout).toContain('Content here');
    });

    it('should handle skill:load for non-existent skill', async () => {
      const result = await handler.execute('skill:load non-existent');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('not found');
    });

    it('should handle skill:search --help', async () => {
      const result = await handler.execute('skill:search --help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('USAGE');
      expect(result.stdout).toContain('skill:search <query>');
    });

    it('should handle skill:enhance --on command', async () => {
      const result = await handler.execute('skill:enhance --on');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('enabled');
    });

    it('should handle skill:enhance --off command', async () => {
      await handler.execute('skill:enhance --on');
      const result = await handler.execute('skill:enhance --off');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('disabled');
    });

    it('should handle skill:load --help command', async () => {
      const result = await handler.execute('skill:load --help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('USAGE');
      expect(result.stdout).toContain('skill:load <skill-name>');
      expect(result.stdout).toContain('ARGUMENTS');
    });

    it('should handle skill:enhance --help command', async () => {
      const result = await handler.execute('skill:enhance --help');
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
      writeSettingsFile(testDirWithLlm);

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
      const mockLlmClient = {
        generate: async (_systemPrompt: string, messages: { role: string; content: string | unknown[] }[], _tools: unknown[]) => {
          searchCallCount++;
          // Simulate LLM understanding "创建新技能" means "create skill"
          const lastMessage = messages[messages.length - 1];
          const query = typeof lastMessage?.content === 'string'
            ? lastMessage.content
            : '';

          let responseContent: string;

          // If query contains Chinese for "create skill", return skill-creator
          if (query.includes('创建新技能') || query.includes('create skill')) {
            responseContent = JSON.stringify({
              matched_skills: [
                { name: 'skill-creator', description: 'Guide for creating effective skills' }
              ]
            });
          } else if (query.includes('invalid')) {
            responseContent = JSON.stringify({
              skills: [
                { name: 'bad-shape', description: 'Invalid payload shape' }
              ]
            });
          } else {
            responseContent = JSON.stringify({ matched_skills: [] });
          }

          return {
            id: 'msg_test',
            usage: { inputOther: 100, output: 50, inputCacheRead: 0, inputCacheCreation: 0 },
            async *[Symbol.asyncIterator]() {
              yield { type: 'text' as const, text: responseContent };
            },
          };
        }
      } as unknown as AnthropicClient;

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
      const result = await handlerWithLlm.execute('skill:search "创建新技能"');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('skill-creator');
      expect(searchCallCount).toBe(1); // LLM was called
    });

    it('should find skill-creator with Chinese query via LLM', async () => {
      const result = await handlerWithLlm.execute('skill:search "创建新技能"');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('skill-creator');
      expect(result.stdout).toContain('Guide for creating effective skills');
    });

    it('should return no results when LLM returns invalid payload', async () => {
      const result = await handlerWithLlm.execute('skill:search invalid');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('No skills found matching');
    });
  });
});
