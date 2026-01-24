# 第七部分：CLI 层设计

## ⚠️ 强制验证法则

**在本部分的实施过程中，必须严格遵循以下验证流程：**

### 1. 迁移前检查（Pre-Migration Check）
- [ ] **CLI 命令对照**：详细列出 Python 版本的所有 CLI 命令和选项
- [ ] **REPL 交互流程**：理解 Python REPL 的命令处理、历史管理机制
- [ ] **输出格式分析**：分析 Python 使用 rich 库的输出格式和样式
- [ ] **错误处理流程**：理解 Python CLI 的错误捕获和显示方式

### 2. 迁移后检查（Post-Migration Check）
- [ ] **命令行为验证**：逐个测试每个 CLI 命令的行为与 Python 版本一致
- [ ] **REPL 功能测试**：验证 REPL 的所有特殊命令（!cmd, /clear, /exit）
- [ ] **输出格式对比**：对比 Markdown 渲染、代码高亮的视觉效果
- [ ] **Help 输出验证**：确认 --help 输出格式和内容与 Python 版本一致

### 3. PRD 符合性检查（PRD Compliance Check）
- [ ] **CLI 交互体验**：验证 CLI 提供流畅的交互体验，符合验证期用户需求
- [ ] **Bash 直接执行**：确认 REPL 支持 `!command` 直接执行 Bash 命令
- [ ] **对话历史维护**：验证 REPL 正确维护对话历史，支持技能学习
- [ ] **可扩展性设计**：确认 CLI 设计为未来 GUI/API 集成留有空间

**❌ 未完成上述检查清单的任何一项，不得进入下一阶段**

---

## 7.1 CLI 入口 (src/entrypoints/cli.tsx)

### 主入口结构

```typescript
#!/usr/bin/env bun
import { Command } from 'commander';
import { version } from '../../package.json';
import { runCommand } from '../cli/commands/run.js';
import { chatCommand } from '../cli/commands/chat.js';
import { configCommand } from '../cli/commands/config.js';
import { toolsCommand } from '../cli/commands/tools.js';
import { skillsCommand } from '../cli/commands/skills.js';

const program = new Command();

program
  .name('synapse')
  .description('Synapse Agent - Self-growing AI agent with unified Bash interface')
  .version(version);

// 主命令：synapse <query>
program
  .argument('[query...]', 'Query to send to the agent')
  .option('-v, --verbose', 'Enable verbose output')
  .option('--max-iterations <n>', 'Maximum iterations', '10')
  .action(async (query, options) => {
    if (query.length === 0) {
      program.help();
      return;
    }
    await runCommand(query.join(' '), options);
  });

// 子命令
program
  .command('chat')
  .description('Start interactive REPL session')
  .option('-v, --verbose', 'Enable verbose output')
  .action(chatCommand);

program
  .command('config')
  .description('Show configuration')
  .action(configCommand);

program
  .command('tools')
  .description('List available tools')
  .option('-v, --verbose', 'Show detailed information')
  .action(toolsCommand);

program
  .command('skills')
  .description('Manage skills')
  .option('-l, --list', 'List all skills')
  .option('-s, --search <query>', 'Search skills')
  .option('-d, --domain <domain>', 'Filter by domain')
  .action(skillsCommand);

program.parse();
```

## 7.2 run 命令 (src/cli/commands/run.ts)

### 单次查询执行

