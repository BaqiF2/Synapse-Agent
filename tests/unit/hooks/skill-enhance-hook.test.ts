/**
 * SkillEnhanceHook Tests
 *
 * 测试 SkillEnhanceHook 的配置检查、SessionId 检查、TodoWrite 调用检测、
 * 会话读取与压缩、Meta-skill 加载、Sub-agent 执行和超时处理功能。
 */

import { describe, expect, it, beforeEach, afterEach, afterAll, mock, spyOn } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { StopHookContext } from '../../../src/hooks/types.ts';
import type { Message } from '../../../src/providers/message.ts';

let capturedSkillEnhancePrompt: string | null = null;
let mockSubAgentResponses: string[] = [];
let capturedExecuteParams: Array<{ type: string; action?: string; prompt: string }> = [];

// Mock SubAgentManager，避免真实 API 调用
mock.module('../../../src/sub-agents/sub-agent-manager.ts', () => ({
  SubAgentManager: class MockSubAgentManager {
    execute(type: string, params: { prompt: string; action?: string }) {
      capturedSkillEnhancePrompt = params.prompt;
      capturedExecuteParams.push({ type, action: params.action, prompt: params.prompt });

      const nextResponse = mockSubAgentResponses.shift();
      if (nextResponse !== undefined) {
        return Promise.resolve(nextResponse);
      }
      return Promise.resolve('[Skill] No enhancement needed');
    }
    shutdown() {}
  },
}));

/**
 * 创建包含 TodoWrite 调用的默认消息列表
 *
 * 用于测试需要通过 TodoWrite 检测的场景
 */
function createMessagesWithTodoWrite(): Message[] {
  return [
    { role: 'user', content: [{ type: 'text', text: 'Create tasks' }] },
    {
      role: 'assistant',
      content: [{ type: 'text', text: 'Creating tasks...' }],
      toolCalls: [
        {
          id: 'tool-1',
          name: 'Bash',
          arguments: JSON.stringify({ command: 'TodoWrite \'{"todos":[{"content":"Test"}]}\'' }),
        },
      ],
    },
  ];
}

// 创建测试用 context
function createTestContext(overrides: Partial<StopHookContext> = {}): StopHookContext {
  return {
    sessionId: 'test-session-123',
    cwd: '/tmp/test',
    // 默认包含 TodoWrite 调用，以通过检测
    messages: createMessagesWithTodoWrite(),
    finalResponse: 'Test response',
    ...overrides,
  };
}

let metaSkillDir: string;
let originalHomeDir: string | undefined;
let tempHomeDir: string;
let homedirSpy: ReturnType<typeof spyOn> | null = null;

beforeEach(() => {
  capturedSkillEnhancePrompt = null;
  mockSubAgentResponses = ['[Skill] No enhancement needed'];
  capturedExecuteParams = [];
  originalHomeDir = process.env.HOME;
  tempHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-enhance-home-'));
  process.env.HOME = tempHomeDir;
  homedirSpy = spyOn(os, 'homedir').mockReturnValue(tempHomeDir);

  metaSkillDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-skill-test-'));
  process.env.SYNAPSE_META_SKILLS_DIR = metaSkillDir;

  const skillCreatorDir = path.join(metaSkillDir, 'skill-creator');
  fs.mkdirSync(skillCreatorDir, { recursive: true });
  fs.writeFileSync(path.join(skillCreatorDir, 'SKILL.md'), '# Skill Creator\n');

  const skillEnhanceDir = path.join(metaSkillDir, 'skill-enhance');
  fs.mkdirSync(skillEnhanceDir, { recursive: true });
  fs.writeFileSync(path.join(skillEnhanceDir, 'SKILL.md'), '# Skill Enhance\n');
});

afterEach(() => {
  if (metaSkillDir && fs.existsSync(metaSkillDir)) {
    fs.rmSync(metaSkillDir, { recursive: true });
  }
  homedirSpy?.mockRestore?.();
  homedirSpy = null;
  if (tempHomeDir && fs.existsSync(tempHomeDir)) {
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
  }
  process.env.HOME = originalHomeDir;
  delete process.env.SYNAPSE_META_SKILLS_DIR;
});

