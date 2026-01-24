# 第四部分：核心模块设计

## ⚠️ 强制验证法则

**在本部分的实施过程中，必须严格遵循以下验证流程：**

### 1. 迁移前检查（Pre-Migration Check）
- [ ] **Agent 主循环逻辑**：详细阅读 Python `agent.py` 的执行流程和状态管理
- [ ] **LLM 交互协议**：理解 Python 版本如何调用 Anthropic API 和处理响应
- [ ] **配置管理机制**：分析 Python 版本的配置加载、验证、环境变量处理
- [ ] **类型定义对照**：对比 Python 类型注解和 TypeScript 类型系统

### 2. 迁移后检查（Post-Migration Check）
- [ ] **消息循环验证**：验证 Agent 主循环与 Python 版本行为完全一致
- [ ] **工具调用流程**：测试工具调用的请求-响应流程与 Python 版本对齐
- [ ] **配置加载测试**：验证环境变量、配置文件的加载顺序和优先级
- [ ] **类型安全检查**：确保所有类型定义正确且无类型错误

### 3. PRD 符合性检查（PRD Compliance Check）
- [ ] **唯一工具验证**：确认 LLM 只能看到单一 Bash 工具，符合统一抽象理念
- [ ] **对话历史管理**：验证对话历史正确维护，支持技能强化的学习能力
- [ ] **系统提示词**：确认系统提示词正确传递 Bash 三层架构的使用说明
- [ ] **错误处理机制**：验证错误处理支持 Agent 自我修复和学习

**❌ 未完成上述检查清单的任何一项，不得进入下一阶段**

---

## 4.1 基础类型系统 (src/core/types.ts)

### 核心类型定义

```typescript
import Anthropic from '@anthropic-ai/sdk';

// 工具调用步骤
export interface ToolCallStep {
  tool_name: string;              // 工具名称（固定为 "Bash"）
  tool_input: Record<string, any>; // 工具输入（command）
  tool_result: string;             // 工具执行结果
  success: boolean;                // 是否成功
}

// Agent 执行结果
export interface AgentResult {
  content: string;        // 最终回复内容
  error: string | null;   // 错误信息
  steps: ToolCallStep[];  // 工具调用步骤列表
  tool_results?: Array<{  // 详细工具结果（用于 verbose 模式）
    name: string;
    result: {
      success: boolean;
      output?: any;
      error?: string;
    };
  }>;
}

// 重新导出 Anthropic 类型
export type Message = Anthropic.MessageParam;
export type ContentBlock = Anthropic.ContentBlock;
export type ToolUseBlock = Extract<Anthropic.ContentBlock, { type: 'tool_use' }>;
export type TextBlock = Extract<Anthropic.ContentBlock, { type: 'text' }>;
```

### 字段对齐 Python 版本

| Python 字段 | TypeScript 字段 | 说明 |
|------------|----------------|------|
| `tool_name` | `tool_name` | 保持 snake_case |
| `tool_input` | `tool_input` | 保持 snake_case |
| `tool_result` | `tool_result` | 保持 snake_case |

## 4.2 配置管理 (src/core/config.ts)

### 配置接口

```typescript
export interface Config {
  synapseHome: string;    // ~/.synapse
  toolsDir: string;       // ~/.synapse/tools
  skillsDir: string;      // ~/.synapse/skills
  model: string;          // MiniMax-M2
  apiKey: string;         // API key
  baseURL?: string;       // API endpoint
  maxTokens: number;      // 默认 4096
  temperature: number;    // 默认 0.7
}
```

### 配置类实现

```typescript
export class SynapseConfig {
  // 从环境变量加载配置
  constructor() {
    this.synapseHome = process.env.SYNAPSE_HOME || DEFAULT_SYNAPSE_HOME;
    this.model = process.env.MODEL || 'MiniMax-M2';
    this.apiKey = process.env.ANTHROPIC_API_KEY || '';
    this.baseURL = process.env.ANTHROPIC_BASE_URL ||
                   'https://api.minimaxi.com/anthropic';
    // ...
  }

  // 确保目录存在
  async ensureDirs(): Promise<void> {
    await fs.mkdir(this.synapseHome, { recursive: true });
    await fs.mkdir(this.toolsDir, { recursive: true });
    await fs.mkdir(this.skillsDir, { recursive: true });
  }

  // 验证配置
  validate(): string[] {
    const errors: string[] = [];
    if (!this.apiKey) errors.push('ANTHROPIC_API_KEY is not set');
    if (!this.model) errors.push('MODEL is not set');
    return errors;
  }
}
```

### 全局配置管理