```typescript
import { Agent } from '../../core/agent.js';
import { createLLMClient } from '../../core/llm.js';
import { getConfig } from '../../core/config.js';
import { DEFAULT_SYSTEM_PROMPT } from '../../core/prompts.js';
import chalk from 'chalk';

export interface RunOptions {
  verbose?: boolean;
  maxIterations?: string;
}

export async function runCommand(
  query: string,
  options: RunOptions
): Promise<void> {
  try {
    // 加载配置
    const config = getConfig();
    await config.ensureDirs();

    const errors = config.validate();
    if (errors.length > 0) {
      console.error(chalk.red('Configuration errors:'));
      errors.forEach(err => console.error(chalk.red(`  - ${err}`)));
      process.exit(1);
    }

    // 创建 Agent
    const llm = createLLMClient(config);
    const agent = new Agent(llm, {
      maxIterations: parseInt(options.maxIterations || '10', 10),
      verbose: options.verbose || false,
    });

    agent.setSystemPrompt(DEFAULT_SYSTEM_PROMPT);

    // 执行查询
    if (options.verbose) {
      console.log(chalk.blue('Query:'), query);
      console.log(chalk.blue('Max iterations:'), agent.config.maxIterations);
      console.log('');
    }

    const result = await agent.run(query);

    // 输出结果
    if (result.error) {
      console.error(chalk.red('Error:'), result.error);
      process.exit(1);
    }

    console.log(result.content);

    // Verbose 模式输出工具调用步骤
    if (options.verbose && result.steps.length > 0) {
      console.log('');
      console.log(chalk.blue('Tool calls:'));
      result.steps.forEach((step, i) => {
        console.log(chalk.gray(`[${i + 1}] ${step.tool_name}`));
        console.log(chalk.gray(`    Input: ${JSON.stringify(step.tool_input)}`));
        console.log(chalk.gray(`    Success: ${step.success}`));
      });
    }
  } catch (error) {
    console.error(chalk.red('Unexpected error:'), error);
    process.exit(1);
  }
}
```

## 7.3 chat 命令 (src/cli/commands/chat.tsx)

### REPL 实现

```typescript
import { Agent } from '../../core/agent.js';
import { createLLMClient } from '../../core/llm.js';
import { getConfig } from '../../core/config.js';
import { DEFAULT_SYSTEM_PROMPT } from '../../core/prompts.js';
import { render, Box, Text } from 'ink';
import { ChatUI } from '../components/ChatUI.js';
import chalk from 'chalk';
import readline from 'readline';

export interface ChatOptions {
  verbose?: boolean;
}

export async function chatCommand(options: ChatOptions): Promise<void> {
  const config = getConfig();
  await config.ensureDirs();

  const llm = createLLMClient(config);
  const agent = new Agent(llm, {
    verbose: options.verbose || false,
  });

  agent.setSystemPrompt(DEFAULT_SYSTEM_PROMPT);

  console.log(chalk.blue('Synapse Agent REPL'));
  console.log(chalk.gray('Type your query or use commands:'));
  console.log(chalk.gray('  !<command>  - Execute shell command directly'));
  console.log(chalk.gray('  /clear      - Clear conversation history'));
  console.log(chalk.gray('  /exit       - Exit REPL'));
  console.log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.green('synapse> '),
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    // 处理命令
    if (input === '/exit') {
      console.log(chalk.gray('Goodbye!'));
      rl.close();
      process.exit(0);
    }

    if (input === '/clear') {
      agent.clearHistory();
      console.log(chalk.blue('Conversation history cleared'));
      rl.prompt();
      return;
    }

    // 直接执行 shell 命令
    if (input.startsWith('!')) {
      const command = input.slice(1);
      try {
        const result = await agent.executeBash(command);
        console.log(result);
      } catch (error) {
        console.error(chalk.red('Error:'), error);
      }
      rl.prompt();
      return;
    }

    // 执行 Agent 查询
    try {
      const result = await agent.run(input);

      if (result.error) {
        console.error(chalk.red('Error:'), result.error);
      } else {
        console.log(result.content);
      }

      if (options.verbose && result.steps.length > 0) {
        console.log('');
        console.log(chalk.gray(`[Executed ${result.steps.length} tool calls]`));
      }
    } catch (error) {
      console.error(chalk.red('Unexpected error:'), error);
    }

    console.log('');
    rl.prompt();
  });

  rl.on('close', () => {
    console.log(chalk.gray('Goodbye!'));
    process.exit(0);
  });
}
```

### ChatUI 组件 (src/cli/components/ChatUI.tsx)

