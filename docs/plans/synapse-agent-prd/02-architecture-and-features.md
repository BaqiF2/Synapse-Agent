# 第二部分：系统架构与功能设计

## 4. 功能需求

### 4.1 三层 Bash 架构（阶段 1 核心）

Synapse Agent 的工具系统基于三层 Bash 架构设计，从底层到上层依次为：

**核心设计原则："一切工具都是 Bash"**

这不是概念抽象，而是**实际的技术实现**：
- **LLM 只看到一个工具**：通过 JSON Schema 定义的唯一工具 `Bash`
- **所有命令通过 Bash 工具执行**：`read`、`write`、`edit` 等都是 Bash 命令，不是独立的 Tool Use
- **命令解析器**：Agent 内部解析命令字符串，路由到对应的实现
- **持久 Bash 会话**：维持状态的持久会话，环境变量和工作目录在命令之间保持
- **会话重启能力**：支持通过 `restart: true` 参数重启 Bash 会话

```
┌─────────────────────────────────────────────────────────┐
│                    LLM 视角                              │
│  ┌─────────────────────────────────────────────────┐   │
│  │     唯一的 Tool Use Schema: Bash                 │   │
│  │     input: { "command": "read /path/to/file" }  │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                  命令解析和路由层                         │
│                    BashRouter                           │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                  三层 Bash 命令                          │
│  ┌──────────────┬──────────────┬──────────────────┐    │
│  │ Native Shell │ Agent Shell  │ Extension Shell  │    │
│  │  ls/grep/..  │  read/write  │  mcp_*/skill_*   │    │
│  │              │  edit/glob   │                  │    │
│  └──────────────┴──────────────┴──────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

#### Layer 1: Native Shell Command
- **定义**：Unix/Linux 系统自带的原生命令（ls, grep, cat, curl, git 等）
- **功能**：提供最基础的系统操作能力
- **实现方式**：**只在系统提示词中引导 LLM 使用，无需封装或特殊处理**
- **系统提示词示例**：
  ```markdown
  你可以使用标准的 Unix 命令完成基础操作：
  - ls / cd / pwd：目录操作
  - grep / find：文件搜索
  - git：版本控制
  - curl / wget：网络请求
  ```

#### Layer 2: Agent Shell Command（原生工具层）
- **定义**：Agent 核心功能封装的命令集，参考 Claude API Tool Use 设计
- **实现方式**：**在系统提示词中直接注入详细的 command 使用信息**
- **Phase 1 核心工具**：
  - `read <file_path>` - 文件读取
  - `write <file_path> <content>` - 文件写入
  - `edit <file_path> <old> <new>` - 文件编辑
  - `glob <pattern>` - 文件模式匹配
  - `grep <pattern> [options]` - 代码搜索
  - `bash <command>` - 执行 Bash 命令
- **Phase 2 扩展工具**：
  - `web_search <query>` - 网页搜索
  - `web_fetch <url>` - 网页获取
- **Phase 3 高级工具**：
  - `tools search <query>` - 工具搜索
  - `skill <action> [args]` - 技能管理（属于 sub agent is tool）
  - `task <agent_type> <prompt>` - 启动子 Agent
  - `plan <action> [items]` - 任务管理

**系统提示词注入格式**：
```markdown
## 可用的 Agent 工具

### read - 读取文件内容
用法：read <file_path> [--offset <line>] [--limit <lines>]
参数：
  - file_path: 文件绝对路径（必填）
  - --offset: 起始行号（可选，默认 0）
  - --limit: 读取行数（可选，默认全部）
示例：
  read /path/to/file.ts
  read /path/to/large-file.log --offset 100 --limit 50

### skill - 技能管理
用法：skill <action> [args]

子命令：
1. skill search "<功能描述>" - 技能检索
   - 功能：在技能库中搜索匹配的技能
   - 触发场景：Agent 运行过程中发现缺少某种能力
   - 返回：技能名称和描述的映射列表
   - 后续：将列表加入历史，由 LLM 推理选择需要的技能，然后加载完整 SKILL.md
   - 示例：skill search "修改 PDF 文件的功能"

2. skill reinforce - 技能增强
   - 功能：分析任务过程，增强现有技能或生成新技能
   - 触发时机：任务完成后即将退出时
   - 工作机制：将任务运行的完整过程传入 skill agent 分析
   - 目标：实现 Agent 的自我成长能力

