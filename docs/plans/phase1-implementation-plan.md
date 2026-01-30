# Synapse Agent 阶段 1 实施计划

**版本**: v1.0
**日期**: 2026-01-25
**状态**: 待审核
**执行策略**: 方案 A - 细粒度分批执行（每批 3-5 个任务）

---

## 技术决策确认

- **LLM 模型**: Minimax 2.1（已有 API 访问权限）
- **核心架构**: LLM 只看到唯一的 Bash 工具（直接实施，无需 PoC）
- **Bash 会话**: 持久会话（整个对话期间保持一个 shell 进程）
- **技术栈**: Bun + TypeScript
- **预计时间**: 8-12 周

---

## 批次总览

| 批次 | 名称 | 任务数 | 核心目标 | 验证标准 |
|------|------|--------|---------|----------|
| 1 | 项目初始化 + 最小 CLI | 3 | 搭建项目基础结构 | CLI 能启动并接收输入 |
| 2 | Minimax 集成 + 单一 Bash 工具 | 3 | 实现核心架构 | LLM 能通过 Bash 工具响应 |
| 3 | 持久 Bash 会话 | 3 | 实现会话管理 | 会话状态在命令间保持 |
| 4 | Agent Shell Command 核心工具 | 3 | read/write/edit | 能读写编辑文件 |
| 5 | Agent Shell Command 扩展工具 | 3 | glob/grep/bash | 能搜索和执行命令 |
| 6 | Agent Loop 完善 | 3 | 上下文管理 | 多轮对话正常工作 |
| 7 | Mcp2Bash 转换器 Part 1 | 3 | MCP 工具发现 | 能解析 MCP 配置 |
| 8 | Mcp2Bash 转换器 Part 2 | 3 | MCP 工具转换 | 能调用 mcp:* 命令 |
| 9 | Skill2Bash 转换器 | 3 | Skill 工具转换 | 能调用 skill:* 命令 |
| 10 | 后台监听进程 | 3 | 自动工具更新 | 新增 skill 自动可用 |
| 11 | 基础技能系统 Part 1 | 3 | 技能存储和索引 | skill search 能工作 |
| 12 | 基础技能系统 Part 2 | 3 | 技能加载 | 能加载并执行技能 |
| 13 | CLI 交互增强 | 3 | 用户体验优化 | Shell 命令直接执行 |
| 14 | 集成测试和优化 | 2 | 质量保证 | E2E 测试通过, 成功率 > 80% |
| 15 | 文档和验收 | 3 | 阶段 1 完成 | 通过所有验收标准 |

**总计**: 15 批次，44 个任务

---

## 详细任务分解

### 批次 1：项目初始化 + 最小 CLI

**目标**: 搭建项目基础结构，实现最基本的 CLI 框架

**任务列表**:

1. **创建项目结构和配置文件**
   - 初始化 Bun 项目（`bun init`）
   - 创建目录结构：
     ```
     src/
       cli/         # CLI 相关
       agent/       # Agent 核心
       tools/       # 工具系统
       skills/      # 技能系统
       utils/       # 工具函数
     ```
   - 配置文件：
     - `tsconfig.json`
     - `.env.example`（包含 MINIMAX_API_KEY）
   - 安装核心依赖：
     - `commander` - CLI 框架
     - `ink` + `@inkjs/ui` - CLI 交互界面
     - `chalk` - 终端颜色
     - `zod` - Schema 验证

2. **实现基础 CLI 框架**
   - 创建 `src/cli/index.ts` 作为入口
   - 使用 `commander` 定义命令：
     - `synapse chat` - 启动 REPL 对话模式
     - `synapse --version` - 显示版本
     - `synapse --help` - 显示帮助
   - 实现基础的命令参数解析

3. **实现 REPL 交互模式**
   - 创建 `src/cli/repl.ts`
   - 实现基础 REPL 循环：
     - 显示提示符：`You (N)> `
     - 读取用户输入
     - 暂时回显用户输入（占位符响应）
     - 支持 `/exit` 退出
   - 基础错误处理

**验证标准**:
- ✅ `bun run src/cli/index.ts chat` 能启动 REPL
- ✅ 能接收用户输入并回显
- ✅ `/exit` 能正常退出

**预计时间**: 3-5 天

---

### 批次 2：Minimax 集成 + 单一 Bash 工具