```typescript
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function ChatUI() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');

  useInput((input, key) => {
    if (key.return) {
      if (input.trim()) {
        setMessages([...messages, { role: 'user', content: input }]);
        setInput('');
      }
    } else if (key.backspace || key.delete) {
      setInput(input.slice(0, -1));
    } else {
      setInput(input + input);
    }
  });

  return (
    <Box flexDirection="column">
      {messages.map((msg, i) => (
        <Box key={i} marginBottom={1}>
          <Text color={msg.role === 'user' ? 'green' : 'blue'}>
            {msg.role === 'user' ? 'You: ' : 'Agent: '}
          </Text>
          <Text>{msg.content}</Text>
        </Box>
      ))}
      <Box>
        <Text color="green">synapse&gt; </Text>
        <Text>{input}</Text>
      </Box>
    </Box>
  );
}
```

## 7.4 config 命令 (src/cli/commands/config.ts)

### 配置显示

```typescript
import { getConfig } from '../../core/config.js';
import chalk from 'chalk';
import Table from 'cli-table3';

export async function configCommand(): Promise<void> {
  const config = getConfig();

  const table = new Table({
    head: [chalk.blue('Key'), chalk.blue('Value')],
    colWidths: [25, 60],
  });

  table.push(
    ['Synapse Home', config.synapseHome],
    ['Tools Directory', config.toolsDir],
    ['Skills Directory', config.skillsDir],
    ['Model', config.model],
    ['Base URL', config.baseURL || 'Not set'],
    ['API Key', config.apiKey ? '***' + config.apiKey.slice(-4) : 'Not set'],
    ['Max Tokens', config.maxTokens.toString()],
    ['Temperature', config.temperature.toString()]
  );

  console.log(chalk.blue.bold('Synapse Agent Configuration'));
  console.log('');
  console.log(table.toString());
  console.log('');

  const errors = config.validate();
  if (errors.length > 0) {
    console.log(chalk.red.bold('Configuration Errors:'));
    errors.forEach(err => console.log(chalk.red(`  - ${err}`)));
  } else {
    console.log(chalk.green('✓ Configuration is valid'));
  }
}
```

## 7.5 tools 命令 (src/cli/commands/tools.ts)

### 工具列表

```typescript
import { Agent } from '../../core/agent.js';
import { createLLMClient } from '../../core/llm.js';
import { getConfig } from '../../core/config.js';
import { ToolRegistry } from '../../tools/registry.js';
import chalk from 'chalk';
import Table from 'cli-table3';

export interface ToolsOptions {
  verbose?: boolean;
}

export async function toolsCommand(options: ToolsOptions): Promise<void> {
  const config = getConfig();
  const llm = createLLMClient(config);
  const agent = new Agent(llm);

  const toolNames = agent.listTools();

  if (options.verbose) {
    // 详细模式：显示完整 schema
    const registry = new ToolRegistry();

    console.log(chalk.blue.bold('Available Tools'));
    console.log('');

    for (const name of toolNames) {
      const tool = registry.get(name);
      if (!tool) continue;

      console.log(chalk.green.bold(`${name}`));
      console.log(chalk.gray(`  ${tool.description}`));
      console.log('');

      const schema = tool.getSchema();
      const props = schema.input_schema.properties || {};
      const required = schema.input_schema.required || [];

      console.log(chalk.blue('  Parameters:'));
      for (const [paramName, paramDef] of Object.entries(props)) {
        const isRequired = required.includes(paramName);
        const requiredMark = isRequired ? chalk.red('*') : ' ';
        const typeDef = (paramDef as any).type || 'any';
        const desc = (paramDef as any).description || '';

        console.log(`    ${requiredMark} ${chalk.yellow(paramName)} (${typeDef})`);
        if (desc) {
          console.log(`      ${chalk.gray(desc)}`);
        }
      }
      console.log('');
    }
  } else {
    // 简洁模式：表格展示
    const table = new Table({
      head: [chalk.blue('#'), chalk.blue('Tool Name'), chalk.blue('Description')],
      colWidths: [5, 20, 60],
    });

    const registry = new ToolRegistry();
    toolNames.forEach((name, i) => {
      const tool = registry.get(name);
      table.push([
        (i + 1).toString(),
        name,
        tool?.description || 'No description',
      ]);
    });

    console.log(chalk.blue.bold('Available Tools'));
    console.log('');
    console.log(table.toString());
    console.log('');
    console.log(chalk.gray(`Total: ${toolNames.length} tools`));
    console.log(chalk.gray('Use --verbose for detailed information'));
  }
}
```

