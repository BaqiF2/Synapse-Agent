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

技能搜索 Agent 是一个**持久化子 Agent**，拥有独立的 LLM 会话，负责技能的搜索与加载。

**架构特点**：
- **独立上下文**：拥有自己的系统提示词和对话历史，与主 Agent 隔离
- **持久化运行**：首次 `skill` 命令时启动，在当前 session 后台持续运行
- **会话复用**：后续所有 `skill search` 命令复用同一个子 Agent 会话
- **生命周期**：主 session 结束时，子 Agent 随之结束

**内存数据结构**（Skill 子 Agent 内部维护）：

```typescript
interface SkillMetadata {
  name: string;        // 技能名称
  description: string; // 技能描述
  body: string;        // SKILL.md 正文（按需加载）
  path: string;        // SKILL.md 完整路径
  dir: string;         // 技能目录路径
}

// 内存映射：name → SkillMetadata
skills: Map<string, SkillMetadata>
```

**阶段 2 命令集**：

| 命令 | 功能 | 路由方式 |
|------|------|----------|
| `skill search "<描述>"` | 搜索匹配的技能，返回元数据列表 | 经过 Skill 子 Agent（LLM 语义匹配） |
| `skill load <name>` | 加载技能完整 SKILL.md 内容 | 直接从内存映射读取（纯代码逻辑） |

**`skill search` 命令**：

```
用法：skill search "<功能描述>"
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

主 Agent 处理流程：
1. 解析 JSON 返回结果
2. 将技能元数据转换为 XML 标签格式注入 LLM 上下文

注入 LLM 的格式（XML）：
```xml
<available-skills>
  <skill name="code-quality-analyzer">
    分析代码质量并提供改进建议
  </skill>
  <skill name="code-refactor">
    重构代码以提升可读性和可维护性
  </skill>
</available-skills>
```

**`skill load` 命令**：

```
用法：skill load <skill_name>
功能：根据 name 从内存映射中定位 SKILL.md，返回完整内容
前提：技能必须已被 search 命令加载到内存
```

**完整执行流程示例**：

```
用户任务: "帮我分析这个 Python 项目的代码质量并生成报告"

┌─────────────────────────────────────────────────────────────┐
│ 1. 主 Agent 判断需要技能支持，执行 skill search             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Skill 子 Agent（首次调用，启动并持久化运行）              │
│    - 初始化 SkillLoader，加载技能索引到内存                  │
│    - LLM 语义分析任务描述                                    │
│    - 匹配相关技能，返回 JSON                                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. 主 Agent 处理返回结果                                     │
│    - 解析 JSON                                               │
│    - 转换为 XML 标签格式注入 LLM 上下文                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. LLM 根据 <available-skills> 选择技能                     │
│    - 决定使用 code-quality-analyzer                          │
│    - 执行: skill load code-quality-analyzer                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Shell Command 解析器处理 skill load（不经过子 Agent）     │
│    - 解析参数获取 skill name                                 │
│    - 从系统内存映射中查找路径                                │
│    - 读取 SKILL.md 完整内容并返回                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. 主 Agent 将 SKILL.md 内容注入上下文                       │
│    - LLM 按照技能指令执行任务                                │
└─────────────────────────────────────────────────────────────┘
```

**核心实现参考**（SkillLoader 类，Skill 子 Agent 内部组件）：

```typescript
class SkillLoader {
  private skills: Map<string, SkillMetadata> = new Map();
  private skillsDir: string;

  constructor(skillsDir: string) {
    this.skillsDir = skillsDir;
    this.loadSkills();  // 子 Agent 初始化时调用
  }

  /**
   * 解析 SKILL.md 文件，提取 YAML frontmatter 和正文
   * 返回 {name, description, body, path, dir}
   */
  parseSkillMd(path: string): SkillMetadata | null { /* ... */ }