**目标**: 实现核心架构 - LLM 只看到唯一的 Bash 工具

**任务列表**:

4. **集成 Minimax API**
   - 安装依赖：`@anthropic-ai/sdk`
   - 创建 `src/agent/llm-client.ts`
   - 实现 Minimax API 调用：
     - 使用 Anthropic SDK 兼容模式
     - 配置 API endpoint（通过环境变量）
     - 实现流式响应处理
   - 环境变量配置：
     - `MINIMAX_API_KEY`
     - `MINIMAX_API_BASE_URL`（可选）
     - `MINIMAX_MODEL`（默认 "minimax-2.1"）

5. **实现 LLM 唯一的 Bash 工具（Tool Use Schema）**
   - 创建 `src/tools/bash-tool-schema.ts`
   - 定义 Bash 工具的 JSON Schema：
     ```typescript
     const BashToolSchema = {
       name: "Bash",
       description: "Execute bash commands in a persistent shell session",
       input_schema: {
         type: "object",
         properties: {
           command: {
             type: "string",
             description: "The bash command to execute"
           },
           restart: {
             type: "boolean",
             description: "Restart the shell session before executing",
             default: false
           }
         },
         required: ["command"]
       }
     };
     ```
   - 将此工具注入到 LLM 的 tools 参数中

6. **实现 Bash 命令路由器（BashRouter）**
   - 创建 `src/tools/bash-router.ts`
   - 实现命令解析和路由逻辑：
     - 识别命令类型（Native Shell Command / Agent Shell Command / Extension Shell Command）
     - 路由到对应的处理器
   - 暂时只支持 Native Shell Command（直接执行系统命令）
   - 创建 `src/tools/handlers/native-shell-handler.ts`
     - 将命令传递给持久 Bash 会话执行

**验证标准**:
- ✅ LLM 能接收 Bash 工具并调用
- ✅ 能执行简单的系统命令（如 `ls`, `pwd`）
- ✅ 命令执行结果能返回给 LLM

**预计时间**: 4-6 天

---

### 批次 3：持久 Bash 会话

**目标**: 实现持久 Bash 会话管理，保持环境变量和工作目录状态

**任务列表**:

7. **实现持久 Bash 会话管理**
   - 创建 `src/tools/bash-session.ts`
   - 实现 `BashSession` 类：
     - 使用 `child_process.spawn()` 启动 bash 进程
     - 保持进程在整个对话期间运行
     - 实现命令执行和输出捕获
     - 实现超时机制（默认 30 秒）
   - 技术要点：
     - stdin/stdout/stderr 管道管理
     - 命令结束符检测（使用特殊 marker）
     - 环境变量持久化

8. **实现会话重启机制**
   - 在 `BashSession` 中实现 `restart()` 方法
   - 处理 Bash 工具的 `restart: true` 参数
   - 重启流程：
     - 终止当前 bash 进程
     - 启动新的 bash 进程
     - 重新初始化环境变量
   - 记录重启事件到日志

9. **在系统提示词中引导 LLM 使用 Native Shell Command**
   - 创建 `src/agent/system-prompt.ts`
   - 编写系统提示词：
     ```markdown
     你是 Synapse Agent，一个基于统一 Shell 抽象的通用智能助手。

     所有操作通过 Shell Command 完成。你可以使用标准的 Unix 命令：
     - ls / cd / pwd：目录操作
     - grep / find：文件搜索
     - git：版本控制
     - curl / wget：网络请求

     Shell 会话是持久的，环境变量和工作目录在命令之间保持。
     如需重启会话，使用 restart: true 参数。
     ```
   - 在 LLM 调用中注入系统提示词

**验证标准**:
- ✅ 会话状态在命令之间保持（`cd /tmp && pwd` 返回 /tmp）
- ✅ 环境变量持久化（`export FOO=bar` 后 `echo $FOO` 返回 bar）
- ✅ `restart: true` 能重启会话

**预计时间**: 4-6 天

---

### 批次 4：Agent Shell Command Layer 2 核心工具

**目标**: 实现 Agent Shell Command 核心工具（read/write/edit）

**任务列表**:

