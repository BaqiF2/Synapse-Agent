# Agent 核心模块审查报告

## 审查范围

- `src/agent/agent-runner.ts` — Agent 主循环
- `src/agent/step.ts` — 单步执行函数
- `src/agent/session.ts` — 会话管理
- `src/agent/context-manager.ts` — 上下文卸载管理
- `src/agent/context-compactor.ts` — 上下文压缩
- `src/agent/offload-storage.ts` — 卸载文件存储
- `src/agent/session-usage.ts` — 用量统计
- `src/agent/system-prompt.ts` — 系统提示词构建
- `src/agent/auto-enhance-trigger.ts` — 自动增强触发
- `src/sub-agents/sub-agent-manager.ts` — 子智能体管理
- `src/sub-agents/sub-agent-types.ts` — 子智能体类型定义
- `src/sub-agents/configs/` — 子智能体配置

严重程度定义：

| 等级 | 含义 |
|------|------|
| **P0-Critical** | 可能导致数据丢失、运行时崩溃或安全漏洞 |
| **P1-Major** | 影响可维护性、可读性或架构健康度 |
| **P2-Minor** | 代码风格、命名、文档等细节改进 |

---

## 1. agent-runner.ts

### 1.1 AgentRunner 职责过重 [P1-Major]

**问题**: AgentRunner（~900 行）承担了过多职责：
- Agent 主循环 (`run`)
- 会话初始化与持久化 (`initSession`, `appendMessage`)
- 上下文卸载 (`offloadHistoryIfNeeded`)
- 上下文压缩 (`compactHistoryIfNeeded`, `forceCompact`)
- 历史消息清理 (`sanitizeToolProtocolHistory`)
- Stop Hooks 执行 (`executeStopHooks`, `emitStopHookProgress`)
- Todo 检查（第 749-768 行）
- Bash 工具误用提示（第 71-78 行常量）
- Skill 搜索指令注入（第 96-98 行）
- 事件发射（`emitOffloadNotification`, `emitCompactNotification`）

**建议**: 拆分为以下独立模块：
1. `AgentLoop` — 仅保留 `run()` 核心循环和 `step()` 编排
2. `HistorySanitizer` — 独立处理 `sanitizeToolProtocolHistory`
3. 将上下文管理（offload + compact）委托给 `ContextManager` 的更高层封装
4. `StopHookExecutor` — 独立 Stop Hooks 执行

### 1.2 模块级辅助函数过多 [P1-Major]

**位置**: 第 40-205 行

**问题**: 文件前 ~200 行充斥着顶层辅助函数（`ensureStopHooksLoaded`, `parseEnvScanRatio`, `parseEnvOptionalString`, `prependSkillSearchInstruction`, `isObjectJsonString`, `hasMalformedToolArguments`, `sanitizeToolProtocolHistory`），这些函数：
- 分别服务于不同关注点（env 解析、消息清理、prompt 注入）
- 与 `AgentRunner` 类本身只是松散耦合

**建议**:
- `sanitizeToolProtocolHistory` + `hasMalformedToolArguments` + `isObjectJsonString` → 提取到 `history-sanitizer.ts`
- `parseEnvScanRatio`, `parseEnvOptionalString` → 合并到 `utils/env.ts`
- `prependSkillSearchInstruction` → 移入 `system-prompt.ts` 或 `skill-search-instruction.ts`

### 1.3 BASH_TOOL_MISUSE_REMINDER 未被使用 [P2-Minor]

**位置**: 第 70-78 行

**问题**: 定义了 `BASH_TOOL_NAME` 和 `BASH_TOOL_MISUSE_REMINDER` 常量，但在 `agent-runner.ts` 内没有引用（`step.ts` 中也定义了独立的 `BASH_TOOL_NAME`）。如果在其他文件中使用，应该提取到共享常量文件。

**建议**: 检查是否有其他模块使用，若无则删除；若有则移至 `tools/constants.ts`。

### 1.4 run() 方法过长且混合多层关注 [P1-Major]

**位置**: 第 687-847 行，约 160 行

**问题**: `run()` 方法在单一函数中混合了：
- 会话初始化
- hooks 初始化
- 历史清理
- 用户消息增强与追加
- 主循环（iteration + failure tracking）
- Todo 检查逻辑（内嵌）
- Stop Hooks 后处理

