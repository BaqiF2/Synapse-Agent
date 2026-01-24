# 第五部分：工具系统设计

## ⚠️ 强制验证法则

**在本部分的实施过程中，必须严格遵循以下验证流程：**

### 1. 迁移前检查（Pre-Migration Check）
- [ ] **BashRouter 解析逻辑**：详细阅读 Python `bash_router.py` 的命令解析实现
- [ ] **工具接口定义**：理解 Python `BaseTool` 的 `execute(**kwargs)` 接口设计
- [ ] **参数传递机制**：分析 Python 如何将命令字符串转换为 kwargs
- [ ] **所有工具实现**：逐个阅读 Read/Write/Edit/Grep/Glob 工具的 Python 实现

### 2. 迁移后检查（Post-Migration Check）
- [ ] **命令解析验证**：测试各种命令格式（--key=value, --key value, 位置参数）的解析
- [ ] **工具执行测试**：逐个验证每个工具的功能与 Python 版本完全一致
- [ ] **参数类型转换**：验证字符串→数字、布尔值的类型转换正确
- [ ] **Help 系统测试**：验证 -h 和 --help 输出格式与 Python 版本一致

### 3. PRD 符合性检查（PRD Compliance Check）
- [ ] **三层 Bash 架构**：验证 Base/Agent/Field 三层命令路由正确实现
- [ ] **统一接口验证**：确认所有工具通过统一的 Bash 接口调用
- [ ] **工具转换能力**：验证架构支持 MCP/FunctionCalling 转换为 Field Bash
- [ ] **扩展性验证**：确认新工具可以轻松注册到 ToolRegistry

**❌ 未完成上述检查清单的任何一项，不得进入下一阶段**

---

## 5.1 核心架构：三层 Bash 体系

```
┌─────────────────────────────────────────┐
│          LLM (MiniMax via Anthropic)    │
└────────────────┬────────────────────────┘
                 │
                 ▼ 调用唯一工具
         ┌───────────────┐
         │  Bash Tool    │  ← 工具定义在 LLM 客户端
         │ input: {      │
         │   command: "" │
         │ }             │
         └───────┬───────┘
                 │
                 ▼ 命令字符串
         ┌───────────────┐
         │ BashRouter    │  ← 解析和路由
         │ parse()       │
         │ execute()     │
         └───────┬───────┘
                 │
    ┌────────────┼────────────┐
    ▼            ▼            ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│  Base   │ │  Agent  │ │  Field  │
│  Bash   │ │  Bash   │ │  Bash   │
└─────────┘ └─────────┘ └─────────┘
   原生命令    核心工具    领域工具
```

## 5.2 基础类型 (src/tools/base.ts)

### ToolResult 类

```typescript
export class ToolResult {
  constructor(
    public success: boolean,
    public output: any = null,
    public error: string | null = null
  ) {}

  static success(output: any): ToolResult {
    return new ToolResult(true, output, null);
  }

  static failure(error: string): ToolResult {
    return new ToolResult(false, null, error);
  }

  toDict(): Record<string, any> {
    return {
      success: this.success,
      output: this.output,
      error: this.error,
    };
  }
}
```

### BaseTool 抽象类

```typescript
export abstract class BaseTool {
  abstract name: string;
  abstract description: string;

  // 接收命名参数，不是命令行数组！
  abstract execute(kwargs: Record<string, any>): Promise<ToolResult>;

  abstract getSchema(): ToolSchema;

  // 统一 help 生成
  help(verbose: boolean = false): string {
    if (verbose) {
      // 基于 schema 生成详细 help
      const schema = this.getSchema();
      const params = schema.input_schema;
      // ... 格式化输出
    } else {
      return `${this.name}: ${this.description}`;
    }
  }

  // 参数验证
  validateArgs(kwargs: Record<string, any>): string[] {
    const errors: string[] = [];
    const required = this.getSchema().input_schema.required || [];
    for (const param of required) {
      if (!(param in kwargs)) {
        errors.push(`Missing required parameter: ${param}`);
      }
    }
    return errors;
  }
}
```

### 关键点

✅ **工具接收 kwargs**，不是 `args: string[]`
✅ **返回 ToolResult**，不是 `string`
✅ **统一 help 生成**，不是每个工具自己实现

## 5.3 BashRouter (src/tools/bash-router.ts)

### ParsedCommand 接口

```typescript
export interface ParsedCommand {
  name: string;                    // 命令名
  args: string[];                  // 位置参数
  kwargs: Record<string, any>;     // 命名参数
  raw: string;                     // 原始命令
  isNativeBash: boolean;           // 是否原生命令
  isHelpRequest: boolean;          // 是否 help 请求
  helpVerbose: boolean;            // -h or --help
}
```

### 解析逻辑

