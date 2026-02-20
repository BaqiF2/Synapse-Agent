/**
 * Agent Loop 单元测试 — 验证 F-002 Agent Core 接口抽象的 5 个 BDD 场景。
 * 测试目标: AgentConfig Zod 验证、工具名冲突检测、工具执行错误兜底、
 *           依赖注入、Mock 依赖独立测试。
 */

import { describe, expect, it } from 'bun:test';
import { AgentConfigSchema, validateAgentConfig } from '../../../src/core/agent-config-schema.ts';
import { runAgentLoop } from '../../../src/core/agent-loop.ts';
import { ConfigurationError } from '../../../src/shared/errors.ts';
import { MAX_TOOL_ITERATIONS, MAX_CONSECUTIVE_TOOL_FAILURES } from '../../../src/shared/constants.ts';
import type { AgentTool, ToolResult, AgentConfig, AgentEvent, LLMProviderLike } from '../../../src/core/types.ts';
import type { AgentLoopConfig } from '../../../src/core/agent-loop-config.ts';
import type { LLMResponse, LLMStream, LLMStreamChunk } from '../../../src/types/provider.ts';

// ========== 测试辅助工厂函数 ==========

/** 创建一个 Mock LLMProvider */
function createMockProvider(responses: LLMResponse[]): LLMProviderLike {
  let callIndex = 0;
  return {
    name: 'mock-provider',
    model: 'mock-model',
    generate(_params) {
      const response = responses[callIndex] ?? responses[responses.length - 1]!;
      callIndex++;

      const iterable: LLMStream = {
        async *[Symbol.asyncIterator](): AsyncGenerator<LLMStreamChunk> {
          // 空流：不产出 chunk
        },
        result: Promise.resolve(response),
      };
      return iterable;
    },
  };
}

/** 创建一个简单的 Mock AgentTool */
function createMockTool(name: string, result: ToolResult): AgentTool {
  return {
    name,
    description: `Mock tool: ${name}`,
    inputSchema: { type: 'object', properties: {} },
    async execute(_input: unknown): Promise<ToolResult> {
      return result;
    },
  };
}

/** 创建一个会抛异常的 AgentTool（用于测试异常兜底） */
function createThrowingTool(name: string): AgentTool {
  return {
    name,
    description: `Throwing tool: ${name}`,
    inputSchema: { type: 'object', properties: {} },
    async execute(_input: unknown): Promise<ToolResult> {
      throw new Error('Unexpected runtime error in tool');
    },
  };
}

/** 创建有效的 AgentConfig（用于 Zod schema 验证测试） */
function createValidConfig(overrides?: Partial<AgentConfig>): AgentConfig {
  const defaults: AgentConfig = {
    provider: createMockProvider([{
      content: [{ type: 'text', text: 'Hello' }],
      stopReason: 'end_turn',
      usage: { inputTokens: 10, outputTokens: 5 },
    }]),
    tools: [],
    systemPrompt: 'You are a helpful assistant.',
    maxIterations: MAX_TOOL_ITERATIONS,
    maxConsecutiveFailures: MAX_CONSECUTIVE_TOOL_FAILURES,
    contextWindow: 128000,
  };
  return { ...defaults, ...overrides };
}

/** 创建有效的 AgentLoopConfig（用于 runAgentLoop 测试） */
function createLoopConfig(overrides?: Partial<AgentLoopConfig>): AgentLoopConfig {
  const defaults: AgentLoopConfig = {
    provider: createMockProvider([{
      content: [{ type: 'text', text: 'Hello' }],
      stopReason: 'end_turn',
      usage: { inputTokens: 10, outputTokens: 5 },
    }]),
    tools: [],
    systemPrompt: 'You are a helpful assistant.',
    maxIterations: MAX_TOOL_ITERATIONS,
    failureDetection: {
      strategy: 'sliding-window',
      windowSize: 10,
      failureThreshold: MAX_CONSECUTIVE_TOOL_FAILURES,
    },
  };
  return { ...defaults, ...overrides };
}

// ========== BDD 场景测试 ==========

