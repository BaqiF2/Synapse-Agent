# Batch 8: 文档更新

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 更新项目文档，添加技能系统使用说明，确保 PRD 可交付成果完整覆盖。

**Scope:** README.md 更新、技能系统使用文档

**Tech Stack:** Markdown

---

## Task 1: 更新项目 README.md

**Files:**
- Modify: `README.md`

**Step 1: 在 README.md 中添加技能系统章节**

在 README.md 的适当位置添加以下内容：

```markdown
## 技能系统

Synapse Agent 支持可扩展的技能系统，允许 Agent 学习和复用知识。

### 技能管理命令

```bash
# 列出所有可用技能
skill list

# 搜索技能
skill search "代码分析"

# 加载技能到上下文
skill load <skill-name>

# 启用自动技能强化
skill enhance --on

# 禁用自动技能强化
skill enhance --off

# 手动触发技能强化
skill enhance --conversation <path>
```

### 技能目录结构

技能存储在 `~/.synapse/skills/` 目录下：

```
~/.synapse/skills/
├── <skill-name>/
│   ├── SKILL.md           # 技能定义（必需）
│   ├── references/        # 参考文档（可选）
│   │   └── *.md
│   └── scripts/           # 可执行脚本（可选）
│       └── *.py|*.ts|*.sh
└── index.json             # 技能索引
```

### SKILL.md 格式

```markdown
---
name: skill-name
description: 技能描述（用于搜索匹配）
---

# 技能标题

## Quick Start
[快速开始示例]

## Execution Steps
1. 步骤 1
2. 步骤 2

## Best Practices
- 最佳实践 1
- 最佳实践 2

## Examples
[使用示例]
```

### 自动技能强化

启用自动强化后，Agent 会在任务完成后分析执行过程：
- 检测可复用的工具使用模式
- 自动生成新技能或增强现有技能
- 维护技能索引

### 元技能

系统内置三个元技能，指导技能的创建和维护：
- `creating-skills`: 指导新技能创建
- `enhancing-skills`: 指导技能强化
- `evaluating-skills`: 评估技能质量
```

**Step 2: 验证 README.md 更新**

确保：
- 技能系统章节位置合理
- 命令示例正确
- 目录结构清晰

**Step 3: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: add skill system documentation to README

Documents skill management commands (list, search, load, enhance),
skill directory structure, SKILL.md format, and meta skills.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 验证文档完整性

**Checklist:**

根据 PRD 第二阶段可交付成果，确认以下内容已文档化：

- [ ] 完整的技能搜索和强化系统使用说明
- [ ] 三个元技能模板说明（creating-skills、enhancing-skills、evaluating-skills）
- [ ] 技能管理 CLI 命令文档（列表、搜索、加载、强化）
- [ ] 技能目录结构说明
- [ ] SKILL.md 格式说明

**验证方式:**

1. 阅读更新后的 README.md
2. 确认所有命令示例可执行
3. 确认目录结构与实际实现一致

---

## Task 3: 更新 CHANGELOG（可选）

**Files:**
- Modify: `CHANGELOG.md`（如果项目有此文件）

**内容:**

```markdown
## [Unreleased]

### Added
- 技能系统完整实现
  - Skill 子 Agent 架构
  - `skill list/search/load/enhance` 命令
  - 自动技能强化功能
  - 元技能模板（creating-skills、enhancing-skills、evaluating-skills）
- 技能索引自动维护
- 脚本自动转换为 Extension Shell Command
```

---

## Batch 8 完成检查

- [ ] README.md 已更新，包含技能系统使用说明
- [ ] 所有 PRD 可交付成果已文档化
- [ ] 提交完成

**验证命令:**

```bash
# 查看 README.md 中是否包含技能系统章节
grep -A 5 "## 技能系统" README.md
```

Expected: 显示技能系统章节内容