**建议**: 将 `run()` 拆解为更小的方法：
```
run() → prepareRun() → executeLoop() → postProcess()
```
其中 Todo 检查（第 749-768 行）可提取为 `checkIncompleteTodos()`。

### 1.5 appendMessage 闭包捕获 [P2-Minor]

**位置**: 第 706-711 行

```typescript
const appendMessage = async (message: Message): Promise<void> => {
  this.history.push(message);
  if (this.session) {
    await this.session.appendMessage(message);
  }
};
```

**问题**: 在 `run()` 中定义闭包函数，而非使用类方法。这增加了认知负担，每次 `run()` 调用都重新创建函数对象。

**建议**: 提取为 `private appendToHistory(message: Message)` 实例方法。

### 1.6 stopHooksLoadPromise 全局可变状态 [P1-Major]

**位置**: 第 38-45 行

```typescript
let stopHooksLoadPromise: Promise<void> | null = null;
```

**问题**: 模块级可变单例，无法在测试中清理。如果 `loadStopHooks()` 失败，Promise 被缓存后永远不会重试。

**建议**:
1. 将 stop hooks 加载移入 `StopHookRegistry`，由其内部管理 lazy-load 状态
2. 至少增加失败重试逻辑（catch 后重置 promise）

### 1.7 上下文管理器重复创建 OffloadStorage [P2-Minor]

**位置**: 第 533-548 行 (`ensureContextManager`) 和 第 550-566 行 (`ensureContextCompactor`)

**问题**: `ContextManager` 和 `ContextCompactor` 各自独立创建 `OffloadStorage` 实例，指向同一目录。两个 storage 实例操作同一文件系统目录可能导致竞态。

**建议**: 共享同一个 `OffloadStorage` 实例，在 session 初始化时一次创建。

### 1.8 迭代超限处理不追加到 session [P0-Critical]

**位置**: 第 818-823 行

```typescript
if (!completedNormally && iteration >= this.maxIterations) {
  // ...
  this.history.push(createTextMessage('assistant', stopMessage));
}
```

**问题**: 直接 `push` 到 `this.history` 但没有调用 `appendMessage` 持久化到 session 文件。如果进程之后 resume 该 session，这条消息会丢失，但 in-memory 历史会包含它——导致不一致。

**建议**: 统一使用 `appendMessage` 方法。

---

## 2. step.ts

### 2.1 设计质量良好

`step.ts`（~404 行）是整个 Agent 模块中最干净的文件。职责单一、函数拆分合理、取消逻辑完整。

### 2.2 BASH_TOOL_NAME 重复定义 [P2-Minor]

**位置**: 第 27 行

**问题**: `agent-runner.ts` 第 70 行也定义了同名常量。

**建议**: 提取到 `tools/constants.ts` 统一引用。

### 2.3 guardWithAbort 中的 Promise 包装可简化 [P2-Minor]

**位置**: 第 170-202 行

**问题**: 手动创建 Promise + addEventListener 模式较啰嗦。可以使用 `AbortSignal.any()` 或 `Promise.race` 简化。

**建议**: 考虑使用 `Promise.race([task, abortPromise])` 模式。

### 2.4 toolResults 闭包捕获 toolCalls 数组引用 [P2-Minor]

**位置**: 第 379-402 行

**问题**: `toolResults()` 闭包捕获了 `toolCalls` 数组，而 `handleToolCall` 回调持续向其 push。如果 `toolResults()` 在 `generate()` 完成前被调用（理论上可行，因为它是返回对象的方法），可能读到不完整的 toolCalls。

实际上当前调用顺序（先 await generate, 再调 toolResults）避免了此问题，但 API 契约没有明确约束。

**建议**: 在 JSDoc 中明确标注 `toolResults()` 必须在 step 返回后调用，或者用 flag 防止提前调用。

---

## 3. session.ts

### 3.1 同步文件 I/O 阻塞事件循环 [P1-Major]

**位置**: 全文大量使用 `fs.existsSync`, `fs.readFileSync`, `fs.writeFileSync`, `fs.appendFileSync`, `fs.mkdirSync`, `fs.rmSync`, `fs.readdirSync`

**问题**: 所有 I/O 操作使用同步 API，但方法签名大多是 `async`（如 `appendMessage`, `loadHistory`, `create`, `find`, `list`）。在高频调用场景下（每个 tool call 都会触发 `appendMessage` → `updateIndex`），同步 I/O 会阻塞 Node.js 事件循环。

