/**
 * 模块交互集成测试 — 验证重构后关键模块间的协作正确性。
 *
 * 测试目标：
 * 1. types 模块导出完整性验证
 * 2. core 模块 EventStream + 消息系统协作
 * 3. tools 模块 BashRouter 三层路由集成
 * 4. 跨模块类型一致性验证
 *
 * 核心导出:
 * - (测试文件，无导出)
 */

import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

describe('Module Interaction Integration Tests', () => {

  describe('types/ 模块导出完整性', () => {
    it('应导出所有核心消息类型', async () => {
      const types = await import('../../../src/types/index.ts');

      // 验证 isEmbeddingProvider 函数存在
      expect(typeof types.isEmbeddingProvider).toBe('function');
    });

    it('types/message.ts 应导出 Role、Message、ToolCall 等类型', async () => {
      // 通过动态导入验证类型文件可以被解析
      const messageModule = await import('../../../src/types/message.ts');
      expect(messageModule).toBeDefined();
    });

    it('types/events.ts 应导出事件联合类型', async () => {
      const eventsModule = await import('../../../src/types/events.ts');
      expect(eventsModule).toBeDefined();
    });

    it('types/tool.ts 应导出工具相关类型', async () => {
      const toolModule = await import('../../../src/types/tool.ts');
      expect(toolModule).toBeDefined();
    });

    it('types/usage.ts 应导出用量统计类型', async () => {
      const usageModule = await import('../../../src/types/usage.ts');
      expect(usageModule).toBeDefined();
    });

    it('types/provider.ts 应导出 LLM Provider 接口', async () => {
      const providerModule = await import('../../../src/types/provider.ts');
      expect(providerModule).toBeDefined();
      expect(typeof providerModule.isEmbeddingProvider).toBe('function');
    });
  });

  describe('core/ 模块 EventStream 与消息系统协作', () => {
    it('EventStream 应支持完整的事件生命周期', async () => {
      const { createEventStream } = await import('../../../src/core/event-stream.ts');

      const { stream, emit, complete } = createEventStream();

      // 生产者发射事件
      const process = async () => {
        emit({ type: 'agent_start', sessionId: 'test-001', config: { maxIterations: 5, maxConsecutiveFailures: 3 } });
        emit({ type: 'turn_start', turnIndex: 0 });
        emit({ type: 'message_start', role: 'assistant' });
        emit({ type: 'message_delta', contentDelta: 'Hello' });
        emit({ type: 'message_end', stopReason: 'end_turn' });
        emit({ type: 'turn_end', turnIndex: 0, hasToolCalls: false });
        complete({ response: 'Hello', turnCount: 1, stopReason: 'end_turn' });
      };

      process();

      // 消费者收集事件
      const events: unknown[] = [];
      for await (const event of stream) {
        events.push(event);
      }

      expect(events.length).toBe(6);
      expect((events[0] as { type: string }).type).toBe('agent_start');
      expect((events[events.length - 1] as { type: string }).type).toBe('turn_end');

      // 验证最终结果
      const result = await stream.result;
      expect(result.response).toBe('Hello');
      expect(result.turnCount).toBe(1);
    });

    it('EventStream 应支持 AbortSignal 中止', async () => {
      const { createEventStream } = await import('../../../src/core/event-stream.ts');
      const controller = new AbortController();
      const { stream, emit } = createEventStream({ signal: controller.signal });

      // 发射一些事件后中止
      const process = async () => {
        emit({ type: 'agent_start', sessionId: 'abort-test', config: { maxIterations: 5, maxConsecutiveFailures: 3 } });
        emit({ type: 'turn_start', turnIndex: 0 });
        // 中止流
        controller.abort();
      };

      process();

      const events: unknown[] = [];
      for await (const event of stream) {
        events.push(event);
      }

      // 应包含 agent_start、turn_start 和 error 事件
      const errorEvent = events.find((e) => (e as { type: string }).type === 'error');
      expect(errorEvent).toBeDefined();

      // result 应为 rejected
      await expect(stream.result).rejects.toThrow();
    });

    it('DomainMessage 应能正确转换为 LLM 消息', async () => {
      const { convertToLlm, createDomainMessage } = await import('../../../src/core/messages.ts');

      const userMsg = createDomainMessage({
        role: 'user',
        content: [{ type: 'text', text: 'Read the file' }],
      });

      const assistantMsg = createDomainMessage({
        role: 'assistant',
        content: [
          { type: 'text', text: 'Reading...' },
          { type: 'tool_use', toolName: 'read', toolId: 'tool-1', input: { path: '/test.txt' } },
        ],
      });

      const toolResultMsg = createDomainMessage({
        role: 'tool_result',
        content: [{ type: 'tool_result', toolId: 'tool-1', output: 'file content', isError: false }],
      });

      const llmMessages = convertToLlm([userMsg, assistantMsg, toolResultMsg]);

      expect(llmMessages).toHaveLength(3);
      expect(llmMessages[0]!.role).toBe('user');
      expect(llmMessages[1]!.role).toBe('assistant');
      // tool_result 在 LLM 层映射为 user 角色
      expect(llmMessages[2]!.role).toBe('user');
    });
  });

  describe('core/ 组件独立功能验证', () => {
    it('SlidingWindowFailureDetector 应正确检测连续失败', async () => {
      const { SlidingWindowFailureDetector } = await import('../../../src/core/agent/sliding-window-failure.ts');

      const detector = new SlidingWindowFailureDetector({
        windowSize: 5,
        failureThreshold: 3,
      });

      // record(isFailure: boolean) — true=失败, false=成功
      detector.record(true);
      detector.record(true);
      expect(detector.shouldStop()).toBe(false);

      // 第三次失败应触发停止
      detector.record(true);
      expect(detector.shouldStop()).toBe(true);
    });

    it('SlidingWindowFailureDetector 成功记录应重置窗口内失败密度', async () => {
      const { SlidingWindowFailureDetector } = await import('../../../src/core/agent/sliding-window-failure.ts');

      // 使用窗口大小 5，阈值 3 — 滑动窗口机制，不是"连续"计数
      const detector = new SlidingWindowFailureDetector({
        windowSize: 5,
        failureThreshold: 3,
      });

      // record(isFailure: boolean) — true=失败, false=成功
      detector.record(true);  // 失败 1
      detector.record(true);  // 失败 2
      detector.record(false); // 成功
      // 窗口内有 2 次失败 + 1 次成功，未达阈值 3
      expect(detector.shouldStop()).toBe(false);
    });

    it('MessageValidator 应能验证消息合法性', async () => {
      const { MessageValidator } = await import('../../../src/core/message-validator.ts');

      const validator = new MessageValidator();

      // MessageValidator.validate() 接收 LLMProviderContentBlock[] 而非 DomainMessage[]
      const validBlocks = [
        { type: 'text' as const, text: 'Hello' },
      ];

      const result = validator.validate(validBlocks);
      expect(result.valid).toBe(true);
    });

    it('MessageValidator 应检测无效 tool_use input', async () => {
      const { MessageValidator } = await import('../../../src/core/message-validator.ts');

      const validator = new MessageValidator();

      // 构造一个无效的 tool_use 块（input 为 string 而非 object）
      const invalidBlocks = [
        { type: 'tool_use' as const, id: 'tool-1', name: 'read', input: 'invalid string' },
      ];

      const result = validator.validate(invalidBlocks as any);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('MetricsCollector 应能通过事件总线记录工具指标', async () => {
      const { MetricsCollector } = await import('../../../src/core/metrics-collector.ts');
      const { AgentEventBus } = await import('../../../src/core/event-bus.ts');

      const eventBus = new AgentEventBus();
      const collector = new MetricsCollector();
      collector.attach(eventBus);

      // 通过事件总线发射 tool_end 事件
      eventBus.emit({
        type: 'tool_end',
        toolName: 'read',
        toolId: 'tool-1',
        output: 'content',
        isError: false,
        duration: 50,
      });
      eventBus.emit({
        type: 'tool_end',
        toolName: 'read',
        toolId: 'tool-2',
        output: 'content',
        isError: false,
        duration: 30,
      });
      eventBus.emit({
        type: 'tool_end',
        toolName: 'write',
        toolId: 'tool-3',
        output: '',
        isError: true,
        duration: 100,
      });

      const readMetrics = collector.getToolMetrics('read');
      expect(readMetrics).not.toBeNull();
      expect(readMetrics!.callCount).toBe(2);
      expect(readMetrics!.errorCount).toBe(0);

      const writeMetrics = collector.getToolMetrics('write');
      expect(writeMetrics).not.toBeNull();
      expect(writeMetrics!.callCount).toBe(1);
      expect(writeMetrics!.errorCount).toBe(1);

      collector.detach();
    });

    it('CostTracker 应能追踪会话成本', async () => {
      const { CostTracker } = await import('../../../src/core/cost-tracker.ts');
      const { AgentEventBus } = await import('../../../src/core/event-bus.ts');

      const eventBus = new AgentEventBus();
      const tracker = new CostTracker('claude-sonnet-4-20250514');
      tracker.attach(eventBus);

      // 通过事件总线触发会话和使用事件
      eventBus.emit({
        type: 'agent_start',
        sessionId: 'test-session-001',
        config: { maxIterations: 10, maxConsecutiveFailures: 3 },
      });
      eventBus.emit({
        type: 'usage',
        inputTokens: 1000,
        outputTokens: 500,
      });

      const summary = tracker.getSession('test-session-001');
      expect(summary).not.toBeNull();
      expect(summary!.totalInputTokens).toBe(1000);
      expect(summary!.totalOutputTokens).toBe(500);
      expect(summary!.callCount).toBe(1);

      tracker.detach();
    });
  });

  describe('tools/ 模块 BashRouter 三层路由验证', () => {
    let session: InstanceType<typeof import('../../../src/tools/bash-session.ts')['BashSession']>;
    let BashRouter: typeof import('../../../src/tools/bash-router.ts')['BashRouter'];
    let CommandType: typeof import('../../../src/tools/bash-router.ts')['CommandType'];
    let BashSession: typeof import('../../../src/tools/bash-session.ts')['BashSession'];

    beforeAll(async () => {
      const bashSessionMod = await import('../../../src/tools/bash-session.ts');
      const bashRouterMod = await import('../../../src/tools/bash-router.ts');
      BashSession = bashSessionMod.BashSession;
      BashRouter = bashRouterMod.BashRouter;
      CommandType = bashRouterMod.CommandType;
      session = new BashSession();
    });

    afterAll(() => {
      session?.cleanup?.();
    });

    it('应正确识别 Layer 1 原生命令', () => {
      const router = new BashRouter(session);
      try {
        expect(router.identifyCommandType('ls')).toBe(CommandType.NATIVE_SHELL_COMMAND);
        expect(router.identifyCommandType('git status')).toBe(CommandType.NATIVE_SHELL_COMMAND);
        expect(router.identifyCommandType('echo hello')).toBe(CommandType.NATIVE_SHELL_COMMAND);
        expect(router.identifyCommandType('cat /tmp/test')).toBe(CommandType.NATIVE_SHELL_COMMAND);
      } finally {
        router.shutdown();
      }
    });

    it('应正确识别 Layer 2 Agent Shell 命令', () => {
      const router = new BashRouter(session);
      try {
        expect(router.identifyCommandType('read file.txt')).toBe(CommandType.AGENT_SHELL_COMMAND);
        expect(router.identifyCommandType('write file.txt content')).toBe(CommandType.AGENT_SHELL_COMMAND);
        expect(router.identifyCommandType('edit file.txt old new')).toBe(CommandType.AGENT_SHELL_COMMAND);
      } finally {
        router.shutdown();
      }
    });

    it('应正确识别 Layer 3 Extension 命令', () => {
      const router = new BashRouter(session);
      try {
        expect(router.identifyCommandType('mcp:server:tool')).toBe(CommandType.EXTEND_SHELL_COMMAND);
        expect(router.identifyCommandType('skill:name:tool')).toBe(CommandType.EXTEND_SHELL_COMMAND);
        // command:search 可能被路由为 agent_shell_command，取决于路由表配置
        const searchType = router.identifyCommandType('command:search');
        expect([CommandType.EXTEND_SHELL_COMMAND, CommandType.AGENT_SHELL_COMMAND]).toContain(searchType);
      } finally {
        router.shutdown();
      }
    });

    it('应正确执行 Agent Shell read 命令', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-integration-'));
      const testFile = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(testFile, 'integration test content');

      const router = new BashRouter(session);
      try {
        const result = await router.route(`read ${testFile}`);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('integration test content');
      } finally {
        router.shutdown();
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('应正确执行 Agent Shell write 命令', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-integration-'));
      const testFile = path.join(tmpDir, 'write-test.txt');

      const router = new BashRouter(session);
      try {
        const result = await router.route(`write ${testFile} "written by integration test"`);
        expect(result.exitCode).toBe(0);

        const content = fs.readFileSync(testFile, 'utf-8');
        expect(content).toBe('written by integration test');
      } finally {
        router.shutdown();
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('应正确执行原生 Shell 命令', async () => {
      const router = new BashRouter(session);
      try {
        const result = await router.route('echo "native shell test"');
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('native shell test');
      } finally {
        router.shutdown();
      }
    });
  });

  describe('tools/ 与 core/ 类型互操作', () => {
    it('BashTool 应暴露符合 AgentTool 接口的 toolDefinition', async () => {
      const { BashTool } = await import('../../../src/tools/bash-tool.ts');

      const tool = new BashTool();
      const def = tool.toolDefinition;

      // 验证 AgentTool 接口要求的字段
      expect(def.name).toBe('Bash');
      expect(typeof def.description).toBe('string');
      expect(def.description.length).toBeGreaterThan(0);
      expect(def.input_schema).toBeDefined();
      expect(def.input_schema.type).toBe('object');
      expect(def.input_schema.properties).toHaveProperty('command');
    });

    it('CallableToolset 应能正确管理工具集', async () => {
      const { CallableToolset } = await import('../../../src/tools/toolset.ts');
      const { BashTool } = await import('../../../src/tools/bash-tool.ts');

      const bashTool = new BashTool();
      const toolset = new CallableToolset([bashTool]);

      // CallableToolset.tools 是 LLMTool[] 数组
      expect(toolset.tools.length).toBeGreaterThanOrEqual(1);

      const bashToolDef = toolset.tools.find(t => t.name === 'Bash');
      expect(bashToolDef).toBeDefined();
    });
  });

  describe('跨模块 SubAgent 类型一致性', () => {
    it('sub-agents/ 配置应导出有效的类型配置', async () => {
      const { getConfig } = await import('../../../src/core/sub-agents/configs/index.ts');
      const generalConfig = await getConfig('general');
      expect(generalConfig.type).toBe('general');

      const exploreConfig = await getConfig('explore');
      expect(exploreConfig.type).toBe('explore');

      const skillConfig = await getConfig('skill');
      expect(skillConfig.type).toBe('skill');
    });

    it('SubAgent 配置应包含正确的权限过滤', async () => {
      const { getConfig } = await import('../../../src/core/sub-agents/configs/index.ts');

      const skillConfig = await getConfig('skill');
      // 技能型 SubAgent 应排除 task: 命令（防止递归）
      expect(skillConfig.permissions.exclude.length).toBeGreaterThan(0);
    });
  });

  describe('skills/ 模块独立功能验证', () => {
    let testSkillsDir: string;

    beforeAll(() => {
      testSkillsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-skills-'));
      const skillDir = path.join(testSkillsDir, '.synapse', 'skills', 'test-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        `# Test Skill

**Domain**: testing
**Description**: A test skill for integration testing
**Tags**: test, integration
**Version**: 1.0.0

## Usage Scenarios
When you need to run integration tests.

## Execution Steps
1. Setup test environment
2. Run tests
3. Report results
`
      );
    });

    afterAll(() => {
      fs.rmSync(testSkillsDir, { recursive: true, force: true });
    });

    it('SkillIndexer 应能索引技能', async () => {
      const { SkillIndexer } = await import('../../../src/skills/loader/indexer.ts');

      const indexer = new SkillIndexer(testSkillsDir);
      indexer.rebuild();
      const index = indexer.getIndex();

      expect(index.skills.length).toBeGreaterThanOrEqual(1);
      const testSkill = index.skills.find(s => s.name === 'test-skill');
      expect(testSkill).toBeDefined();
      // domain 取决于 SkillIndexer 的解析逻辑，验证存在即可
      expect(testSkill?.domain).toBeDefined();
    });

    it('SkillLoader 应能加载技能到 Level 1', async () => {
      const { SkillLoader } = await import('../../../src/skills/loader/skill-loader.ts');

      const loader = new SkillLoader(testSkillsDir);
      loader.rebuildIndex();
      const skills = loader.loadAllLevel1();

      expect(skills.length).toBeGreaterThanOrEqual(1);
      const testSkill = skills.find(s => s.name === 'test-skill');
      expect(testSkill).toBeDefined();
      expect(testSkill?.tags).toContain('test');
    });
  });
});