```typescript
parse(command: string): ParsedCommand {
  // 1. 使用 shell-quote 解析（类似 Python shlex）
  const tokens = shlexParse(command);

  const name = tokens[0];
  const args: string[] = [];
  const kwargs: Record<string, any> = {};

  // 2. 遍历 tokens 解析参数
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];

    // 检查 help 标志
    if (token === '-h' || token === '--help') {
      isHelpRequest = true;
      helpVerbose = (token === '--help');
      continue;
    }

    // 检查 --key=value
    if (token.startsWith('--') && token.includes('=')) {
      const [key, value] = token.slice(2).split('=', 2);
      kwargs[key.replace(/-/g, '_')] = this.parseValue(value);
      continue;
    }

    // 检查 --key value
    if (token.startsWith('--')) {
      const key = token.slice(2).replace(/-/g, '_');
      if (i + 1 < tokens.length && !tokens[i + 1].startsWith('-')) {
        kwargs[key] = this.parseValue(tokens[i + 1]);
        i++;
      } else {
        kwargs[key] = true; // boolean flag
      }
      continue;
    }

    // 位置参数
    args.push(token);
  }

  // 3. 判断命令类型
  const isNative = !AGENT_COMMANDS.includes(name) &&
                   !name.startsWith('field:');

  return { name, args, kwargs, raw, isNative, isHelpRequest, helpVerbose };
}
```

### 值类型转换

```typescript
private parseValue(value: string): any {
  // 整数
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);

  // 浮点数
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);

  // 布尔值
  const lower = value.toLowerCase();
  if (['true', 'yes', '1'].includes(lower)) return true;
  if (['false', 'no', '0'].includes(lower)) return false;

  // 字符串
  return value;
}
```

### 路由执行

```typescript
async execute(command: string): Promise<ToolResult> {
  const parsed = this.parse(command);

  // 1. 处理 help
  if (parsed.isHelpRequest) {
    return this.handleHelp(parsed);
  }

  // 2. 路由到不同处理器
  if (parsed.isNativeBash) {
    return this.routeToBash(parsed);
  } else if (parsed.name.startsWith('field:')) {
    return this.routeToField(parsed);
  } else {
    return this.routeToTool(parsed);
  }
}
```

### 工具路由逻辑

```typescript
private async routeToTool(parsed: ParsedCommand): Promise<ToolResult> {
  const tool = this.registry.get(parsed.name);
  if (!tool) {
    return ToolResult.failure(`Unknown tool: ${parsed.name}`);
  }

  // 构建 kwargs
  const toolKwargs: Record<string, any> = { ...parsed.kwargs };

  // 映射位置参数到 required 参数
  if (parsed.args.length > 0) {
    const schema = tool.getSchema();
    const required = schema.input_schema.required || [];

    for (let i = 0; i < parsed.args.length; i++) {
      if (i < required.length) {
        const paramName = required[i];
        if (!(paramName in toolKwargs)) {
          toolKwargs[paramName] = parsed.args[i];
        }
      }
    }
  }

  // 执行工具
  return this.registry.execute(parsed.name, toolKwargs);
}
```

## 5.4 Agent Bash 工具实现

### Read 工具 (src/tools/agent/read.ts)

```typescript
export class ReadTool extends BaseTool {
  name = 'read';
  description = 'Read contents of a file. Use to examine file contents before editing.';

  async execute(kwargs: Record<string, any>): Promise<ToolResult> {
    const {
      file_path,           // 注意：保持 snake_case
      offset,
      limit,
      show_line_numbers = false,
    } = kwargs;

    // 展开路径
    let filePath = file_path;
    if (filePath.startsWith('~')) {
      filePath = filePath.replace('~', os.homedir());
    }
    filePath = path.resolve(filePath);

    // 检查文件是否存在
    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      return ToolResult.failure(`File does not exist: ${file_path}`);
    }

    // 读取内容
    let content = await file.text();
    const lines = content.split('\n');

    // 应用 offset 和 limit
    let startIdx = 0;
    if (offset !== null && offset !== undefined) {
      startIdx = Math.max(0, offset - 1); // 1-indexed → 0-indexed
    }

    let endIdx = lines.length;
    if (limit !== null && limit !== undefined) {
      endIdx = Math.min(startIdx + limit, lines.length);
    }

    const selectedLines = lines.slice(startIdx, endIdx);

    // 格式化输出
    if (show_line_numbers) {
      const maxLineNum = startIdx + selectedLines.length;
      const width = String(maxLineNum).length;
      const formatted = selectedLines.map((line, i) => {
        const lineNum = String(startIdx + i + 1).padStart(width, ' ');
        return `${lineNum}| ${line}`;
      });
      return ToolResult.success(formatted.join('\n'));
    } else {
      return ToolResult.success(selectedLines.join('\n'));
    }
  }

  getSchema(): ToolSchema {
    return {
      name: this.name,
      description: this.description,
      input_schema: {
        type: 'object',
        properties: {
          file_path: {                    // 保持 snake_case
            type: 'string',
            description: 'Absolute path to the file to read.',
          },
          offset: {
            type: 'integer',
            description: 'Line number to start reading from (1-indexed).',
          },
          limit: {
            type: 'integer',
            description: 'Maximum number of lines to read.',
          },
          show_line_numbers: {             // 保持 snake_case
            type: 'boolean',
            description: 'Include line numbers in output.',
            default: false,
          },
        },
        required: ['file_path'],
      },
    };
  }
}
```

