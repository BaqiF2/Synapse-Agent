# 第二部分（续）：技能系统设计

### 4.4 技能系统（阶段 1 核心）

#### 4.4.1 技能定义与格式

技能参考 Claude Code Skills，但当前实现以 Markdown Key-Value 解析为主。每个技能是一个目录，包含 `SKILL.md` 文件：

```
code-quality-analyzer/
├── SKILL.md (必需，主要指导文档)
├── references (可选，详细参考资料)
└── scripts/
    └── analyze.py (可选，可执行脚本)
```

**SKILL.md 格式（当前解析器采用 Markdown Key-Value）**：

```markdown
# Code Quality Analyzer

**name**: programming
**Description**: 分析代码质量并提供改进建议。当用户需要检查代码质量、寻找潜在问题或优化代码时使用此技能。
**type**: meta

## Quick Start

\`\`\`bash
# 1. 定位项目中的代码文件
glob "**/*.py"

# 2. 读取文件内容
read src/main.py

# 3. 搜索潜在问题
search "TODO|FIXME" --path src
\`\`\`

## Execution Steps

1. 识别分析范围，确定需要分析的文件和目录
2. 执行搜索与静态检查步骤
3. 汇总发现并生成报告

## Best Practices

- 先分析核心模块，再分析辅助模块
- 关注高复杂度函数和重复代码
- 提供具体的改进建议和示例代码
```

**必需字段（当前实现要求）**：
- `name`：技能名称来自目录名（最多 64 字符，小写字母、数字、连字符）
- `Description`：简要描述功能和使用时机（第三人称书写）。缺失会导致索引描述为空

#### 4.4.2 技能存储结构

采用扁平存储结构，技能直接存放在 `skills/` 目录下：

```
~/.synapse/
├── skills/
│   ├── code-quality-analyzer/
│   │   ├── SKILL.md
│   │   ├── references/
│   │   │   └── REFERENCE.md
│   │   └── scripts/
│   │       └── analyze.py
│   ├── code-refactor/
│   │   └── SKILL.md
│   ├── stock-analysis/
│   │   └── SKILL.md
│   ├── task-planning/
│   │   └── SKILL.md
│   └── index.json
└── tools/
    ├── agent/
    ├── field/
    └── index.json
```

**技能索引文件** (`~/.synapse/skills/index.json`)：

采用扁平数组结构，包含完整的技能元数据，支持快速搜索和过滤：

```json
{
  "version": "1.0.0",
  "skills": [
    {
      "name": "code-quality-analyzer",
      "title": "Code Quality Analyzer",
      "description": "分析代码质量并提供改进建议。当用户需要检查代码质量、寻找潜在问题或优化代码时使用此技能。",
      "version": "1.0.0",
      "tags": ["code", "analysis", "quality", "lint"],
      "author": "Synapse Team",
      "tools": ["skill:code-quality-analyzer:analyze"],
      "scriptCount": 1,
      "path": "/Users/user/.synapse/skills/code-quality-analyzer",
      "hasSkillMd": true,
      "lastModified": "2025-01-26T10:00:00.000Z"
    },
    {
      "name": "stock-analysis",
      "title": "Stock Analysis",
      "description": "分析股票市场数据并生成投资建议。当用户需要技术分析、基本面分析或市场趋势预测时使用此技能。",
      "version": "1.0.0",
      "tags": ["stock", "finance", "analysis"],
      "tools": [],
      "scriptCount": 0,
      "path": "/Users/user/.synapse/skills/stock-analysis",
      "hasSkillMd": true,
      "lastModified": "2025-01-26T10:00:00.000Z"
    }
  ],
  "totalSkills": 2,
  "totalTools": 1,
  "generatedAt": "2025-01-26T10:00:00.000Z",
  "updatedAt": "2025-01-26T10:00:00.000Z"
}
```

**索引结构说明**：
- **扁平数组**：所有技能存放在 `skills` 数组中
- **丰富元数据**：包含 `name`、`title`、`description`、`version`、`tags`、`author`、`tools`、`scriptCount`、`path`、`hasSkillMd`、`lastModified` 等字段
- **工具列表**：`tools` 数组包含技能提供的所有工具命令（格式：`skill:技能名:脚本名`）
- **统计信息**：`totalSkills` 和 `totalTools` 提供快速统计，`generatedAt` 和 `updatedAt` 记录索引时间戳

#### 4.4.3 技能搜索 Agent（阶段 2 核心）

技能搜索 Agent 是一个**持久化子 Agent**，拥有独立的 LLM 会话，负责技能的语义检索。

**架构特点**：
- **独立上下文**：拥有自己的系统提示词和对话历史，与主 Agent 隔离
- **持久化运行**：首次执行 `task:skill:search` 时创建，在当前 session 中复用
- **会话复用**：后续所有 `task:skill:search` 命令复用同一个子 Agent 实例
- **生命周期**：主 session 结束时，子 Agent 随之结束
- **元数据来源**：通过 `SkillIndexer` 读取 `~/.synapse/skills/index.json`，构建技能列表并注入子 Agent system prompt

