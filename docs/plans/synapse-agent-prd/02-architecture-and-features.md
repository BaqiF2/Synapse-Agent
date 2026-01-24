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
│  │  Base Bash   │  Agent Bash  │   Field Bash     │    │
│  │  ls/grep/..  │  read/write  │  mcp_*/skill_*   │    │
│  │              │  edit/glob   │                  │    │
│  └──────────────┴──────────────┴──────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

#### Layer 1: Base Bash
- **定义**：Unix/Linux 系统自带的原生命令（ls, grep, cat, curl, git 等）
- **功能**：提供最基础的系统操作能力
- **实现要求**：无需封装，直接可用

#### Layer 2: Agent Bash
- **定义**：Agent 核心功能封装的命令集，参考 Claude API Tool Use 设计
- **Phase 1 核心工具**（基于 JSON Schema 转 Bash）：
  - `read <file_path>` - 文件读取
  - `write <file_path> <content>` - 文件写入
  - `edit <file_path> <old> <new>` - 文件编辑
  - `glob <pattern>` - 文件模式匹配
  - `grep <pattern> [options]` - 代码搜索
  - `bash <command>` - 执行 Bash 命令
  - `skill <skill_name> [args]` - 技能加载和执行
- **Phase 2 扩展工具**：
  - `web_search <query>` - 网页搜索（参考 Claude server tool）
  - `web_fetch <url>` - 网页获取（参考 Claude server tool）
- **Phase 3 高级工具**：
  - `task <agent_type> <prompt>` - 启动子 Agent
  - `todo <action> [items]` - 任务管理
  - `ask <question> [options]` - 询问用户
- **实现要求**：
  - 将 JSON Schema 定义的工具转换为 Bash 命令格式
  - 每个工具包含：名称、描述、参数 schema、执行逻辑
  - 工具定义存储在文件系统（如 `~/.synapse/tools/agent/`）
- **自描述能力**：
  - `-h` 参数：输出简要信息
    - `read -h` → 显示 read 工具的简要用法和参数列表
    - `task -h` → 显示 task 工具支持的 agent_type 列表
  - `--help` 参数：输出详细信息
    - `read --help` → 显示完整文档（所有参数、类型、示例）
    - `task --help` → 显示所有 agent 类型的详细说明和使用示例

#### Layer 3: Field Bash
- **定义**：领域专用工具封装的命令集
- **来源**：
  - MCP 工具通过 Mcp2Bash 转换（参考 Claude MCP 工具集成）
  - FunctionCalling 工具通过 Fc2Bash 转换
  - Skills 中定义的工具通过 Skill2Bash 转换
- **实现要求**：
  - 动态生成，运行时可扩展
  - 工具按领域分类存储：
    - `~/.synapse/tools/field/programming/` - 编程相关工具
    - `~/.synapse/tools/field/finance/` - 金融相关工具
    - `~/.synapse/tools/field/medical/` - 医疗相关工具
    - `~/.synapse/tools/field/<domain>/` - 其他领域工具
  - 支持工具索引和版本管理
  - Agent 可根据任务类型自动加载相应领域的工具集
- **自描述能力**：
  - `-h` 参数：输出简要信息
    - `field -h` → 列出所有可用领域（名称）
    - `field:finance -h` → 列出 finance 领域下的所有工具（名称和简短描述）
    - `field:finance:stock_query -h` → 显示 stock_query 工具的简要用法
  - `--help` 参数：输出详细信息
    - `field --help` → 列出所有领域的详细信息（描述、工具数量等）
    - `field:finance --help` → 列出 finance 领域下所有工具的详细信息（完整描述、参数 schema）
    - `field:finance:stock_query --help` → 显示 stock_query 工具的完整文档（所有参数、示例）

**架构验证目标**：
- **LLM 只看到唯一的 Bash 工具**：所有工具调用统一通过 `{"name": "Bash", "input": {"command": "..."}}`
- **命令解析器正确路由**：Agent 内部解析命令字符串，路由到 Base/Agent/Field 三层实现
- **自描述能力**：所有命令支持 `-h/--help` 参数，LLM 可自主探索可用命令
- **持久会话状态**：环境变量和工作目录在命令之间保持
- **会话重启**：支持 `restart: true` 参数重启 Bash 会话

---

### 4.2 工具转 Bash 转换器（阶段 1 核心）

工具转 Bash Agent 负责将不同来源的工具统一转换为 Bash 命令格式，是验证"一切工具都是 Bash"的核心组件。

#### 4.2.1 转换器架构

**工具转 Bash Agent**
- **职责**：识别工具类型并调用对应转换器
- **触发时机**：
  - **用户要求安装新工具时自动触发**：
    - 用户要求 Agent 安装 MCP（如："帮我安装 git-tools MCP"），Agent 安装完成后自动转换为 Bash
    - 用户手动安装完 MCP/工具后，启动 Agent 时自动检测并运行转换脚本
  - 技能强化 Agent 生成新工具时
  - 外源技能导入时
- **工作流程**：
  1. 分析工具定义格式，识别来源类型
  2. 调用对应转换器（Mcp2Bash / Fc2Bash / Skill2Bash）
  3. 生成 Bash 命令文件，包含：
     - 命令名称和别名
     - `-h` 和 `--help` 自描述逻辑
     - 参数解析和验证
     - 底层工具调用逻辑
  4. 保存到对应目录并更新工具索引
  5. 使 Bash 命令在当前会话中立即可用

#### 4.2.2 三种转换器