### tools search - 工具搜索
用法：tools search <query>
功能：搜索可用的 MCP 和 Skill 工具
支持：
  - 关键词匹配：tools search "pdf"
  - 正则匹配：tools search "mcp:git-.*"
返回：匹配的工具名称列表
后续：使用 <tool_name> -h 获取简要信息，<tool_name> --help 获取完整文档

...（其他工具的完整说明）
```

**关键实现点**：
1. **静态注入**：工具说明在 Agent 启动时注入系统提示词，LLM 直接可见
2. **完整文档**：每个工具包含用法、参数类型、默认值、示例
3. **无需 -h/--help**：Agent Shell Command 工具的信息已在提示词中，不需要运行时查询

#### Layer 3: Extension Shell Command（扩展工具层）
- **定义**：外部工具通过统一转换机制提供的命令集

**两种来源与命名格式**：

**1. MCP Command**: `mcp:<mcp_name>:<tool>`
- **示例**：`mcp:git-tools:commit`, `mcp:filesystem:read_file`
- **来源**：从 MCP 配置解析（参考 mcp-cli 实现）
- **解析时机**：Agent 启动时一次性解析并缓存
- **配置管理**：支持在配置中启用/禁用特定 MCP 或工具
- **实现流程**：
  1. Agent 启动时读取 MCP 配置文件
  2. 连接各个 MCP server，获取工具列表
  3. 为每个 MCP 工具生成 `mcp:<mcp_name>:<tool>` 命令包装器
  4. 安装到 `~/.synapse/bin/`，使其在 PATH 中可用

**2. Skill Command**: `skill:<skill_name>:<tool>`
- **示例**：`skill:pdf-editor:extract_text`, `skill:code-analyzer:check_quality`
- **来源**：从 `~/.synapse/skills/*/scripts/` 目录解析
- **解析时机**：后台监听进程扫描生成（静态解析存储）
- **技能结构**：
  ```
  ~/.synapse/skills/pdf-editor/
  ├── SKILL.md           # 技能文档和使用指导
  └── scripts/           # 可执行脚本
      ├── extract_text.py
      └── merge_files.sh
  ```
- **实现流程**：
  1. 后台监听进程监控 `~/.synapse/skills/` 目录变化
  2. 扫描每个技能的 `scripts/` 子目录
  3. 为每个脚本生成 `skill:<skill_name>:<tool>` 命令包装器
  4. 解析脚本的 docstring/注释获取描述和参数信息
  5. 安装到 `~/.synapse/bin/`

**工具发现机制**：

**tools search 工具**（Agent Shell Command Layer 2 提供）：
```bash
# 关键词匹配
tools search "pdf"
# 输出：
# mcp:filesystem:read_pdf
# skill:pdf-editor:extract_text
# skill:pdf-editor:merge_files

# 正则匹配
tools search "mcp:git-.*"
# 输出：
# mcp:git-tools:commit
# mcp:git-tools:push
# mcp:git-tools:status
```

**实现机制**：
1. 扫描 `~/.synapse/bin/` 目录，列出所有 `mcp:*` 和 `skill:*` 命令
2. 根据关键词或正则表达式过滤匹配
3. 返回工具名称列表

**工具详细信息获取**：
- Agent 通过 `tools search` 发现工具后
- 使用 `<tool_name> -h` 获取简要信息
- 使用 `<tool_name> --help` 获取完整文档

**自描述能力**：
所有 Extension Shell Command 工具必须支持 `-h` 和 `--help` 参数：

```bash
# MCP 工具示例
$ mcp:git-tools:commit -h
Usage: mcp:git-tools:commit <message> [--author <name>]
Commit changes to git repository

$ mcp:git-tools:commit --help
# 完整文档输出，包括所有参数、类型、示例等

# Skill 工具示例
$ skill:pdf-editor:extract_text -h
Usage: skill:pdf-editor:extract_text <pdf_path> [--pages <list>]
Extract text from PDF files

$ skill:pdf-editor:extract_text --help
# 完整文档输出，从脚本的 docstring 解析
```

**架构验证目标**：
- **LLM 只看到唯一的 Bash 工具**：所有工具调用统一通过 `{"name": "Bash", "input": {"command": "..."}}`
- **命令解析器正确路由**：Agent 内部解析命令字符串，路由到 Native/Agent/Field 三层实现
- **工具发现机制**：通过 `tools search` 关键词/正则搜索，返回 `mcp:*` 和 `skill:*` 工具列表
- **自描述能力**：所有 Extension Shell Command 命令支持 `-h/--help` 参数，LLM 可自主探索工具详情
- **持久会话状态**：环境变量和工作目录在命令之间保持
- **会话重启**：支持 `restart: true` 参数重启 Bash 会话
- **后台监听**：Skill 工具的自动发现和更新，无需手动干预

---

### 4.2 工具转 Bash 转换器（阶段 1 核心）

工具转 Bash 转换器负责将不同来源的工具统一转换为 Bash 命令格式，是验证"一切工具都是 Bash"的核心组件。

#### 4.2.1 转换器架构

**两种转换器**：

根据简化后的架构，只保留两种转换器：
1. **Mcp2Bash 转换器**：将 MCP 工具转换为 `mcp:<mcp_name>:<tool>` 命令
2. **Skill2Bash 转换器**：将 Skill 脚本转换为 `skill:<skill_name>:<tool>` 命令

**触发时机**：

**Mcp2Bash**：
- Agent 启动时自动触发
- 用户手动刷新：`synapse tools refresh mcp`

**Skill2Bash**：
- 后台监听进程持续运行，检测 SKILLS 目录变化时自动触发
- 用户手动刷新：`synapse tools refresh skills`

#### 4.2.2 Mcp2Bash 转换器

**输入**：MCP 工具定义（inputSchema 格式）

**MCP 配置示例**：

MCP 服务器通过配置文件定义，配置文件位置为当前目录的 `mcp_servers.json` 或 `~/.synapse/mcp/mcp_servers.json`：

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "."
      ]
    },
    "deepwiki": {
      "url": "https://mcp.deepwiki.com/mcp"
    }
  }
}
```

**配置说明**：
- **command 方式**：通过本地命令启动 MCP 服务器（如 `filesystem` 示例）
- **url 方式**：连接远程 MCP 服务器（如 `deepwiki` 示例）
- **服务器名称**：配置中的 key（如 `filesystem`, `deepwiki`）将作为 `<mcp_name>` 用于生成 Bash 命令

**转换规则**：
- MCP `name` → Bash 命令名称：`mcp:<mcp_name>:<tool>`
- MCP `inputSchema` → Bash 参数解析逻辑
- MCP `call_tool()` → Bash 函数调用

**输出示例**：
```bash
#!/bin/bash
# Generated: mcp:git-tools:commit
# MCP Server: git-tools
# Tool: commit

if [[ "$1" == "-h" ]]; then
  echo "Usage: mcp:git-tools:commit <message> [--author <name>]"
  echo "Commit changes to git repository"
  exit 0
fi

if [[ "$1" == "--help" ]]; then
  cat <<'EOF'
mcp:git-tools:commit - Commit changes to git repository

Usage:
  mcp:git-tools:commit <message> [options]

Parameters:
  message (string, required): Commit message
  --author (string, optional): Commit author

Examples:
  mcp:git-tools:commit "Fix bug in authentication"
  mcp:git-tools:commit "Add feature" --author "John Doe"
EOF
  exit 0
fi

# 参数解析和 MCP 调用逻辑
# ...（调用 MCP server 的实际实现）
```

**安装位置**：`~/.synapse/bin/mcp:git-tools:commit`

#### 4.2.3 Skill2Bash 转换器

**输入**：Skill 目录中的 `scripts/` 子目录下的可执行脚本（Python、Shell 等）

**职责**：将 Skill 内的脚本转换为可通过 Bash 命令调用的 Extension Shell Command 工具

**转换规则**：
- 扫描 `~/.synapse/skills/*/scripts/` 目录
- 解析脚本的 docstring 或注释获取描述和参数信息
- 生成 `skill:<skill_name>:<tool>` 命令包装器

**示例**：
```
输入：
~/.synapse/skills/pdf-editor/
├── SKILL.md
└── scripts/
    └── extract_text.py  # 包含 docstring 的 Python 脚本

