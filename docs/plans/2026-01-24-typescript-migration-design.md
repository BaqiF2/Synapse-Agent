# SynapseAgent TypeScript 迁移设计文档

**版本**: v1.1
**日期**: 2026-01-24
**状态**: 设计完成（包含强制验证法则）
**迁移类型**: Python → TypeScript 完全重写

---

## ⚠️ 强制验证法则（MANDATORY VALIDATION RULES）

**本迁移计划的每个部分都必须遵循以下三步验证法则：**

### 验证三原则

1. **迁移前检查（Pre-Migration Check）**
   - 必须详细阅读对应的 Python 源码实现
   - 必须理解每个功能的设计意图和行为细节
   - 必须识别 Python 和 TypeScript 的语言差异点

2. **迁移后检查（Post-Migration Check）**
   - 必须逐项验证功能与 Python 版本的行为一致性
   - 必须确保所有字段名、接口、类型与 Python 版本对齐
   - 必须测试边界情况和错误处理的一致性

3. **PRD 符合性检查（PRD Compliance Check）**
   - 必须验证实现符合 [Synapse Agent PRD](./2026-01-22-synapse-agent-prd.md) 的核心理念
   - 必须确保支持 PRD 定义的所有核心使用场景
   - 必须满足 PRD 规定的非功能性需求

### 执行要求

- ✅ **每个实施阶段必须完成对应的验证清单**
- ✅ **未通过验证的阶段不得进入下一阶段**
- ✅ **所有验证结果必须有书面记录**
- ❌ **严禁跳过任何验证步骤**

---

## 文档结构

本迁移设计文档由以下部分组成，**每个部分都包含强制验证法则和详细检查清单**：

**📋 [验证清单汇总](./typescript-migration/00-validation-checklist.md)** - 所有验证点的快速参考和记录模板

1. [项目概述与迁移目标](./typescript-migration/01-overview.md) - 背景、目标、迁移范围
   - ✅ 包含迁移前/后检查清单、PRD 符合性验证

2. [技术栈选型](./typescript-migration/02-tech-stack.md) - 运行时、框架、依赖包选择
   - ✅ 包含依赖分析、API 兼容性、性能验证清单

3. [项目结构设计](./typescript-migration/03-project-structure.md) - 目录结构、模块划分
   - ✅ 包含目录对照、模块职责、可扩展性验证清单

4. [核心模块设计](./typescript-migration/04-core-modules.md) - Agent、LLM、配置管理
   - ✅ 包含主循环、工具调用、配置管理验证清单

5. [工具系统设计](./typescript-migration/05-tools-system.md) - 三层 Bash 架构、工具实现
   - ✅ 包含命令解析、工具执行、三层架构验证清单

6. [技能系统设计](./typescript-migration/06-skills-system.md) - 技能加载、索引管理
   - ✅ 包含加载机制、搜索功能、自我成长验证清单

7. [CLI 交互层设计](./typescript-migration/07-cli-layer.md) - 命令行接口、REPL
   - ✅ 包含命令行为、REPL 功能、输出格式验证清单

8. [实施计划](./typescript-migration/08-implementation-plan.md) - 开发步骤、验证方案
   - ✅ 包含完整的功能回归测试、性能对比、场景覆盖验证清单

**重要提示**：
- 每个子文档开头都有 ⚠️ 标记的强制验证法则部分，实施时必须严格遵循
- 📋 建议先阅读[验证清单汇总](./typescript-migration/00-validation-checklist.md)了解完整验证流程

---

## 快速导航

### 核心原则

1. **完全复刻 Python 版本功能** - 不添加、不删减、不修改
2. **保持架构一致性** - 三层 Bash 体系、唯一工具设计
3. **使用最新依赖** - 所有 npm 包使用 latest 版本
4. **类型安全优先** - 充分利用 TypeScript 类型系统
5. **对齐字段命名** - 所有接口、类型与 Python 版本一致

### 关键架构决策

- ✅ **运行时**: Bun（与 Kode-cli 保持一致）
- ✅ **LLM 提供商**: MiniMax API（通过 Anthropic SDK 兼容模式）
- ✅ **唯一工具**: LLM 只看到一个 `bash` 工具
- ✅ **命令路由**: BashRouter 解析命令字符串，路由到具体工具
- ✅ **参数传递**: 工具接收命名参数（kwargs），不是命令行数组
- ✅ **CLI 框架**: Commander.js + Ink (React for CLI)

### 重大修正

在设计过程中发现并修正的架构问题：

1. **工具接口设计错误** ❌ → ✅
   - 错误：工具接收 `args: string[]`，自己解析命令行
   - 正确：工具接收 `kwargs: Record<string, any>`，由 BashRouter 解析

2. **返回值类型错误** ❌ → ✅
   - 错误：工具返回 `Promise<string>`
   - 正确：工具返回 `Promise<ToolResult>`

3. **Help 实现错误** ❌ → ✅
   - 错误：每个工具自己实现 help 文本
   - 正确：BaseTool 提供统一 help 生成，基于 schema

---

## 变更记录

| 版本 | 日期 | 修改内容 | 修改人 |
|------|------|----------|--------|
| v1.1 | 2026-01-24 | 添加强制验证法则到所有文档，创建验证清单汇总 | Claude |
| v1.0 | 2026-01-24 | 初始版本，完成设计 | Claude |

---

**阅读指南**：
- 了解迁移背景：阅读第 1 部分
- 了解技术选型：阅读第 2 部分
- 了解代码结构：阅读第 3 部分
- 了解核心实现：阅读第 4-7 部分
- 了解实施步骤：阅读第 8 部分
