# 上下文压缩策略设计

## 概述

当卸载策略效率不足时（释放 token < 15K），自动触发压缩策略。压缩将历史消息交给 LLM 生成结构化总结，替换前面部分历史，保留最近 5 条消息，释放更多上下文空间。

## 与卸载策略的关系

```
卸载（Offload）：将工具结果内容写入文件，用路径引用替换
    ↓ 效率不足（freedTokens < 15K）
压缩（Compact）：调用 LLM 总结历史，替换为精简摘要
```

压缩是卸载的"后备策略"，仅在卸载无法有效释放空间时启动。

## 核心参数

| 参数 | 默认值 | 环境变量 | 说明 |
|------|--------|----------|------|
| 压缩触发阈值 | 15,000 tokens | `SYNAPSE_COMPACT_TRIGGER_THRESHOLD` | 卸载释放量低于此值时触发压缩 |
| 压缩目标长度 | 8,000 tokens | `SYNAPSE_COMPACT_TARGET_TOKENS` | 总结的目标 token 数 |
| 保留消息数 | 5 | `SYNAPSE_COMPACT_PRESERVE_COUNT` | 保留最近 N 条消息 |
| 压缩模型 | - | `SYNAPSE_COMPACT_MODEL` | 用于压缩的模型 ID（可选，默认使用当前模型） |
| 重试次数 | 3 | `SYNAPSE_COMPACT_RETRY_COUNT` | LLM 调用失败重试次数 |

## 模块结构

```
src/agent/
├── context-manager.ts       # 现有：卸载逻辑
├── context-compactor.ts     # 新增：压缩逻辑
├── offload-storage.ts       # 现有：卸载文件存储
└── agent-runner.ts          # 修改：集成压缩检查

src/agent/prompts/
└── compact-summary.md       # 新增：压缩总结系统提示

src/config/
└── settings.ts              # 修改：新增压缩相关配置

src/cli/
└── repl.ts                  # 修改：新增 /compact 命令
```

## 详细设计

### 1. 核心类型定义

```typescript
export interface CompactResult {
  messages: Message[];           // 压缩后的消息历史
  previousTokens: number;        // 压缩前 token 数
  currentTokens: number;         // 压缩后 token 数
  freedTokens: number;           // 释放的 token 数
  preservedCount: number;        // 保留的原始消息数
  deletedFiles: string[];        // 已删除的卸载文件列表
  success: boolean;              // 是否成功
}

export interface CompactOptions {
  targetTokens?: number;         // 目标总结长度
  preserveCount?: number;        // 保留消息数
  model?: string;                // 压缩使用的模型
  retryCount?: number;           // 重试次数
}
```

### 2. ContextCompactor 类

**文件**: `src/agent/context-compactor.ts`

```typescript
export class ContextCompactor {
  constructor(
    private storage: OffloadStorage,
    private client: AnthropicClient,
    private options: CompactOptions
  ) {}

  async compact(messages: Message[]): Promise<CompactResult> {
    // 1. 分割消息：待压缩部分 + 保留部分
    const { toCompress, toPreserve } = this.splitMessages(messages);

    // 2. 还原卸载内容
    const restored = await this.restoreOffloadedContent(toCompress);

    // 3. 调用 LLM 生成总结（带重试）
    const summary = await this.generateSummary(restored);

    // 4. 构建新历史：[压缩摘要消息] + [保留的原始消息]
    const compressedHistory = this.buildCompressedHistory(summary, toPreserve);

    // 5. 清理卸载文件
    const deletedFiles = await this.cleanupOffloadedFiles();

    return { messages: compressedHistory, ... };
  }

  private splitMessages(messages: Message[]): { toCompress: Message[]; toPreserve: Message[] } {
    const preserveCount = this.options.preserveCount ?? 5;
    const splitIndex = Math.max(0, messages.length - preserveCount);

    return {
      toCompress: messages.slice(0, splitIndex),
      toPreserve: messages.slice(splitIndex),
    };
  }

  private async restoreOffloadedContent(messages: Message[]): Promise<Message[]> {
    // 扫描消息，找到 "Tool result is at: {path}" 格式的内容
    // 读取文件内容，替换回原始消息
  }

  private async generateSummary(messages: Message[]): Promise<string> {
    const systemPrompt = this.loadSummaryPrompt(this.options.targetTokens);

    for (let attempt = 1; attempt <= this.retryCount; attempt++) {
      try {
        const response = await this.client.generate({
          systemPrompt,
          messages,
          maxTokens: this.options.targetTokens * 1.2,  // 留 20% 余量
        });
        return extractText(response);
      } catch (error) {
        logger.warn(`Compact summary attempt ${attempt} failed`, { error });
        if (attempt === this.retryCount) throw error;
        await this.delay(1000 * attempt);  // 指数退避
      }
    }
  }

  private buildCompressedHistory(summary: string, preserved: Message[]): Message[] {
    const compressedMessage: Message = {
      role: 'user',
      content: `[Compressed History]\n\n${summary}`,
    };

    return [compressedMessage, ...preserved];
  }

  private async cleanupOffloadedFiles(): Promise<string[]> {
    // 删除所有卸载文件，返回已删除的文件列表
  }
}
```