输出：
~/.synapse/bin/skill:pdf-editor:extract_text  # Bash 命令包装器
```

**包装器示例**：
```bash
#!/bin/bash
# Generated: skill:pdf-editor:extract_text
# Skill: pdf-editor
# Script: extract_text.py

SCRIPT_PATH="$HOME/.synapse/skills/pdf-editor/scripts/extract_text.py"

if [[ "$1" == "-h" ]]; then
  echo "Usage: skill:pdf-editor:extract_text <pdf_path> [--pages <list>]"
  echo "Extract text from PDF files"
  exit 0
fi

if [[ "$1" == "--help" ]]; then
  # 解析并输出脚本的完整 docstring
  python3 "$SCRIPT_PATH" --help
  exit 0
fi

# 执行实际脚本
python3 "$SCRIPT_PATH" "$@"
```

**脚本执行特点**（参考 Claude 官方文档）：
- 脚本通过 Bash 执行，脚本代码本身不进入上下文窗口
- 仅脚本的输出（stdout/stderr）进入上下文
- 脚本提供确定性操作，比 LLM 即时生成代码更可靠高效

**后台监听机制**：
详见 4.2.4 节。

#### 4.2.4 后台监听进程

**监听目标**：`~/.synapse/skills/` 目录

**监听范围**：
- 新增/删除技能目录
- `scripts/` 子目录中脚本文件的变化（新增、修改、删除）

**核心职责**：
1. **生成命令包装器**：为每个脚本生成对应的 Bash 命令包装器
2. **安装到 PATH**：将包装器安装到 `~/.synapse/bin/`
3. **自描述支持**：包装器包含 `-h` 和 `--help` 逻辑
4. **清理过期工具**：删除已不存在的技能对应的命令包装器

**工作流程**：
```
SKILLS 目录变化
  → 检测变更类型（新增/修改/删除）
  → 扫描 scripts/ 目录
  → 调用 Skill2Bash 转换器
  → 生成/更新/删除命令包装器
  → 安装到 ~/.synapse/bin/
  → tools search 可立即发现新工具
