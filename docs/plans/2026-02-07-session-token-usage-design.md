# Session Token 计费和缓存命中率统计设计

## 概述

按 Session 维度统计 token 的输入输出、缓存读写，并根据配置文件中的模型定价计算费用。

## 需求确认

| 决策项 | 选择 |
|--------|------|
| 费用配置来源 | 纯配置文件驱动，支持多模型定价 |
| 统计数据存储 | 随 Session 持久化到 sessions.json |
| 主/子智能体统计 | 统一计算，不区分 |
| 展示时机 | 按需查询，通过 `/cost` 命令 |
| 缓存命中率粒度 | 每轮记录 + Session 汇总 |
| 输出格式 | 简洁单行 |
| 配置文件结构 | 按模型 ID 扁平配置 |
| 配置文件位置 | `~/.synapse/pricing.json` |

## 数据模型

### TokenUsage（已有）

```typescript
interface TokenUsage {
  inputOther: number;
  output: number;
  inputCacheRead: number;
  inputCacheCreation: number;
}
```

### SessionUsage（新增）

```typescript
interface SessionUsage {
  // 累计 token 数
  totalInputOther: number;
  totalOutput: number;
  totalCacheRead: number;
  totalCacheCreation: number;
  // 本 Session 使用的模型
  model: string;
  // 每轮明细（用于缓存命中率趋势分析）
  rounds: TokenUsage[];
  // 总费用（美元），配置缺失时为 null
  totalCost: number | null;
}
```

## 定价配置

### 配置文件位置

`~/.synapse/pricing.json`

### 配置文件结构

```json
{
  "claude-sonnet-4-20250514": {
    "inputPerMillion": 3.0,
    "outputPerMillion": 15.0,
    "cacheReadPerMillion": 0.3,
    "cacheWritePerMillion": 3.75
  },
  "claude-opus-4-20250514": {
    "inputPerMillion": 15.0,
    "outputPerMillion": 75.0,
    "cacheReadPerMillion": 1.5,
    "cacheWritePerMillion": 18.75
  },
  "claude-haiku-3-5-20241022": {
    "inputPerMillion": 0.8,
    "outputPerMillion": 4.0,
    "cacheReadPerMillion": 0.08,
    "cacheWritePerMillion": 1.0
  }
}
```

### 费用计算公式

```typescript
function calculateCost(usage: TokenUsage, pricing: ModelPricing): number {
  return (
    (usage.inputOther * pricing.inputPerMillion / 1_000_000) +
    (usage.output * pricing.outputPerMillion / 1_000_000) +
    (usage.inputCacheRead * pricing.cacheReadPerMillion / 1_000_000) +
    (usage.inputCacheCreation * pricing.cacheWritePerMillion / 1_000_000)
  );
}
```

## 数据流

### 统计入口

在 `generate.ts` 的 `generate()` 函数中，stream 完全消费后触发 `onUsage` 回调。

### 回调传递链

```
REPL 设置 onUsage 回调
       ↓
AgentRunner 构造时接收 onUsage
       ↓
step() 调用 generate() 时传递 onUsage
       ↓
generate() 完成后触发 onUsage(usage, model)
       ↓
累加到 SessionUsage
       ↓
Session.updateUsage() 持久化
```

### 接口扩展

```typescript
// generate.ts
interface GenerateOptions {
  onMessagePart?: OnMessagePart;
  onToolCall?: OnToolCall;
  signal?: AbortSignal;
  /** 每次 API 调用完成后的 usage 回调 */
  onUsage?: (usage: TokenUsage, model: string) => void;
}
```

## /cost 命令

### 输出格式

```
Token: 12,345 in / 3,456 out | Cache: 78% hit | Cost: $0.42
```

### 字段计算

```typescript
function formatCostOutput(usage: SessionUsage): string {
  const totalInput = usage.totalInputOther + usage.totalCacheRead + usage.totalCacheCreation;
  const cacheHitRate = totalInput > 0
    ? Math.round((usage.totalCacheRead / totalInput) * 100)
    : 0;

  const costDisplay = usage.totalCost !== null
    ? `$${usage.totalCost.toFixed(2)}`
    : 'N/A';

  return `Token: ${formatNumber(totalInput)} in / ${formatNumber(usage.totalOutput)} out | Cache: ${cacheHitRate}% hit | Cost: ${costDisplay}`;
}
```

### 边界情况

- Session 无使用记录：`Token: 0 in / 0 out | Cache: 0% hit | Cost: $0.00`
- 定价配置缺失：token 正常统计，费用显示 `N/A`
- 模型未配置：同上，该模型费用显示 `N/A`

## 文件组织

### 新增文件

| 文件 | 职责 |
|------|------|
| `src/config/pricing.ts` | 定价配置加载与费用计算 |
| `src/agent/session-usage.ts` | SessionUsage 类型定义与累加逻辑 |

### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/providers/generate.ts` | 新增 onUsage 回调参数 |
| `src/agent/step.ts` | 传递 onUsage 回调 |
| `src/agent/agent-runner.ts` | 新增 onUsage 选项，传递给 step() |
| `src/agent/session.ts` | SessionInfo 新增 usage 字段，持久化 |
| `src/cli/repl.ts` | 初始化 onUsage 回调，注册 /cost 命令 |

### 配置文件

| 文件 | 说明 |
|------|------|
| `~/.synapse/pricing.json` | 用户定价配置 |

## 异常处理

| 场景 | 处理方式 |
|------|----------|
| pricing.json 不存在 | token 正常统计，费用显示 N/A |
| 模型未在配置中 | token 正常统计，该模型费用显示 N/A |
| pricing.json 格式错误 | 记录警告日志，按配置不存在处理 |

## 状态行为

| 操作 | 影响 |
|------|------|
| Session 创建 | 初始化空的 SessionUsage |
| 每轮对话完成 | 累加 token，追加到 rounds，更新费用，持久化 |
| Session clear | 重置 SessionUsage 为初始状态 |
| Session 恢复 | 从 sessions.json 加载 usage |

## 设计约束

- rounds 数组无最大长度限制，记录所有轮次
- 费用单位为美元，保留两位小数显示
- 主/子智能体消耗统一计入 Session，不做区分
