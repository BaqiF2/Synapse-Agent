# P1 核心工具能力 E2E BDD（part03）

## 范围
- `BaseAgentHandler` 帮助语义一致性
- `bash` 包装命令的严格判定
- `BashSession` 执行约束与自定义 shell
- `BashTool` 失败分类与修复提示

## Feature: BaseAgentHandler 通用帮助行为

### Scenario: `-h` 返回简版用法
**Given** 基于 `BaseAgentHandler` 的处理器（如 `read`）已初始化  
**When** 执行命令 `read -h`  
**Then** 退出码应为 `0`  
**And** 输出应为简版 `Usage: ...`

### Scenario: `--help` 返回详细帮助文档
**Given** 基于 `BaseAgentHandler` 的处理器（如 `read`）已初始化  
**When** 执行命令 `read --help`  
**Then** 退出码应为 `0`  
**And** 输出应为帮助 Markdown 的详细内容

### Scenario: 文件路径 `~` 在 read/write/edit 中可展开到 HOME
**Given** 临时设置 `HOME=<TEST_HOME>` 且目标文件位于 `~/x.txt`  
**When** 执行 `read ~/x.txt` 或 `write ~/x.txt "..."`  
**Then** 实际访问路径应为 `<TEST_HOME>/x.txt`

## Feature: BashWrapper 命令语义

### Scenario: `bash --help` 显示包装器帮助且不执行子命令
**Given** `BashWrapperHandler` 已初始化  
**When** 执行 `bash   --help`  
**Then** 退出码应为 `0`  
**And** 输出应包含 `USAGE:` 与 `bash <command>`  
**And** `session.execute` 不应被调用

### Scenario: `bash echo -h` 不应误判为帮助请求
**Given** `BashWrapperHandler` 已初始化  
**When** 执行 `bash echo -h`  
**Then** 应执行实际子命令 `echo -h`  
**And** 不应返回包装器帮助文档

### Scenario: `bash` 无参数时返回用法错误
**Given** `BashWrapperHandler` 已初始化  
**When** 执行 `bash`  
**Then** 退出码应为非 `0`  
**And** 错误信息应包含 `Usage: bash <command>`

## Feature: BashSession 运行约束

### Scenario: 命令执行期间禁止并发执行
**Given** 同一 `BashSession` 正在执行命令 A 且未完成  
**When** 并发调用 `execute(commandB)`  
**Then** 第二次调用应抛错 `Another command is already executing`

### Scenario: 进程未就绪时执行命令返回错误
**Given** `BashSession` 进程已退出或尚未初始化完成  
**When** 调用 `execute("echo hi")`  
**Then** 应返回 `Bash session is not ready` 错误

### Scenario: 会话重启后环境变量应被重置
**Given** 先执行 `export SYNAPSE_TEST_VAR=works` 并验证可读  
**When** 调用 `session.restart()`  
**Then** 再次读取该变量应为空

### Scenario: 支持自定义 `shellCommand` 启动
**Given** `shellCommand='sandbox-exec -f /tmp/test.sb /bin/bash'`  
**When** 创建 `BashSession`  
**Then** 底层 spawn 应使用 `sandbox-exec` 作为 command  
**And** args 末尾自动追加 `--norc --noprofile`

### Scenario: 自定义 shell 下命令结束标记仍可正确解析
**Given** 会话使用自定义 `shellCommand` 启动  
**When** 执行 `echo hello`  
**Then** 返回应正确解析 `stdout=hello` 与 `exitCode=0`

## Feature: BashTool 失败分类与提示

### Scenario: invalid usage 失败会追加自修复提示
**Given** 路由返回 `stderr` 含 `Usage: read <file_path>...` 且 `exitCode!=0`  
**When** `BashTool.call({ command: 'read' })`  
**Then** 返回应为 `ToolError`  
**And** `message/output` 应包含 `Bash(command="read --help")` 提示

### Scenario: command not found 失败会追加自修复提示
**Given** 路由返回 `stderr` 含 `command not found`  
**When** `BashTool.call(...)`  
**Then** 返回应为 `ToolError`  
**And** `extras.failureCategory` 应为 `command_not_found`

### Scenario: execution error 不追加自描述提示
**Given** 路由返回执行期错误（如文件不存在）且分类为 `execution_error`  
**When** `BashTool.call(...)`  
**Then** 返回应为 `ToolError`  
**And** 输出中不应追加 `Self-description` 提示段

### Scenario: 空输出成功命令返回统一占位文案
**Given** 路由返回 `exitCode=0` 且 `stdout/stderr` 为空  
**When** `BashTool.call(...)`  
**Then** `output` 应为 `(Command executed successfully with no output)`

### Scenario: 被沙箱拦截时返回结构化 marker 而非错误退出
**Given** 路由返回 `blocked=true` 且带 `blockedReason/resource`  
**When** `BashTool.call({ command })`  
**Then** 返回应为 `ToolOk`  
**And** `extras.type` 应为 `sandbox_blocked`

### Scenario: `allow_permanent` 同步写入持久白名单并生效
**Given** `SYNAPSE_HOME` 指向可写目录  
**When** 调用 `bashTool.allowPermanent('/extra', '/workspace')`  
**Then** `sandbox.json` 白名单应包含 `/extra`  
**And** 会话白名单也应被动态添加

## 备注
- 本文件补充“工具层稳定执行与错误可恢复”的关键细节。  
- 文件行数需保持小于等于 1000；后续超限请创建 `02-p1-core-tools-part04.md`。
