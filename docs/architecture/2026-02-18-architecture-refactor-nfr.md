# Synapse Agent 架构模块化重构 — NFR 提取文档

## PRD Reference

`docs/requirements/2026-02-18-architecture-refactor-prd.md`

## NFR Summary Table

| NFR ID | Category | PRD Source | Requirement | Threshold | Affected Stack Layer | Technology Constraint |
|--------|----------|-----------|-------------|-----------|--------------------|-----------------------|
| NFR-001 | Performance | PRD §4.1 | EventStream 事件延迟 | < 1ms（本地） | Core 模块 | 轻量级事件分发，无序列化开销 |
| NFR-002 | Performance | PRD §4.1 | Agent Loop 启动时间 | < 100ms | Core、Provider | 延迟初始化，避免启动时加载所有 Provider |
| NFR-003 | Performance | PRD §4.1 | Provider 切换零开销 | 无状态设计 | Provider 模块 | Provider 实例无状态 |
| NFR-004 | Extensibility | PRD §1.2 G4, F-005 | 工具执行环境可插拔 | 接口抽象 | Tools 模块 | Operations 接口 + 依赖注入 |
| NFR-005 | Extensibility | PRD §1.2 G2, F-003 | 多 Provider 无缝切换 | 支持 3 家 Provider | Provider 模块 | 统一 LLM 抽象层 + 各 Provider SDK |
| NFR-006 | Modularity | PRD §4.3, F-008 | 模块边界严格隔离 | 无跨模块内部引用 | 全局 | 目录级模块化 + index.ts 导出边界 |
| NFR-007 | Testability | PRD §4.3, F-002 | Agent Core 可 Mock 测试 | 覆盖率 > 80% | Core、Test | 依赖注入，Mock 友好接口 |
| NFR-008 | Maintainability | PRD 约束 NFR-004 | 代码规模控制 | 模块 < 5000 行，文件 < 500 行 | 全局 | 单一职责，函数拆分 |
| NFR-009 | Security | PRD §4.2 | API Key 隔离 | Key 不暴露给 Core/Tools | Provider 模块 | Key 仅在 Provider 实现内部使用 |
| NFR-010 | Compatibility | PRD §4.4 | 运行时兼容 | Bun >= 1.0, TS >= 5.0, Node >= 18 | 全局 | 避免 Bun-only API，优先使用标准 API |
| NFR-011 | Reliability | PRD F-001 | EventStream 背压处理 | 缓冲区满时暂停生成 | Core 模块 | AsyncIterable + 背压机制 |
| NFR-012 | Usability | PRD §4.3 | 新增 Provider 简单 | 只需实现接口 + 注册 | Provider 模块 | 清晰的 Provider 接口定义 |

## NFR 到技术栈映射

### Performance NFRs → 技术约束
- NFR-001/002/003 → Bun 高性能运行时 + TypeScript AsyncIterable + 延迟初始化模式

### Extensibility NFRs → 技术约束
- NFR-004 → TypeScript 接口抽象（FileOperations/BashOperations）+ 依赖注入
- NFR-005 → 各家官方 SDK（@anthropic-ai/sdk + openai + @google/genai）+ 自建统一层

### Modularity NFRs → 技术约束
- NFR-006 → 目录级模块化 + index.ts 导出边界 + 架构测试

### Testability NFRs → 技术约束
- NFR-007 → Bun Test + Mock Provider/Tools + 依赖注入

### Security NFRs → 技术约束
- NFR-009 → API Key 仅在 Provider 实现文件中引用，不传递给 Agent Core

### Compatibility NFRs → 技术约束
- NFR-010 → 优先使用标准 Web API（fetch, AbortSignal, AsyncIterable），避免 Bun-only API