```typescript
// 单例模式
let globalConfig: SynapseConfig | null = null;

export function getConfig(): SynapseConfig {
  if (!globalConfig) {
    globalConfig = new SynapseConfig();
  }
  return globalConfig;
}
```

### 与 Python 对比

| Python | TypeScript | 说明 |
|--------|-----------|------|
| `get_config()` | `getConfig()` | 函数名转 camelCase |
| `ensure_dirs()` | `ensureDirs()` | 方法名转 camelCase |
| `synapse_home` | `synapseHome` | 属性名转 camelCase |

## 4.3 LLM 客户端 (src/core/llm.ts)

### 唯一工具定义

```typescript
// Bash 工具 - LLM 唯一可见的工具
const BASH_TOOL: Anthropic.Tool = {
  name: 'bash',
  description: 'Execute bash commands. Supports Base Bash (native commands), Agent Bash (read, write, edit, grep, glob, skill), and Field Bash (MCP tools, converted tools).',
  input_schema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The bash command to execute',
      },
    },
    required: ['command'],
  },
};
```

### LLM 客户端类

```typescript
export class LLMClient {
  private client: Anthropic;
  private defaultModel: string;
  private defaultMaxTokens: number;

  constructor(
    apiKey: string,
    baseURL: string,
    model: string,
    maxTokens: number = 4096
  ) {
    this.client = new Anthropic({ apiKey, baseURL });
    this.defaultModel = model;
    this.defaultMaxTokens = maxTokens;
  }

  // 发送消息 - 始终只传递单个 bash 工具
  async createMessage(
    messages: Anthropic.MessageParam[],
    systemPrompt?: string
  ): Promise<Anthropic.Message> {
    return this.client.messages.create({
      model: this.defaultModel,
      max_tokens: this.defaultMaxTokens,
      messages,
      tools: [BASH_TOOL], // 唯一工具
      system: systemPrompt,
    });
  }
}
```

### 工厂函数

```typescript
export function createLLMClient(config: Config): LLMClient {
  return new LLMClient(
    config.apiKey,
    config.baseURL || 'https://api.minimaxi.com/anthropic',
    config.model,
    config.maxTokens
  );
}
```

## 4.4 Agent 配置 (src/core/agent-config.ts)

### 配置接口

```typescript
export interface AgentConfig {
  maxIterations: number;  // 最大迭代次数
  verbose: boolean;       // 详细输出
  timeout?: number;       // 超时时间（毫秒）
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  maxIterations: 10,
  verbose: false,
  timeout: 120000, // 2 分钟
};
```

### 与 Python 对齐

| Python | TypeScript |
|--------|-----------|
| `max_iterations` | `maxIterations` |

## 4.5 Agent 主类 (src/core/agent.ts)

### 类结构

```typescript
export class Agent {
  private llm: LLMClient;
  private registry: ToolRegistry;
  private session: BashSession;
  private router: BashRouter;
  private conversationHistory: Message[] = [];
  private systemPrompt: string = '';
  private config: AgentConfig;

  constructor(llm: LLMClient, config: Partial<AgentConfig> = {}) {
    this.llm = llm;
    this.config = { ...DEFAULT_AGENT_CONFIG, ...config };
    this.registry = new ToolRegistry();
    this.session = new BashSession();
    this.router = new BashRouter(this.registry, this.session);
  }
}
```

### 核心方法

**run() - 主循环**

```typescript
async run(userMessage: string): Promise<AgentResult> {
  // 1. 添加用户消息
  this.conversationHistory.push({
    role: 'user',
    content: userMessage,
  });

  const steps: ToolCallStep[] = [];
  let iteration = 0;

  // 2. Agent Loop
  while (iteration < this.config.maxIterations) {
    iteration++;

    // 3. 调用 LLM
    const response = await this.llm.createMessage(
      this.conversationHistory,
      this.systemPrompt
    );

    // 4. 添加助手响应
    this.conversationHistory.push({
      role: 'assistant',
      content: response.content,
    });

    // 5. 检查 stop_reason
    if (response.stop_reason === 'end_turn') {
      // 提取文本内容并返回
      return { content, error: null, steps };
    }

    // 6. 处理工具调用
    if (response.stop_reason === 'tool_use') {
      const toolResultBlocks = await this.executeTools(response.content, steps);

      // 添加工具结果到历史
      this.conversationHistory.push({
        role: 'user',
        content: toolResultBlocks,
      });

      continue; // 继续循环
    }
  }

  // 7. 达到最大迭代次数
  return {
    content: '',
    error: `Maximum iterations (${this.config.maxIterations}) reached`,
    steps,
  };
}
```

