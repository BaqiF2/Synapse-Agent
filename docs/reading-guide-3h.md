# Synapse Agent 3 小时阅读指南

目标：在 3 小时内建立“系统全貌 + 关键调用链 + 核心模块边界”的认知，达到可定位问题、可做小改动的水平。

## 0. 阅读前准备（5 分钟）

先明确你要回答的 4 个问题：
1. 用户输入如何一路走到工具执行？
2. 三层工具体系如何分层与路由？
3. 技能系统如何加载/增强/持久化？
4. 会话、上下文、沙箱分别解决什么问题？

建议开 3 个窗口：
- 文档窗口（`README.md`、`docs/`）
- 主链路代码窗口（`src/cli`、`src/agent`、`src/tools`）
- 测试窗口（`tests/`）

---

## 1. 0:00-0:30 建立整体地图（30 分钟）

### 先读
- `/Users/wuwenjun/.codex/worktrees/bb5e/Synapse-Agent/README.md`
- `/Users/wuwenjun/.codex/worktrees/bb5e/Synapse-Agent/docs/SynapseAgent.md`
- `/Users/wuwenjun/.codex/worktrees/bb5e/Synapse-Agent/docs/plans/synapse-agent-prd/01-overview-and-requirements.md`

### 关注点
- 项目核心理念：统一 Bash 抽象、技能即成长载体
- 功能版图：REPL、三层工具、技能增强、子智能体、沙箱
- 用户操作入口与常用命令

### 产出（你自己写 5-8 行）
- “这个项目是做什么的”
- “为什么是 Bash 统一抽象”
- “核心模块有哪些”

---

## 2. 0:30-1:15 主调用链走读（45 分钟）

### 按顺序读（最重要）
- `/Users/wuwenjun/.codex/worktrees/bb5e/Synapse-Agent/src/cli/index.ts`
- `/Users/wuwenjun/.codex/worktrees/bb5e/Synapse-Agent/src/cli/repl.ts`
- `/Users/wuwenjun/.codex/worktrees/bb5e/Synapse-Agent/src/cli/repl-init.ts`
- `/Users/wuwenjun/.codex/worktrees/bb5e/Synapse-Agent/src/agent/agent-runner.ts`
- `/Users/wuwenjun/.codex/worktrees/bb5e/Synapse-Agent/src/agent/step.ts`
- `/Users/wuwenjun/.codex/worktrees/bb5e/Synapse-Agent/src/providers/generate.ts`
- `/Users/wuwenjun/.codex/worktrees/bb5e/Synapse-Agent/src/providers/anthropic/anthropic-client.ts`

### 你要画出的链路（手写即可）
`REPL 输入 -> AgentRunner.run -> step -> generate -> ToolCall -> Toolset.handle`

### 关注点
- 谁维护消息历史
- 谁决定继续循环/停止
- 工具调用结果如何回写消息流

---

## 3. 1:15-2:00 工具体系（45 分钟）

### 按层读
- 入口与路由
  - `/Users/wuwenjun/.codex/worktrees/bb5e/Synapse-Agent/src/tools/bash-tool.ts`
  - `/Users/wuwenjun/.codex/worktrees/bb5e/Synapse-Agent/src/tools/bash-router.ts`
  - `/Users/wuwenjun/.codex/worktrees/bb5e/Synapse-Agent/src/tools/toolset.ts`
- Layer 1（原生命令）
  - `/Users/wuwenjun/.codex/worktrees/bb5e/Synapse-Agent/src/tools/handlers/native-command-handler.ts`
- Layer 2（Agent Shell）
  - `/Users/wuwenjun/.codex/worktrees/bb5e/Synapse-Agent/src/tools/handlers/agent-bash/read.ts`
  - `/Users/wuwenjun/.codex/worktrees/bb5e/Synapse-Agent/src/tools/handlers/agent-bash/write.ts`
  - `/Users/wuwenjun/.codex/worktrees/bb5e/Synapse-Agent/src/tools/handlers/agent-bash/edit.ts`