**Mcp2Bash 转换器**
- **输入**：MCP 工具定义（inputSchema 格式）
- **转换规则**：
  - `inputSchema` → Bash 参数 schema
  - MCP `call_tool()` → Bash 函数调用
- **输出示例**：
  ```bash
  # 生成的 Bash 命令文件：~/.synapse/tools/field/programming/mcp_git_commit
  #!/bin/bash
  # Tool: git_commit (from MCP server: git-tools)
  # Description: Commit changes to git repository

  if [[ "$1" == "-h" ]]; then
    echo "git_commit <message> [--author <name>]"
    exit 0
  fi

  if [[ "$1" == "--help" ]]; then
    echo "Detailed help for git_commit..."
    exit 0
  fi

  # 参数解析和 MCP 调用逻辑...
  ```

**Fc2Bash 转换器**
- **输入**：FunctionCalling 工具定义（JSON Schema）
- **转换规则**：
  - JSON Schema `properties` → Bash 参数定义
  - Function 调用 → Bash 函数执行
- **输出**：与 Mcp2Bash 类似格式的 Bash 文件

**Skill2Bash 转换器**
- **输入**：Skill 目录中的 `scripts/` 子目录下的可执行脚本（Python、Shell 等）
- **职责**：将 Skill 内的脚本转换为可通过 Bash 命令调用的 Field Bash 工具
- **转换规则**：
  - 扫描 `scripts/` 目录下的脚本文件（`.py`、`.sh` 等）
  - 解析脚本的 docstring 或注释获取描述和参数信息
  - 生成对应的 BashCommand 包装器
- **示例**：
  ```
  Skill 目录：
  ~/.synapse/skills/programming/code-quality-analyzer/
  ├── SKILL.md
  └── scripts/
      └── analyze.py  # 输入脚本

  转换结果：
  ~/.synapse/tools/field/programming/skill_code_quality_analyzer_analyze
  # 可通过 field:programming:skill_code_quality_analyzer_analyze 调用
  ```
- **脚本执行特点**（参考 Claude 官方文档）：
  - 脚本通过 Bash 执行，脚本代码本身不进入上下文窗口
  - 仅脚本的输出（stdout/stderr）进入上下文
  - 脚本提供确定性操作，比 LLM 即时生成代码更可靠高效
- **输出**：BashCommand 包装文件，包含脚本调用逻辑和参数传递

#### 4.2.3 工具索引和管理

- **工具索引文件**：`~/.synapse/tools/index.json`
  ```json
  {
    "agent": {
      "read": {"version": "1.0.0", "path": "agent/read"},
      "write": {"version": "1.0.0", "path": "agent/write"}
    },
    "field": {
      "programming": {
        "git_commit": {"version": "1.0.0", "source": "mcp", "path": "field/programming/mcp_git_commit"}
      },
      "finance": {
        "stock_query": {"version": "1.0.0", "source": "function_calling", "path": "field/finance/fc_stock_query"}
      }
    }
  }
  ```

- **版本管理**：支持工具更新时的版本控制，避免破坏性变更

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
1. **角色定义**：你是 Synapse Agent，一个通用智能助手
2. **工具使用规范**：
   - 所有操作通过 Bash 命令完成
   - 使用 `-h` 探索工具简要信息
   - 使用 `--help` 查看详细文档
3. **三层 Bash 说明**：
   - Base Bash：系统命令
   - Agent Bash：核心功能（read、write、task、skill 等）
   - Field Bash：领域工具（通过 `field -h` 探索）
4. **技能加载提示**：任务复杂时，考虑使用 `task` 调用技能搜索 Agent
5. **记忆机制**：重要信息和新生成的工具保存到文件系统

---

### 4.4 CLI 交互增强（阶段 1 易用性）

#### 4.4.1 Shell 命令直接执行

**功能概述**：
在 REPL 交互模式中，支持用户通过 `!` 前缀直接执行 Shell 命令，无需通过 LLM 处理，提供快速的命令行操作体验。

**核心需求**：
- **触发机制**：用户输入以 `!` 开头时，识别为 Shell 命令
- **命令提取**：去掉 `!` 前缀后，将剩余字符串作为完整的 Shell 命令
- **执行方式**：使用 `subprocess.run()` 在当前工作目录执行
- **输出处理**：命令的标准输出和标准错误直接连接到终端（流式输出）
- **错误处理**：命令执行失败时显示退出码，但继续 REPL 循环

**技术实现要点**：
```python
# 在 REPL.start() 主循环中的处理流程
user_input = self._get_input()

# 检查是否为 Shell 命令（在检查特殊命令之后、发送给 Agent 之前）
if user_input.strip().startswith("!"):
    shell_command = user_input.strip()[1:].strip()
    self._execute_shell_command(shell_command)
    continue

# _execute_shell_command 实现
def _execute_shell_command(self, command: str) -> None:
    """Execute a shell command directly."""
    result = subprocess.run(
        command,
        shell=True,
        cwd=os.getcwd(),  # 使用当前工作目录
        stdout=None,      # 直接输出到终端
        stderr=None       # 直接输出到终端
    )

    # 如果命令失败，显示退出码
    if result.returncode != 0:
        self._console.print(
            f"[dim]Command exited with code {result.returncode}[/dim]"
        )
```

**行为规范**：
- **工作目录**：使用用户启动 `synapse chat` 时的当前工作目录
- **输出方式**：保持原生 Shell 输出，支持流式输出和交互式命令
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