**建议**:
1. 短期：将 `async` 方法改为真正的异步实现（`fs.promises`）
2. 或去掉 `async` 标记以诚实反映同步行为
3. 至少 `appendMessage` 和 `updateIndex` 应使用异步 I/O

### 3.2 会话索引文件竞态写入 [P0-Critical]

**位置**: `updateIndex()` 第 552-564 行，`register()` 第 461-485 行

**问题**: `updateIndex` 执行 read-modify-write：
1. `loadIndex()` 读取 JSON
2. 修改 sessions 数组
3. `saveIndex()` 写入 JSON

多个并发 `appendMessage` 调用（比如并行 tool results）可能导致更新丢失。而 `rewriteHistory` 使用 rename 原子写入，但 `saveIndex` 没有。

**建议**:
1. 使用文件锁或 write-ahead-log 机制
2. 或序列化所有 index 更新到单个队列

### 3.3 parseJsonl 无错误处理 [P1-Major]

**位置**: 第 134-137 行

```typescript
function parseJsonl(content: string): Message[] {
  const lines = content.trim().split('\n').filter((line) => line.length > 0);
  return lines.map((line) => JSON.parse(line) as Message);
}
```

**问题**: 如果某行 JSON 格式损坏，整个历史加载会抛异常。对于用户可能手动编辑或意外截断的 JSONL 文件，缺乏鲁棒性。

**建议**: 逐行 try-catch，跳过损坏行并记录 warning。

### 3.4 会话恢复时 usage 字段处理不一致 [P2-Minor]

**位置**: `find()` 第 246-249 行

```typescript
const model = info.usage?.model ?? options.model ?? DEFAULT_SESSION_MODEL;
const session = new Session(sessionId, sessionsDir, model);
session._title = info.title;
session._messageCount = info.messageCount;
session._usage = info.usage ?? createEmptySessionUsage(model);
```

**问题**: `model` 从三个来源取值（`info.usage?.model` → `options.model` → 默认值），但创建 session 后又赋值 `info.usage`（可能包含不同的 model）。逻辑可读性差。

**建议**: 明确 model 优先级并注释。

### 3.5 deleteSessionFile 静默忽略错误 [P2-Minor]

**位置**: 第 515-531 行

**问题**: `catch` 块完全为空，连日志都不打。

**建议**: 至少记录 `logger.debug`。

---

## 4. context-manager.ts

### 4.1 设计简洁，质量良好

**优点**:
- 仅 104 行，职责清晰（token 计数 → 阈值判断 → 卸载）
- 纯函数风格，`offloadIfNeeded` 返回新数组而不修改原数组
- 依赖注入 `OffloadStorage`

### 4.2 缺少文件头文档 [P2-Minor]

**位置**: 文件开头无 `/**` 注释块

**问题**: 不符合项目 `file-header-documentation.md` 规范。

### 4.3 scanRatio 边界情况 [P2-Minor]

**位置**: 第 67 行

```typescript
const scanEndIndex = Math.floor(messages.length * this.options.scanRatio);
```

**问题**: 当 `scanRatio = 0` 时，`scanEndIndex = 0`，不会卸载任何消息，但 `offloadedCount` 仍为 0——逻辑正确但不直观。建议添加卫语句。

### 4.4 OFFLOAD_REFERENCE_PREFIX 与 context-compactor 重复定义 [P2-Minor]

**位置**: `context-manager.ts` 第 7 行和 `context-compactor.ts` 第 11 行

**问题**: 两个文件各自定义 `const OFFLOAD_REFERENCE_PREFIX = 'Tool result is at:'`。

**建议**: 提取到共享常量文件（如 `context-constants.ts`）。

---

## 5. context-compactor.ts

### 5.1 restoreOffloadedContent 标记为 async 但实际同步 [P2-Minor]

**位置**: 第 124 行

```typescript
private async restoreOffloadedContent(messages: Message[]): Promise<Message[]> {
  return messages.map((message) => { ... });
}
```

**问题**: 方法签名 `async` 但内部完全是同步的 `map` + `readFileSync`。

**建议**: 移除 `async` 或改为真正的异步文件读取。

### 5.2 cleanupOffloadedFiles 也标记为 async 但同步执行 [P2-Minor]

**位置**: 第 264 行