**当前实现命令集**：

| 命令 | 功能 | 路由方式 |
|------|------|----------|
| `task:skill:search --prompt "<描述>" --description "<短描述>"` | 语义搜索技能，返回 JSON 列表 | 经过 Skill 子 Agent（LLM 语义匹配） |
| `skill:load <name>` | 加载技能完整 SKILL.md 内容 | 直接从磁盘读取（SkillLoader 缓存） |

**`task:skill:search` 命令**：

```
用法：task:skill:search --prompt "<功能描述>" --description "<短描述>"
功能：使用 LLM 语义匹配，在技能库中搜索相关技能
返回：JSON 格式的技能元数据列表
```

返回格式（JSON）：
```json
{
  "matched_skills": [
    {
      "name": "code-quality-analyzer",
      "description": "分析代码质量并提供改进建议"
    },
    {
      "name": "code-refactor",
      "description": "重构代码以提升可读性和可维护性"
    }
  ]
}
```

**`skill:load` 命令**：

```
用法：skill:load <skill_name>
功能：从磁盘读取 SKILL.md 并返回完整内容（带缓存）
说明：不依赖 search 是否执行，可直接加载
```

**完整执行流程示例**：

```
用户任务: "帮我分析这个 Python 项目的代码质量并生成报告"

┌─────────────────────────────────────────────────────────────┐
│ 1. 主 Agent 判断需要技能支持，执行 task:skill:search         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Skill 子 Agent（首次调用，启动并持久化运行）              │
│    - 从 index.json 构建技能列表                              │
│    - LLM 语义分析任务描述                                    │
│    - 匹配相关技能，返回 JSON                                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. 主 Agent 直接读取 JSON 结果                               │
│    - LLM 选择技能                                             │
│    - 执行: skill:load code-quality-analyzer                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Shell Command 解析器处理 skill:load                       │
│    - 读取 SKILL.md 完整内容并返回                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. 主 Agent 将 SKILL.md 内容注入上下文                       │
│    - LLM 按照技能指令执行任务                                │
└─────────────────────────────────────────────────────────────┘
```

**核心实现参考**（SkillLoader 类，Skill 子 Agent 内部组件）：

**实现组件（当前实现）**：
- **SkillIndexer**：扫描 `~/.synapse/skills`，生成或重建 `index.json`
- **SkillLoader**：提供 `loadLevel1/loadLevel2`，带缓存 TTL（`SKILL_CACHE_TTL_MS`）
- **SkillDocParser**：解析 Markdown Key-Value 元数据

**关键设计点**：
- **元数据来源**：优先从 `index.json` 读取，缺失或过期则重建
- **按需读取正文**：`skill:load` 时读取 SKILL.md 完整内容并缓存
- **与搜索解耦**：`skill:load` 不依赖 `task:skill:search` 的执行顺序

#### 4.4.4 技能加载与执行机制

**渐进式加载**（当前实现）：

- **Level 1 - 元数据加载（索引）**：
  - `SkillIndexer` 生成 `index.json`（缺失或过期时自动重建）
  - 元数据包含 name/description/tags/tools 等

- **Level 2 - 搜索与选择（任务匹配时）**：
  - 主 Agent 执行 `task:skill:search --prompt ... --description ...`
  - Skill 子 Agent 返回 JSON 格式的匹配结果
  - 主 Agent 直接基于 JSON 结果选择技能

- **Level 3 - 内容加载（按需）**：
  - LLM 执行 `skill:load <name>` 命令加载具体技能
  - `SkillLoader` 从磁盘读取 SKILL.md，并缓存结果
  - LLM 根据 SKILL.md 中的指令自主执行相应的 Shell 命令

- **Level 4 - 资源加载（深度按需）**：
  - 仅在 SKILL.md 引用时，LLM 通过 `read` 命令读取额外文件
  - 脚本通过 Shell 执行，只有输出进入上下文

**执行示例**：

```
用户: "帮我分析这个 Python 项目的代码质量"

主 Agent 判断: 任务复杂，需要技能支持

主 Agent 执行:
task:skill:search --prompt "分析 Python 项目代码质量" --description "Search skills"

Skill 子 Agent 返回 (JSON):
{
  "matched_skills": [
    {"name": "code-quality-analyzer", "description": "分析代码质量并提供改进建议"}
  ]
}

主 Agent 处理:
- 读取 JSON 结果并选择技能

LLM 决策并执行:
1. skill:load code-quality-analyzer
2. [SKILL.md 内容注入上下文]
3. 按照 SKILL.md 指令执行:
   - glob "**/*.py"
   - read src/main.py
   - search "TODO|FIXME" --path src
4. 根据执行结果生成分析报告
```

**记忆与技能的关系**：
- 根据已知定律："文件系统是一种记忆" 和 "技能 = 文件系统 + 工具"
- 技能保存在文件系统中，即实现了知识的持久化记忆
- 技能强化 Agent 保存/更新技能 = 更新记忆
