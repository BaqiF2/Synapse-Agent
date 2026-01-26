# PRD 阶段一 端到端验证测试用例

**版本**: v1.0
**日期**: 2026-01-25
**对应 PRD 版本**: v1.0 (2026-01-22)

---

## 测试概览

本文档包含 PRD 第一阶段所有功能的验证测试用例。每个测试用例可以：
- **脚本自动执行**: 通过 `bun test tests/e2e/phase1-validation/` 运行
- **用户手动执行**: 按照 "手动执行步骤" 在 CLI 中操作

### 执行方式标记

| 标记 | 含义 |
|------|------|
| `[AUTO]` | 可自动化测试 |
| `[MANUAL]` | 需用户手动执行 |
| `[HYBRID]` | 自动化 + 手动验证 |

---

## 一、三层 Bash 架构验证

### TC-1.1: LLM 只看到唯一的 Bash 工具 [AUTO]

**验证目标**: PRD 验证标准 - "LLM 只看到唯一的 Bash 工具"

**前置条件**:
- Synapse Agent 已安装
- 可访问 Bash Tool Schema 定义

**测试步骤**:
1. 检查 `src/tools/bash-tool-schema.ts` 中定义的工具
2. 验证 Schema 只定义了一个 `Bash` 工具
3. 验证所有命令（read、write、edit 等）通过 `command` 参数传递

**预期结果**:
- 只存在一个名为 `Bash` 的工具定义
- 工具 Schema 的 `name` 字段值为 `"Bash"`
- 工具输入包含 `command: string` 和 `restart?: boolean` 参数

**手动执行步骤**:
```bash
# 查看工具 Schema 定义
cat src/tools/bash-tool-schema.ts

# 验证点：
# 1. 导出的 BASH_TOOL_SCHEMA.name === "Bash"
# 2. inputSchema 包含 command 和 restart 参数
```

---

### TC-1.2: 命令路由正确性 [AUTO]

**验证目标**: BashRouter 能正确识别和路由三层命令

**前置条件**:
- BashRouter 实例可用
- BashSession 实例可用

**测试步骤**:
1. 识别 Native Shell Command 命令 (ls, pwd, echo)
2. 识别 Agent Shell Command 命令 (read, write, edit, glob, grep, skill search)
3. 识别 Extension Shell Command 命令 (mcp:*, skill:*, tools)

**测试数据**:
| 命令 | 期望类型 |
|------|---------|
| `ls -la` | NATIVE_SHELL |
| `pwd` | NATIVE_SHELL |
| `echo "test"` | NATIVE_SHELL |
| `read /path/file.txt` | AGENT_SHELL |
| `write /path/file.txt "content"` | AGENT_SHELL |
| `edit /path/file.txt "old" "new"` | AGENT_SHELL |
| `glob "*.ts"` | AGENT_SHELL |
| `grep "pattern"` | AGENT_SHELL |
| `skill search "query"` | AGENT_SHELL |
| `tools search "query"` | EXTENSION_SHELL |
| `mcp:server:tool arg` | EXTENSION_SHELL |
| `skill:name:tool arg` | EXTENSION_SHELL |

**预期结果**:
- 所有命令被正确分类到对应层级

**手动执行步骤**:
```bash
# 启动 synapse chat
bun run chat

# 在 REPL 中测试不同命令
# 观察命令是否正确执行（无报错）
```

---

### TC-1.3: Bash 会话状态持久化 [AUTO]

**验证目标**: PRD 验证标准 - "Bash 会话状态在命令之间保持"

**前置条件**:
- BashSession 实例可用

**测试步骤**:
1. 设置环境变量 `export TEST_VAR="value1"`
2. 执行 `echo $TEST_VAR`，验证输出 "value1"
3. 切换目录 `cd /tmp`
4. 执行 `pwd`，验证输出 "/tmp"
5. 设置另一个环境变量 `export TEST_VAR2="value2"`
6. 执行 `echo $TEST_VAR $TEST_VAR2`，验证两个变量都存在

**预期结果**:
- 环境变量在命令间保持
- 工作目录在命令间保持
- 多个变量可同时存在