**问题**: 同上，`this.storage.remove()` 和 `this.storage.listFiles()` 都是同步操作。

### 5.3 generateSummary 的 retry 延迟策略 [P2-Minor]

**位置**: 第 174-190 行

```typescript
await this.delay(100 * attempt);
```

**问题**: 线性退避（100ms, 200ms, 300ms），对于 LLM API 调用可能过短。

**建议**: 使用指数退避（如 `1000 * 2^attempt`），或可配置退避参数。

### 5.4 unreachable throw [P2-Minor]

**位置**: 第 189 行

```typescript
throw new Error('unreachable');
```

**问题**: TypeScript 编译器需要此行来满足类型检查，但更好的做法是使用 `never` 返回类型的辅助函数。

### 5.5 compact 失败静默降级 [P1-Major]

**位置**: 第 88-99 行

**问题**: compact 失败时返回 `success: false` 并静默保持原历史。但调用方 `agent-runner.ts:608-614` 仅在 `success` 时更新——这意味着如果 compact 持续失败，每次 step 都会重新尝试 compact（因为 token 数不变），造成无效的 LLM API 调用浪费。

**建议**: 增加 compact 冷却期机制（失败后 N 步内不再尝试），或限制单次 run 中的 compact 尝试次数。

---

## 6. offload-storage.ts

### 6.1 设计简洁，无重大问题

64 行代码，职责明确。使用 `randomUUID` 避免文件名冲突。

### 6.2 缺少文件头文档 [P2-Minor]

**问题**: 不符合项目规范。

### 6.3 save 方法每次调用 mkdirSync [P2-Minor]

**位置**: 第 53 行

```typescript
fs.mkdirSync(path.dirname(filepath), { recursive: true });
```

**问题**: 每次保存文件前都创建目录，理论上第二次以后是多余的 I/O 调用。

**建议**: 缓存 `dirEnsured` 标志。

---

## 7. session-usage.ts

### 7.1 设计良好，功能完整

91 行代码，纯函数式设计，`accumulateUsage` 返回新对象（不可变模式）。`formatCostOutput` 格式化逻辑清晰。

### 7.2 rounds 数组无限增长 [P1-Major]

**位置**: `accumulateUsage` 第 50 行

```typescript
rounds: [...sessionUsage.rounds, roundUsage],
```

**问题**: 每次 API 调用都追加一个 round，长会话（数百步）会导致 `rounds` 数组持续增长：
1. 内存占用线性增加
2. `updateIndex()` 每次将整个 `rounds` 序列化写入 `sessions.json`
3. 会话索引文件越来越大，影响 `loadIndex` 性能

**建议**:
1. 限制 rounds 保留数量（如最近 50 轮），旧数据合并到 total
2. 或将 rounds 分离到独立文件存储，index 中仅保留 total

### 7.3 Spread 不可变模式的性能考量 [P2-Minor]

**位置**: 第 44-52 行

**问题**: 每次 `accumulateUsage` 都展开整个 `rounds` 数组。长会话中 `[...sessionUsage.rounds, roundUsage]` 的成本为 O(n)。

**建议**: 如果保留当前不可变模式，考虑使用 `rounds.concat(roundUsage)` 或 push-then-clone。

---

## 8. system-prompt.ts

### 8.1 设计简洁，无重大问题

62 行，纯函数式。`loadDesc` 加载 markdown 文件拼装 prompt。

### 8.2 SystemPromptOptions 过于简单 [P2-Minor]

**位置**: 第 29-32 行

```typescript
export interface SystemPromptOptions {
  cwd?: string;
}
```

**问题**: 仅有 `cwd` 一个选项。如果未来需要传递更多上下文（model name, available tools 等），需要扩展。

**建议**: 暂不处理，但接口设计为 options bag 模式已具备扩展性。

---

## 9. auto-enhance-trigger.ts

### 9.1 triggerEnhancement 直接修改 decision 对象 [P1-Major]

**位置**: 第 218-219 行

```typescript
decision.suggestedAction = 'enhance';
decision.existingSkill = context.skillsUsed[0];
```

**问题**: `shouldEnhance` 返回的 decision 对象被直接修改（mutation），违反了函数式风格和可预测性原则。

**建议**: 创建新对象覆盖：
```typescript
const overriddenDecision = { ...decision, suggestedAction: 'enhance', existingSkill: ... };
```