## 7.6 skills 命令 (src/cli/commands/skills.ts)

### 技能管理

```typescript
import { SkillLoader } from '../../skills/loader.js';
import { SkillIndex } from '../../skills/index.js';
import { getConfig } from '../../core/config.js';
import chalk from 'chalk';
import Table from 'cli-table3';

export interface SkillsOptions {
  list?: boolean;
  search?: string;
  domain?: string;
}

export async function skillsCommand(options: SkillsOptions): Promise<void> {
  const config = getConfig();
  const loader = new SkillLoader(config.skillsDir);

  // 列出所有技能
  if (options.list || (!options.search && !options.domain)) {
    const skills = await loader.discoverSkills();

    const table = new Table({
      head: [
        chalk.blue('#'),
        chalk.blue('Name'),
        chalk.blue('Domain'),
        chalk.blue('Description'),
      ],
      colWidths: [5, 25, 15, 50],
    });

    skills.forEach((skill, i) => {
      table.push([
        (i + 1).toString(),
        skill.name,
        skill.domain || 'general',
        skill.description,
      ]);
    });

    console.log(chalk.blue.bold('Available Skills'));
    console.log('');
    console.log(table.toString());
    console.log('');
    console.log(chalk.gray(`Total: ${skills.length} skills`));
    return;
  }

  // 搜索技能
  if (options.search) {
    const index = await SkillIndex.load(`${config.synapseHome}/skills-index.json`);
    const results = index.search(options.search);

    console.log(chalk.blue.bold(`Search results for: ${options.search}`));
    console.log('');

    if (results.length === 0) {
      console.log(chalk.gray('No skills found'));
      return;
    }

    results.forEach((skill, i) => {
      console.log(chalk.green(`${i + 1}. ${skill.metadata.name}`));
      console.log(chalk.gray(`   Domain: ${skill.metadata.domain || 'general'}`));
      console.log(chalk.gray(`   ${skill.metadata.description}`));
      console.log('');
    });
  }

  // 按域过滤
  if (options.domain) {
    const index = await SkillIndex.load(`${config.synapseHome}/skills-index.json`);
    const results = index.searchByDomain(options.domain);

    console.log(chalk.blue.bold(`Skills in domain: ${options.domain}`));
    console.log('');

    if (results.length === 0) {
      console.log(chalk.gray('No skills found in this domain'));
      return;
    }

    results.forEach((skill, i) => {
      console.log(chalk.green(`${i + 1}. ${skill.metadata.name}`));
      console.log(chalk.gray(`   ${skill.metadata.description}`));
      console.log('');
    });
  }
}
```

## 7.7 输出格式化 (src/cli/formatters/output.ts)

### Markdown 渲染

```typescript
import { marked } from 'marked';
import { highlight } from 'cli-highlight';
import chalk from 'chalk';

export function formatMarkdown(markdown: string): string {
  const renderer = new marked.Renderer();

  // 代码块高亮
  renderer.code = (code, language) => {
    const highlighted = highlight(code, { language: language || 'text' });
    return '\n' + highlighted + '\n';
  };

  // 标题
  renderer.heading = (text, level) => {
    const colors = [
      chalk.blue.bold,
      chalk.green.bold,
      chalk.yellow.bold,
      chalk.cyan.bold,
    ];
    const color = colors[level - 1] || chalk.white;
    return color(text) + '\n';
  };

  // 列表
  renderer.listitem = (text) => {
    return `  • ${text}\n`;
  };

  marked.setOptions({ renderer });
  return marked(markdown);
}
```

### 错误格式化