  /**
   * 扫描技能目录，加载所有有效的 SKILL.md 元数据
   * 启动时调用，只加载元数据，body 按需加载
   */
  loadSkills(): void { /* ... */ }

  /**
   * 生成技能描述列表（用于 skill search 的 LLM 上下文）
   */
  getDescriptions(): string { /* ... */ }

  /**
   * 获取技能完整内容（用于 skill load）
   */
  getSkillContent(name: string): string | null {
    const skill = this.skills.get(name);
    if (!skill) return null;
    return `# Skill: ${name}\n\n${skill.body}`;
  }
}
```

**关键设计点**：
- **启动时加载元数据**：`loadSkills()` 在子 Agent 初始化时调用
- **按需读取正文**：`body` 字段在首次 `skill load` 时才从文件读取
- **内存映射共享**：SkillLoader 实例作为共享组件，主 Agent 和子 Agent 都可访问

**设计优势**：
- **上下文精简**：元数据加载成本低，body 按需加载
- **会话复用**：子 Agent 持久化避免重复初始化
- **路径解耦**：LLM 无需知道 SKILL.md 具体路径，通过 name 访问
- **格式统一**：JSON 返回 + XML 注入，结构清晰

#### 4.4.4 技能加载与执行机制

**渐进式加载**（三层架构）：

- **Level 1 - 元数据加载（子 Agent 初始化时）**：
  - Skill 子 Agent 首次启动时，通过 `loadSkills()` 扫描技能目录
  - 解析所有 SKILL.md 文件的 YAML frontmatter，提取元数据（name、description）
  - 元数据缓存到内存映射 `skills: Map<string, SkillMetadata>`
  - body 字段暂不加载，保持初始化轻量

- **Level 2 - 搜索与选择（任务匹配时）**：
  - 主 Agent 执行 `skill search "<功能描述>"` 命令
  - Skill 子 Agent 使用 LLM 语义匹配，返回 JSON 格式的匹配结果
  - 主 Agent 解析 JSON，转换为 XML 标签格式注入 LLM 上下文
  - LLM 根据 `<available-skills>` 自主选择需要的技能

- **Level 3 - 内容加载（按需）**：
  - LLM 执行 `skill load <name>` 命令加载具体技能
  - Shell Command 解析器从内存映射中读取 SKILL.md 完整内容（不经过子 Agent）
  - SKILL.md 内容以 tool result 形式注入上下文
  - LLM 根据 SKILL.md 中的指令自主执行相应的 Shell 命令

- **Level 4 - 资源加载（深度按需）**：
  - 仅在 SKILL.md 引用时，LLM 通过 `read` 命令读取额外文件
  - 脚本通过 Shell 执行，只有输出进入上下文

**执行示例**：

```
用户: "帮我分析这个 Python 项目的代码质量"

主 Agent 判断: 任务复杂，需要技能支持

主 Agent 执行:
skill search "分析 Python 项目代码质量"

Skill 子 Agent 返回 (JSON):
{
  "matched_skills": [
    {"name": "code-quality-analyzer", "description": "分析代码质量并提供改进建议"}
  ]
}

主 Agent 处理:
- 解析 JSON，转换为 XML 注入 LLM 上下文:
  <available-skills>
    <skill name="code-quality-analyzer">分析代码质量并提供改进建议</skill>
  </available-skills>

LLM 决策并执行:
1. skill load code-quality-analyzer
2. [SKILL.md 内容注入上下文]
3. 按照 SKILL.md 指令执行:
   - glob "**/*.py"
   - read src/main.py
   - skill:code-quality-analyzer:pylint src/main.py
4. 根据执行结果生成分析报告
```

**记忆与技能的关系**：
- 根据已知定律："文件系统是一种记忆" 和 "技能 = 文件系统 + 工具"
- 技能保存在文件系统中，即实现了知识的持久化记忆
- 技能强化 Agent 保存/更新技能 = 更新记忆
