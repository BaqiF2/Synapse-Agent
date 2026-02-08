# 上下文卸载策略设计

## 概述

当 Agent 会话的历史消息 Token 数量达到阈值时，自动将部分工具响应内容卸载到文件，释放上下文空间，使对话能够继续进行。

## 核心参数

| 参数 | 默认值 | 环境变量 | 说明 |
|------|--------|----------|------|
| 最大上下文窗口 | 200,000 tokens | `SYNAPSE_MAX_CONTEXT_WINDOW` | 模型最大上下文限制 |
| 自动卸载阈值 | 150,000 tokens | `SYNAPSE_OFFLOAD_THRESHOLD` | 触发卸载的 token 数 |
| 卸载扫描范围 | 0.5 (50%) | `SYNAPSE_OFFLOAD_SCAN_RATIO` | 扫描前 N% 的消息 |
| 最小卸载字符数 | 50 | `SYNAPSE_OFFLOAD_MIN_CHARS` | 内容超过此字符数才卸载 |

## 模块结构

```
src/
├── utils/
│   └── token-counter.ts        # Token 计数器（js-tiktoken 封装）
├── agent/
│   ├── context-manager.ts      # 上下文管理器（核心逻辑）
│   ├── offload-storage.ts      # 卸载文件存储
│   ├── session.ts              # 修改：新增 rewriteHistory()
│   └── agent-runner.ts         # 修改：集成卸载检查
├── cli/
│   └── repl.ts                 # 修改：新增 /context 命令
```

## 详细设计

### 1. Token 计数器

**文件**: `src/utils/token-counter.ts`

使用 `js-tiktoken` 库进行本地 Token 估算，精度约 90-95%。

```typescript
import { getEncoding } from 'js-tiktoken';

const encoding = getEncoding('cl100k_base');

export function countTokens(text: string): number {
  return encoding.encode(text).length;
}

export function countMessageTokens(messages: Message[]): number {
  return messages.reduce((total, msg) => {
    // 计算 content、toolCalls 等字段的 token 数
    return total + countTokens(serializeMessage(msg));
  }, 0);
}
```

### 2. 卸载文件存储

**文件**: `src/agent/offload-storage.ts`

**存储路径**:
```
~/.synapse/sessions/{sessionId}/
├── {sessionId}.jsonl       # 消息历史
└── offloaded/              # 卸载内容目录
    ├── {uuid}.txt
    ├── {uuid}.json
    └── ...
```

**接口**:
```typescript
export class OffloadStorage {
  constructor(private sessionDir: string) {}

  save(content: string, extension?: string): string {
    const id = crypto.randomUUID();
    const ext = extension || this.detectExtension(content);
    const filename = `${id}.${ext}`;
    const filepath = path.join(this.sessionDir, 'offloaded', filename);
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, content, 'utf-8');
    return filepath;
  }

  private detectExtension(content: string): string {
    try {
      JSON.parse(content);
      return 'json';
    } catch {
      return 'txt';
    }
  }
}
```

### 3. 上下文管理器

**文件**: `src/agent/context-manager.ts`

```typescript
export interface OffloadResult {
  messages: Message[];
  offloadedCount: number;
  previousTokens: number;
  currentTokens: number;
  freedTokens: number;
  stillExceedsThreshold: boolean;
}

export class ContextManager {
  constructor(
    private storage: OffloadStorage,
    private options: ContextManagerOptions
  ) {}

  offloadIfNeeded(messages: Message[]): OffloadResult {
    const totalTokens = countMessageTokens(messages);

    if (totalTokens < this.options.offloadThreshold) {
      return {
        messages,
        offloadedCount: 0,
        previousTokens: totalTokens,
        currentTokens: totalTokens,
        freedTokens: 0,
        stillExceedsThreshold: false
      };
    }

    return this.performOffload(messages, totalTokens);
  }

  private performOffload(messages: Message[], totalTokens: number): OffloadResult {
    const scanEndIndex = Math.floor(messages.length * this.options.scanRatio);
    let offloadedCount = 0;

    const newMessages = messages.map((msg, index) => {
      if (index >= scanEndIndex) return msg;
      if (msg.role !== 'tool') return msg;

      const content = extractTextContent(msg);
      if (content.length <= this.options.minChars) return msg;
      if (this.isAlreadyOffloaded(content)) return msg;

      const filepath = this.storage.save(content);
      offloadedCount++;

      return replaceToolContent(msg, `Tool result is at: ${filepath}`);
    });

    const newTokenCount = countMessageTokens(newMessages);

    return {
      messages: newMessages,
      offloadedCount,
      previousTokens: totalTokens,
      currentTokens: newTokenCount,
      freedTokens: totalTokens - newTokenCount,
      stillExceedsThreshold: newTokenCount >= this.options.offloadThreshold
    };
  }

  private isAlreadyOffloaded(content: string): boolean {
    return content.startsWith('Tool result is at:');
  }
}
```

### 4. AgentRunner 集成

**文件**: `src/agent/agent-runner.ts`