describe('F-002 Agent Core Interface', () => {

  // BDD 场景 1: AgentConfig 通过 Zod 验证
  describe('Scenario 1: AgentConfig Zod 验证', () => {
    it('should validate a valid AgentConfig', () => {
      const config = createValidConfig();
      const result = AgentConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject config missing provider field', () => {
      // Given: 一个缺少 provider 字段的配置对象
      const invalidConfig = {
        tools: [],
        systemPrompt: 'test',
        maxIterations: 10,
        maxConsecutiveFailures: 3,
        contextWindow: 128000,
      };

      // When: 尝试验证该配置
      const result = AgentConfigSchema.safeParse(invalidConfig);

      // Then: 抛出 Zod 验证错误，明确指出 provider 字段有问题
      expect(result.success).toBe(false);
      if (!result.success) {
        // Zod 4 对缺失的 object 字段报告 "expected object, received undefined"
        const hasProviderIssue = result.error.issues.some(
          (i) =>
            i.path.includes('provider') || i.message.toLowerCase().includes('required'),
        );
        expect(hasProviderIssue).toBe(true);
      }
    });

    it('should reject config with invalid maxIterations', () => {
      const invalidConfig = {
        ...createValidConfig(),
        maxIterations: -1,
      };
      const result = AgentConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should accept config with optional abortSignal', () => {
      const controller = new AbortController();
      const config = createValidConfig({ abortSignal: controller.signal });
      const result = AgentConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });

  // BDD 场景 2: 工具名冲突检测
  describe('Scenario 2: 工具名冲突检测', () => {
    it('should throw ConfigurationError when tools have duplicate names', () => {
      // Given: 两个 AgentTool 实例，name 均为 'duplicate_tool'
      const tool1 = createMockTool('duplicate_tool', { output: 'ok', isError: false });
      const tool2 = createMockTool('duplicate_tool', { output: 'ok', isError: false });

      const config = createValidConfig({ tools: [tool1, tool2] });

      // When & Then: 在 Agent 启动前抛出配置错误，说明工具名 'duplicate_tool' 冲突
      expect(() => validateAgentConfig(config)).toThrow(ConfigurationError);
      expect(() => validateAgentConfig(config)).toThrow(/duplicate_tool/);
    });

    it('should not throw when tool names are unique', () => {
      const tool1 = createMockTool('tool_a', { output: 'ok', isError: false });
      const tool2 = createMockTool('tool_b', { output: 'ok', isError: false });

      const config = createValidConfig({ tools: [tool1, tool2] });

      expect(() => validateAgentConfig(config)).not.toThrow();
    });
  });

  // BDD 场景 3: AgentTool.execute 不抛异常
  describe('Scenario 3: AgentTool.execute 不抛异常', () => {
    it('should return ToolResult with isError=true when tool throws', async () => {
      // Given: 一个 AgentTool 实现，内部发生运行时错误
      const throwingTool = createThrowingTool('broken_tool');

      // Provider 返回一个 tool_use，指向 broken_tool
      const provider = createMockProvider([
        {
          content: [
            { type: 'tool_use', id: 'call-1', name: 'broken_tool', input: {} },
          ],
          stopReason: 'tool_use',
          usage: { inputTokens: 10, outputTokens: 5 },
        },
        {
          content: [{ type: 'text', text: 'Done.' }],
          stopReason: 'end_turn',
          usage: { inputTokens: 15, outputTokens: 10 },
        },
      ]);

      const config = createLoopConfig({
        provider,
        tools: [throwingTool],
        maxIterations: 5,
      });

      // When: Agent Loop 调用该工具的 execute() 方法
      const stream = runAgentLoop(config, [{ type: 'text', text: 'Use broken_tool' }]);
      const events: AgentEvent[] = [];
      for await (const event of stream) {
        events.push(event);
      }

      // Then: 返回 ToolResult，isError 为 true
      const toolEndEvent = events.find((e) => e.type === 'tool_end');
      expect(toolEndEvent).toBeDefined();
      if (toolEndEvent?.type === 'tool_end') {
        expect(toolEndEvent.isError).toBe(true);
        // output 包含错误信息
        expect(toolEndEvent.output).toContain('Unexpected runtime error in tool');
      }

      // Agent Loop 正常继续运行（没有抛异常，有最终结果）
      const result = await stream.result;
      expect(result).toBeDefined();
      expect(result.stopReason).not.toBe('error');
    });
  });

  // BDD 场景 4: Agent Loop 通过接口接收所有依赖
  describe('Scenario 4: Agent Loop 依赖注入', () => {
    it('should not contain direct instantiation of concrete providers or tools', async () => {
      // Given: Agent Core 模块的源代码
      // When: 扫描 agent-loop.ts 中的 import 和实例化语句
      const agentLoopSource = await Bun.file(
        new URL('../../../src/core/agent-loop.ts', import.meta.url).pathname,
      ).text();

      // Then: 不存在 new AnthropicClient() 或类似的具体 Provider 实例化
      expect(agentLoopSource).not.toMatch(/new\s+AnthropicClient/);
      expect(agentLoopSource).not.toMatch(/new\s+OpenAIClient/);
      expect(agentLoopSource).not.toMatch(/new\s+GoogleClient/);

      // 不存在 new BashTool() 或类似的具体工具实例化
      expect(agentLoopSource).not.toMatch(/new\s+BashTool/);
      expect(agentLoopSource).not.toMatch(/new\s+ReadTool/);
      expect(agentLoopSource).not.toMatch(/new\s+WriteTool/);

      // 所有依赖通过 AgentLoopConfig 参数传入（检查函数签名）
      expect(agentLoopSource).toMatch(/AgentLoopConfig/);
    });

    it('should not import from providers or tools implementation modules', async () => {
      const agentLoopSource = await Bun.file(
        new URL('../../../src/core/agent-loop.ts', import.meta.url).pathname,
      ).text();

      // 不应导入具体实现模块
      expect(agentLoopSource).not.toMatch(/from\s+['"].*providers\/(?!types)/);
      expect(agentLoopSource).not.toMatch(/from\s+['"].*tools\/handlers/);
    });
  });

  // BDD 场景 5: 使用 Mock 依赖独立测试 Agent Loop
  describe('Scenario 5: Mock 依赖独立测试', () => {
    it('should complete a full agent loop with mock dependencies', async () => {
      // Given: 一个 Mock LLMProvider，返回预设响应
      const mockTool = createMockTool('echo', { output: 'echoed result', isError: false });

      const provider = createMockProvider([
        // 第一轮：调用工具
        {
          content: [
            { type: 'text', text: 'I will use the echo tool.' },
            { type: 'tool_use', id: 'call-1', name: 'echo', input: { text: 'hello' } },
          ],
          stopReason: 'tool_use',
          usage: { inputTokens: 100, outputTokens: 50 },
        },
        // 第二轮：最终回复
        {
          content: [{ type: 'text', text: 'The echo result is: echoed result' }],
          stopReason: 'end_turn',
          usage: { inputTokens: 200, outputTokens: 30 },
        },
      ]);

      // 一个完整的 AgentLoopConfig
      const config = createLoopConfig({
        provider,
        tools: [mockTool],
        maxIterations: 10,
      });

      // When: 调用 Agent Loop 处理用户消息
      const stream = runAgentLoop(config, [{ type: 'text', text: 'Say hello with echo' }]);

      // Then: Agent Loop 完整运行
      const events: AgentEvent[] = [];
      for await (const event of stream) {
        events.push(event);
      }

      // 不需要真实 LLM API 调用（使用 Mock）
      // 不需要真实文件系统操作（使用 Mock Tool）

      // 返回预期结果
      const result = await stream.result;
      expect(result.response).toContain('echo');
      expect(result.turnCount).toBeGreaterThanOrEqual(2);
      expect(result.stopReason).toBe('end_turn');

      // 验证事件序列完整
      const eventTypes = events.map((e) => e.type);
      expect(eventTypes).toContain('agent_start');
      expect(eventTypes).toContain('turn_start');
      expect(eventTypes).toContain('tool_start');
      expect(eventTypes).toContain('tool_end');
      expect(eventTypes).toContain('agent_end');
    });

    it('should stop at max iterations', async () => {
      // Provider 永远返回 tool_use，模拟无限循环
      const mockTool = createMockTool('infinite', { output: 'ok', isError: false });
      const toolUseResponse: LLMResponse = {
        content: [
          { type: 'tool_use', id: 'call-loop', name: 'infinite', input: {} },
        ],
        stopReason: 'tool_use',
        usage: { inputTokens: 10, outputTokens: 5 },
      };

      const provider = createMockProvider([toolUseResponse]);

      const maxIterations = 3;
      const config = createLoopConfig({
        provider,
        tools: [mockTool],
        maxIterations,
      });

      const stream = runAgentLoop(config, [{ type: 'text', text: 'loop forever' }]);
      const events: AgentEvent[] = [];
      for await (const event of stream) {
        events.push(event);
      }

      const result = await stream.result;
      expect(result.stopReason).toBe('max_iterations');
      expect(result.turnCount).toBe(maxIterations);
    });

    it('should handle abortSignal', async () => {
      const controller = new AbortController();

      // Provider 在第一次调用后 abort
      let callCount = 0;
      const provider: LLMProviderLike = {
        name: 'abort-provider',
        model: 'abort-model',
        generate(_params) {
          callCount++;
          if (callCount > 1) {
            controller.abort();
          }
          const stream: LLMStream = {
            async *[Symbol.asyncIterator](): AsyncGenerator<LLMStreamChunk> {},
            result: Promise.resolve({
              content: [
                { type: 'tool_use', id: `call-${callCount}`, name: 'tool', input: {} },
              ],
              stopReason: 'tool_use',
              usage: { inputTokens: 10, outputTokens: 5 },
            } satisfies LLMResponse),
          };
          return stream;
        },
      };

      const mockTool = createMockTool('tool', { output: 'ok', isError: false });
      const config = createLoopConfig({
        provider,
        tools: [mockTool],
        maxIterations: 10,
        abortSignal: controller.signal,
      });

      const stream = runAgentLoop(config, [{ type: 'text', text: 'test abort' }]);
      const events: AgentEvent[] = [];
      for await (const event of stream) {
        events.push(event);
      }

      const result = await stream.result;
      expect(result.stopReason).toBe('aborted');
    });
  });
});