**手动执行步骤**:
```bash
bun run chat

# 在 REPL 中执行（使用 ! 前缀）:
!export MY_VAR="hello"
!echo $MY_VAR
# 预期输出: hello

!cd /tmp
!pwd
# 预期输出: /tmp
```

---

### TC-1.4: Bash 会话重启 [AUTO]

**验证目标**: PRD 验证标准 - "支持 restart: true 参数重启会话"

**前置条件**:
- BashSession 实例可用

**测试步骤**:
1. 设置环境变量 `export RESTART_TEST="before_restart"`
2. 验证变量存在 `echo $RESTART_TEST` → "before_restart"
3. 调用 `router.route('echo $RESTART_TEST', true)` (restart=true)
4. 验证变量已清除（输出为空）

**预期结果**:
- restart=true 后，之前的环境变量不再存在
- 会话状态被重置

**手动执行步骤**:
```bash
# 此用例需要通过代码测试，因为 REPL 不直接暴露 restart 参数
# 运行自动化测试:
bun test tests/e2e/phase1-validation/phase1-e2e.test.ts -t "session restart"
```

---

## 二、Agent Shell Command 工具验证

### TC-2.1: read 工具 [AUTO]

**验证目标**: 文件读取功能

**测试步骤**:
1. 创建测试文件，内容为 5 行文本
2. `read <file>` - 读取全部内容
3. `read <file> --offset 2` - 从第 3 行开始读取
4. `read <file> --limit 2` - 只读取 2 行
5. `read <file> --offset 1 --limit 2` - 跳过 1 行，读取 2 行
6. `read <nonexistent>` - 读取不存在的文件

**预期结果**:
- 全部读取返回 5 行
- offset=2 返回第 3-5 行
- limit=2 返回第 1-2 行
- 组合参数正确工作
- 不存在文件返回错误

**手动执行步骤**:
```bash
bun run chat

# 创建测试文件
!echo -e "Line 1\nLine 2\nLine 3\nLine 4\nLine 5" > /tmp/test-read.txt

# 测试读取
read /tmp/test-read.txt
read /tmp/test-read.txt --offset 2
read /tmp/test-read.txt --limit 2
read /tmp/nonexistent.txt
```

---

### TC-2.2: write 工具 [AUTO]

**验证目标**: 文件写入功能

**测试步骤**:
1. `write <file> "content"` - 写入新文件
2. 验证文件内容正确
3. `write <file> "new content"` - 覆盖已有文件
4. 验证文件被覆盖
5. `write <nested/path/file> "content"` - 自动创建父目录
6. 验证嵌套目录被创建

**预期结果**:
- 文件正确创建和写入
- 覆盖正确工作
- 父目录自动创建

**手动执行步骤**:
```bash
bun run chat

write /tmp/test-write.txt "Hello World"
!cat /tmp/test-write.txt
# 预期: Hello World

write /tmp/test-write.txt "New Content"
!cat /tmp/test-write.txt
# 预期: New Content

write /tmp/nested/deep/file.txt "Nested"
!cat /tmp/nested/deep/file.txt
# 预期: Nested
```

---

### TC-2.3: edit 工具 [AUTO]

**验证目标**: 文件编辑功能

**测试步骤**:
1. 创建测试文件内容: "Hello World\nHello Again"
2. `edit <file> "Hello" "Hi"` - 替换首次出现
3. 验证只有第一个 Hello 被替换
4. 重置文件
5. `edit <file> "Hello" "Hi" --all` - 替换所有出现
6. 验证所有 Hello 都被替换

**预期结果**:
- 默认只替换首次出现
- --all 替换所有出现

**手动执行步骤**:
```bash
bun run chat

!echo -e "Hello World\nHello Again" > /tmp/test-edit.txt
edit /tmp/test-edit.txt "Hello" "Hi"
!cat /tmp/test-edit.txt
# 预期: Hi World\nHello Again

!echo -e "Hello World\nHello Again" > /tmp/test-edit.txt
edit /tmp/test-edit.txt "Hello" "Hi" --all
!cat /tmp/test-edit.txt
# 预期: Hi World\nHi Again
```