10. **实现 read 工具**
    - 创建 `src/tools/handlers/agent-shell/read.ts`
    - 功能：读取文件内容
    - 参数：
      - `file_path` (必填): 文件绝对路径
      - `--offset` (可选): 起始行号
      - `--limit` (可选): 读取行数
    - 实现：
      - 使用 `fs.readFileSync()` 读取文件
      - 按行分割并应用 offset/limit
      - 输出格式：带行号的内容（`cat -n` 格式）
    - 注册到 BashRouter（识别 `read ` 前缀）

11. **实现 write 工具**
    - 创建 `src/tools/handlers/agent-shell/write.ts`
    - 功能：写入文件
    - 参数：
      - `file_path` (必填): 文件绝对路径
      - `content` (必填): 文件内容
    - 实现：
      - 使用 `fs.writeFileSync()` 写入文件
      - 自动创建父目录（如不存在）
      - 返回成功/失败信息
    - 注册到 BashRouter

12. **实现 edit 工具**
    - 创建 `src/tools/handlers/agent-shell/edit.ts`
    - 功能：替换文件中的字符串
    - 参数：
      - `file_path` (必填): 文件绝对路径
      - `old_string` (必填): 要替换的字符串
      - `new_string` (必填): 替换后的字符串
      - `--all` (可选): 替换所有匹配（默认只替换第一个）
    - 实现：
      - 读取文件内容
      - 字符串替换（精确匹配）
      - 写回文件
      - 返回替换次数
    - 注册到 BashRouter

**验证标准**:
- ✅ `read /path/to/file` 能正确读取文件
- ✅ `write /path/to/file <content>` 能正确写入
- ✅ `edit /path/to/file "old" "new"` 能正确替换

**预计时间**: 4-6 天

---

### 批次 5：Agent Shell Command 扩展工具

**目标**: 实现 Agent Shell Command 扩展工具（glob/grep/bash）

**任务列表**:

13. **实现 glob 工具**
    - 创建 `src/tools/handlers/agent-shell/glob.ts`
    - 功能：文件模式匹配
    - 参数：
      - `pattern` (必填): glob 模式（如 `*.ts`, `src/**/*.js`）
      - `--path` (可选): 搜索路径（默认当前目录）
    - 实现：
      - 使用 `glob` 或 `fast-glob` 库
      - 返回匹配的文件路径列表
      - 按修改时间排序
    - 注册到 BashRouter

14. **实现 grep 工具**
    - 创建 `src/tools/handlers/agent-shell/grep.ts`
    - 功能：代码搜索
    - 参数：
      - `pattern` (必填): 搜索模式（支持正则）
      - `--path` (可选): 搜索路径
      - `--type` (可选): 文件类型（js, ts, py 等）
      - `--context` (可选): 上下文行数
    - 实现：
      - 使用 `ripgrep` 或纯 Node.js 实现
      - 返回匹配的文件和行号
    - 注册到 BashRouter

15. **实现 bash 工具（包装器）**
    - 创建 `src/tools/handlers/agent-shell/bash.ts`
    - 功能：显式执行 Bash 命令（与 Native Shell Command 相同）
    - 说明：这是一个显式的包装器，允许 LLM 明确表示要执行系统命令
    - 实现：直接调用 BashSession 执行命令
    - 注册到 BashRouter

**验证标准**:
- ✅ `glob "src/**/*.ts"` 能返回所有 TypeScript 文件
- ✅ `grep "TODO" --type ts` 能搜索代码中的 TODO
- ✅ `bash ls -la` 能执行系统命令

**预计时间**: 4-6 天

---

### 批次 6：Agent Loop 完善

**目标**: 完善 Agent Loop，实现上下文管理和多轮对话

**任务列表**:

16. **实现上下文管理（对话历史）**
    - 创建 `src/agent/context-manager.ts`
    - 实现 `ContextManager` 类：
      - 维护对话历史（messages 数组）
      - 添加用户消息
      - 添加助手消息
      - 添加工具调用和结果
      - 上下文窗口管理（保持在限制内）
    - 集成到 REPL 主循环

17. **实现系统提示词动态注入**
    - 扩展 `src/agent/system-prompt.ts`
    - 实现动态提示词构建：
      - 基础角色定义
      - Native Shell Command 命令说明
      - Agent Shell Command 工具详细说明（read/write/edit/glob/grep）
      - 工具使用规范
    - 在每次 LLM 调用时注入完整的系统提示词

