/**
 * Skill Sub-Agent Tests
 *
 * Tests for the refactored SkillSubAgent with AgentRunner.
 */

import { describe, expect, it, beforeEach, afterEach, mock } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillSubAgent } from '../../../src/skill-sub-agent/skill-sub-agent.ts';
import type { AgentRunnerStreamedMessage } from '../../../src/agent/agent-runner.ts';
import type { StreamedMessagePart } from '../../../src/providers/anthropic/anthropic-types.ts';

/**
 * Create a mock streamed message for testing
 */
function createMockStream(parts: StreamedMessagePart[]): AgentRunnerStreamedMessage {
  return {
    id: 'msg_test',
    usage: { inputOther: 100, output: 50, inputCacheRead: 0, inputCacheCreation: 0 },
    async *[Symbol.asyncIterator]() {
      for (const part of parts) {
        yield part;
      }
    },
  };
}

function createMockToolExecutor() {
  return {
    name: 'Bash',
    description: 'Mock bash tool',
    toolDefinition: { name: 'Bash', description: 'Mock', input_schema: { type: 'object', properties: {} } },
    call: mock(() => Promise.resolve({ isError: false, output: '', message: '', brief: '' })),
  } as any;
}

describe('SkillSubAgent', () => {
  let testDir: string;
  let skillsDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-subagent-test-'));
    skillsDir = path.join(testDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });

    // Create a regular test skill
    const skillDir = path.join(skillsDir, 'test-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      `---
name: test-skill
description: A test skill
---

# Test Skill
`
    );

    // Create a meta skill
    const metaSkillDir = path.join(skillsDir, 'skill-creator');
    fs.mkdirSync(metaSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(metaSkillDir, 'SKILL.md'),
      `---
name: skill-creator
description: Guide for creating skills
type: meta
---

# Skill Creator

Instructions for creating skills.
`
    );
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('should initialize with skills loaded', () => {
      const mockLlmClient = {
        generate: mock(() =>
          Promise.resolve(createMockStream([{ type: 'text', text: '{}' }]))
        ),
      };

      const mockToolExecutor = createMockToolExecutor();

      const agent = new SkillSubAgent({
        skillsDir,
        llmClient: mockLlmClient,
        toolExecutor: mockToolExecutor,
      });

      expect(agent.isInitialized()).toBe(true);
      expect(agent.getSkillCount()).toBe(2);
    });
  });

  describe('getSkillContent', () => {
    it('should return skill content', () => {
      const mockLlmClient = {
        generate: mock(() =>
          Promise.resolve(createMockStream([{ type: 'text', text: '{}' }]))
        ),
      };

      const mockToolExecutor = createMockToolExecutor();

      const agent = new SkillSubAgent({
        skillsDir,
        llmClient: mockLlmClient,
        toolExecutor: mockToolExecutor,
      });

      const content = agent.getSkillContent('test-skill');
      expect(content).toContain('# Skill: test-skill');
      expect(content).toContain('# Test Skill');
    });
  });

  describe('default skillsDir', () => {
    it('should use DEFAULT_SKILLS_DIR when skillsDir is not provided', () => {
      const mockLlmClient = {
        generate: mock(() =>
          Promise.resolve(createMockStream([{ type: 'text', text: '{}' }]))
        ),
      };

      const mockToolExecutor = createMockToolExecutor();

      // This test verifies that the agent can be created without skillsDir
      // It will use ~/.synapse/skills as default
      const agent = new SkillSubAgent({
        llmClient: mockLlmClient,
        toolExecutor: mockToolExecutor,
      });

      expect(agent.isInitialized()).toBe(true);
    });
  });
});
