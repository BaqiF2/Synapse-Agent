# P1 核心工具能力 E2E BDD（part01）

## 范围
- Bash Router 路由与命令分层
- Agent Shell Command 工具（read/write/edit）
- 兼容路径回退（已移除命令）
- task:* 调用安全（递归保护）

## Feature: 三层命令路由

### Scenario: Native Shell 命令被路由并成功执行
**Given** 已创建 `BashSession` 与 `BashRouter`  
**When** 执行命令 `pwd`  
**Then** 路由结果退出码应为 `0`  
**And** `stdout` 应包含当前工作目录

### Scenario: Native Shell 命令支持常见指令
**Given** 已创建 `BashSession` 与 `BashRouter`  
**When** 依次执行 `ls -la` 与 `echo "Hello Synapse"`  
**Then** 两条命令都应返回退出码 `0`  
**And** `echo` 的输出应包含 `Hello Synapse`

### Scenario: Agent Shell 命令由 Router 分派到内建工具
**Given** 已创建 `BashSession` 与 `BashRouter`  
**And** 已准备测试文件 `<TEST_FILE>`  
**When** 执行命令 `read <TEST_FILE>`  
**Then** 返回应为工具读取结果  
**And** 输出中应包含文件内容

### Scenario: Extension Shell 命令可通过统一入口发现
**Given** 已安装扩展命令包装器（如 `mcp:*`、`skill:*`）  
**When** 执行 `command:search` 相关查询  
**Then** 返回应包含扩展命令搜索结果  
**And** 结果可按类型过滤

## Feature: read 工具

### Scenario: 读取整个文件
**Given** 已创建包含 5 行文本的文件 `<TEST_FILE>`  
**When** 执行命令 `read <TEST_FILE>`  
**Then** 退出码应为 `0`  
**And** 输出中应包含首行与末行内容

### Scenario: 使用 `--offset` 从指定偏移读取
**Given** 已创建包含 5 行文本的文件 `<TEST_FILE>`  
**When** 执行命令 `read <TEST_FILE> --offset 2`  
**Then** 退出码应为 `0`  
**And** 输出应包含第 3 行内容

### Scenario: 使用 `--limit` 限制读取行数
**Given** 已创建包含 5 行文本的文件 `<TEST_FILE>`  
**When** 执行命令 `read <TEST_FILE> --limit 2`  
**Then** 退出码应为 `0`  
**And** 输出应仅包含前 2 行范围内内容

### Scenario: 读取不存在文件时返回错误
**Given** 指定路径 `<NON_EXISTENT_FILE>` 不存在  
**When** 执行命令 `read <NON_EXISTENT_FILE>`  
**Then** 退出码应为非 `0`  
**And** 返回可读错误信息

## Feature: write 工具

### Scenario: 写入新文件
**Given** 目标文件 `<WRITE_FILE>` 不存在  
**When** 执行命令 `write <WRITE_FILE> "Test content written by Synapse"`  
**Then** 退出码应为 `0`  
**And** 文件应被创建  
**And** 文件内容应与输入文本一致

### Scenario: 写入已存在文件时执行覆盖
**Given** 目标文件 `<WRITE_FILE>` 已存在旧内容  
**When** 执行命令 `write <WRITE_FILE> "New content"`  
**Then** 退出码应为 `0`  
**And** 文件内容应被覆盖为 `New content`

### Scenario: 自动创建父目录
**Given** 目标路径 `<NESTED_FILE>` 的父目录尚不存在  
**When** 执行命令 `write <NESTED_FILE> "Nested content"`  
**Then** 退出码应为 `0`  
**And** 目标文件应存在  
**And** 所需目录层级应被自动创建

## Feature: edit 工具

### Scenario: 默认仅替换首个匹配项
**Given** 文件 `<EDIT_FILE>` 内容为 `Hello World\nGoodbye World\nHello Again`  
**When** 执行命令 `edit <EDIT_FILE> "Hello" "Hi"`  
**Then** 退出码应为 `0`  
**And** 第一个 `Hello` 应被替换为 `Hi`  
**And** 后续 `Hello` 保持不变

### Scenario: `--all` 可替换全部匹配项
**Given** 文件 `<EDIT_FILE>` 内容为 `Hello World\nGoodbye World\nHello Again`  
**When** 执行命令 `edit <EDIT_FILE> "Hello" "Hi" --all`  
**Then** 退出码应为 `0`  
**And** 所有 `Hello` 都应替换为 `Hi`  
**And** 文件中不应再出现 `Hello`

## Feature: 已移除命令的回退行为

### Scenario: `glob` 被作为 native 命令回退执行
**Given** `glob` 不再是 Agent Shell 内建命令  
**When** 执行命令 `glob "*.ts"`  
**Then** 命令应走 native shell 路径  
**And** 在缺失同名可执行文件时退出码应为非 `0`

### Scenario: `search` 被作为 native 命令回退执行
**Given** `search` 不再是 Agent Shell 内建命令  
**When** 执行命令 `search "TODO"`  
**Then** 命令应走 native shell 路径  
**And** 在缺失同名可执行文件时退出码应为非 `0`

## Feature: task 命令递归保护

### Scenario: 在 `task:general` 子代理中阻止嵌套 `task:*` 调用
**Given** 使用可计数的 Mock LLM 响应序列  
**And** 第一轮返回 `Bash` 工具调用且命令为嵌套 `task:skill:search ...`  
**And** 第二轮返回普通文本 `General task finished without nested task execution.`  
**When** 执行 `task:general --prompt "analyze route" --description "guard recursion"`  
**Then** 主调用应成功完成且 `isError=false`  
**And** 输出应包含 `General task finished without nested task execution.`  
**And** LLM 调用次数应为 `2`（无无限递归）

## 备注
- 本文件聚焦 P1 工具能力与执行安全。  
- 文件行数需保持小于等于 1000；如后续补充超限，新增 `02-p1-core-tools-part02.md`。