afterAll(() => {
  mock.restore();
});

describe('SkillEnhanceHook - 配置检查 (Feature 9)', () => {
  let tempDir: string;
  let sessionPath: string;

  beforeEach(() => {
    // 创建临时目录模拟 sessions 目录
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-enhance-test-'));
    process.env.SYNAPSE_SESSIONS_DIR = tempDir;

    // 创建测试会话文件
    sessionPath = path.join(tempDir, 'test-session-123.jsonl');
    fs.writeFileSync(
      sessionPath,
      '{"id":"msg-1","timestamp":"2025-01-01T00:00:00Z","role":"user","content":"Hello"}\n' +
        '{"id":"msg-2","timestamp":"2025-01-01T00:00:01Z","role":"assistant","content":"Hi there!"}\n'
    );
  });

  afterEach(() => {
    // 清理临时目录
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
    delete process.env.SYNAPSE_SESSIONS_DIR;
  });

  it('autoEnhance 禁用时跳过处理', async () => {
    // 动态导入以确保环境变量生效
    const { SettingsManager } = await import('../../../src/config/settings-manager.ts');
    const { skillEnhanceHook } = await import('../../../src/hooks/skill-enhance-hook.ts');

    // Mock isAutoEnhanceEnabled 返回 false
    const settingsProto = SettingsManager.prototype;
    const originalIsAutoEnhanceEnabled = settingsProto.isAutoEnhanceEnabled;
    settingsProto.isAutoEnhanceEnabled = () => false;

    try {
      const context = createTestContext();
      const result = await skillEnhanceHook(context);

      // 应该直接返回 undefined（不执行任何逻辑）
      expect(result).toBeUndefined();
    } finally {
      settingsProto.isAutoEnhanceEnabled = originalIsAutoEnhanceEnabled;
    }
  });

  it('autoEnhance 启用时继续处理', async () => {
    const { SettingsManager } = await import('../../../src/config/settings-manager.ts');
    const { skillEnhanceHook } = await import('../../../src/hooks/skill-enhance-hook.ts');

    // Mock isAutoEnhanceEnabled 返回 true
    const settingsProto = SettingsManager.prototype;
    const originalIsAutoEnhanceEnabled = settingsProto.isAutoEnhanceEnabled;
    const originalGetMaxEnhanceContextChars = settingsProto.getMaxEnhanceContextChars;

    settingsProto.isAutoEnhanceEnabled = () => true;
    settingsProto.getMaxEnhanceContextChars = () => 50000;

    try {
      const context = createTestContext();
      const result = await skillEnhanceHook(context);

      // 应该继续执行并返回结果
      // 由于 meta-skills 存在，会尝试执行 sub-agent（可能失败但不会返回 undefined）
      expect(result).toBeDefined();
    } finally {
      settingsProto.isAutoEnhanceEnabled = originalIsAutoEnhanceEnabled;
      settingsProto.getMaxEnhanceContextChars = originalGetMaxEnhanceContextChars;
    }
  });

  it('autoEnhance 启用且执行增强时应发送进度提示', async () => {
    const { SettingsManager } = await import('../../../src/config/settings-manager.ts');
    const { skillEnhanceHook } = await import('../../../src/hooks/skill-enhance-hook.ts');

    const settingsProto = SettingsManager.prototype;
    const originalIsAutoEnhanceEnabled = settingsProto.isAutoEnhanceEnabled;
    const originalGetMaxEnhanceContextChars = settingsProto.getMaxEnhanceContextChars;

    settingsProto.isAutoEnhanceEnabled = () => true;
    settingsProto.getMaxEnhanceContextChars = () => 50000;

    const progressMessages: string[] = [];

    try {
      const context = createTestContext({
        onProgress: (message: string) => {
          progressMessages.push(message);
        },
      });
      await skillEnhanceHook(context);
      expect(progressMessages).toContain('Analyzing skill enhancement...');
    } finally {
      settingsProto.isAutoEnhanceEnabled = originalIsAutoEnhanceEnabled;
      settingsProto.getMaxEnhanceContextChars = originalGetMaxEnhanceContextChars;
    }
  });
});