**executeTools() - 工具执行**

```typescript
private async executeTools(
  content: ContentBlock[],
  steps: ToolCallStep[]
): Promise<Anthropic.ToolResultBlockParam[]> {
  const toolUseBlocks = content.filter(
    (block): block is ToolUseBlock => block.type === 'tool_use'
  );

  const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];

  for (const toolUseBlock of toolUseBlocks) {
    // 提取 bash 命令
    const command = toolUseBlock.input.command as string;

    // 通过 BashRouter 执行
    const result = await this.router.execute(command);

    // 记录步骤
    steps.push({
      tool_name: 'Bash',
      tool_input: { command },
      tool_result: result.output || result.error || '',
      success: result.success,
    });

    // 添加工具结果
    toolResultBlocks.push({
      type: 'tool_result',
      tool_use_id: toolUseBlock.id,
      content: result.success
        ? (result.output || '')
        : (result.error || 'Unknown error'),
      is_error: !result.success,
    });
  }

  return toolResultBlocks;
}
```

### 其他方法

```typescript
// 设置系统提示词
setSystemPrompt(prompt: string): void {
  this.systemPrompt = prompt;
}

// 注册工具
registerTool(tool: BaseTool): void {
  this.registry.register(tool);
}

// 列出工具
listTools(): string[] {
  return this.registry.listNames();
}

// 清除历史
clearHistory(): void {
  this.conversationHistory = [];
}

// 直接执行 bash 命令（用于 REPL ! 前缀）
async executeBash(command: string): Promise<string> {
  const result = await this.router.execute(command);
  return result.success
    ? (result.output || 'Command completed successfully')
    : (result.error || 'Command failed');
}
```

## 4.6 系统提示词 (src/core/prompts.ts)

### 默认提示词

```typescript
export const DEFAULT_SYSTEM_PROMPT = `You are Synapse Agent, an AI assistant with access to a unified Bash interface.

## Tool Architecture

You have access to a single tool called "bash" which provides three layers of commands:

### Base Bash (Native Commands)
Standard Unix/Linux commands: ls, cd, git, curl, etc.
These execute in a persistent shell session that maintains environment variables and working directory.

### Agent Bash (Core Tools)
Specialized tools for file and code operations:
- read <file>          : Read file contents
- write <file>         : Write/create files
- edit <file>          : Edit files with string replacement
- grep <pattern>       : Search file contents
- glob <pattern>       : Find files by pattern
- skill <action>       : Load and manage skills

All Agent commands support -h (short) and --help (detailed) help flags.

### Field Bash (Domain Tools)
Domain-specific tools converted from:
- MCP (Model Context Protocol) servers
- Anthropic tool format
- Skill scripts

## Important Guidelines

1. **Use bash tool for ALL commands** - Never assume you can access files or run commands without the bash tool
2. **Persistent session** - Environment variables and working directory persist across bash calls
3. **Help is available** - Use -h or --help flags to learn about Agent commands
4. **Skills enhance capabilities** - Use the skill tool to load domain expertise
5. **Output clarity** - Provide clear explanations of what you're doing and why

## Execution Flow

1. Analyze the user's request
2. Determine which bash commands are needed
3. Execute commands via the bash tool
4. Interpret results and respond to the user

Remember: You can accomplish complex tasks by chaining bash commands together.`;
```

### 其他提示词

```typescript
export const SKILL_SEARCH_PROMPT = `You are a skill search agent...`;
export const SKILL_ENHANCEMENT_PROMPT = `You are a skill enhancement agent...`;
```

## 4.7 与 Python 版本对比

### 类和方法对照表

| Python | TypeScript | 说明 |
|--------|-----------|------|
| `class Agent` | `class Agent` | ✅ 完全一致 |
| `def run(self, query: str)` | `async run(userMessage: string)` | ✅ 对齐 |
| `def set_system_prompt()` | `setSystemPrompt()` | ✅ camelCase |
| `def register_tool()` | `registerTool()` | ✅ camelCase |
| `def list_tools()` | `listTools()` | ✅ camelCase |
| `def clear_history()` | `clearHistory()` | ✅ camelCase |
| `AgentConfig` | `AgentConfig` | ✅ 完全一致 |
| `max_iterations` | `maxIterations` | ✅ camelCase |

### 字段名对照表

| Python | TypeScript | 保持一致 |
|--------|-----------|---------|
| `tool_name` | `tool_name` | ✅ |
| `tool_input` | `tool_input` | ✅ |
| `tool_result` | `tool_result` | ✅ |
| `is_error` | `is_error` | ✅ |
| `stop_reason` | `stop_reason` | ✅ |