### 9.2 CLARIFICATION_KEYWORDS 的启发式判断过于粗糙 [P2-Minor]

**位置**: 第 28 行

```typescript
const CLARIFICATION_KEYWORDS = ['clarif', 'mean', 'actually', 'instead'];
```

**问题**: 单词片段匹配可能误判：
- "I mean to say thank you" 被计为 clarification
- "actually it works now" 被计为 clarification

**建议**: 使用更精确的模式（如 "what I mean is", "I actually want"）或接受当前粗糙度。

### 9.3 scriptsGenerated 计数方式不准确 [P2-Minor]

**位置**: 第 276-280 行

```typescript
if (call.name === 'write' || call.name === 'edit') {
  scriptsGenerated++;
}
```

**问题**: 所有 write/edit 调用都计为 "scripts generated"，包括修改配置文件、README 等非脚本文件。

**建议**: 增加文件扩展名过滤（`.sh`, `.py`, `.ts` 等）。

### 9.4 default export 多余 [P2-Minor]

**位置**: 第 296 行

```typescript
export default AutoEnhanceTrigger;
```

**问题**: 已有 named export，default export 导致两种引入方式共存。项目其他文件统一使用 named export。

**建议**: 删除 default export。

---

## 10. sub-agent-manager.ts

### 10.1 agents Map 未被使用 [P0-Critical]

**位置**: 第 102 行

```typescript
private agents: Map<SubAgentType, SubAgentInstance> = new Map();
```

**问题**: `execute()` 方法每次创建新的 `AgentRunner`，**从不向 `agents` Map 中添加实例**。但 `get()`, `has()`, `destroy()`, `destroyAll()`, `size` getter 都操作这个 Map。这意味着：
- 文件头注释声称的 "同一 session 中复用 Sub Agent 实例" 功能完全未实现
- `get()`, `has()`, `destroy()` 永远返回 `undefined` / `false`
- `size` 永远返回 0
- `SubAgentInstance` 接口（第 74-78 行）定义了但从未使用

**建议**:
1. 如果复用功能是设计目标，在 `execute()` 中实现缓存逻辑
2. 如果不需要复用，删除 `agents` Map 及相关方法（`get`, `has`, `destroy`, `destroyAll`, `size`），简化为纯粹的工厂模式

### 10.2 createAgentWithCallbacks 同时承担创建和配置 [P1-Major]

**位置**: 第 214-269 行

**问题**: 方法同时负责：
1. 获取 config
2. 创建 toolset
3. 包装 onToolCall / onToolResult 回调
4. 构建 AgentRunner

**建议**: 拆分为 `createToolset` + `wrapCallbacks` + `createRunner`。当前 `createToolset` 已独立，但回调包装和 runner 创建仍混在一起。

### 10.3 cleanup 可能遗漏 [P1-Major]

**位置**: `execute()` 第 171 行

```typescript
} finally {
  cleanup();
}
```

**问题**: `cleanup()` 调用 `isolatedBashTool.cleanup()`。但如果 `createAgentWithCallbacks` 在 `createToolset` 成功后、`new AgentRunner` 前抛异常，`cleanup` 闭包已创建但不会被调用（因为 `finally` 还没开始）。

实际场景中 `new AgentRunner()` 是同步构造不太可能抛异常，但这是一个防御性编程缺失。

**建议**: 在 `createAgentWithCallbacks` 内部用 try-catch 包裹，失败时主动 cleanup。

### 10.4 subAgentCounter 非线程安全 [P2-Minor]

**位置**: 第 108 行

**问题**: 多个并发 `execute()` 调用可能读到同一个 counter 值。虽然 JS 单线程保证了原子性，但 `Date.now()` 的追加使得 ID 唯一性依赖时间戳精度——两个快速连续调用可能得到相同 timestamp。

**建议**: 仅用 counter 递增即可保证唯一性，或使用 `randomUUID()`。

---

## 11. sub-agent-types.ts

### 11.1 设计良好，无重大问题

89 行，类型定义清晰。使用 Zod schema 验证参数。

### 11.2 TaskCommandParams 中 action 类型过宽 [P2-Minor]

**位置**: 第 75 行

```typescript
action: z.string().nullish(),
```

**问题**: `action` 接受任意 string，但实际只支持 `'search'` | `'enhance'`。

**建议**: 使用 `z.enum(SKILL_ACTIONS).nullish()` 或 `z.union([z.literal('search'), z.literal('enhance')]).nullish()`。