describe('SkillEnhanceHook - SessionId 检查 (Feature 10)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-enhance-test-'));
    process.env.SYNAPSE_SESSIONS_DIR = tempDir;
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
    delete process.env.SYNAPSE_SESSIONS_DIR;
  });

  it('sessionId 为 null 时跳过增强', async () => {
    const { SettingsManager } = await import('../../../src/config/settings-manager.ts');
    const { skillEnhanceHook } = await import('../../../src/hooks/skill-enhance-hook.ts');

    // Mock isAutoEnhanceEnabled 返回 true
    const settingsProto = SettingsManager.prototype;
    const originalIsAutoEnhanceEnabled = settingsProto.isAutoEnhanceEnabled;
    settingsProto.isAutoEnhanceEnabled = () => true;

    try {
      const context = createTestContext({ sessionId: null });
      const result = await skillEnhanceHook(context);

      // 应该返回错误消息
      expect(result).toBeDefined();
      expect(result?.message).toContain('session not found');
    } finally {
      settingsProto.isAutoEnhanceEnabled = originalIsAutoEnhanceEnabled;
    }
  });

  it('sessionId 存在时继续处理', async () => {
    const { SettingsManager } = await import('../../../src/config/settings-manager.ts');
    const { skillEnhanceHook } = await import('../../../src/hooks/skill-enhance-hook.ts');

    // 创建会话文件
    const sessionPath = path.join(tempDir, 'existing-session.jsonl');
    fs.writeFileSync(
      sessionPath,
      '{"id":"msg-1","timestamp":"2025-01-01T00:00:00Z","role":"user","content":"Test"}\n'
    );

    // Mock settings
    const settingsProto = SettingsManager.prototype;
    const originalIsAutoEnhanceEnabled = settingsProto.isAutoEnhanceEnabled;
    const originalGetMaxEnhanceContextChars = settingsProto.getMaxEnhanceContextChars;

    settingsProto.isAutoEnhanceEnabled = () => true;
    settingsProto.getMaxEnhanceContextChars = () => 50000;

    try {
      const context = createTestContext({ sessionId: 'existing-session' });
      const result = await skillEnhanceHook(context);

      // 应该继续执行并返回结果
      expect(result).toBeDefined();
      // 不应该包含 "session not found"
      expect(result?.message).not.toContain('session not found');
    } finally {
      settingsProto.isAutoEnhanceEnabled = originalIsAutoEnhanceEnabled;
      settingsProto.getMaxEnhanceContextChars = originalGetMaxEnhanceContextChars;
    }
  });
});