---

### TC-2.4: glob 工具 [AUTO]

**验证目标**: 文件模式匹配功能

**测试步骤**:
1. 创建测试目录结构:
   - /tmp/glob-test/file1.ts
   - /tmp/glob-test/file2.ts
   - /tmp/glob-test/file3.js
   - /tmp/glob-test/sub/nested.ts
2. `glob "*.ts" --path /tmp/glob-test` - 匹配当前目录 ts 文件
3. `glob "**/*.ts" --path /tmp/glob-test` - 递归匹配 ts 文件
4. `glob "*.js" --path /tmp/glob-test` - 匹配 js 文件

**预期结果**:
- 非递归匹配只返回当前目录文件
- 递归匹配包含子目录文件

**手动执行步骤**:
```bash
bun run chat

!mkdir -p /tmp/glob-test/sub
!touch /tmp/glob-test/file1.ts /tmp/glob-test/file2.ts /tmp/glob-test/file3.js /tmp/glob-test/sub/nested.ts

glob "*.ts" --path /tmp/glob-test
# 预期: file1.ts, file2.ts

glob "**/*.ts" --path /tmp/glob-test
# 预期: file1.ts, file2.ts, sub/nested.ts
```

---

### TC-2.5: grep 工具 [AUTO]

**验证目标**: 代码搜索功能

**测试步骤**:
1. 创建测试文件包含多个函数定义
2. `grep "function" --path <dir>` - 搜索关键词
3. `grep "console\\.log" --path <dir>` - 搜索正则表达式
4. `grep "pattern" --type ts` - 按文件类型过滤
5. `grep "pattern" -i` - 忽略大小写搜索

**预期结果**:
- 关键词搜索返回匹配行
- 正则搜索正确工作
- 文件类型过滤生效

**手动执行步骤**:
```bash
bun run chat

!mkdir -p /tmp/grep-test
!echo 'function hello() { console.log("hi"); }' > /tmp/grep-test/test.js

grep "function" --path /tmp/grep-test
grep "console\\.log" --path /tmp/grep-test
```

---

### TC-2.6: 工具帮助信息 [AUTO]

**验证目标**: PRD 验证标准 - "所有命令支持 -h/--help 自描述"

**测试步骤**:
对以下每个命令测试 -h 和 --help:
1. `read -h` / `read --help`
2. `write -h` / `write --help`
3. `edit -h` / `edit --help`
4. `glob -h` / `glob --help`
5. `grep -h` / `grep --help`
6. `skill search -h` / `skill search --help`
7. `tools search -h` / `tools search --help`

**预期结果**:
- 每个命令的 -h 输出简要用法
- 每个命令的 --help 输出完整文档
- 帮助信息包含: USAGE, OPTIONS, EXAMPLES

**手动执行步骤**:
```bash
bun run chat

read -h
read --help
write -h
edit --help
glob -h
grep --help
skill search --help
tools search --help
```

---

## 三、工具转换系统验证

### TC-3.1: MCP 配置解析 [AUTO]

**验证目标**: Mcp2Bash 转换器 - 配置解析

**前置条件**:
- 测试 MCP 配置文件存在

**测试步骤**:
1. 创建 MCP 配置文件 `mcp_servers.json`
2. 配置 command 类型和 url 类型服务器
3. 使用 McpConfigParser 解析
4. 验证解析结果

**测试数据**:
```json
{
  "mcpServers": {
    "local-server": {
      "command": "node",
      "args": ["server.js"]
    },
    "remote-server": {
      "url": "https://example.com/mcp"
    }
  }
}
```

**预期结果**:
- 正确识别 command 类型服务器
- 正确识别 url 类型服务器
- 返回服务器列表

**手动执行步骤**:
```bash
# 此用例主要通过自动化测试验证
bun test tests/e2e/phase1-validation/phase1-e2e.test.ts -t "MCP config"
```

---

### TC-3.2: Skill 包装脚本生成 [AUTO]