```

**启动时机**：
- Agent 启动时在后台启动监听进程
- 监听进程与 Agent 主进程独立运行
- Agent 退出时不影响监听进程（持续运行）

**实现技术**：
- 使用文件系统监听（如 Node.js 的 `chokidar` 或 `fs.watch`）
- 异步处理，不阻塞 Agent 主进程

---

### 4.3 基础 Agent Loop（阶段 1 核心）

#### 4.3.1 Agent Loop 架构

基础 Agent Loop 是 Synapse Agent 的核心运行机制，负责接收用户输入、调用工具、生成响应的完整循环。

**核心组件**：
- **用户输入处理**：接收 CLI 命令或多轮对话输入
- **上下文管理**：维护对话历史和任务状态
- **工具调用引擎**：
  - 识别 LLM 输出中的 Bash 命令
  - 执行 Bash 命令（Base/Agent/Field 三层）
  - 捕获执行结果并返回给 LLM
- **响应生成**：将 LLM 输出和工具执行结果呈现给用户

**工作流程**：
```
用户输入 → LLM 推理 → 识别 Bash 命令 → 执行工具 → 返回结果 → LLM 继续推理 → 输出响应 → 等待下一轮输入
```

#### 4.3.2 系统提示词设计

系统提示词需要包含：

**1. 角色定义**
```markdown
你是 Synapse Agent，一个基于统一 Bash 抽象的通用智能助手。
```

**2. 工具使用规范**
```markdown
所有操作通过 Bash 命令完成。工具分为三层：
- Native Shell Command：标准 Unix 命令（ls, grep, git, curl 等）
- Agent Shell Command：核心功能工具（read, write, edit, skill, tools search 等）
- Extension Shell Command：外部扩展工具（mcp:*, skill:* 格式）

使用 tools search 探索可用的 MCP 和 Skill 工具。
使用 <tool> -h 获取简要信息，<tool> --help 获取完整文档。
```

**3. Agent Shell Command 工具详细说明**

在系统提示词中完整注入所有 Agent Shell Command 工具的使用说明：
```markdown
## Agent Shell Command 工具

### read - 读取文件内容
用法：read <file_path> [--offset <line>] [--limit <lines>]
...（完整说明）

### write - 写入文件
...（完整说明）

### skill - 技能管理
用法：skill <action> [args]

子命令：
1. skill search "<功能描述>"
   - 功能：在技能库中搜索匹配的技能
   - 返回：技能名称和描述的映射列表
   - 后续：将列表加入历史，由 LLM 推理选择并加载完整 SKILL.md