---

## 12. sub-agents/configs/

### 12.1 explore 配置的 system prompt 内嵌字符串 [P2-Minor]

**位置**: `configs/explore.ts` 第 23-53 行

**问题**: 其他模块（如 `system-prompt.ts`）使用 `loadDesc()` 从 `.md` 文件加载 prompt。但 explore/general 配置直接在 TypeScript 中内嵌长字符串，不一致。

**建议**: 统一使用 markdown 文件加载 prompt。

### 12.2 getConfig 中类型断言不安全 [P1-Major]

**位置**: `configs/index.ts` 第 41 行

```typescript
return createSkillConfig(action as SkillAction);
```

**问题**: `action` 参数类型是 `string | undefined`，直接断言为 `SkillAction` 绕过了类型检查。如果传入 `'invalid'` 字符串，`createSkillConfig` 会走到默认分支返回 enhance 配置——这可能不是调用方的预期。

**建议**: 使用 `isSkillAction(action)` 检查，无效时抛出异常或返回默认配置并记录警告。

### 12.3 skill.ts 中 loadAllSkillMetadata 每次创建新 SkillIndexer [P2-Minor]

**位置**: `configs/skill.ts` 第 41-53 行

**问题**: 每次调用 `createSkillConfig()` 都创建新的 `SkillIndexer` 实例并读取文件系统。在高频调用场景下（虽然当前不太可能），性能欠佳。

**建议**: 缓存 indexer 实例或元数据结果。

---

## 13. 与主流 Agent 框架的对比

### 13.1 与 Claude Code Agent Loop 的相似与差异

| 维度 | Synapse Agent | Claude Code / LangGraph 典型模式 |
|------|--------------|------|
| Loop 结构 | `while(iteration < max)` + step + append | 类似，多数框架使用 while + step |
| 上下文管理 | Offload + Compact 二级策略 | Claude Code 使用 context compaction；LangGraph 无内置 |
| 工具执行 | step 内部分组（task batch vs single） | 多数框架逐个执行，Claude Code 支持并行 |
| 会话持久化 | JSONL + JSON index | Claude Code 用 JSONL；LangGraph 用 checkpoint |
| 子智能体 | 独立 AgentRunner，通过 BashTool 间接调用 | Claude Code 用 task: 前缀；LangGraph 用 graph composition |
| Stop 机制 | max iterations + consecutive failures + hooks | 类似，多数框架有 max iterations |

### 13.2 优势
- 二级上下文管理（offload → compact）比单纯 truncation 更智能
- Tool failure 分类（countable vs non-countable）更精细
- 工具执行的分组策略（task batch parallel）有价值

### 13.3 可改进
- AgentRunner 职责过重是最大的架构问题
- Session 的同步 I/O + 索引竞态是最大的技术风险
- SubAgentManager 的 agents Map 缓存完全未实现

---

## 14. 优先修复建议

### P0-Critical（建议立即修复）

1. **agents Map 死代码** (`sub-agent-manager.ts:102`) — 删除未使用的 Map 及相关方法，或实现缓存逻辑
2. **会话索引竞态写入** (`session.ts:552-564`) — 增加文件锁或序列化写入队列
3. **迭代超限消息未持久化** (`agent-runner.ts:822`) — 使用 `appendMessage` 替代直接 push

### P1-Major（建议本轮重构处理）

4. **AgentRunner 拆分** — 提取 HistorySanitizer、StopHookExecutor 等模块
5. **Session 同步 I/O** — 至少将 `appendMessage` 和 `updateIndex` 改为异步
6. **parseJsonl 鲁棒性** — 增加逐行错误处理
7. **compact 冷却期** — 避免重复无效 LLM 调用
8. **rounds 数组增长** — 限制保留数量
9. **getConfig 类型断言** — 使用 isSkillAction 验证
10. **triggerEnhancement mutation** — 使用不可变更新

### P2-Minor（可后续迭代处理）

11. 重复常量提取（`BASH_TOOL_NAME`, `OFFLOAD_REFERENCE_PREFIX`）
12. 文件头文档补全（`context-manager.ts`, `offload-storage.ts`）
13. 删除 `auto-enhance-trigger.ts` 的 default export
14. 统一 prompt 加载方式（markdown 文件 vs 内嵌字符串）
15. 其他代码风格细节