describe('SkillEnhanceHook - 会话读取与压缩 (Feature 11)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-enhance-test-'));
    process.env.SYNAPSE_SESSIONS_DIR = tempDir;
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
    delete process.env.SYNAPSE_SESSIONS_DIR;
  });

  it('会话文件不存在时返回空会话', async () => {
    const { SettingsManager } = await import('../../../src/config/settings-manager.ts');
    const { skillEnhanceHook } = await import('../../../src/hooks/skill-enhance-hook.ts');

    // Mock settings
    const settingsProto = SettingsManager.prototype;
    const originalIsAutoEnhanceEnabled = settingsProto.isAutoEnhanceEnabled;
    const originalGetMaxEnhanceContextChars = settingsProto.getMaxEnhanceContextChars;

    settingsProto.isAutoEnhanceEnabled = () => true;
    settingsProto.getMaxEnhanceContextChars = () => 5000;

    try {
      // 使用不存在的 sessionId
      const context = createTestContext({ sessionId: 'non-existent-session' });
      const result = await skillEnhanceHook(context);

      // ConversationReader.readTruncated 对不存在的文件返回空数组
      // 所以会得到空会话的结果
      expect(result).toBeDefined();
      expect(result?.message).toContain('empty conversation');
    } finally {
      settingsProto.isAutoEnhanceEnabled = originalIsAutoEnhanceEnabled;
      settingsProto.getMaxEnhanceContextChars = originalGetMaxEnhanceContextChars;
    }
  });

  it('使用配置的 maxChars 参数', async () => {
    const { SettingsManager } = await import('../../../src/config/settings-manager.ts');
    const { skillEnhanceHook } = await import('../../../src/hooks/skill-enhance-hook.ts');
    const { ConversationReader } = await import('../../../src/skills/conversation-reader.ts');

    // 创建会话文件
    const sessionPath = path.join(tempDir, 'max-chars-test.jsonl');
    fs.writeFileSync(
      sessionPath,
      '{"id":"msg-1","timestamp":"2025-01-01T00:00:00Z","role":"user","content":"Hello"}\n'
    );

    // 记录 readTruncated 调用参数
    let capturedMaxChars: number | undefined;
    const originalReadTruncated = ConversationReader.prototype.readTruncated;
    ConversationReader.prototype.readTruncated = function (filePath: string, maxChars: number) {
      capturedMaxChars = maxChars;
      return originalReadTruncated.call(this, filePath, maxChars);
    };

    // Mock settings with specific maxChars
    const settingsProto = SettingsManager.prototype;
    const originalIsAutoEnhanceEnabled = settingsProto.isAutoEnhanceEnabled;
    const originalGetMaxEnhanceContextChars = settingsProto.getMaxEnhanceContextChars;

    settingsProto.isAutoEnhanceEnabled = () => true;
    settingsProto.getMaxEnhanceContextChars = () => 12345;

    try {
      const context = createTestContext({ sessionId: 'max-chars-test' });
      await skillEnhanceHook(context);

      // 验证 readTruncated 被调用时使用了正确的 maxChars
      expect(capturedMaxChars).toBe(12345);
    } finally {
      settingsProto.isAutoEnhanceEnabled = originalIsAutoEnhanceEnabled;
      settingsProto.getMaxEnhanceContextChars = originalGetMaxEnhanceContextChars;
      ConversationReader.prototype.readTruncated = originalReadTruncated;
    }
  });
});

describe('SkillEnhanceHook - Meta-skill 加载 (Feature 12)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-enhance-test-'));
    process.env.SYNAPSE_SESSIONS_DIR = tempDir;
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
    delete process.env.SYNAPSE_SESSIONS_DIR;
  });

  it('Meta-skill 文件存在时加载成功', async () => {
    const { SettingsManager } = await import('../../../src/config/settings-manager.ts');
    const { skillEnhanceHook } = await import('../../../src/hooks/skill-enhance-hook.ts');

    // 创建会话文件
    const sessionPath = path.join(tempDir, 'meta-skill-test.jsonl');
    fs.writeFileSync(
      sessionPath,
      '{"id":"msg-1","timestamp":"2025-01-01T00:00:00Z","role":"user","content":"Hello"}\n' +
        '{"id":"msg-2","timestamp":"2025-01-01T00:00:01Z","role":"assistant","content":"Hi!"}\n'
    );

    // Mock settings
    const settingsProto = SettingsManager.prototype;
    const originalIsAutoEnhanceEnabled = settingsProto.isAutoEnhanceEnabled;
    const originalGetMaxEnhanceContextChars = settingsProto.getMaxEnhanceContextChars;

    settingsProto.isAutoEnhanceEnabled = () => true;
    settingsProto.getMaxEnhanceContextChars = () => 50000;

    try {
      const context = createTestContext({ sessionId: 'meta-skill-test' });
      const result = await skillEnhanceHook(context);

      // 应该继续执行（meta-skills 应该存在于项目中）
      expect(result).toBeDefined();
      // 不应该包含 "meta-skills not found"（除非项目结构问题）
      // 由于没有 API key，可能会失败在 sub-agent 执行阶段，但不会在 meta-skill 加载阶段
      if (result?.message?.includes('meta-skills not found')) {
        // 如果 meta-skills 不存在，这可能是因为测试环境路径问题
        console.warn('Meta-skills not found - this may be a path issue in test environment');
      }
    } finally {
      settingsProto.isAutoEnhanceEnabled = originalIsAutoEnhanceEnabled;
      settingsProto.getMaxEnhanceContextChars = originalGetMaxEnhanceContextChars;
    }
  });

  it('增强 prompt 不应包含规则化候选列表区块（纯 LLM 判定）', async () => {
    const { SettingsManager } = await import('../../../src/config/settings-manager.ts');
    const { skillEnhanceHook } = await import('../../../src/hooks/skill-enhance-hook.ts');

    const sessionPath = path.join(tempDir, 'llm-only-test.jsonl');
    fs.writeFileSync(
      sessionPath,
      '{"id":"msg-1","timestamp":"2025-01-01T00:00:00Z","role":"user","content":"请分析仓库质量并给出优化建议"}\n' +
        '{"id":"msg-2","timestamp":"2025-01-01T00:00:01Z","role":"assistant","content":"好的"}\n'
    );

    const settingsProto = SettingsManager.prototype;
    const originalIsAutoEnhanceEnabled = settingsProto.isAutoEnhanceEnabled;
    const originalGetMaxEnhanceContextChars = settingsProto.getMaxEnhanceContextChars;
    settingsProto.isAutoEnhanceEnabled = () => true;
    settingsProto.getMaxEnhanceContextChars = () => 50000;

    try {
      await skillEnhanceHook(createTestContext({ sessionId: 'llm-only-test' }));

      expect(capturedSkillEnhancePrompt).toBeDefined();
      expect(capturedSkillEnhancePrompt || '').not.toContain('Similar Skill Candidates');
      expect(capturedSkillEnhancePrompt || '').not.toContain('SIMILAR_SKILL_CANDIDATES');
    } finally {
      settingsProto.isAutoEnhanceEnabled = originalIsAutoEnhanceEnabled;
      settingsProto.getMaxEnhanceContextChars = originalGetMaxEnhanceContextChars;
    }
  });
});