2. skill reinforce
   - 功能：分析任务过程，增强现有技能
   - 触发时机：任务完成后即将退出时

### tools search - 工具搜索
用法：tools search <query>
支持关键词匹配和正则匹配
示例：
  tools search "pdf"         # 搜索包含 pdf 的工具
  tools search "mcp:git-.*"  # 搜索所有 git MCP 工具
...（其他工具说明）
```

**4. Extension Shell Command 工具使用说明**
```markdown
## 外部工具使用

使用 tools search 发现可用工具：
- MCP 工具：mcp:<mcp_name>:<tool> 格式
- Skill 工具：skill:<skill_name>:<tool> 格式

示例：
1. tools search "git"
2. 发现 mcp:git-tools:commit
3. mcp:git-tools:commit -h  # 查看简要用法
4. mcp:git-tools:commit --help  # 查看完整文档
5. mcp:git-tools:commit "Fix bug"  # 执行命令
```

**5. 技能加载提示**
```markdown
当任务需要特定领域能力时：
1. 使用 skill search "<功能描述>" 搜索相关技能
2. 从返回列表中选择合适的技能
3. 加载技能的 SKILL.md 文档
4. 根据文档指导完成任务（可能使用 skill:* 工具或其他方式）
```

**6. 记忆机制**
```markdown
重要信息和新生成的工具保存到文件系统。
文件系统是你的记忆载体，合理组织和管理文件。
```

---

### 4.4 CLI 交互增强（阶段 1 易用性）

#### 4.4.1 Shell 命令直接执行

**功能概述**：
在 REPL 交互模式中，支持用户通过 `!` 前缀直接执行 Shell 命令，无需通过 LLM 处理，提供快速的命令行操作体验。

**核心需求**：
- **触发机制**：用户输入以 `!` 开头时，识别为 Shell 命令
- **命令提取**：去掉 `!` 前缀后，将剩余字符串作为完整的 Shell 命令
- **执行方式**：使用 `subprocess.run()` 在当前工作目录执行
- **输出处理**：命令的标准输出和标准错误直接连接到终端
- **错误处理**：命令执行失败时显示退出码，但继续 REPL 循环

**技术实现要点**：
```typescript
// 在 REPL.start() 主循环中的处理流程
const userInput = await this.getInput();

// 检查是否为 Shell 命令（在检查特殊命令之后、发送给 Agent 之前）
if (userInput.trim().startsWith("!")) {
    const shellCommand = userInput.trim().slice(1).trim();
    await this.executeShellCommand(shellCommand);
    continue;
}

// executeShellCommand 实现
async executeShellCommand(command: string): Promise<void> {
    // Execute a shell command directly
    const proc = Bun.spawn(command, {
        shell: true,
        cwd: process.cwd(), // 使用当前工作目录
        stdout: "inherit",  // 直接输出到终端
        stderr: "inherit"   // 直接输出到终端
    });

    const exitCode = await proc.exited;

    // 如果命令失败，显示退出码
    if (exitCode !== 0) {
        console.log(chalk.dim(`Command exited with code ${exitCode}`));
    }
}
```

**行为规范**：
- **工作目录**：使用用户启动 `synapse chat` 时的当前工作目录
- **输出方式**：保持原生 Shell 输出，支持交互式命令
- **错误处理**：命令失败后继续 REPL，不中断用户会话
- **状态隔离**：Shell 命令执行不影响 Agent 的上下文和历史记录

**使用示例**：
```
You (1)> !ls -la
total 48
drwxr-xr-x  12 user  staff   384 Jan 23 10:30 .
drwxr-xr-x   5 user  staff   160 Jan 22 15:20 ..
...

You (2)> !git status
On branch main
Your branch is up to date with 'origin/main'.
...

You (3)> !python test.py
Running tests...
[Command exited with code 1]

You (4)> 帮我分析一下 test.py 的错误
Agent> [正常的 Agent 响应]
```

**价值验证**：
- 提升用户体验，减少在 REPL 和 Shell 之间切换的需求
- 保持 REPL 的流畅性，快速执行常见 Shell 操作（查看文件、检查状态等）
- 为后续功能奠定基础（如 Agent 可以建议用户执行特定的 Shell 命令）
