# Synapse Agent Phase 2 E2E 手动测试指南

**版本**: v1.1
**日期**: 2026-01-27
**状态**: 可用于验收测试
**更新说明**: 新增 SkillSubAgent 重构相关测试（AgentRunner、Meta Skill Type、完整 Agent Loop）

---

## 目录

1. [环境准备](#1-环境准备)
2. [元技能自动安装测试](#2-元技能自动安装测试)
3. [元技能 Type 字段测试](#3-元技能-type-字段测试) ⭐ 新增
4. [技能列表命令测试](#4-技能列表命令测试)
5. [技能搜索命令测试](#5-技能搜索命令测试)
6. [技能加载命令测试](#6-技能加载命令测试)
7. [技能强化命令测试](#7-技能强化命令测试)
8. [技能评估命令测试](#8-技能评估命令测试) ⭐ 新增
9. [自动强化功能测试](#9-自动强化功能测试)
10. [设置持久化测试](#10-设置持久化测试)
11. [Skill 子 Agent 测试](#11-skill-子-agent-测试)
12. [AgentRunner 集成测试](#12-agentrunner-集成测试) ⭐ 新增
13. [验收清单](#13-验收清单)

---

## 1. 环境准备

### 1.1 前置条件

确保已完成 Phase 1 的环境配置：

```bash
# 检查项目目录
cd /Users/wuwenjun/WebstormProjects/Synapse-Agent

# 确保依赖已安装
bun install

# 确保环境变量已配置
cat .env
# 应包含 ANTHROPIC_API_KEY 等配置
```

### 1.2 运行单元测试验证基础功能

```bash
# 运行 agent 模块的所有单元测试
bun test tests/unit/agent/

# 预期输出：47 pass, 0 fail
```

**验证结果**:
- [x] 所有单元测试通过

### 1.3 清理旧的元技能（可选）

为了测试元技能自动安装功能，可以先删除已有的元技能：

```bash
# 备份现有技能（可选）
cp -r ~/.synapse/skills ~/.synapse/skills.bak

# 删除元技能以测试自动安装
rm -rf ~/.synapse/skills/skill-creator
rm -rf ~/.synapse/skills/enhancing-skills
rm -rf ~/.synapse/skills/evaluating-skills
```

**验证结果**:
- [x] 元技能目录已删除

---

## 2. 元技能自动安装测试

### 2.1 启动 Agent 触发自动安装

```bash
bun run chat
```

**预期行为**:
- 启动时自动检测并安装缺失的元技能
- 日志显示 "Installed X meta skill(s)"

### 2.2 验证元技能已安装

```bash
# 在另一个终端检查
ls -la ~/.synapse/skills/
```

**预期输出**: 应包含以下目录：
- `skill-creator/`
- `enhancing-skills/`
- `evaluating-skills/`

```bash
# 验证每个技能都有 SKILL.md
cat ~/.synapse/skills/skill-creator/SKILL.md | head -20
cat ~/.synapse/skills/enhancing-skills/SKILL.md | head -20
cat ~/.synapse/skills/evaluating-skills/SKILL.md | head -20
```

**验证结果**:
- [x] skill-creator 已安装
- [x] enhancing-skills 已安装
- [x] evaluating-skills 已安装
- [x] 每个技能都有 SKILL.md 文件

### 2.3 验证不覆盖现有技能

```bash
# 在某个元技能中添加自定义内容
echo "# Custom content" >> ~/.synapse/skills/skill-creator/custom.md

# 重启 Agent
bun run chat
# 然后退出
/exit

# 验证自定义内容仍然存在
cat ~/.synapse/skills/skill-creator/custom.md
```

**预期输出**: `# Custom content`

**验证结果**:
- [x] 自定义内容未被覆盖

---

## 3. 元技能 Type 字段测试 ⭐ 新增

此测试验证 SkillSubAgent 重构中新增的 `type: meta` 字段解析功能。

### 3.1 验证元技能包含 type: meta 字段

```bash
# 检查 skill-creator 的 frontmatter
head -10 ~/.synapse/skills/skill-creator/SKILL.md
```

**预期输出**:
```yaml
---
name: skill-creator
description: Guide for creating effective skills...
type: meta
---
```

```bash
# 检查 enhancing-skills 的 frontmatter
head -10 ~/.synapse/skills/enhancing-skills/SKILL.md
```

**预期输出**:
```yaml
---
name: enhancing-skills
description: Guide for enhancing and improving existing skills...
type: meta
---
```

```bash
# 检查 evaluating-skills 的 frontmatter
head -10 ~/.synapse/skills/evaluating-skills/SKILL.md
```

**预期输出**:
```yaml
---
name: evaluating-skills
description: Guide for evaluating and quality assessment of skills...
type: meta
---
```

**验证结果**:
- [x] skill-creator 包含 `type: meta`
- [x] enhancing-skills 包含 `type: meta`
- [x] evaluating-skills 包含 `type: meta`

### 3.2 验证普通技能没有 type 字段

```bash
# 如果有其他普通技能，检查它们没有 type: meta
# 或者创建一个测试技能
mkdir -p ~/.synapse/skills/test-regular-skill
cat > ~/.synapse/skills/test-regular-skill/SKILL.md << 'EOF'
---
name: test-regular-skill
description: A regular skill for testing
---

# Test Regular Skill

This is a regular skill without type: meta.
EOF

# 在 REPL 中加载并验证
bun run chat
```

在 REPL 中：
```
You (1)> skill list
```

**预期输出**:
- 列表中应包含 test-regular-skill
- 元技能和普通技能都应正常显示

**验证结果**:
- [x] 普通技能正确加载
- [x] 元技能和普通技能在列表中都可见

### 3.3 验证 SkillMemoryStore 的 isMetaSkill 功能

此功能通过单元测试验证：

```bash
bun test tests/unit/agent/skill-memory-store.test.ts -t "isMetaSkill"
```

**预期输出**:
```
✓ should return true for meta skills
✓ should return false for regular skills
✓ should return false for non-existent skills
```

**验证结果**:
- [x] isMetaSkill 测试全部通过

### 3.4 验证 getMetaSkillContents 功能

此功能通过单元测试验证：

```bash
bun test tests/unit/agent/skill-memory-store.test.ts -t "getMetaSkillContents"
```

**预期输出**:
```
✓ should return concatenated content of all meta skills
✓ should not include regular skills
✓ should return empty string when no meta skills exist
```

**验证结果**:
- [x] getMetaSkillContents 测试全部通过

---

## 4. 技能列表命令测试

### 4.1 基本列表命令

在 REPL 中：

```
You (1)> skill list
```

**预期输出**:
- 显示所有已安装技能的列表
- 包含技能名称和描述
- 至少包含三个元技能

**验证结果**:
- [x] 显示技能列表
- [x] 包含 skill-creator
- [x] 包含 enhancing-skills
- [x] 包含 evaluating-skills

### 4.2 通过 Agent 请求列出技能

```
You (2)> 请列出所有可用的技能
```

**预期行为**:
- Agent 调用 skill list 命令
- 返回技能列表摘要

**验证结果**:
- [x] Agent 正确调用命令
- [x] 返回技能信息

---

## 5. 技能搜索命令测试

### 5.1 语义搜索（通过 SkillSubAgent）

```
You (1)> skill search "创建新技能"
```

**预期输出**:
- 返回与"创建"相关的技能
- 应包含 skill-creator
- 日志显示 `[DEBUG] [skill-command-handler] Using LLM semantic search`（语义搜索模式）

**验证结果**:
- [x] 搜索成功返回结果
- [x] 结果包含相关技能
- [x] 日志确认使用了 LLM 语义搜索

### 5.2 本地关键词搜索（searchLocal）

SkillSubAgent 新增了 `searchLocal` 方法用于同步关键词搜索。此功能主要在代码内部使用，可通过单元测试验证：

```bash
# 验证 searchLocal 功能存在
grep -n "searchLocal" src/agent/skill-sub-agent.ts
```

**预期输出**: 应显示 `searchLocal` 方法定义

**验证结果**:
- [x] searchLocal 方法存在

### 5.3 无结果搜索

```
You (2)> skill search "不存在的技能xyz123"
```

**预期输出**:
- 提示未找到匹配的技能

**验证结果**:
- [x] 正确处理无结果情况

---

## 6. 技能加载命令测试

### 6.1 加载单个技能

```
You (1)> skill load skill-creator
```

**预期输出**:
- 显示 skill-creator 的完整内容
- 包含 SKILL.md 的正文
- 格式为 `# Skill: skill-creator\n\n[body content]`

**验证结果**:
- [x] 技能内容正确加载
- [x] 显示技能定义
- [x] 格式正确

### 6.2 加载不存在的技能

```
You (2)> skill load nonexistent-skill
```

**预期输出**:
- 错误提示：技能不存在

**验证结果**:
- [x] 正确处理错误情况

### 6.3 通过 Agent 加载技能

```
You (3)> 请加载 enhancing-skills 技能，我想了解如何强化技能
```

**预期行为**:
- Agent 调用 skill load 命令
- 返回技能内容摘要

**验证结果**:
- [x] Agent 正确加载技能
- [x] 返回有用的信息

---

## 7. 技能强化命令测试

### 7.1 查看强化状态

```
You (1)> /skill enhance
```

**预期输出**:
- 显示当前自动强化是否启用
- 显示相关配置

**验证结果**:
- [x] 显示状态信息

### 7.2 启用自动强化

```
You (2)> /skill enhance --on
```

**预期输出**:
- 确认自动强化已启用

**验证**:
```bash
# 在另一个终端检查设置文件
cat ~/.synapse/settings.json
```

**预期**: `"autoEnhance": true`

**验证结果**:
- [x] 命令执行成功
- [x] 设置已持久化

### 7.3 禁用自动强化

```
You (3)> skill enhance --off
```

**预期输出**:
- 确认自动强化已禁用

**验证**:
```bash
cat ~/.synapse/settings.json
```

**预期**: `"autoEnhance": false`

**验证结果**:
- [x] 命令执行成功
- [x] 设置已持久化

### 7.4 手动触发强化（需要对话文件）⭐ 重要：验证 AgentRunner 集成

此测试验证 SkillSubAgent 使用 AgentRunner 进行完整 Agent Loop 的能力。

首先创建一个测试对话文件：

```bash
# 创建测试对话目录
mkdir -p ~/.synapse/conversations

# 创建测试对话文件（包含多个工具调用以触发强化）
cat > ~/.synapse/conversations/test-conversation.jsonl << 'EOF'
{"role":"user","content":"请帮我分析这个Python文件"}
{"role":"assistant","content":"好的，让我使用read工具读取文件","tool_use":{"name":"bash","input":{"command":"cat src/main.py"}}}
{"role":"tool","content":"def main():\n    print('Hello World')","tool_use_id":"123"}
{"role":"assistant","content":"这是一个Python模块，主要功能是打印Hello World"}
{"role":"user","content":"请帮我优化这段代码"}
{"role":"assistant","content":"我来使用edit工具进行优化","tool_use":{"name":"bash","input":{"command":"sed -i 's/Hello World/Hello, World!/g' src/main.py"}}}
{"role":"tool","content":"File updated successfully","tool_use_id":"124"}
{"role":"assistant","content":"代码已优化完成"}
{"role":"user","content":"请运行测试"}
{"role":"assistant","content":"运行测试中","tool_use":{"name":"bash","input":{"command":"python -m pytest tests/"}}}
{"role":"tool","content":"All tests passed","tool_use_id":"125"}
EOF
```

然后在 REPL 中：

```
You (4)> /skill enhance --conversation ~/.synapse/conversations/test-conversation.jsonl
```

**预期输出**:
- 显示 "Triggering manual enhance from: ..."
- SkillSubAgent 使用 AgentRunner 执行 Agent Loop
- 分析对话内容
- 返回 JSON 格式的结果，包含：
  - `action`: "created" | "enhanced" | "none"
  - `skillName`: 技能名称（如果创建或强化）
  - `message`: 描述信息

**验证日志**:
```bash
# 检查 agent-runner 和 skill-sub-agent 的日志
grep -E "(agent-runner|skill-sub-agent)" ~/.synapse/logs/*.log | tail -30
```

**预期日志内容**:
- `[agent-runner] Agent loop iteration 1`
- `[skill-sub-agent] Skill Sub-Agent initialized`

**验证结果**:
- [x] 命令执行成功
- [x] 返回分析结果（JSON 格式）
- [x] 日志显示 AgentRunner 执行 Agent Loop
- [x] SkillSubAgent 在 silent 模式下运行（无输出到控制台）

---

## 8. 技能评估命令测试 ⭐ 新增

此测试验证 SkillSubAgent 新增的 `evaluate` 方法。

### 8.1 评估技能质量

在代码中，SkillSubAgent 提供了 `evaluate` 方法。可通过以下方式间接测试：

```
You (1)> 请评估 skill-creator 技能的质量
```

**预期行为**:
- Agent 理解请求并尝试评估技能
- 可能加载 evaluating-skills 元技能作为指导
- 返回评估结果

**预期输出格式**（如果直接调用 `evaluate` 方法）:
```json
{
  "action": "evaluated",
  "skillName": "skill-creator",
  "message": "Skill evaluation completed",
  "scores": {
    "clarity": 8,
    "completeness": 7,
    "usability": 9,
    "accuracy": 8,
    "efficiency": 7
  },
  "overallScore": 7.8
}
```

**验证结果**:
- [ ] 评估请求被正确处理
- [ ] 返回有意义的评估信息

### 8.2 验证 SkillEvaluateResult 类型定义

```bash
# 检查类型定义
grep -A 15 "SkillEvaluateResult" src/agent/skill-sub-agent-types.ts
```

**预期输出**:
```typescript
export const SkillEvaluateResultSchema = z.object({
  action: z.enum(['evaluated', 'none']),
  skillName: z.string().optional(),
  message: z.string(),
  scores: z.object({
    clarity: z.number(),
    completeness: z.number(),
    usability: z.number(),
    accuracy: z.number(),
    efficiency: z.number(),
  }).optional(),
  overallScore: z.number().optional(),
});
```

**验证结果**:
- [x] SkillEvaluateResult 类型定义完整

---

## 9. 自动强化功能测试

### 9.1 启用自动强化后的行为

```
You (1)> skill enhance --on
```

然后进行一些工具调用：

```
You (2)> 请读取 README.md 文件

You (3)> 请在 src 目录中搜索 "BashRouter"

You (4)> 请查看 git 状态
```

**预期行为**:
- 自动强化在后台记录工具使用模式
- 可能生成强化建议

**验证结果**:
- [ ] 自动强化正常运行
- [ ] 不影响正常操作

### 9.2 检查强化日志

```bash
# 检查日志中的强化相关记录
grep -i "enhance" ~/.synapse/logs/agent.log | tail -20
```

**预期输出**:
- 包含强化相关的日志记录

**验证结果**:
- [ ] 日志记录正常

---

## 10. 设置持久化测试

### 10.1 验证设置文件创建

```bash
cat ~/.synapse/settings.json
```

**预期输出**:
```json
{
  "version": "1.0.0",
  "skillEnhance": {
    "autoEnhance": false,
    "maxEnhanceContextTokens": 8000
  }
}
```

**验证结果**:
- [x] 设置文件存在
- [x] 格式正确

### 10.2 设置跨会话持久化

```
You (1)> skill enhance --on
You (2)> /exit
```

重新启动：

```bash
bun run chat
```

```
You (1)> skill enhance --status
```

**预期输出**:
- 自动强化仍然是启用状态

**验证结果**:
- [x] 设置跨会话保持

### 10.3 损坏设置文件恢复

```bash
# 损坏设置文件
echo "invalid json" > ~/.synapse/settings.json

# 重启 Agent
bun run chat
```

**预期行为**:
- Agent 正常启动
- 使用默认设置
- 警告日志记录

```
You (1)> skill enhance --status
```

**预期输出**:
- 显示默认状态（禁用）

**验证结果**:
- [ ] 从损坏文件恢复
- [ ] 使用默认值

---

## 11. Skill 子 Agent 测试

### 11.1 验证技能搜索智能匹配

```
You (1)> 我想创建一个新技能，应该怎么做？
```

**预期行为**:
- Skill 子 Agent 搜索相关技能
- 推荐 skill-creator 技能
- 提供创建指导

**验证结果**:
- [ ] 智能推荐相关技能
- [ ] 提供有用的指导

### 11.2 验证技能内容理解

```
You (2)> 请按照 skill-creator 技能的指导，帮我规划一个"代码审查"技能的结构
```

**预期行为**:
- Agent 加载 skill-creator 技能
- 按照技能指导生成结构

**验证结果**:
- [ ] 正确理解技能内容
- [ ] 生成合理的结构

### 11.3 多技能协作

```
You (3)> 请先评估现有技能的质量，然后告诉我如何改进
```

**预期行为**:
- 可能使用 evaluating-skills 评估
- 可能使用 enhancing-skills 提供改进建议

**验证结果**:
- [ ] 能够协调使用多个技能

### 11.4 验证 SkillSubAgent 生命周期方法 ⭐ 新增

SkillSubAgent 新增了以下生命周期方法：

```bash
# 检查方法存在性
grep -E "(isRunning|shutdown|isInitialized|getSkillCount)" src/agent/skill-sub-agent.ts
```

**预期输出**: 显示这些方法的定义

**验证结果**:
- [ ] `isRunning()` 方法存在
- [ ] `shutdown()` 方法存在
- [ ] `isInitialized()` 方法存在
- [ ] `getSkillCount()` 方法存在

---

## 12. AgentRunner 集成测试 ⭐ 新增

此部分验证从 repl.ts 提取的 AgentRunner 模块功能。

### 12.1 验证 AgentRunner 单元测试

```bash
bun test tests/unit/agent/agent-runner.test.ts
```

**预期输出**:
```
✓ should create AgentRunner with streaming mode
✓ should create AgentRunner with silent mode
✓ should expose getLlmClient and getToolExecutor
✓ should process user message and return response (no tools)
✓ should execute tools when LLM returns tool calls
✓ should call onText callback in streaming mode
✓ should not call onText callback in silent mode
```

**验证结果**:
- [ ] 所有 AgentRunner 测试通过

### 12.2 验证 AgentRunner 在 REPL 中的使用

```bash
# 验证 repl.ts 导入了 AgentRunner
grep "AgentRunner" src/cli/repl.ts | head -5
```

**预期输出**:
```
import { AgentRunner } from '../agent/agent-runner.ts';
...
agentRunner = new AgentRunner({
```

**验证结果**:
- [ ] repl.ts 正确导入 AgentRunner

### 12.3 验证 AgentRunner 导出

```bash
# 验证 agent/index.ts 导出了 AgentRunner
grep "AgentRunner" src/agent/index.ts
```

**预期输出**:
```typescript
export {
  AgentRunner,
  type AgentRunnerOptions,
  type OutputMode,
  type AgentRunnerLlmClient,
  type AgentRunnerToolExecutor,
} from './agent-runner.ts';
```

**验证结果**:
- [ ] AgentRunner 正确导出

### 12.4 验证 SkillSubAgent 使用 AgentRunner

```bash
# 验证 SkillSubAgent 创建 AgentRunner
grep -A 10 "this.agentRunner = new AgentRunner" src/agent/skill-sub-agent.ts
```

**预期输出**:
```typescript
this.agentRunner = new AgentRunner({
  llmClient: options.llmClient,
  contextManager: this.contextManager,
  toolExecutor: options.toolExecutor,
  systemPrompt,
  tools: [BashToolSchema],
  outputMode: 'silent',
});
```

**验证结果**:
- [ ] SkillSubAgent 正确创建 AgentRunner
- [ ] 使用 `silent` 输出模式

### 12.5 验证 SkillSubAgent 系统提示词结构

```bash
# 验证提示词包含 4 节结构
grep -E "## [0-9]+\." src/agent/skill-sub-agent-prompt.ts
```

**预期输出**:
```
## 1. Your Role
## 2. Tools
## 3. Meta Skills (Full Content)
## 4. Available Skills (Metadata)
```

**验证结果**:
- [ ] 系统提示词包含 4 节结构
- [ ] 顺序正确：Role → Tools → Meta Skills → Available Skills

### 12.6 验证 SkillSubAgentOptions 后向兼容性

SkillSubAgent 的 `llmClient` 和 `toolExecutor` 参数现在是可选的：

```bash
# 检查接口定义
grep -A 10 "interface SkillSubAgentOptions" src/agent/skill-sub-agent.ts
```

**预期输出**:
```typescript
export interface SkillSubAgentOptions {
  /** Skills directory path */
  skillsDir?: string;
  /** LLM client (optional - required for LLM-based operations) */
  llmClient?: AgentRunnerLlmClient;
  /** Tool executor (optional - required for LLM-based operations) */
  toolExecutor?: AgentRunnerToolExecutor;
}
```

**验证结果**:
- [ ] llmClient 是可选参数
- [ ] toolExecutor 是可选参数

### 12.7 E2E 测试：完整 Agent Loop

在 REPL 中执行多轮对话，验证 AgentRunner 的 Agent Loop 正常工作：

```
You (1)> 请帮我创建一个名为 test-skill 的目录，然后在里面创建一个 SKILL.md 文件

You (2)> 请读取刚才创建的文件内容

You (3)> 请删除这个测试目录
```

**预期行为**:
- 每个请求都触发 AgentRunner 的 run() 方法
- 工具调用正常执行
- 输出以 streaming 模式显示

**验证日志**:
```bash
grep "Agent loop iteration" ~/.synapse/logs/*.log | tail -10
```

**预期输出**: 多个 "Agent loop iteration" 日志条目

**验证结果**:
- [ ] Agent Loop 正常执行
- [ ] 工具调用成功
- [ ] Streaming 输出正常

---

## 13. 验收清单

根据 Phase 2 PRD 和 SkillSubAgent 重构验证标准，完成以下清单：

### 技能管理命令

| 验证项 | 状态 | 备注 |
|--------|------|------|
| `skill list` 列出所有技能 | ☐ | |
| `skill search <query>` 搜索技能 | ☐ | |
| `skill load <name>` 加载技能 | ☐ | |
| `skill enhance --on` 启用自动强化 | ☐ | |
| `skill enhance --off` 禁用自动强化 | ☐ | |
| `skill enhance --status` 查看状态 | ☐ | |
| `skill enhance --conversation <path>` 手动强化 | ☐ | |

### 元技能系统

| 验证项 | 状态 | 备注 |
|--------|------|------|
| skill-creator 元技能已安装 | ☐ | |
| enhancing-skills 元技能已安装 | ☐ | |
| evaluating-skills 元技能已安装 | ☐ | |
| 元技能自动安装不覆盖已有技能 | ☐ | |
| 元技能内容可被正确加载 | ☐ | |
| 元技能包含 `type: meta` 字段 | ☐ | ⭐ 新增 |

### 设置持久化

| 验证项 | 状态 | 备注 |
|--------|------|------|
| 设置文件正确创建 | ☐ | |
| 设置跨会话持久化 | ☐ | |
| 损坏设置文件能恢复 | ☐ | |

### Skill 子 Agent

| 验证项 | 状态 | 备注 |
|--------|------|------|
| 智能搜索匹配相关技能 | ☐ | |
| 正确理解和应用技能内容 | ☐ | |
| 多技能协作正常 | ☐ | |
| SkillSubAgent 使用 AgentRunner | ☐ | ⭐ 新增 |
| SkillSubAgent silent 模式工作正常 | ☐ | ⭐ 新增 |
| SkillSubAgent 生命周期方法可用 | ☐ | ⭐ 新增 |

### 自动强化

| 验证项 | 状态 | 备注 |
|--------|------|------|
| 启用/禁用状态正确切换 | ☐ | |
| 后台记录工具使用模式 | ☐ | |
| 不影响正常操作性能 | ☐ | |

### AgentRunner 模块 ⭐ 新增

| 验证项 | 状态 | 备注 |
|--------|------|------|
| AgentRunner 单元测试通过 | ☐ | |
| AgentRunner 正确导出 | ☐ | |
| repl.ts 使用 AgentRunner | ☐ | |
| streaming 模式工作正常 | ☐ | |
| silent 模式工作正常 | ☐ | |
| getLlmClient() 方法可用 | ☐ | |
| getToolExecutor() 方法可用 | ☐ | |
| getTools() 方法可用 | ☐ | |

### SkillMemoryStore 扩展 ⭐ 新增

| 验证项 | 状态 | 备注 |
|--------|------|------|
| type 字段解析正确 | ☐ | |
| getMetaSkillContents() 工作正常 | ☐ | |
| isMetaSkill() 工作正常 | ☐ | |

---

## 清理测试环境

测试完成后，清理测试文件：

```bash
# 删除测试对话文件
rm -f ~/.synapse/conversations/test-conversation.jsonl

# 删除测试技能
rm -rf ~/.synapse/skills/test-regular-skill

# 恢复备份的技能（如果有）
# rm -rf ~/.synapse/skills
# mv ~/.synapse/skills.bak ~/.synapse/skills

# 重置设置为默认值
rm -f ~/.synapse/settings.json
```

---

## 问题反馈

如果在测试过程中发现问题，请记录以下信息：

1. **测试步骤**: 执行的具体命令
2. **预期行为**: 应该发生什么
3. **实际行为**: 实际发生了什么
4. **错误信息**: 控制台输出的错误
5. **日志**: `~/.synapse/logs/agent.log` 相关内容
6. **设置文件**: `~/.synapse/settings.json` 内容

### 关键日志模块

针对本次重构，需要特别关注以下日志模块：

- `[agent-runner]` - AgentRunner 执行日志
- `[skill-sub-agent]` - SkillSubAgent 操作日志
- `[skill-memory-store]` - 技能加载和解析日志

```bash
# 查看相关日志
grep -E "(agent-runner|skill-sub-agent|skill-memory-store)" ~/.synapse/logs/*.log | tail -50
```

---

**文档版本**: 1.1
**最后更新**: 2026-01-27
**变更说明**:
- 新增 Section 3: 元技能 Type 字段测试
- 新增 Section 8: 技能评估命令测试
- 新增 Section 12: AgentRunner 集成测试
- 更新验收清单，添加 AgentRunner 和 SkillMemoryStore 相关项
- 更新 Section 7.4 手动强化测试，添加 AgentRunner 验证步骤