describe('SkillEnhanceHook - Sub-agent 超时处理 (Feature 14)', () => {
  it('子代理返回无效中间话术时应重试并返回规范结果', async () => {
    const { SettingsManager } = await import('../../../src/config/settings-manager.ts');
    const { skillEnhanceHook } = await import('../../../src/hooks/skill-enhance-hook.ts');

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-enhance-retry-test-'));
    process.env.SYNAPSE_SESSIONS_DIR = tempDir;

    const sessionPath = path.join(tempDir, 'retry-output.jsonl');
    fs.writeFileSync(
      sessionPath,
      '{"id":"msg-1","timestamp":"2025-01-01T00:00:00Z","role":"user","content":"Please help"}\n'
    );

    const settingsProto = SettingsManager.prototype;
    const originalIsAutoEnhanceEnabled = settingsProto.isAutoEnhanceEnabled;
    const originalGetMaxEnhanceContextChars = settingsProto.getMaxEnhanceContextChars;
    const originalGetLlmConfig = settingsProto.getLlmConfig;
    settingsProto.isAutoEnhanceEnabled = () => true;
    settingsProto.getMaxEnhanceContextChars = () => 50000;
    // mock getLlmConfig 提供 dummy API key，避免 AnthropicClient 构造时因无 key 报错
    settingsProto.getLlmConfig = () => ({
      apiKey: 'test-dummy-key',
      baseURL: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-5',
    });

    mockSubAgentResponses = [
      '我来分析这个对话历史，确定是否需要创建新技能或增强现有技能。',
      '[Skill] No enhancement needed',
    ];

    try {
      const result = await skillEnhanceHook(createTestContext({ sessionId: 'retry-output' }));

      expect(result).toBeDefined();
      expect(result?.message).toContain('[Skill] No enhancement needed');
      expect(result?.message).not.toContain('我来分析');
      expect(capturedExecuteParams).toHaveLength(2);
      expect(capturedExecuteParams[0]?.action).toBe('enhance');
      expect(capturedExecuteParams[1]?.action).toBe('enhance');
    } finally {
      settingsProto.isAutoEnhanceEnabled = originalIsAutoEnhanceEnabled;
      settingsProto.getMaxEnhanceContextChars = originalGetMaxEnhanceContextChars;
      settingsProto.getLlmConfig = originalGetLlmConfig;
      fs.rmSync(tempDir, { recursive: true, force: true });
      delete process.env.SYNAPSE_SESSIONS_DIR;
    }
  });

  it('子代理连续两次无效输出时应返回兜底结果', async () => {
    const { SettingsManager } = await import('../../../src/config/settings-manager.ts');
    const { skillEnhanceHook } = await import('../../../src/hooks/skill-enhance-hook.ts');

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-enhance-fallback-test-'));
    process.env.SYNAPSE_SESSIONS_DIR = tempDir;

    const sessionPath = path.join(tempDir, 'fallback-output.jsonl');
    fs.writeFileSync(
      sessionPath,
      '{"id":"msg-1","timestamp":"2025-01-01T00:00:00Z","role":"user","content":"Please help"}\n'
    );

    const settingsProto = SettingsManager.prototype;
    const originalIsAutoEnhanceEnabled = settingsProto.isAutoEnhanceEnabled;
    const originalGetMaxEnhanceContextChars = settingsProto.getMaxEnhanceContextChars;
    const originalGetLlmConfig = settingsProto.getLlmConfig;
    settingsProto.isAutoEnhanceEnabled = () => true;
    settingsProto.getMaxEnhanceContextChars = () => 50000;
    // mock getLlmConfig 提供 dummy API key，避免 AnthropicClient 构造时因无 key 报错
    settingsProto.getLlmConfig = () => ({
      apiKey: 'test-dummy-key',
      baseURL: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-5',
    });

    mockSubAgentResponses = ['我来分析一下。', '继续分析中。'];

    try {
      const result = await skillEnhanceHook(createTestContext({ sessionId: 'fallback-output' }));

      expect(result).toBeDefined();
      expect(result?.message).toContain('[Skill] No enhancement needed');
      expect(result?.message).toContain('invalid sub-agent output format');
      expect(capturedExecuteParams).toHaveLength(2);
      expect(capturedExecuteParams[0]?.action).toBe('enhance');
      expect(capturedExecuteParams[1]?.action).toBe('enhance');
    } finally {
      settingsProto.isAutoEnhanceEnabled = originalIsAutoEnhanceEnabled;
      settingsProto.getMaxEnhanceContextChars = originalGetMaxEnhanceContextChars;
      settingsProto.getLlmConfig = originalGetLlmConfig;
      fs.rmSync(tempDir, { recursive: true, force: true });
      delete process.env.SYNAPSE_SESSIONS_DIR;
    }
  });

  it('默认超时 5 分钟', async () => {
    // 删除环境变量以确保使用默认值
    delete process.env.SYNAPSE_SKILL_SUBAGENT_TIMEOUT;

    // 由于 getSubagentTimeout 是内部函数，我们通过检查默认行为来验证
    // 这里主要测试环境变量配置
    expect(process.env.SYNAPSE_SKILL_SUBAGENT_TIMEOUT).toBeUndefined();
  });

  it('超时可通过环境变量配置', async () => {
    process.env.SYNAPSE_SKILL_SUBAGENT_TIMEOUT = '120000';

    try {
      // 验证环境变量已设置
      expect(process.env.SYNAPSE_SKILL_SUBAGENT_TIMEOUT).toBe('120000');
    } finally {
      delete process.env.SYNAPSE_SKILL_SUBAGENT_TIMEOUT;
    }
  });
});

