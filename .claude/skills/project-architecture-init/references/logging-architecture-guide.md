# 日志架构参考指南

本文档提供日志架构设计的详细参考，包含日志框架选型、结构化日志格式、日志级别规范和配置模板。

## 日志框架选型

### 按技术栈推荐

| 技术栈 | 推荐框架 | 备选 | 说明 |
|--------|---------|------|------|
| Java/Kotlin | SLF4J + Logback | Log4j2 | SLF4J 提供统一门面，Logback 为默认实现；Spring Boot 默认集成 |
| TypeScript/JavaScript | pino | winston | pino 性能优异，原生 JSON 输出；winston 生态更丰富 |
| Python | structlog | logging (stdlib) | structlog 提供结构化日志；stdlib logging 零依赖 |
| Go | log/slog (stdlib) | zap / zerolog | Go 1.21+ 内置 slog；zap 高性能，zerolog 零分配 |

## 结构化日志格式

### 生产环境：JSON 格式

所有字段键名使用 camelCase，时间戳使用 ISO-8601 格式：

```json
{
  "timestamp": "2024-01-15T10:30:00.123Z",
  "level": "INFO",
  "logger": "com.example.order.core.OrderService",
  "thread": "http-nio-8080-exec-1",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Order created successfully",
  "context": {
    "orderId": "ORD-12345",
    "userId": "USR-67890",
    "amount": 99.99
  }
}
```

### 开发环境：人类可读格式

```
2024-01-15 10:30:00.123 INFO  [http-nio-8080-exec-1] [550e8400] c.e.o.c.OrderService - Order created successfully | orderId=ORD-12345 userId=USR-67890
```

## 日志级别使用规范

| 级别 | 语义 | 使用场景 | 生产环境默认 |
|------|------|---------|------------|
| ERROR | 不可恢复错误，需人工介入 | 外部服务不可达、数据一致性破坏、未预期异常 | 开启 |
| WARN | 可恢复的异常状况 | 重试后成功、缓存降级、速率限制触发、接近阈值 | 开启 |
| INFO | 关键业务事件 | 请求完成、配置加载、应用启动/关闭、定时任务执行 | 开启 |
| DEBUG | 诊断细节 | 方法入参/出参、SQL 语句、HTTP 请求/响应详情 | 关闭 |
| TRACE | 极细粒度追踪 | 循环迭代、算法中间步骤（极少使用） | 关闭 |

### 日志级别配置策略

- 应用代码默认级别：INFO
- 第三方库默认级别：WARN
- 通过环境变量支持运行时调整（无需重启）

## 关联 ID（Correlation ID）

### 设计原则

1. 每个入站请求生成唯一 UUID 作为关联 ID
2. 如果请求头中已携带关联 ID（如 `X-Correlation-ID` 或 `X-Request-ID`），优先使用
3. 关联 ID 贯穿整个请求处理链路，所有日志条目必须包含
4. 对外部服务的调用应传播关联 ID

### 按技术栈的实现方式

| 技术栈 | 实现机制 |
|--------|---------|
| Java/Spring | MDC (Mapped Diagnostic Context) + Filter/Interceptor |
| TypeScript/Express | AsyncLocalStorage + Middleware |
| TypeScript/NestJS | ClsModule / AsyncLocalStorage + Interceptor |
| Python/FastAPI | contextvars + Middleware |
| Python/Django | threading.local + Middleware |
| Go | context.Context + Middleware |

## 敏感信息保护

### 禁止记录的信息类型

| 类型 | 示例 | 替代方案 |
|------|------|---------|
| 认证令牌 | Bearer token, API key | 记录令牌后 4 位或 hash 前缀 |
| 用户凭证 | 密码、密钥 | 仅记录操作结果（成功/失败） |
| 个人身份信息 (PII) | 身份证号、银行卡号 | 脱敏处理（如 `****1234`） |
| 完整请求/响应体 | 包含上述信息的 payload | 记录摘要或仅记录非敏感字段 |

### 最佳实践

- 日志框架层面配置 pattern 过滤或 marker 机制
- 代码审查时检查日志语句是否包含敏感数据
- 使用参数化日志消息，避免字符串拼接

## 日志消息编写规范

### 语言

所有日志消息统一使用英文，保持全球化可读性和工具兼容性。

### 消息格式

- 使用参数化消息，禁止字符串拼接：

  ```java
  // DO
  log.info("Order created: orderId={}, amount={}", orderId, amount);

  // DON'T
  log.info("Order created: orderId=" + orderId + ", amount=" + amount);
  ```

- 消息应简洁、描述性，说明"发生了什么"：

  ```
  // DO
  "Failed to fetch market data from Binance API"
  "Cache miss for exchange info, fetching from remote"

  // DON'T
  "Error!"
  "Something went wrong"
  "Here"
  ```

## 配置模板

### Java/Spring Boot (Logback)

```xml
<!-- logback-spring.xml -->
<configuration>
    <springProfile name="default,dev">
        <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
            <encoder>
                <pattern>%d{yyyy-MM-dd HH:mm:ss.SSS} %-5level [%thread] [%X{correlationId}] %logger{36} - %msg%n</pattern>
            </encoder>
        </appender>
        <root level="INFO">
            <appender-ref ref="CONSOLE"/>
        </root>
    </springProfile>

    <springProfile name="prod">
        <appender name="JSON" class="ch.qos.logback.core.ConsoleAppender">
            <encoder class="net.logstash.logback.encoder.LogstashEncoder">
                <includeMdcKeyName>correlationId</includeMdcKeyName>
            </encoder>
        </appender>
        <root level="INFO">
            <appender-ref ref="JSON"/>
        </root>
    </springProfile>
</configuration>
```

### TypeScript/Node.js (pino)

```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty' }
    : undefined,
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
```

### Python (structlog)

```python
import structlog

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer()  # dev
        # structlog.processors.JSONRenderer()  # prod
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
)
```

### Go (slog)

```go
import (
    "log/slog"
    "os"
)

func initLogger(env string) *slog.Logger {
    var handler slog.Handler
    if env == "production" {
        handler = slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
            Level: slog.LevelInfo,
        })
    } else {
        handler = slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
            Level: slog.LevelDebug,
        })
    }
    return slog.New(handler)
}
```