18. **实现工具执行结果处理**
    - 创建 `src/agent/tool-executor.ts`
    - 实现工具执行流程：
      - 识别 LLM 返回的工具调用
      - 调用 BashRouter 执行命令
      - 捕获执行结果（stdout/stderr）
      - 格式化结果返回给 LLM
      - 错误处理和重试机制
    - 在 REPL 中集成工具执行循环

**验证标准**:
- ✅ 多轮对话能正常工作（LLM 能记住上下文）
- ✅ 工具调用结果能正确返回给 LLM
- ✅ 错误能被捕获并展示给用户

**预计时间**: 5-7 天

---

### 批次 7：Mcp2Bash 转换器 Part 1

**目标**: 实现 MCP 工具发现和连接

**任务列表**:

19. **实现 MCP 配置解析**
    - 创建 `src/tools/converters/mcp/config-parser.ts`
    - 功能：解析 `mcp_servers.json` 配置文件
    - 配置文件位置：
      - 当前目录：`./mcp_servers.json`
      - 用户目录：`~/.synapse/mcp/mcp_servers.json`
    - 解析逻辑：
      - 读取 JSON 配置
      - 验证 schema（使用 zod）
      - 提取 MCP server 定义（command/url 方式）
    - 返回 MCP server 配置列表

20. **实现 MCP Server 连接**
    - 创建 `src/tools/converters/mcp/mcp-client.ts`
    - 实现 MCP 协议客户端：
      - 通过 command 启动本地 MCP server
      - 通过 url 连接远程 MCP server
      - 实现 MCP 协议握手
    - 使用 `@modelcontextprotocol/sdk` 或自行实现
    - 错误处理：连接失败、超时等

21. **实现工具列表获取**
    - 在 `mcp-client.ts` 中实现 `listTools()` 方法
    - 调用 MCP server 的 `tools/list` 端点
    - 解析返回的工具列表：
      - 工具名称
      - 工具描述
      - inputSchema (JSON Schema)
    - 返回结构化的工具元数据

**验证标准**:
- ✅ 能解析 `mcp_servers.json` 配置
- ✅ 能连接至少 1 个 MCP server（本地或远程）
- ✅ 能获取 MCP server 的工具列表

**预计时间**: 5-7 天

---

### 批次 8：Mcp2Bash 转换器 Part 2

**目标**: 实现 MCP 工具到 Bash 命令的转换

**任务列表**:

22. **实现 Bash 命令包装器生成**
    - 创建 `src/tools/converters/mcp/wrapper-generator.ts`
    - 功能：为每个 MCP 工具生成 Bash 脚本
    - 生成逻辑：
      - 命令名称：`mcp:<mcp_name>:<tool>`
      - 参数解析：根据 inputSchema 生成参数处理逻辑
      - MCP 调用：调用 MCP server 的 `tools/call` 端点
      - 输出处理：格式化工具返回结果
    - 脚本模板：
      ```bash
      #!/bin/bash
      # Generated: mcp:git-tools:commit
      # ...参数解析和 MCP 调用逻辑
      ```

23. **实现工具自描述（-h/--help）**
    - 在包装器脚本中添加 `-h` 和 `--help` 处理
    - `-h` 输出：简要用法（1-2 行）
    - `--help` 输出：完整文档（参数、类型、示例）
    - 从 inputSchema 自动生成文档内容