**验证目标**: Skill2Bash 转换器 - 包装脚本生成

**前置条件**:
- 测试技能目录存在
- 技能包含 scripts/ 子目录

**测试步骤**:
1. 创建测试技能结构
2. 调用 SkillWrapperGenerator
3. 验证生成的包装脚本
4. 验证脚本包含 -h/--help 支持

**预期结果**:
- 包装脚本正确生成
- 脚本可执行
- 支持 -h/--help 参数

---

### TC-3.3: tools search 工具 [AUTO]

**验证目标**: 工具搜索功能

**测试步骤**:
1. 安装测试工具到 ~/.synapse/bin/
2. `tools search "*"` - 列出所有工具
3. `tools search "mcp:*"` - 搜索 MCP 工具
4. `tools search "skill:*"` - 搜索 Skill 工具
5. `tools search "test"` - 关键词搜索

**预期结果**:
- 正确列出已安装工具
- 通配符匹配正确
- 关键词搜索有效

**手动执行步骤**:
```bash
bun run chat

tools search "*"
tools search --type mcp
tools search --type skill
```

---

## 四、基础 Agent Loop 验证

### TC-4.1: CLI 交互界面 [MANUAL]

**验证目标**: 用户可以通过 CLI 与 Agent 交互

**测试步骤**:
1. 启动 `bun run chat`
2. 验证欢迎消息显示
3. 验证提示符格式 `You (N)>`
4. 输入消息，验证 Agent 响应
5. 输入下一条消息，验证轮次增加

**预期结果**:
- 欢迎消息正确显示
- 提示符包含轮次数
- Agent 能够响应用户输入

**手动执行步骤**:
```bash
bun run chat
# 预期: 显示欢迎消息和提示符 "You (1)>"

# 输入任意问题
你好
# 预期: Agent 响应，然后显示 "You (2)>"
```

---

### TC-4.2: 特殊命令 [AUTO/MANUAL]

**验证目标**: REPL 特殊命令功能

**测试步骤**:
1. `/help` - 显示帮助信息
2. `/clear` - 清除对话历史
3. `/history` - 显示对话历史
4. `/tools` - 列出可用工具
5. `/skills` - 列出可用技能
6. `/sessions` - 列出保存的会话
7. `/exit` - 退出程序

**预期结果**:
- 每个命令按预期工作
- 命令不区分大小写

**手动执行步骤**:
```bash
bun run chat

/help
# 预期: 显示帮助信息

/clear
# 预期: 清除历史，轮次重置为 1

/tools
# 预期: 显示可用工具列表

/skills
# 预期: 显示可用技能列表

/sessions
# 预期: 显示保存的会话

/exit
# 预期: 程序退出
```

---

### TC-4.3: Shell 命令直接执行 [AUTO]

**验证目标**: ! 前缀直接执行 Shell 命令

**测试步骤**:
1. `!echo "hello"` - 执行简单命令
2. `!ls -la` - 执行带参数命令
3. `!false` - 执行失败命令
4. `!echo "a" | cat` - 执行管道命令

**预期结果**:
- 命令输出直接显示
- 失败命令显示退出码
- 管道命令正确执行

**手动执行步骤**:
```bash
bun run chat

!echo "hello"
# 预期: hello

!ls -la /tmp
# 预期: 目录列表

!false
# 预期: 显示 "Command exited with code 1"

!echo "test" | cat
# 预期: test
```

---

### TC-4.4: 上下文管理 [MANUAL]

**验证目标**: 对话历史和上下文保持

**测试步骤**:
1. 启动对话
2. 提问 "我的名字是张三"
3. 提问 "我叫什么名字？"
4. 验证 Agent 记住上下文
5. 执行 `/clear`
6. 再次提问 "我叫什么名字？"
7. 验证 Agent 不再记得

**预期结果**:
- Agent 能够记住对话上下文
- /clear 后上下文被清除

**手动执行步骤**:
```bash
bun run chat

# 对话 1
我的名字是张三
# Agent 响应

# 对话 2
我叫什么名字？
# 预期: Agent 回答 "张三"

/clear

# 对话 3
我叫什么名字？
# 预期: Agent 不知道（上下文已清除）
```

