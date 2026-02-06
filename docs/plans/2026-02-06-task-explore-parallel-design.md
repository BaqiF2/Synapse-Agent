# Task Explore 并行优化设计

## 问题背景

当前系统在使用 `task:explore` 工具时存在两个问题：

1. **渲染问题**：长命令导致终端输出混乱，进度动画无法正确原地更新
2. **任务分发问题**：所有提示词都塞到一个 explore 任务里，无法并行执行

## 设计目标

1. 截断长命令显示，避免多行渲染问题
2. 自动按目录拆分 explore 任务，实现并行执行
3. 每个并行任务在终端显示一行

## 解决方案

### 1. 命令截断渲染

**修改位置**: `src/cli/terminal-renderer.ts`

**核心逻辑**:

```typescript
// 新增常量
const MAX_COMMAND_DISPLAY_LENGTH = parseInt(
  process.env.SYNAPSE_MAX_COMMAND_DISPLAY_LENGTH || '80',
  10
);

// 新增截断函数
function truncateCommand(command: string, maxLength: number): string {
  if (command.length <= maxLength) {
    return command;
  }
  return command.slice(0, maxLength - 3) + '...';
}

// 修改 buildToolLine()
private buildToolLine(options: {
  depth: number;
  isLast: boolean;
  dotColor: (text: string) => string;
  command: string;
}): string {
  const prefix = this.getToolPrefix(options.depth, options.isLast, options.dotColor);
  const displayCommand = truncateCommand(options.command, MAX_COMMAND_DISPLAY_LENGTH);
  const toolName = chalk.yellow(`Bash(${displayCommand})`);
  return `${prefix}${toolName}`;
}
```

### 2. 目录自动拆分

**修改位置**: `src/tools/handlers/task-command-handler.ts`

**核心逻辑**:

```typescript
// 新增常量
const MAX_PARALLEL_TASKS = parseInt(
  process.env.SYNAPSE_MAX_PARALLEL_TASKS || '5',
  10
);

// 新增目录检测函数
async function detectSubDirectories(basePath: string): Promise<string[]> {
  const entries = await fs.readdir(basePath, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    .map(entry => path.join(basePath, entry.name))
    .slice(0, MAX_PARALLEL_TASKS);
}

// 新增任务拆分函数
async function splitExploreTask(
  params: TaskCommandParams
): Promise<TaskCommandParams[]> {
  // 从 prompt 中提取目标路径，默认为 src/
  const targetPath = extractTargetPath(params.prompt) || 'src';

  const subDirs = await detectSubDirectories(targetPath);

  // 如果子目录 <= 1，不拆分
  if (subDirs.length <= 1) {
    return [params];
  }

  // 为每个子目录生成独立任务
  return subDirs.map(dir => ({
    ...params,
    prompt: `${params.prompt}\n\n重点分析目录: ${dir}`,
    description: `${params.description || '探索'}: ${path.basename(dir)}`,
  }));
}
```

**路径提取逻辑**:

```typescript
function extractTargetPath(prompt: string): string | null {
  // 匹配常见模式: "分析 src/", "查看 ./lib", "探索 packages/"
  const patterns = [
    /(?:分析|查看|探索|检查|扫描)\s+([^\s,，。]+)/,
    /(?:in|under|at)\s+([^\s,]+)/i,
  ];

  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    if (match && match[1]) {
      const candidate = match[1].replace(/["""'']/g, '');
      // 验证路径存在
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }

  // 默认返回 src（如果存在）
  return existsSync('src') ? 'src' : null;
}
```

**执行方式**:

```typescript
// 在 execute() 方法中
async execute(command: string): Promise<CommandResult> {
  const parsed = parseTaskCommand(command);

  if (parsed.type === 'explore') {
    const tasks = await splitExploreTask(parsed.params);

    // 并行执行所有任务
    const results = await Promise.allSettled(
      tasks.map(task => this.manager.execute('explore', task))
    );

    // 分离成功和失败的结果
    const succeeded = results.filter(r => r.status === 'fulfilled');
    const failed = results.filter(r => r.status === 'rejected');

    const output = succeeded
      .map(r => (r as PromiseFulfilledResult<string>).value)
      .join('\n\n---\n\n');

    const errors = failed
      .map(r => (r as PromiseRejectedResult).reason?.message || 'Unknown error')
      .join('\n');

    return {
      stdout: output,
      stderr: errors,
      exitCode: failed.length > 0 ? 1 : 0,
    };
  }

  // 其他类型保持原有逻辑
  // ...
}
```

## 边界情况处理

| 场景 | 处理方式 |
|------|---------|
| 目标路径不存在 | 回退到单任务执行，不拆分 |
| 目录下无子目录 | 直接执行原始任务，不拆分 |
| 子目录数量超过限制 | 取前 N 个（按字母排序），N = `MAX_PARALLEL_TASKS` |
| 隐藏目录（`.git`, `.cache`） | 自动过滤，不纳入拆分 |
| 非 explore 类型任务 | 保持原有逻辑，不拆分 |
| 命令 < 80 字符 | 完整显示 |
| 命令 >= 80 字符 | 截断 + `...` |
| 部分任务失败 | 返回成功结果 + 错误信息，exitCode = 1 |

## 环境变量

| 变量 | 默认值 | 说明 |
|------|-------|------|
| `SYNAPSE_MAX_COMMAND_DISPLAY_LENGTH` | 80 | 命令显示最大长度 |
| `SYNAPSE_MAX_PARALLEL_TASKS` | 5 | 最大并行任务数 |

## 预期终端输出

```
• Bash(task:explore --prompt "分析 src/agent 目录...")
• Bash(task:explore --prompt "分析 src/cli 目录...")
• Bash(task:explore --prompt "分析 src/tools 目录...")
```

## 测试用例

| 测试场景 | 输入 | 预期输出 |
|---------|------|---------|
| 长命令截断 | 100 字符命令 | 显示 77 字符 + `...` |
| 短命令不截断 | 50 字符命令 | 完整显示 |
| 目录拆分 - 正常 | `src/` 下有 3 个子目录 | 3 个并行 task |
| 目录拆分 - 无子目录 | `src/` 下无子目录 | 单个 task，不拆分 |
| 目录拆分 - 路径不存在 | 指定 `nonexistent/` | 回退单任务 |
| 目录拆分 - 超过限制 | 10 个子目录，限制 5 | 只执行前 5 个 |
| 部分任务失败 | 3 个任务，1 个失败 | 返回 2 个成功结果 + 错误信息 |

## 实现文件清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/cli/terminal-renderer.ts` | 修改 | 添加 `truncateCommand()` 和常量 |
| `src/tools/handlers/task-command-handler.ts` | 修改 | 添加拆分逻辑 |
| `tests/unit/cli/terminal-renderer.test.ts` | 新增/修改 | 截断测试 |
| `tests/unit/tools/task-command-handler.test.ts` | 新增/修改 | 拆分逻辑测试 |