24. **实现命令安装到 ~/.synapse/bin/**
    - 创建 `src/tools/converters/mcp/installer.ts`
    - 功能：
      - 创建 `~/.synapse/bin/` 目录
      - 将生成的包装器脚本写入目录
      - 设置可执行权限（`chmod +x`）
      - 确保 `~/.synapse/bin/` 在 PATH 中
    - 实现 `tools search` 命令（MCP 部分）：
      - 扫描 `~/.synapse/bin/mcp:*` 文件
      - 支持关键词和正则匹配
      - 返回匹配的工具名称列表
    - 注册 `tools search` 到 BashRouter

**验证标准**:
- ✅ MCP 工具能生成 `mcp:*` 命令
- ✅ 命令支持 `-h` 和 `--help`
- ✅ `tools search "git"` 能找到相关工具

**预计时间**: 5-7 天

---

### 批次 9：Skill2Bash 转换器

**目标**: 实现 Skill 脚本到 Bash 命令的转换

**任务列表**:

25. **实现 Skills 目录结构设计**
    - 创建 `~/.synapse/skills/` 目录结构：
      ```
      ~/.synapse/skills/
        pdf-editor/
          SKILL.md           # 技能文档
          scripts/           # 可执行脚本
            extract_text.py
            merge_files.sh
        code-analyzer/
          SKILL.md
          scripts/
            check_quality.py
      ```
    - 创建 `src/skills/skill-structure.ts` 定义技能结构的 Schema

26. **实现脚本 docstring 解析**
    - 创建 `src/tools/converters/skill/docstring-parser.ts`
    - 功能：从脚本中提取元数据
    - 支持的脚本类型：
      - Python: 解析 docstring（`"""..."""`）
      - Shell: 解析注释（`# ...`）
    - 提取信息：
      - 脚本描述
      - 参数列表（名称、类型、必填/可选）
      - 使用示例
    - 使用正则表达式或 AST 解析

27. **实现 skill:* 命令包装器生成**
    - 创建 `src/tools/converters/skill/wrapper-generator.ts`
    - 功能：为每个 Skill 脚本生成 Bash 包装器
    - 生成逻辑：
      - 命令名称：`skill:<skill_name>:<tool>`
      - 包装器调用实际脚本（Python/Shell）
      - 支持 `-h` 和 `--help`（从 docstring 生成）
    - 安装到 `~/.synapse/bin/`

**验证标准**:
- ✅ 能扫描 `~/.synapse/skills/` 目录
- ✅ 能解析 Python 和 Shell 脚本的 docstring
- ✅ 能生成 `skill:*` 命令并执行

**预计时间**: 5-7 天

---

### 批次 10：后台监听进程

**目标**: 实现自动监听 Skills 目录变化，动态生成工具

**任务列表**:

28. **实现文件系统监听**
    - 安装依赖：`chokidar`
    - 创建 `src/tools/converters/skill/watcher.ts`
    - 实现 `SkillWatcher` 类：
      - 监听 `~/.synapse/skills/` 目录
      - 检测变化：新增/修改/删除
      - 过滤监听范围：只关注 `scripts/` 子目录
    - 实现事件处理器：
      - `onAdd`: 新脚本添加
      - `onChange`: 脚本修改
      - `onUnlink`: 脚本删除

29. **实现自动工具更新机制**
    - 在 `SkillWatcher` 中集成 Skill2Bash 转换器
    - 变化处理流程：
      - 检测到新脚本 → 生成包装器 → 安装到 bin
      - 检测到脚本修改 → 重新生成包装器
      - 检测到脚本删除 → 删除对应的命令
    - 实现防抖机制（避免频繁重新生成）
    - 记录转换日志

30. **扩展 tools search 工具（Skill 部分）**
    - 在 `tools search` 中添加 Skill 工具搜索
    - 扫描 `~/.synapse/bin/skill:*` 命令
    - 合并 MCP 和 Skill 工具的搜索结果
    - 支持过滤：
      - 只搜索 MCP: `tools search "mcp:.*"`
      - 只搜索 Skill: `tools search "skill:.*"`

**验证标准**:
- ✅ 后台监听进程能持续运行
- ✅ 新增 Skill 脚本后，命令自动可用（无需手动刷新）
- ✅ `tools search` 能找到所有 mcp:* 和 skill:* 工具

**预计时间**: 4-6 天

---

### 批次 11：基础技能系统 Part 1

**目标**: 实现技能存储、索引和搜索

**任务列表**:

31. **设计技能文件结构（SKILL.md）**
    - 定义 SKILL.md 格式规范：
      ```markdown
      # 技能名称

      **领域**: programming | finance | general | ...
      **描述**: 一句话描述技能功能
      **标签**: tag1, tag2, tag3

      ## 使用场景
      描述技能的典型使用场景...

      ## 工具依赖
      - skill:pdf-editor:extract_text
      - mcp:filesystem:read_file

      ## 执行流程
      1. 步骤 1
      2. 步骤 2
      ...

      ## 示例
      示例输入输出...
      ```
    - 创建 `src/skills/skill-schema.ts` 定义 Schema

32. **实现技能索引（index.json）**
    - 创建 `src/skills/indexer.ts`
    - 功能：扫描 `~/.synapse/skills/` 并生成索引
    - 索引文件位置：`~/.synapse/skills/index.json`
    - 索引内容：
      ```json
      {
        "skills": [
          {
            "name": "pdf-editor",
            "domain": "programming",
            "description": "PDF 文件处理工具集",
            "tags": ["pdf", "document", "text-extraction"],
            "tools": ["skill:pdf-editor:extract_text"],
            "path": "/Users/.../skills/pdf-editor"
          }
        ],
        "updated_at": "2026-01-25T10:00:00Z"
      }
      ```
    - 实现索引更新机制（手动 + 自动）

33. **实现 skill search 工具**
    - 创建 `src/tools/handlers/agent-shell/skill-search.ts`
    - 功能：在技能库中搜索匹配的技能
    - 搜索逻辑：
      - 关键词匹配：名称、描述、标签
      - 领域过滤
      - 工具依赖匹配
    - 返回格式：
      ```
      Found 2 matching skills:

      1. pdf-editor (programming)
         - PDF 文件处理工具集
         - Tags: pdf, document, text-extraction

      2. code-analyzer (programming)
         - 代码质量分析工具
         - Tags: code, quality, linting
      ```
    - 注册到 BashRouter

**验证标准**:
- ✅ 能解析 SKILL.md 文件
- ✅ 能生成技能索引
- ✅ `skill search "pdf"` 能找到相关技能

**预计时间**: 4-6 天

---

### 批次 12：基础技能系统 Part 2

**目标**: 实现技能加载和执行

**任务列表**:

34. **实现技能加载机制**
    - 创建 `src/skills/skill-loader.ts`
    - 实现三层渐进式加载（Level 1, 2）：
      - **Level 1**: 加载技能元数据（从 index.json）
        - 返回：名称、描述、标签
      - **Level 2**: 加载完整 SKILL.md
        - 返回：完整的使用说明、执行流程
      - （Level 3 在阶段 2 实现）
    - 实现缓存机制（避免重复加载）

35. **在系统提示词中注入技能使用说明**
    - 扩展 `src/agent/system-prompt.ts`
    - 添加技能管理说明：
      ```markdown
      ## 技能系统

      当任务需要特定领域能力时：
      1. 使用 skill search "<功能描述>" 搜索相关技能
      2. 从返回列表中选择合适的技能
      3. 加载技能的 SKILL.md 文档（通过 read 命令）
      4. 根据文档指导完成任务

      技能位置：~/.synapse/skills/<skill-name>/SKILL.md
      ```
    - 实现动态技能信息注入（根据对话上下文）

36. **创建示例技能用于测试**
    - 创建 2-3 个示例技能：
      - `example-file-analyzer`：分析文件内容统计
      - `example-git-helper`：Git 操作辅助
    - 每个技能包含：
      - SKILL.md 文档
      - scripts/ 目录（至少 1 个脚本）
    - 用于验证技能系统端到端流程

**验证标准**:
- ✅ LLM 能通过 skill search 发现技能
- ✅ LLM 能加载 SKILL.md 并理解使用方法
- ✅ 能成功执行至少 1 个示例技能

**预计时间**: 5-7 天

---

### 批次 13：CLI 交互增强

**目标**: 提升 CLI 用户体验

**任务列表**:

37. **实现 Shell 命令直接执行（! 前缀）**
    - 在 REPL 主循环中检测 `!` 前缀
    - 实现 `executeShellCommand()` 方法：
      - 提取 `!` 后的命令
      - 使用 `child_process.spawn()` 执行
      - 流式输出到终端（stdout/stderr: "inherit"）
      - 显示退出码（如果失败）
    - 不影响 Agent 的上下文和历史

38. **实现 REPL 特殊命令**
    - 支持的特殊命令：
      - `/help` - 显示帮助信息
      - `/exit` - 退出 REPL
      - `/clear` - 清空对话历史
      - `/tools` - 列出所有可用工具
      - `/skills` - 列出所有技能
    - 在 REPL 输入处理中添加命令检测和路由

39. **实现命令历史和自动补全（可选）**
    - 使用 `readline` 或 `inquirer` 增强输入体验
    - 功能：
      - 上下箭头浏览历史命令
      - Tab 自动补全（特殊命令）
    - 历史存储：依赖上下文持久化（`~/.synapse/conversations/`）
    - 如果时间有限，可以延后到批次 14

**验证标准**:
- ✅ `!ls -la` 能直接执行 Shell 命令
- ✅ `/help` 能显示帮助信息
- ✅ `/tools` 能列出所有工具

**预计时间**: 3-5 天

---

### 批次 14：集成测试和优化

**目标**: 确保系统稳定性和性能

**任务列表**:

40. **端到端测试（完整对话流程）**
    - 创建 `tests/e2e/` 目录
    - 编写测试场景：
      - 场景 1：基础对话和 Native Shell Command 命令
      - 场景 2：Agent Shell Command 工具（read/write/edit）
      - 场景 3：MCP 工具调用（mcp:*）
      - 场景 4：Skill 工具调用（skill:*）
      - 场景 5：技能搜索和加载
    - 使用测试框架（如 Vitest）
    - 覆盖关键路径

41. **错误处理和日志完善**
    - 创建 `src/utils/logger.ts`
    - 实现分级日志：
      - DEBUG: 详细调试信息
      - INFO: 正常操作日志
      - WARN: 警告信息
      - ERROR: 错误和异常
    - 关键操作日志：
      - LLM 调用（请求/响应）
      - 工具执行（命令/结果）
      - 技能加载（名称/路径）
      - MCP 连接（server/状态）
    - 日志文件：`~/.synapse/logs/agent.log`
    - 实现友好的错误提示

**验证标准**:
- ✅ 所有 E2E 测试通过
- ✅ 错误信息清晰可理解

**预计时间**: 5-7 天

---

### 批次 15：文档和验收

**目标**: 完成阶段 1 文档和验收测试

**任务列表**:

42. **编写用户使用指南**
    - 创建 `docs/user-guide.md`
    - 内容包括：
      - 快速开始（安装和配置）
      - 基础使用（启动 REPL、执行命令）
      - Agent Shell Command 工具参考
      - MCP 工具配置和使用
      - Skill 工具开发指南
      - 常见问题 FAQ
    - 包含截图和示例

43. **编写架构设计文档**
    - 创建 `docs/architecture.md`
    - 内容包括：
      - 系统架构概览
      - 三层 Shell Command 架构详解
      - Bash 命令路由机制
      - 持久会话实现
      - 工具转换机制（Mcp2Bash、Skill2Bash）
      - 技能系统设计
      - 核心类和模块说明
    - 包含架构图和流程图

44. **准备阶段 1 验收测试**
    - 创建验收测试清单（基于 PRD 验证标准）：
      - ✅ 用户可以通过 CLI 与 Agent 交互
      - ✅ Agent 可以使用 Agent Shell Command 工具完成文件操作
      - ✅ LLM 只看到唯一的 Bash 工具
      - ✅ Bash 会话状态在命令之间保持
      - ✅ 支持 `restart: true` 参数重启会话
      - ✅ 所有命令支持 `-h/--help` 自描述
      - ✅ 成功转换至少 3 种不同类型的工具
      - ✅ 成功执行至少 2 个自定义技能
    - 执行验收测试并记录结果
    - 准备 Demo 演示视频或 GIF

**验证标准**:
- ✅ 用户指南完整清晰
- ✅ 架构文档准确详细
- ✅ 所有验收标准通过

**预计时间**: 4-6 天

---

## 总结

**总任务数**: 44 个任务
**总批次数**: 15 个批次
**预计总时间**: 8-12 周

### 关键里程碑

- **M1（第 2 周）**: 批次 1-3 完成 - 最小可运行 Agent
- **M2（第 4 周）**: 批次 4-6 完成 - Agent Shell Command 工具完整
- **M3（第 6 周）**: 批次 7-10 完成 - 工具转换系统完整
- **M4（第 8 周）**: 批次 11-13 完成 - 技能系统和 CLI 完善
- **M5（第 10-12 周）**: 批次 14-15 完成 - 阶段 1 验收通过

### 风险和应对

| 风险 | 应对策略 |
|------|---------|
| Minimax API 兼容性问题 | 准备 Anthropic Claude API 作为备选 |
| 持久 Bash 会话稳定性 | 实现完善的错误恢复和重启机制 |
| MCP 工具转换复杂度超预期 | 先支持简单的 MCP 工具，复杂工具延后 |
| 时间延期 | 优先完成核心功能，非核心功能降级或延后 |

---

**下一步**: 等待用户审核此计划，确认无误后开始执行批次 1。