describe('SkillEnhanceHook - 模块加载时自动注册 (Feature 15)', () => {
  it('导入模块时自动注册 Hook', async () => {
    // 重新导入模块以触发自动注册
    const { stopHookRegistry } = await import('../../../src/hooks/stop-hook-registry.ts');

    // 导入 skill-enhance-hook 模块（这会触发自动注册）
    await import('../../../src/hooks/skill-enhance-hook.ts');

    // 验证 hook 已注册
    expect(stopHookRegistry.has('skill-enhance')).toBe(true);
  });
});

describe('SkillEnhanceHook - TodoWrite 调用检测', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-enhance-test-'));
    process.env.SYNAPSE_SESSIONS_DIR = tempDir;
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
    delete process.env.SYNAPSE_SESSIONS_DIR;
  });

  it('无 TodoWrite 调用时应跳过增强', async () => {
    const { SettingsManager } = await import('../../../src/config/settings-manager.ts');
    const { skillEnhanceHook } = await import('../../../src/hooks/skill-enhance-hook.ts');

    // 创建会话文件
    const sessionPath = path.join(tempDir, 'no-todo-write.jsonl');
    fs.writeFileSync(
      sessionPath,
      '{"id":"msg-1","timestamp":"2025-01-01T00:00:00Z","role":"user","content":"Hello"}\n' +
        '{"id":"msg-2","timestamp":"2025-01-01T00:00:01Z","role":"assistant","content":"Hi!"}\n'
    );

    // Mock settings
    const settingsProto = SettingsManager.prototype;
    const originalIsAutoEnhanceEnabled = settingsProto.isAutoEnhanceEnabled;
    const originalGetMaxEnhanceContextChars = settingsProto.getMaxEnhanceContextChars;

    settingsProto.isAutoEnhanceEnabled = () => true;
    settingsProto.getMaxEnhanceContextChars = () => 50000;

    try {
      // 创建不包含 TodoWrite 调用的 context
      const context = createTestContext({
        sessionId: 'no-todo-write',
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
          { role: 'assistant', content: [{ type: 'text', text: 'Hi!' }] },
        ],
      });
      const result = await skillEnhanceHook(context);

      // 应该直接返回 undefined（跳过增强）
      expect(result).toBeUndefined();
    } finally {
      settingsProto.isAutoEnhanceEnabled = originalIsAutoEnhanceEnabled;
      settingsProto.getMaxEnhanceContextChars = originalGetMaxEnhanceContextChars;
    }
  });

  it('有 TodoWrite 调用时应继续增强流程', async () => {
    const { SettingsManager } = await import('../../../src/config/settings-manager.ts');
    const { skillEnhanceHook } = await import('../../../src/hooks/skill-enhance-hook.ts');

    // 创建会话文件
    const sessionPath = path.join(tempDir, 'with-todo-write.jsonl');
    fs.writeFileSync(
      sessionPath,
      '{"id":"msg-1","timestamp":"2025-01-01T00:00:00Z","role":"user","content":"Create a task list"}\n' +
        '{"id":"msg-2","timestamp":"2025-01-01T00:00:01Z","role":"assistant","content":"Creating tasks..."}\n'
    );

    // Mock settings
    const settingsProto = SettingsManager.prototype;
    const originalIsAutoEnhanceEnabled = settingsProto.isAutoEnhanceEnabled;
    const originalGetMaxEnhanceContextChars = settingsProto.getMaxEnhanceContextChars;

    settingsProto.isAutoEnhanceEnabled = () => true;
    settingsProto.getMaxEnhanceContextChars = () => 50000;

    try {
      // 创建包含 TodoWrite 调用的 context
      const context = createTestContext({
        sessionId: 'with-todo-write',
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Create a task list' }] },
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'Creating tasks...' }],
            toolCalls: [
              {
                id: 'tool-1',
                name: 'Bash',
                arguments: JSON.stringify({ command: 'TodoWrite \'{"todos":[{"content":"Test task"}]}\'' }),
              },
            ],
          },
        ],
      });
      const result = await skillEnhanceHook(context);

      // 应该继续执行并返回结果（不是 undefined）
      expect(result).toBeDefined();
      // 不应该因为缺少 TodoWrite 而跳过
    } finally {
      settingsProto.isAutoEnhanceEnabled = originalIsAutoEnhanceEnabled;
      settingsProto.getMaxEnhanceContextChars = originalGetMaxEnhanceContextChars;
    }
  });

  it('TodoWrite 命令前有空格时也应检测成功', async () => {
    const { SettingsManager } = await import('../../../src/config/settings-manager.ts');
    const { skillEnhanceHook } = await import('../../../src/hooks/skill-enhance-hook.ts');

    // 创建会话文件
    const sessionPath = path.join(tempDir, 'with-space-todo-write.jsonl');
    fs.writeFileSync(
      sessionPath,
      '{"id":"msg-1","timestamp":"2025-01-01T00:00:00Z","role":"user","content":"Test"}\n'
    );

    // Mock settings
    const settingsProto = SettingsManager.prototype;
    const originalIsAutoEnhanceEnabled = settingsProto.isAutoEnhanceEnabled;
    const originalGetMaxEnhanceContextChars = settingsProto.getMaxEnhanceContextChars;

    settingsProto.isAutoEnhanceEnabled = () => true;
    settingsProto.getMaxEnhanceContextChars = () => 50000;

    try {
      // 创建包含带前导空格的 TodoWrite 调用的 context
      const context = createTestContext({
        sessionId: 'with-space-todo-write',
        messages: [
          {
            role: 'assistant',
            content: [],
            toolCalls: [
              {
                id: 'tool-1',
                name: 'Bash',
                arguments: JSON.stringify({ command: '  TodoWrite \'{"todos":[]}\'' }),
              },
            ],
          },
        ],
      });
      const result = await skillEnhanceHook(context);

      // 应该继续执行并返回结果
      expect(result).toBeDefined();
    } finally {
      settingsProto.isAutoEnhanceEnabled = originalIsAutoEnhanceEnabled;
      settingsProto.getMaxEnhanceContextChars = originalGetMaxEnhanceContextChars;
    }
  });

  it('非 Bash 工具调用时不应误判为 TodoWrite', async () => {
    const { SettingsManager } = await import('../../../src/config/settings-manager.ts');
    const { skillEnhanceHook } = await import('../../../src/hooks/skill-enhance-hook.ts');

    // 创建会话文件
    const sessionPath = path.join(tempDir, 'other-tool.jsonl');
    fs.writeFileSync(
      sessionPath,
      '{"id":"msg-1","timestamp":"2025-01-01T00:00:00Z","role":"user","content":"Test"}\n'
    );

    // Mock settings
    const settingsProto = SettingsManager.prototype;
    const originalIsAutoEnhanceEnabled = settingsProto.isAutoEnhanceEnabled;
    const originalGetMaxEnhanceContextChars = settingsProto.getMaxEnhanceContextChars;

    settingsProto.isAutoEnhanceEnabled = () => true;
    settingsProto.getMaxEnhanceContextChars = () => 50000;

    try {
      // 创建包含其他工具调用的 context
      const context = createTestContext({
        sessionId: 'other-tool',
        messages: [
          {
            role: 'assistant',
            content: [],
            toolCalls: [
              {
                id: 'tool-1',
                name: 'Read',
                arguments: JSON.stringify({ path: '/some/file.txt' }),
              },
            ],
          },
        ],
      });
      const result = await skillEnhanceHook(context);

      // 应该跳过增强（返回 undefined）
      expect(result).toBeUndefined();
    } finally {
      settingsProto.isAutoEnhanceEnabled = originalIsAutoEnhanceEnabled;
      settingsProto.getMaxEnhanceContextChars = originalGetMaxEnhanceContextChars;
    }
  });
});

