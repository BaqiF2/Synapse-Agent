# 测试架构参考指南

本文档提供测试架构设计的详细参考，包含测试金字塔定义、测试数据管理策略和架构适应度函数。

## 测试金字塔定义

测试架构是代码架构的镜像。有什么样的代码结构，就需要什么样的测试结构。

### 标准测试金字塔

| 测试类型 | 目标层级 | 执行时机 | 编写者 |
|----------|---------|---------|--------|
| 单元测试 | core 层的业务逻辑 | 每次提交 | 开发 |
| 集成测试 | api 层 + infrastructure 层 | CI 流程 | 开发/测试协助 |
| 端到端测试 | 全流程（前端 → 后端 → DB） | 预发环境部署后 | 测试 |

### 按技术栈的测试工具映射

#### Java/Kotlin 项目
| 测试类型 | 工具/技术 |
|----------|----------|
| 单元测试 | JUnit 5 + Mockito |
| 集成测试 | @SpringBootTest + Testcontainers |
| API 测试 | Rest Assured / MockMvc |
| 契约测试 | Spring Cloud Contract / Pact |
| 架构测试 | ArchUnit |
| 覆盖率 | JaCoCo |
| 端到端 | Playwright / Cypress |

#### TypeScript/JavaScript 项目
| 测试类型 | 工具/技术 |
|----------|----------|
| 单元测试 | Jest / Vitest |
| 集成测试 | Supertest + Testcontainers |
| API 测试 | Supertest |
| 契约测试 | Pact |
| 架构测试 | dependency-cruiser / eslint-plugin-import |
| 覆盖率 | c8 / istanbul |
| 端到端 | Playwright / Cypress |

#### Python 项目
| 测试类型 | 工具/技术 |
|----------|----------|
| 单元测试 | pytest + unittest.mock |
| 集成测试 | pytest + Testcontainers |
| API 测试 | httpx / requests |
| 架构测试 | import-linter |
| 覆盖率 | coverage.py / pytest-cov |
| 端到端 | Playwright / Selenium |

#### Go 项目
| 测试类型 | 工具/技术 |
|----------|----------|
| 单元测试 | testing + testify |
| 集成测试 | testcontainers-go |
| API 测试 | httptest |
| 架构测试 | go-arch-lint |
| 覆盖率 | go test -cover |
| 端到端 | Playwright |

## 测试数据管理策略

### 按测试层级划分

| 测试层级 | 数据来源 | 生命周期 | 隔离方式 |
|----------|---------|---------|---------|
| 单元测试 | 内存对象 / Mock | 随测试创建销毁 | 完全隔离 |
| 集成测试 | Testcontainers / 测试容器 | 每个测试类/套件 | 容器级别隔离 |
| 端到端测试 | 预置数据 + API 创建 | 每次运行前重置 | 环境级别隔离 |

### 最佳实践

1. **单元测试**：使用 Builder 模式或 Factory 构建测试数据，避免硬编码
2. **集成测试**：使用 Testcontainers 保证与生产环境的兼容性
3. **数据库迁移**：测试环境使用与生产相同的迁移脚本
4. **测试数据清理**：每个测试用例负责清理自己创建的数据

## 架构适应度函数

自动化测试来保护架构特性，确保架构规范不被违反。

### 依赖规则检查

确保分层架构的依赖方向正确：

```
core 层 ← 不依赖任何其他层（纯业务逻辑）
api 层 → 依赖 core 层接口
infrastructure 层 → 实现 core 层定义的接口
```

### 覆盖率阈值

建议的最低覆盖率：

| 模块类型 | 行覆盖率 | 分支覆盖率 |
|----------|---------|----------|
| core（核心业务） | ≥ 80% | ≥ 70% |
| api（接口层） | ≥ 60% | ≥ 50% |
| infrastructure（实现层） | ≥ 50% | ≥ 40% |
| 整体项目 | ≥ 70% | ≥ 60% |

### 常见架构适应度函数

1. **循环依赖检测**：禁止模块间循环依赖
2. **分层违规检测**：core 层不得导入框架特定包
3. **命名规范检查**：Controller/Service/Repository 命名一致性
4. **包边界检查**：模块间只通过公开接口通信

## 日志测试策略

### 日志输出验证

关键业务场景必须验证日志输出正确，包括：

1. **错误场景日志** — 验证异常发生时记录了 ERROR 级别日志且包含足够诊断信息
2. **审计事件日志** — 验证关键业务操作记录了 INFO 级别日志
3. **敏感信息排除** — 验证日志中不包含令牌、密码、密钥等敏感数据

### 按技术栈的日志测试工具

| 技术栈 | 日志测试方式 |
|--------|------------|
| Java/Kotlin | ListAppender (Logback) / OutputCaptureExtension (Spring Boot Test) |
| TypeScript/JavaScript | jest.spyOn(console) / pino-test / winston transport mock |
| Python | caplog fixture (pytest) / assertLogs (unittest) |
| Go | bytes.Buffer + custom writer / zap.NewDevelopment() observer |

### 日志测试示例模式

```
// 伪代码 — 按实际技术栈调整
test("should log error when external service fails") {
    // Arrange: set up log capture
    // Act: trigger the failure scenario
    // Assert: verify log output contains expected level, message, and correlation ID
    // Assert: verify log output does NOT contain sensitive data
}
```

## 测试目录结构参考

### 镜像法（推荐）

```
src/
  modules/
    order/
      core/
        OrderService.ts
      api/
        OrderController.ts
      infrastructure/
        OrderRepository.ts

tests/
  unit/
    modules/
      order/
        core/
          OrderService.test.ts
  integration/
    modules/
      order/
        api/
          OrderController.integration.test.ts
        infrastructure/
          OrderRepository.integration.test.ts
  e2e/
    order-flow.e2e.test.ts
```

### 就近法（可选）

```
src/
  modules/
    order/
      core/
        OrderService.ts
        __tests__/
          OrderService.test.ts
```
