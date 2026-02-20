# ADR-008: 架构适应度函数 — dependency-cruiser

## 状态

ACCEPTED

## 日期

2026-02-18

## 上下文

PRD F-008 要求严格的模块导出边界和依赖方向规则。需要自动化工具在 CI 中强制执行这些规则，防止架构腐化。

## 决策

采用 **dependency-cruiser** 作为架构适应度函数的核心工具，用于检查：
- 模块间依赖方向
- 禁止深层导入（非 index.ts 文件）
- 循环依赖检测

## 理由

### 备选方案

| 方案 | 优势 | 劣势 |
|------|------|------|
| eslint-plugin-import | ESLint 生态集成、配置简单 | 规则表达力有限，无法精确匹配模块路径模式 |
| 手写脚本 | 完全自定义 | 维护成本高、边界情况多 |
| **dependency-cruiser (选定)** | 强大的规则 DSL、支持可视化、TypeScript 原生支持 | 额外依赖 |

dependency-cruiser 提供专业级的依赖分析和规则定义能力，与 TypeScript 项目深度集成。

## 后果

### 正面影响

- 架构规则自动化检查，防止违反依赖方向
- 支持 CI 集成，作为质量门禁
- 可生成依赖关系图（辅助架构审查）

### 负面影响

- 新增 devDependency（仅影响开发/CI 环境）
- 需要编写和维护规则配置文件

### 对测试的影响

- dependency-cruiser 测试作为独立的架构测试阶段在 CI 中运行
- 不影响业务单元测试和集成测试

## 参考

- [dependency-cruiser 官方文档](https://github.com/sverweij/dependency-cruiser)
- 测试架构参考：`references/test-architecture-guide.md`