---

## 五、技能系统验证

### TC-5.1: 技能搜索 [AUTO]

**验证目标**: skill search 命令功能

**前置条件**:
- 测试技能已安装

**测试步骤**:
1. `skill search "text"` - 关键词搜索
2. `skill search --domain programming` - 按领域搜索
3. `skill search --tag analysis` - 按标签搜索
4. `skill search --rebuild` - 重建索引

**预期结果**:
- 关键词搜索返回匹配技能
- 领域过滤正确工作
- 标签过滤正确工作

**手动执行步骤**:
```bash
bun run chat

skill search "analyzer"
skill search --domain programming
skill search --tag code
```

---

### TC-5.2: 技能加载 - Level 1 [AUTO]

**验证目标**: 快速元数据加载

**测试步骤**:
1. 调用 SkillLoader.loadAllLevel1()
2. 验证返回技能元数据列表
3. 验证包含: name, description, domain, tags

**预期结果**:
- 快速返回所有技能的基本信息
- 不加载完整 SKILL.md 内容

---

### TC-5.3: 技能加载 - Level 2 [AUTO]

**验证目标**: 完整 SKILL.md 加载

**测试步骤**:
1. 调用 SkillLoader.loadLevel2("skill-name")
2. 验证返回完整技能信息
3. 验证包含: executionSteps, toolDependencies

**预期结果**:
- 返回完整技能文档内容
- 解析执行步骤
- 解析工具依赖

---

### TC-5.4: 技能执行 [MANUAL]

**验证目标**: PRD 验证标准 - "成功执行至少 2 个自定义技能"

**前置条件**:
- text-analyzer 技能已安装
- file-utils 技能已安装

**测试场景 1**: 执行 text-analyzer 技能
```bash
bun run chat

# 搜索技能
skill search "text analyzer"
# 预期: 显示 text-analyzer 技能

# 让 Agent 使用技能分析文件
请分析 /tmp/test.txt 文件的文本内容
# Agent 应该：
# 1. 加载 text-analyzer 技能
# 2. 使用技能中定义的工具/步骤
# 3. 返回分析结果
```

**测试场景 2**: 执行 file-utils 技能
```bash
# 让 Agent 使用技能
请使用 file-utils 技能帮我统计项目文件
# Agent 应该：
# 1. 加载 file-utils 技能
# 2. 执行相关操作
# 3. 返回结果
```

**预期结果**:
- 两个技能都能被 Agent 正确调用
- 技能执行产生有效输出

---

### TC-5.5: 技能索引维护 [AUTO]

**验证目标**: index.json 自动维护

**测试步骤**:
1. 创建新技能目录
2. 调用 indexer.rebuild()
3. 验证 index.json 包含新技能
4. 删除技能目录
5. 再次 rebuild
6. 验证技能从索引移除

**预期结果**:
- 索引正确反映技能目录状态

---

## 六、工具转换验证

### TC-6.1: 三种工具类型转换 [AUTO/MANUAL]

**验证目标**: PRD 验证标准 - "成功转换至少 3 种不同类型的工具为 Bash 命令"

**测试步骤**:

**类型 1: Agent Shell Command 内置工具**
```bash
# 通过 BashRouter 执行 Agent Shell Command 命令
read /tmp/test.txt
write /tmp/test.txt "content"
glob "*.ts"
```

**类型 2: MCP 工具 (如有配置)**
```bash
# 搜索可用 MCP 工具
tools search "mcp:*"
# 执行 MCP 工具 (需要实际 MCP 服务器)
# mcp:server:tool args
```

**类型 3: Skill 工具**
```bash
# 搜索可用 Skill 工具
tools search "skill:*"
# 执行 Skill 工具
# skill:name:tool args
```

**预期结果**:
- 三种类型的工具都能通过统一的 Bash 接口执行
- 命令格式统一：`<command> [args]`

---

## 七、会话持久化验证

### TC-7.1: 会话保存和恢复 [MANUAL]

**验证目标**: 对话历史持久化