```typescript
export function formatError(error: Error | string): string {
  if (typeof error === 'string') {
    return chalk.red('Error: ') + error;
  }

  const lines = [
    chalk.red.bold('Error:'),
    chalk.red(`  ${error.message}`),
  ];

  if (error.stack) {
    lines.push('');
    lines.push(chalk.gray('Stack trace:'));
    error.stack.split('\n').forEach(line => {
      lines.push(chalk.gray(`  ${line}`));
    });
  }

  return lines.join('\n');
}
```

## 7.8 与 Python 版本对齐

### 命令对照表

| Python CLI | TypeScript CLI | 对齐 |
|-----------|---------------|-----|
| `synapse <query>` | `synapse <query>` | ✅ |
| `synapse chat` | `synapse chat` | ✅ |
| `synapse config` | `synapse config` | ✅ |
| `synapse tools` | `synapse tools` | ✅ |
| `synapse skills` | `synapse skills` | ✅ |

### 选项对照表

| Python | TypeScript | 对齐 |
|--------|-----------|-----|
| `-v, --verbose` | `-v, --verbose` | ✅ |
| `--max-iterations` | `--max-iterations` | ✅ |
| `!<command>` | `!<command>` | ✅ |
| `/clear` | `/clear` | ✅ |
| `/exit` | `/exit` | ✅ |

### REPL 行为对齐

| 行为 | Python | TypeScript | 对齐 |
|-----|--------|-----------|-----|
| 提示符 | `synapse>` | `synapse>` | ✅ |
| Shell 命令 | `!` 前缀 | `!` 前缀 | ✅ |
| 清除历史 | `/clear` | `/clear` | ✅ |
| 退出 | `/exit` | `/exit` | ✅ |
| 历史保持 | ✅ | ✅ | ✅ |

### 输出格式对齐

| 输出类型 | Python | TypeScript | 对齐 |
|---------|--------|-----------|-----|
| Markdown 渲染 | ✅ rich | ✅ marked + cli-highlight | ✅ |
| 代码高亮 | ✅ Pygments | ✅ cli-highlight | ✅ |
| 表格展示 | ✅ rich.table | ✅ cli-table3 | ✅ |
| 颜色输出 | ✅ rich.console | ✅ chalk | ✅ |

## 7.9 错误处理

### 统一错误处理

```typescript
export class CLIError extends Error {
  constructor(
    message: string,
    public exitCode: number = 1
  ) {
    super(message);
    this.name = 'CLIError';
  }
}

export function handleError(error: unknown): never {
  if (error instanceof CLIError) {
    console.error(formatError(error.message));
    process.exit(error.exitCode);
  }

  if (error instanceof Error) {
    console.error(formatError(error));
    process.exit(1);
  }

  console.error(chalk.red('Unknown error:'), error);
  process.exit(1);
}
```

### 全局错误捕获

```typescript
// 在 cli.tsx 入口添加
process.on('uncaughtException', (error) => {
  console.error(chalk.red.bold('Uncaught Exception:'));
  console.error(formatError(error));
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error(chalk.red.bold('Unhandled Rejection:'));
  console.error(formatError(reason as Error));
  process.exit(1);
});
```

## 7.10 Help 输出

### 主命令 Help

```
Synapse Agent - Self-growing AI agent with unified Bash interface

Usage: synapse [options] [query...]
       synapse <command> [options]

Arguments:
  query                  Query to send to the agent

Options:
  -v, --verbose          Enable verbose output
  --max-iterations <n>   Maximum iterations (default: 10)
  -V, --version          Output the version number
  -h, --help             Display help for command

Commands:
  chat [options]         Start interactive REPL session
  config                 Show configuration
  tools [options]        List available tools
  skills [options]       Manage skills
  help [command]         Display help for command
```

### 子命令 Help

```
Usage: synapse skills [options]

Manage skills

Options:
  -l, --list             List all skills
  -s, --search <query>   Search skills
  -d, --domain <domain>  Filter by domain
  -h, --help             Display help for command
```