### 关键点

✅ **参数名保持 snake_case**: `file_path`, `show_line_numbers`
✅ **接收 kwargs**: `execute(kwargs: Record<string, any>)`
✅ **返回 ToolResult**: `ToolResult.success()` or `ToolResult.failure()`
✅ **offset 是 1-indexed**: 与 Python 版本一致

### 其他工具类似结构

- **WriteTool**: `file_path`, `content`
- **EditTool**: `file_path`, `old_string`, `new_string`, `replace_all`
- **GrepTool**: `pattern`, `path`, `glob`, `ignore_case`
- **GlobTool**: `pattern`, `path`

## 5.5 BashSession (src/tools/bash-session.ts)

### 持久会话

```typescript
export class BashSession {
  private cwd: string;
  private env: Record<string, string>;
  private outputMaxLength = 50000; // 50KB 限制

  constructor(cwd?: string, env?: Record<string, string>) {
    this.cwd = cwd || process.cwd();
    this.env = { ...process.env, ...env } as Record<string, string>;
  }

  async execute(command: string, timeout: number = 120000): Promise<BashOutput> {
    return new Promise((resolve) => {
      const proc = spawn('bash', ['-c', command], {
        cwd: this.cwd,
        env: this.env,
      });

      let stdout = '';
      let timedOut = false;
      let truncated = false;

      // 超时处理
      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill();
      }, timeout);

      // 捕获输出
      proc.stdout?.on('data', (data) => {
        const chunk = data.toString();
        if (stdout.length + chunk.length > this.outputMaxLength) {
          truncated = true;
          stdout += chunk.slice(0, this.outputMaxLength - stdout.length);
        } else {
          stdout += chunk;
        }
      });

      // 处理退出
      proc.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          stdout: stdout.trim(),
          exitCode: code || 0,
          timedOut,
          truncated,
        });
      });
    });
  }
}
```

### BashOutput 接口

```typescript
export interface BashOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  truncated: boolean;
}
```

## 5.6 ToolRegistry (src/tools/registry.ts)

### 工具注册和管理

```typescript
export class ToolRegistry {
  private tools: Map<string, BaseTool> = new Map();

  constructor() {
    this.registerDefaultTools();
  }

  private registerDefaultTools(): void {
    const tools = [
      new ReadTool(),
      new WriteTool(),
      new EditTool(),
      new GrepTool(),
      new GlobTool(),
    ];
    tools.forEach(tool => this.tools.set(tool.name, tool));
  }

  register(tool: BaseTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  async execute(name: string, kwargs: Record<string, any>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return ToolResult.failure(`Unknown tool: ${name}`);
    }

    // 验证参数
    const errors = tool.validateArgs(kwargs);
    if (errors.length > 0) {
      return ToolResult.failure(`Validation errors:\n${errors.join('\n')}`);
    }

    // 执行工具
    try {
      return await tool.execute(kwargs);
    } catch (error) {
      return ToolResult.failure(`Tool execution failed: ${error}`);
    }
  }
}
```

## 5.7 与 Python 版本完全对齐

### 架构对齐

| 组件 | Python | TypeScript | 对齐 |
|-----|--------|-----------|-----|
| 唯一工具 | ✅ Bash Tool | ✅ Bash Tool | ✅ |
| 命令解析 | ✅ shlex.split | ✅ shell-quote | ✅ |
| 参数传递 | ✅ kwargs | ✅ kwargs | ✅ |
| 返回类型 | ✅ ToolResult | ✅ ToolResult | ✅ |
| Help 生成 | ✅ BaseTool.help() | ✅ BaseTool.help() | ✅ |

### 字段对齐

| Python | TypeScript | 对齐 |
|--------|-----------|-----|
| `file_path` | `file_path` | ✅ |
| `old_string` | `old_string` | ✅ |
| `new_string` | `new_string` | ✅ |
| `replace_all` | `replace_all` | ✅ |
| `show_line_numbers` | `show_line_numbers` | ✅ |
| `ignore_case` | `ignore_case` | ✅ |

### 行为对齐

| 行为 | Python | TypeScript | 对齐 |
|-----|--------|-----------|-----|
| offset 1-indexed | ✅ | ✅ | ✅ |
| 路径展开 (~) | ✅ | ✅ | ✅ |
| 错误消息格式 | ✅ | ✅ | ✅ |
| Help 输出格式 | ✅ | ✅ | ✅ |
