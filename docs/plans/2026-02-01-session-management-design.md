# Session 管理设计方案

## 概述

为 AgentRunner 添加 Session 管理功能，实现会话持久化和恢复。

## 目录结构

```
~/.synapse/
├── logs/
│   └── synapse.log
└── sessions/
    ├── sessions.json           ← 会话索引（元信息）
    └── session-xxx-xxx.jsonl   ← 单个会话的消息历史
```

## 数据模型

### sessions.json 结构

```json
{
  "version": "1.0.0",
  "sessions": [
    {
      "id": "session-m5abc-xyz123",
      "title": "帮我写一个 Python 计算器...",
      "createdAt": "2026-02-01T10:00:00.000Z",
      "updatedAt": "2026-02-01T10:30:00.000Z",
      "messageCount": 12,
      "cwd": "/path/to/project"
    }
  ],
  "updatedAt": "2026-02-01T10:30:00.000Z"
}
```

### session-xxx.jsonl 消息格式

基于 `src/providers/message.ts` 中的 `Message` 类型，每行一个 JSON 对象：

```jsonl
{"role":"user","content":[{"type":"text","text":"帮我写一个计算器"}]}
{"role":"assistant","content":[{"type":"text","text":"好的..."}],"toolCalls":[...]}
{"role":"tool","content":[{"type":"text","text":"文件已创建"}],"toolCallId":"call_1"}
```

## Session 类 API

### 静态方法

```typescript
class Session {
  // 创建新会话
  static async create(options?: { sessionId?: string }): Promise<Session>

  // 查找指定会话
  static async find(sessionId: string): Promise<Session | null>

  // 列出所有会话
  static async list(): Promise<SessionInfo[]>

  // 继续最近的会话
  static async continue(): Promise<Session | null>
}
```

### 实例方法

```typescript
class Session {
  // 追加消息到历史（同时写入文件）
  async appendMessage(message: Message | Message[]): Promise<void>

  // 加载历史消息（从 JSONL 文件读取）
  async loadHistory(): Promise<Message[]>

  // 刷新会话元信息（标题、更新时间）
  async refresh(): Promise<void>

  // 删除会话
  async delete(): Promise<void>

  // 属性
  get id(): string
  get title(): string | undefined
  get historyPath(): string
}
```

## AgentRunner 集成

### 选项扩展

```typescript
interface AgentRunnerOptions {
  // ... 现有选项
  sessionId?: string;  // 可选，用于恢复指定会话
}
```

### 延迟初始化

- 构造函数保持同步
- `run()` 首次调用时异步初始化 Session
- 如有 `sessionId`：恢复指定 Session，加载历史消息到 `this.history`
- 如无 `sessionId`：自动创建新 Session

### 消息持久化流程

```
用户输入
    ↓
this.history.push(userMessage)
await this.session.appendMessage(userMessage)  ← 保存用户消息
    ↓
Agent Loop
    ↓
step() → LLM 响应
    ↓
this.history.push(result.message)
await this.session.appendMessage(result.message)  ← 保存 LLM 响应
    ↓
工具执行
    ↓
this.history.push(toolResultMessage)
await this.session.appendMessage(toolResultMessage)  ← 保存工具结果
    ↓
循环继续...
```

### 会话恢复流程

```
AgentRunner.run() 首次调用
    ↓
检查 this.session 是否已初始化
    ↓
如有 sessionId → Session.find(sessionId)
              → session.loadHistory()
              → this.history = loadedMessages
    ↓
如无 sessionId → Session.create()
    ↓
继续正常执行
```

## CLI 命令

### /resume 命令

```
/resume              列出最近会话，选择一个恢复
/resume <session-id> 恢复指定会话
/resume --last       恢复最近一个会话
```

### 交互流程示例

```
You> /resume

Recent Sessions:
  1. [session-m5abc-xyz] 帮我写一个 Python 计算器... (2h ago)
  2. [session-k3def-uvw] 修复登录页面的 bug... (1d ago)
  3. [session-j2ghi-rst] 重构数据库连接池... (3d ago)

Enter number or session ID to resume (or press Enter to cancel): 1

✓ Resumed session: session-m5abc-xyz (12 messages loaded)

You>
```

## 其他细节

### 标题自动提取

首次用户消息保存时，截取前 50 字符作为会话标题。

### 文件变更清单

1. `src/agent/session.ts` - 重构为完整的 Session 类
2. `src/agent/agent-runner.ts` - 集成 Session，添加持久化逻辑
3. `src/cli/repl.ts` - 添加 `/resume` 命令处理
