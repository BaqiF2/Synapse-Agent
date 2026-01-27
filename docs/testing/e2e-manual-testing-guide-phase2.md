# Synapse Agent Phase 2 E2E 手动测试指南

**版本**: v1.0
**日期**: 2026-01-27
**状态**: 可用于验收测试

---

## 目录

1. [环境准备](#1-环境准备)
2. [元技能自动安装测试](#2-元技能自动安装测试)
3. [技能列表命令测试](#3-技能列表命令测试)
4. [技能搜索命令测试](#4-技能搜索命令测试)
5. [技能加载命令测试](#5-技能加载命令测试)
6. [技能强化命令测试](#6-技能强化命令测试)
7. [自动强化功能测试](#7-自动强化功能测试)
8. [设置持久化测试](#8-设置持久化测试)
9. [Skill 子 Agent 测试](#9-skill-子-agent-测试)
10. [验收清单](#10-验收清单)

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

### 1.2 清理旧的元技能（可选）

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

## 3. 技能列表命令测试

### 3.1 基本列表命令

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

### 3.2 通过 Agent 请求列出技能

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

## 4. 技能搜索命令测试

### 4.1 关键词搜索

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
- [x] 日志确认使用了 LLM 语义搜索（而非关键词匹配）

### 4.2 无结果搜索

```
You (2)> skill search "不存在的技能xyz123"
```

**预期输出**:
- 提示未找到匹配的技能

**验证结果**:
- [x] 正确处理无结果情况

---

## 5. 技能加载命令测试

### 5.1 加载单个技能

```
You (1)> skill load skill-creator
```

**预期输出**:
- 显示 skill-creator 的完整内容
- 包含 SKILL.md 的正文

**验证结果**:
- [x] 技能内容正确加载
- [x] 显示技能定义

### 5.2 加载不存在的技能

```
You (2)> skill load nonexistent-skill
```

**预期输出**:
- 错误提示：技能不存在

**验证结果**:
- [x] 正确处理错误情况

### 5.3 通过 Agent 加载技能

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

## 6. 技能强化命令测试

### 6.1 查看强化状态

```
You (1)> skill enhance --status
```

**预期输出**:
- 显示当前自动强化是否启用
- 显示相关配置

**验证结果**:
- [x] 显示状态信息

### 6.2 启用自动强化

```
You (2)> skill enhance --on
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

### 6.3 禁用自动强化

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

### 6.4 手动触发强化（需要对话文件）

首先创建一个测试对话文件：

```bash
# 创建测试对话目录
mkdir -p ~/.synapse/conversations

# 创建测试对话文件
cat > ~/.synapse/conversations/test-conversation.jsonl << 'EOF'
{"role":"user","content":"请帮我分析这个Python文件"}
{"role":"assistant","content":"好的，让我使用read工具读取文件","tool_use":{"name":"bash","input":{"command":"read src/main.py"}}}
{"role":"tool","content":"文件内容...","tool_use_id":"123"}
{"role":"assistant","content":"这是一个Python模块，主要功能是..."}
{"role":"user","content":"请帮我优化这段代码"}
{"role":"assistant","content":"我来使用edit工具进行优化","tool_use":{"name":"bash","input":{"command":"edit src/main.py \"old\" \"new\""}}}
EOF
```

然后在 REPL 中：

```
You (4)> /skill enhance --conversation ~/.synapse/conversations/test-conversation.jsonl
```

**预期输出**:
- 分析对话内容
- 返回强化建议或结果

**验证结果**:
- [ ] 命令执行成功
- [ ] 返回分析结果

---

## 7. 自动强化功能测试

### 7.1 启用自动强化后的行为

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

### 7.2 检查强化日志

```bash
# 检查日志中的强化相关记录
grep -i "enhance" ~/.synapse/logs/agent.log | tail -20
```

**预期输出**:
- 包含强化相关的日志记录

**验证结果**:
- [ ] 日志记录正常

---

## 8. 设置持久化测试

### 8.1 验证设置文件创建

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
- [ ] 设置文件存在
- [ ] 格式正确

### 8.2 设置跨会话持久化

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
- [ ] 设置跨会话保持

### 8.3 损坏设置文件恢复

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

## 9. Skill 子 Agent 测试

### 9.1 验证技能搜索智能匹配

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

### 9.2 验证技能内容理解

```
You (2)> 请按照 skill-creator 技能的指导，帮我规划一个"代码审查"技能的结构
```

**预期行为**:
- Agent 加载 skill-creator 技能
- 按照技能指导生成结构

**验证结果**:
- [ ] 正确理解技能内容
- [ ] 生成合理的结构

### 9.3 多技能协作

```
You (3)> 请先评估现有技能的质量，然后告诉我如何改进
```

**预期行为**:
- 可能使用 evaluating-skills 评估
- 可能使用 enhancing-skills 提供改进建议

**验证结果**:
- [ ] 能够协调使用多个技能

---

## 10. 验收清单

根据 Phase 2 PRD 验证标准，完成以下清单：

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

### 自动强化

| 验证项 | 状态 | 备注 |
|--------|------|------|
| 启用/禁用状态正确切换 | ☐ | |
| 后台记录工具使用模式 | ☐ | |
| 不影响正常操作性能 | ☐ | |

---

## 清理测试环境

测试完成后，清理测试文件：

```bash
# 删除测试对话文件
rm -f ~/.synapse/conversations/test-conversation.jsonl

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

---

**文档版本**: 1.0
**最后更新**: 2026-01-27