**测试步骤**:
1. 启动对话，进行几轮交互
2. 记录会话 ID
3. 使用 `/exit` 退出
4. 重新启动
5. 使用 `/sessions` 查看保存的会话
6. 使用 `/resume <id>` 恢复会话
7. 验证对话历史恢复

**预期结果**:
- 会话正确保存
- 会话列表显示历史会话
- 恢复后对话历史完整

**手动执行步骤**:
```bash
# 会话 1
bun run chat
你好
# Agent 响应
我今天想学编程
# Agent 响应
/exit

# 会话 2
bun run chat
/sessions
# 预期: 显示之前的会话

/resume <session-id>
# 预期: 显示恢复成功

# 提问验证上下文
我刚才想学什么？
# 预期: Agent 记得 "编程"
```

---

## 八、综合场景验证

### TC-8.1: 完整工作流 [MANUAL]

**验证目标**: 端到端用户工作流

**场景描述**: 用户使用 Synapse Agent 分析一个代码文件

**测试步骤**:
1. 启动 Agent
2. 创建测试代码文件
3. 让 Agent 读取并分析文件
4. 让 Agent 修改文件
5. 验证修改结果

**手动执行步骤**:
```bash
bun run chat

# 创建测试文件
!echo 'function hello() { console.log("Hello"); }' > /tmp/code.js

# 让 Agent 分析
请读取 /tmp/code.js 并分析这个函数
# Agent 使用 read 工具读取文件并分析

# 让 Agent 修改
请把函数名从 hello 改成 greet
# Agent 使用 edit 工具修改

# 验证结果
!cat /tmp/code.js
# 预期: function greet() { console.log("Hello"); }
```

---

### TC-8.2: 错误处理 [AUTO/MANUAL]

**验证目标**: 错误情况的优雅处理

**测试场景**:
1. 读取不存在的文件
2. 写入无权限的路径
3. 执行失败的 Shell 命令
4. 搜索不存在的技能

**预期结果**:
- 错误信息清晰明确
- 不会导致程序崩溃
- 用户可以继续操作

**手动执行步骤**:
```bash
bun run chat

read /nonexistent/file.txt
# 预期: 显示文件不存在的错误

!false
# 预期: 显示命令失败

skill search "不存在的技能名称非常长xxxxx"
# 预期: 显示未找到匹配技能
```

---

## 测试执行清单

### 自动化测试执行

```bash
# 运行所有 Phase 1 验证测试
bun test tests/e2e/phase1-validation/

# 运行特定测试套件
bun test tests/e2e/phase1-validation/phase1-e2e.test.ts

# 运行特定测试
bun test tests/e2e/phase1-validation/ -t "三层 Bash"
```

### 手动测试清单

| 用例 ID | 用例名称 | 状态 | 备注 |
|---------|---------|------|------|
| TC-4.1 | CLI 交互界面 | [ ] | |
| TC-4.4 | 上下文管理 | [ ] | |
| TC-5.4 | 技能执行 | [ ] | 需要 2 个技能 |
| TC-7.1 | 会话保存和恢复 | [ ] | |
| TC-8.1 | 完整工作流 | [ ] | |
| TC-8.2 | 错误处理 | [ ] | |

---

## 附录

### A. 测试环境要求

- Bun >= 1.0.0
- 操作系统: macOS / Linux
- 网络: 可选（MCP 远程服务器测试需要）
- 环境变量: `ANTHROPIC_API_KEY` (LLM 测试需要)

### B. 测试数据位置

```
tests/e2e/phase1-validation/
├── fixtures/
│   ├── skills/           # 测试技能
│   │   ├── text-analyzer/
│   │   └── file-utils/
│   └── mcp/
│       └── mcp_servers.json  # 测试 MCP 配置
```

### C. 问题报告模板

```markdown
## 问题描述
[简要描述问题]

## 测试用例
[TC-X.X: 用例名称]

## 复现步骤
1. ...
2. ...

## 预期结果
[...]

## 实际结果
[...]

## 环境信息
- OS:
- Bun version:
- Commit:
```