- Layer 3（扩展）
  - `/Users/wuwenjun/.codex/worktrees/bb5e/Synapse-Agent/src/tools/handlers/extend-bash/mcp-command-handler.ts`
  - `/Users/wuwenjun/.codex/worktrees/bb5e/Synapse-Agent/src/tools/handlers/extend-bash/skill-tool-handler.ts`
  - `/Users/wuwenjun/.codex/worktrees/bb5e/Synapse-Agent/src/tools/handlers/task-command-handler.ts`

### 关注点
- BashRouter 如何识别命令归属层
- 每层的失败处理与返回结构
- `task:*` 如何进入子智能体

### 产出
- 一张“3 层工具 + 路由条件”小表格

---

## 4. 2:00-2:35 技能/钩子/子智能体（35 分钟）

### 先读模块 README（高效）
- `/Users/wuwenjun/.codex/worktrees/bb5e/Synapse-Agent/src/skills/README.md`
- `/Users/wuwenjun/.codex/worktrees/bb5e/Synapse-Agent/src/hooks/README.md`
- `/Users/wuwenjun/.codex/worktrees/bb5e/Synapse-Agent/src/sub-agents/README.md`

### 再读关键实现
- `/Users/wuwenjun/.codex/worktrees/bb5e/Synapse-Agent/src/skills/skill-manager.ts`
- `/Users/wuwenjun/.codex/worktrees/bb5e/Synapse-Agent/src/skills/skill-loader.ts`
- `/Users/wuwenjun/.codex/worktrees/bb5e/Synapse-Agent/src/hooks/skill-enhance-hook.ts`
- `/Users/wuwenjun/.codex/worktrees/bb5e/Synapse-Agent/src/sub-agents/sub-agent-manager.ts`

### 关注点
- 技能的来源、索引、安装和加载路径
- 停止钩子在主流程中的触发点
- 子智能体与主智能体边界

---

## 5. 2:35-3:00 状态管理与测试（25 分钟）

### 状态与配置
- `/Users/wuwenjun/.codex/worktrees/bb5e/Synapse-Agent/src/agent/session.ts`
- `/Users/wuwenjun/.codex/worktrees/bb5e/Synapse-Agent/src/agent/context-orchestrator.ts`
- `/Users/wuwenjun/.codex/worktrees/bb5e/Synapse-Agent/src/config/settings-manager.ts`
- `/Users/wuwenjun/.codex/worktrees/bb5e/Synapse-Agent/src/sandbox/sandbox-manager.ts`

### 用测试反推真实行为
- `/Users/wuwenjun/.codex/worktrees/bb5e/Synapse-Agent/tests/unit/agent/step.test.ts`
- `/Users/wuwenjun/.codex/worktrees/bb5e/Synapse-Agent/tests/unit/agent/agent-runner.test.ts`
- `/Users/wuwenjun/.codex/worktrees/bb5e/Synapse-Agent/tests/e2e/cli-repl.test.ts`
- `/Users/wuwenjun/.codex/worktrees/bb5e/Synapse-Agent/docs/testing/test-guide.md`

### 关注点
- 会话持久化模型
- 上下文压缩/offload 触发条件
- E2E 如何覆盖主链路

---

## 3 小时结束时的验收标准

你应该能直接回答：
1. 一次用户输入从哪开始，到哪结束？
2. 为什么项目用“单 Bash 工具 + 内部路由”而不是多工具暴露？
3. `task:*`、`mcp:*`、`skill:*` 分别如何落地执行？
4. 会话与上下文是怎么保存/压缩的？
5. 技能增强何时触发、产物存在哪里？
6. 出现工具失败时在哪些模块排查？

如果以上 6 个问题你能在 5 分钟内讲清楚，就算“整体认识”达标。

---

## 附：阅读时的高效命令

```bash
# 看顶层结构
find src -maxdepth 2 -type d | sort

# 看核心导出
rg "^export" src/agent src/tools src/skills src/hooks src/sub-agents

# 快速定位主流程调用
rg "run\(|step\(|generate\(|route\(" src/cli src/agent src/providers src/tools

# 看测试如何验证主链路
rg "describe\(|it\(" tests/unit/agent tests/e2e
```

