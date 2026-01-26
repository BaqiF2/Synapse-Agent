# 第二部分（续）：技能系统设计

### 4.4 技能系统（阶段 1 核心）

#### 4.4.1 技能定义与格式

技能采用 Claude Code Skills 标准格式，每个技能是一个目录，包含 `SKILL.md` 文件：

```
code-quality-analyzer/
├── SKILL.md (必需，主要指导文档)
├── references (可选，详细参考资料)
└── scripts/
    └── analyze.py (可选，可执行脚本)
```

**SKILL.md 格式**：

```markdown
---
name: code-quality-analyzer
description: 分析代码质量并提供改进建议。当用户需要检查代码质量、寻找潜在问题或优化代码时使用此技能。
---

# Code Quality Analyzer

## 快速开始

使用以下步骤分析代码质量：

\`\`\`bash
# 1. 定位项目中的代码文件
glob "**/*.py"

# 2. 读取文件内容
read src/main.py

# 3. 运行代码检查工具
field:programming:pylint src/main.py
\`\`\`

## 分析流程

1. **识别分析范围**：确定需要分析的文件和目录
2. **运行静态分析**：使用 linter 工具检查代码风格和潜在问题
3. **生成报告**：整理分析结果，提供可操作的改进建议

## 最佳实践

- 先分析核心模块，再分析辅助模块
- 关注高复杂度函数和重复代码
- 提供具体的改进建议和示例代码

更多详细参考信息，请查看 [REFERENCE.md](./references/REFERENCE.md)
```

**必需字段**：
- `name`：技能名称（最多64字符，小写字母、数字、连字符）
- `description`：简要描述功能和使用时机（最多1024字符，用第三人称书写）

#### 4.4.2 技能存储结构

采用扁平存储结构，技能直接存放在 `skills/` 目录下，通过元数据中的 `domain` 字段标识所属领域：

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
      "domain": "programming",
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
      "domain": "finance",
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
- **扁平数组**：所有技能存放在 `skills` 数组中，通过 `domain` 字段区分领域
- **丰富元数据**：包含 `name`、`title`、`domain`、`description`、`version`、`tags`、`author`、`tools`、`scriptCount`、`path`、`hasSkillMd`、`lastModified` 等字段
- **工具列表**：`tools` 数组包含技能提供的所有工具命令（格式：`skill:技能名:脚本名`）
- **统计信息**：`totalSkills` 和 `totalTools` 提供快速统计，`generatedAt` 和 `updatedAt` 记录索引时间戳
- **支持的领域**：`programming`、`data`、`devops`、`finance`、`general`、`automation`、`ai`、`security`、`other`

#### 4.4.3 技能搜索 Agent（阶段 2 核心）

技能搜索 Agent 是一个 子 Agent，负责根据用户任务智能选择需要加载的技能元数据。

**触发时机**：
- 用户任务进入 Agent Loop 后，主 Agent 根据任务复杂度判断是否需要调用技能搜索 Agent
- 简单任务（如文件读写、简单计算）无需技能，直接执行
- 复杂任务（如代码分析、数据处理、领域特定操作）调用技能搜索 Agent

**工作流程**：
1. 接收用户任务描述和当前上下文
2. 读取技能索引文件 (`~/.synapse/skills/index.json`)
3. 根据任务关键词、领域描述、技能描述等因素，匹配相关技能
4. **返回所有匹配的技能元数据**（不限制数量，因为只是元数据加载）
5. 将技能元数据列表注入系统提示词或上下文
6. **LLM 自主判断**：在后续执行过程中，LLM 根据任务需要，通过 `read` 命令加载具体的 SKILL.md 文件

**示例**：
```
用户任务: "帮我分析这个 Python 项目的代码质量并生成报告"

技能搜索 Agent 分析:
- 关键词: "分析", "Python", "代码质量", "报告"
- 匹配领域: programming (编程相关技能)
- 匹配技能:
  1. code-quality-analyzer (描述匹配 "代码质量分析")
  2. code-refactor (可能相关 "代码优化")
  3. report-generator (描述匹配 "生成报告")

返回技能元数据列表（所有匹配的技能）:
[
  {
    "name": "code-quality-analyzer",
    "domain": "programming",
    "description": "分析代码质量并提供改进建议...",
    "path": "~/.synapse/skills/code-quality-analyzer"
  },
  {
    "name": "code-refactor",
    "domain": "programming",
    "description": "重构代码以提升可读性和可维护性...",
    "path": "~/.synapse/skills/code-refactor"
  },
  {
    "name": "report-generator",
    "domain": "general",
    "description": "生成结构化报告...",
    "path": "~/.synapse/skills/report-generator"
  }
]

主 Agent 执行:
- 将元数据列表注入上下文（成本低，约 300 tokens）
- LLM 开始任务执行，自行判断是否需要加载技能
- LLM 决定: 需要 code-quality-analyzer 技能
- LLM 执行: read ~/.synapse/skills/code-quality-analyzer/SKILL.md
- [SKILL.md 内容注入上下文，按指令执行]
- LLM 判断: 需要 report-generator 生成报告
- LLM 执行: read ~/.synapse/skills/report-generator/SKILL.md
- [继续按指令完成报告生成]
```

**关键改进**：
- **不限制搜索数量**：返回所有匹配的技能元数据，由 LLM 自主选择
- **渐进式加载**：技能搜索只加载元数据（Level 1），SKILL.md 加载（Level 2）由 LLM 在执行过程中自主决定
- **灵活性**：LLM 可以根据任务进展动态加载所需技能，无需预先确定

#### 4.4.4 技能加载与执行机制

**渐进式加载**（三层架构）：

- **Level 1 - 元数据加载（技能搜索工具返回）**：
  - 技能搜索 Agent 读取技能索引文件 `index.json`，获取所有技能的元数据
  - 将元数据注入系统提示词，成本约 100 tokens/技能
  - LLM 知道所有可用技能及其用途
  - 根据用户搜索技能描述，匹配相关技能
  - 解析SKILL.md,缓存技能结构数据,返回匹配的技能元数据列表
  - 主 Agent 根据匹配的技能元数据列表，决定需要加载的技能

- **Level 2 - 指令加载（任务匹配时）**：
  - 技能搜索 Agent 返回需要加载的技能列表
  - 主 Agent 通过 `skill load <name>` 命令或取对应的 SKILL.md 文件
  - SKILL.md 内容以 tool result 形式注入上下文（非系统提示词，保持缓存命中）
  - LLM 根据 SKILL.md 中的指令自主执行相应的 Bash 命令

- **Level 3 - 资源加载（按需）**：
  - 仅在 SKILL.md 引用时，LLM 通过 `read` 命令读取额外文件
  - 脚本通过 Bash 执行，只有输出进入上下文

**执行示例**：

```
用户: "帮我分析这个 Python 项目的代码质量"

主 Agent 判断: 任务复杂，需要技能支持

主 Agent → 技能搜索 Agent:
task skill-search "分析 Python 项目代码质量"

技能搜索 Agent 返回: ["code-quality-analyzer"]

主 Agent 执行:
1. skill load code-quality-analyzer
2. [SKILL.md 内容注入上下文]
3. 按照 SKILL.md 指令执行:
   - glob "**/*.py"
   - read src/main.py
   - field:programming:pylint src/main.py
4. 根据执行结果生成分析报告
```

**记忆与技能的关系**：
- 根据已知定律："文件系统是一种记忆" 和 "技能 = 文件系统 + 工具"
- 技能保存在文件系统中，即实现了知识的持久化记忆
- 技能强化 Agent 保存/更新技能 = 更新记忆