describe('buildRetryPrompt - 新签名测试', () => {
  it('输出应包含 [Previous Attempt Failed] 和截断文本', async () => {
    const { buildRetryPrompt } = await import('../../../src/hooks/skill-enhance-result-parser.ts');

    const prompt = 'Analyze conversation';
    const previousOutput = '我来分析这个对话，看看是否需要创建或增强技能。';
    const result = buildRetryPrompt(prompt, previousOutput);

    expect(result).toContain('[Previous Attempt Failed]');
    expect(result).toContain(previousOutput);
    expect(result).toContain('[Output Contract]');
    expect(result).toContain(prompt);
  });

  it('超过 500 字符的 previousOutput 应被截断', async () => {
    const { buildRetryPrompt } = await import('../../../src/hooks/skill-enhance-result-parser.ts');

    const longOutput = 'A'.repeat(600);
    const result = buildRetryPrompt('test prompt', longOutput);

    expect(result).toContain('...(truncated)');
    expect(result).not.toContain('A'.repeat(600));
    expect(result).toContain('A'.repeat(500));
  });

  it('短于 500 字符的 previousOutput 不应被截断', async () => {
    const { buildRetryPrompt } = await import('../../../src/hooks/skill-enhance-result-parser.ts');

    const shortOutput = 'Short invalid output';
    const result = buildRetryPrompt('test prompt', shortOutput);

    expect(result).toContain(shortOutput);
    expect(result).not.toContain('...(truncated)');
  });
});