```typescript
async run(userMessage: string): Promise<void> {
  this.appendMessage(createTextMessage('user', userMessage));

  while (iteration < this.maxIterations) {
    // 每轮开始前检查是否需要卸载
    const offloadResult = this.contextManager.offloadIfNeeded(this.history);

    if (offloadResult.offloadedCount > 0) {
      this.history = offloadResult.messages;
      await this.session.rewriteHistory(this.history);
      this.emitOffloadNotification(offloadResult);
    }

    if (offloadResult.stillExceedsThreshold) {
      logger.warn('TODO: Context still exceeds threshold after offload, consider increasing scan ratio or reducing min chars');
    }

    // 继续正常的 step 执行
    const result = await this.step(...);
    // ...
  }
}

private emitOffloadNotification(result: OffloadResult): void {
  // 输出：已卸载 5 条工具结果，释放 12,345 tokens
  this.emit('offload', {
    count: result.offloadedCount,
    freedTokens: result.freedTokens
  });
}
```

### 5. Session 扩展

**文件**: `src/agent/session.ts`

```typescript
async rewriteHistory(messages: Message[]): Promise<void> {
  const filepath = this.getSessionFilePath();
  const content = messages.map(msg => JSON.stringify(msg)).join('\n');
  await fs.writeFile(filepath, content + '\n', 'utf-8');
  this.updateMessageCount(messages.length);
}
```

### 6. /context 命令

**文件**: `src/cli/repl.ts` - 在 `handleReplCommand` 函数中添加

```typescript
// 在 switch (cmd) 中添加新的 case
case '/context': {
  const stats = runner.getContextStats();
  renderContextStats(stats);
  return true;
}

// 新增辅助函数
function renderContextStats(stats: ContextStats): void {
  const percentage = (stats.currentTokens / stats.maxTokens * 100).toFixed(1);
  const thresholdPercentage = (stats.offloadThreshold / stats.maxTokens * 100).toFixed(1);
  const filled = Math.round(parseFloat(percentage) / 5);
  const empty = 20 - filled;
  const progressBar = `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${percentage}%`;

  console.log(`
📊 上下文状态
─────────────────────────────
当前 Token:     ${stats.currentTokens.toLocaleString()} / ${stats.maxTokens.toLocaleString()} (${percentage}%)
卸载阈值:       ${stats.offloadThreshold.toLocaleString()} (${thresholdPercentage}%)
消息数量:       ${stats.messageCount} 条
工具调用:       ${stats.toolCallCount} 次
已卸载文件:     ${stats.offloadedFileCount} 个

${progressBar}
  `);
}
```

同时在 `showHelp` 函数中添加帮助信息：

```typescript
console.log(chalk.gray('  /context         ') + chalk.white('Show context usage stats'));
```
```

## 错误处理

| 场景 | 处理方式 |
|------|----------|
| 卸载文件写入失败 | 跳过该条目，记录警告日志，继续处理其他 |
| JSONL 重写失败 | 抛出异常，中断 Agent Loop，保留原历史 |
| Token 计算异常 | 降级为字符估算（1 token ≈ 4 字符） |
| offloaded 目录创建失败 | 首次写入时尝试创建，失败则抛出异常 |

## 边界情况

| 场景 | 处理方式 |
|------|----------|
| 前 50% 内无可卸载内容 | 返回 offloadedCount=0，不修改历史 |
| 卸载后仍超阈值 | 打印 TODO 日志，不再重复卸载 |
| 空消息历史 | 直接返回，不执行卸载 |
| 工具结果已是路径引用 | 检测 `Tool result is at:` 前缀，跳过已卸载的 |

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
    ┌───────▼───────┐
    │ tokens > 150K? │
    └───────┬───────┘
            │ Yes
    ┌───────▼───────────┐
    │ 扫描前 50% 消息     │
    │ 筛选 tool 消息      │
    │ 内容 > 50 字符      │
    └───────┬───────────┘
            │
    ┌───────▼───────────┐
    │ offloadStorage    │
    │   .save(content)  │
    │ 替换为路径引用      │
    └───────┬───────────┘
            │
    ┌───────▼───────────┐
    │ 重新计算 token     │
    │ 仍超限则打印 TODO  │
    └───────┬───────────┘
            │
    ┌───────▼───────────┐
    │ session           │
    │   .rewriteHistory │
    └───────┬───────────┘
            │
    ┌───────▼───────────┐
    │ 用户提示           │
    │ 已卸载 N 条，释放 M │
    └───────────────────┘
```

## 清理机制

- 会话删除时（`Session.delete()`），连同 `offloaded/` 目录一起删除
- 无需额外的定时清理逻辑

## 回顾机制

- LLM 自行决定是否需要读取卸载的文件
- 可以通过 `read` 命令读取卸载文件的内容
- 系统不自动注入卸载内容到上下文

## BDD 可测试性验证

### Input/Output 格式 ✅

| 组件 | 输入 | 输出 |
|------|------|------|
| TokenCounter | `string` 或 `Message[]` | `number` |
| OffloadStorage.save | `string` content | `string` filepath |
| ContextManager.offloadIfNeeded | `Message[]` | `OffloadResult` |
| /context 命令 | 无参数 | 格式化文本 |

### 可独立测试的行为 ✅

- Token 计数准确性（对比 API 返回值）
- 卸载触发条件（150K 阈值）
- 文件写入正确性（内容匹配）
- 消息替换正确性（路径格式）
- 重复卸载跳过（前缀检测）
- /context 命令输出格式