### 3. 压缩总结系统提示

**文件**: `src/agent/prompts/compact-summary.md`

```markdown
Please provide a comprehensive summary of our conversation structured as follows:

## Technical Context
Development environment, tools, frameworks, and configurations in use.

## Project Overview
Main project goals, features, and scope. Key components and their relationships.

## Code Changes
Files created, modified, or analyzed. Specific implementations added.

## Debugging & Issues
Problems encountered, root causes, and solutions implemented.

## Current Status
What was just completed. Current state of the codebase.

## Pending Tasks
Immediate next steps and priorities. Known issues needing attention.

## User Preferences
Coding style, formatting, and workflow preferences observed.

## Key Decisions
Important technical decisions made and their rationale.

Focus on information essential for continuing effectively. Target length: approximately {targetTokens} tokens.
```

### 4. AgentRunner 集成

**文件**: `src/agent/agent-runner.ts`

```typescript
async run(userMessage: string, options?: AgentRunOptions): Promise<string> {
  // ...
  while (iteration < this.maxIterations) {
    // 1. 先尝试卸载
    const offloadResult = this.contextManager.offloadIfNeeded(this.history);

    if (offloadResult.offloadedCount > 0) {
      this.history = offloadResult.messages;
      await this.session.rewriteHistory(this.history);
      this.emitOffloadNotification(offloadResult);
    }

    // 2. 卸载效率不足时触发压缩
    if (offloadResult.stillExceedsThreshold &&
        offloadResult.freedTokens < COMPACT_TRIGGER_THRESHOLD) {
      const compactResult = await this.contextCompactor.compact(this.history);
      if (compactResult.success) {
        this.history = compactResult.messages;
        await this.session.rewriteHistory(this.history);
        this.emitCompactNotification(compactResult);
      }
    }

    // 3. 继续正常 step 执行
    const result = await this.step(...);
  }
}

async forceCompact(): Promise<CompactResult> {
  // /compact 命令调用，无条件执行压缩
  return this.contextCompactor.compact(this.history);
}
```

### 5. /compact 命令

**文件**: `src/cli/repl.ts`

```typescript
case '/compact': {
  const compactResult = await runner.forceCompact();
  if (compactResult.success) {
    console.log(`✅ 压缩完成：${compactResult.previousTokens.toLocaleString()} → ${compactResult.currentTokens.toLocaleString()} tokens`);
    console.log(`   释放 ${compactResult.freedTokens.toLocaleString()} tokens，删除 ${compactResult.deletedFiles.length} 个卸载文件`);
  } else {
    console.log('❌ 压缩失败，保持原历史不变');
  }
  return true;
}
```

同时在 `showHelp` 函数中添加帮助信息：

```typescript
console.log(chalk.gray('  /compact         ') + chalk.white('Compress conversation history'));
```

## 错误处理

