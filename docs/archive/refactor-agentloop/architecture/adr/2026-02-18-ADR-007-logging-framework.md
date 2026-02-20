# ADR-007: 日志框架 — pino

## 状态

ACCEPTED

## 日期

2026-02-18

## 上下文

Synapse Agent 架构模块化重构需要统一的日志基础设施，满足以下需求：
- 结构化日志输出（JSON 格式用于生产，人类可读格式用于开发）
- 高性能，不影响 EventStream 事件延迟（NFR-001 < 1ms）
- 支持关联 ID 传播（通过 AsyncLocalStorage）
- 与 Bun 运行时兼容

## 决策

采用 **pino** 作为日志框架，配合 **pino-pretty** 用于开发环境。

## 理由

### 备选方案

| 方案 | 优势 | 劣势 |
|------|------|------|
| console.log (原生) | 零依赖 | 无结构化输出、无日志级别、无上下文 |
| winston | 生态丰富、Transport 插件多 | 性能较低（同步写入）、体积较大 |
| **pino (选定)** | 极致性能、原生 JSON 输出、低开销 | 生态比 winston 小 |

pino 是 Node.js/Bun 生态中性能最优的日志框架，其异步写入和低分配策略与 NFR-001 的延迟要求高度契合。

## 后果

### 正面影响

- 日志写入开销极低，不影响 EventStream 性能
- 原生 JSON 输出，无需额外格式化
- pino-pretty 开发体验良好

### 负面影响

- 新增运行时依赖（pino ~100KB，影响可控）
- Transport 生态比 winston 小（当前需求不需要复杂 Transport）

### 对测试的影响

- 单元测试可通过 pino destination mock 捕获日志输出进行验证
- 集成测试验证关联 ID 正确传播

## 参考

- [pino 官方文档](https://getpino.io/)
- 日志架构参考：`references/logging-architecture-guide.md`