| 场景 | 处理方式 |
|------|----------|
| LLM 调用失败（重试耗尽） | 返回 `success: false`，保持原历史不变，记录 error 日志 |
| 卸载文件读取失败 | 跳过该文件，用占位符 `[Content unavailable: {path}]` 替代 |
| 卸载文件删除失败 | 记录 warn 日志，不影响压缩结果 |
| Session 重写失败 | 抛出异常，中断操作，保留原历史 |
| 压缩模型未配置 | 使用当前对话模型作为 fallback |

## 边界情况

| 场景 | 处理方式 |
|------|----------|
| 历史消息 ≤ 5 条 | 跳过压缩，返回 `success: true` 但 `freedTokens: 0` |
| 无卸载文件需要还原 | 正常执行压缩，仅跳过还原步骤 |
| 保留消息中包含已卸载内容 | 保留消息不还原，保持路径引用格式 |
| /compact 时历史为空 | 返回成功，提示"无需压缩" |
| 生成的总结超过目标长度 | 接受结果，不做二次截断 |

## 流程图

```
AgentRunner.run()
    │
    ▼ 每轮循环开始
┌─────────────────────────┐
│ contextManager          │
│   .offloadIfNeeded()    │
└───────────┬─────────────┘
            │
    ┌───────▼───────────────────┐
    │ stillExceedsThreshold &&  │
    │ freedTokens < 15K?        │
    └───────┬───────────────────┘
            │ Yes
    ┌───────▼───────────────┐
    │ contextCompactor      │
    │   .compact()          │
    └───────┬───────────────┘
            │
    ┌───────▼───────────────┐
    │ 1. 分割消息            │
    │    (前N条 / 后5条)     │
    └───────┬───────────────┘
            │
    ┌───────▼───────────────┐
    │ 2. 还原卸载内容        │
    │    读取 offloaded/*.txt│
    └───────┬───────────────┘
            │
    ┌───────▼───────────────┐
    │ 3. LLM 生成总结        │
    │    (带重试机制)        │
    └───────┬───────────────┘
            │
    ┌───────▼───────────────┐
    │ 4. 构建新历史          │
    │    [摘要] + [后5条]    │
    └───────┬───────────────┘
            │
    ┌───────▼───────────────┐
    │ 5. 清理卸载文件        │
    │    删除 offloaded/*    │
    └───────┬───────────────┘
            │
    ┌───────▼───────────────┐
    │ 6. 重写 Session        │
    │ 7. 用户提示            │
    └───────────────────────┘
```

## 清理机制

- 压缩成功后，立即删除所有卸载文件（`offloaded/` 目录下的文件）
- 会话删除时（`Session.delete()`），连同整个 `offloaded/` 目录一起删除

## 压缩后的历史结构示例

```
Message[0]: { role: 'user', content: '[Compressed History]\n\n## Technical Context\n...' }
Message[1]: { role: 'assistant', content: '让我读取这个文件', toolCalls: [...] }
Message[2]: { role: 'tool', content: 'file content here...' }
Message[3]: { role: 'assistant', content: '文件内容如下...' }
Message[4]: { role: 'user', content: '请修改第 10 行' }
Message[5]: { role: 'assistant', content: '好的，我来修改' }
```

## BDD 可测试性验证

### Input/Output 格式 ✅

| 组件 | 输入 | 输出 |
|------|------|------|
| ContextCompactor.compact | `Message[]` | `CompactResult` |
| splitMessages | `Message[]` | `{ toCompress, toPreserve }` |
| restoreOffloadedContent | `Message[]` | `Message[]` |
| generateSummary | `Message[]` | `string` |
| buildCompressedHistory | `string, Message[]` | `Message[]` |
| /compact 命令 | 无参数 | 格式化输出 |

### 可独立测试的行为 ✅

- 消息分割正确性（保留最后 5 条）
- 卸载内容还原（路径检测与文件读取）
- LLM 调用与重试机制
- 历史重建格式（`[Compressed History]` 前缀）
- 卸载文件清理
- /compact 命令输出格式
- 自动触发条件（卸载效率 < 15K）
