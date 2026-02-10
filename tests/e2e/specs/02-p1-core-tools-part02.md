# P1 核心工具能力 E2E BDD（part02）

## 范围
- `read/write/edit` 边界与失败路径
- `task:*` 参数校验与中断行为
- `TodoWrite` 真实输入错误分支
- Bash 工具误用与超时恢复

## Feature: read 工具边界行为

### Scenario: 缺少文件参数时返回用法
**Given** 已创建 `ReadHandler`  
**When** 执行命令 `read`  
**Then** 退出码应为非 `0`  
**And** 错误信息应包含 `Usage: read <file_path>`

### Scenario: `--offset` 缺少参数时报错
**Given** 已创建 `ReadHandler`  
**When** 执行命令 `read ./a.txt --offset`  
**Then** 退出码应为非 `0`  
**And** 错误信息应包含 `--offset requires a number argument`

### Scenario: `--limit` 传入负数时报错
**Given** 已创建 `ReadHandler`  
**When** 执行命令 `read ./a.txt --limit -1`  
**Then** 退出码应为非 `0`  
**And** 错误信息应包含 `--limit must be a non-negative number`

### Scenario: 读取目录路径时拒绝执行
**Given** 指定路径 `<DIR_PATH>` 是目录  
**When** 执行命令 `read <DIR_PATH>`  
**Then** 退出码应为非 `0`  
**And** 错误信息应包含 `Cannot read directory`

### Scenario: offset 超过总行数时返回空输出
**Given** 文件 `<TEST_FILE>` 仅有 3 行  
**When** 执行命令 `read <TEST_FILE> --offset 100`  
**Then** 退出码应为 `0`  
**And** `stdout` 应为空字符串

## Feature: write 工具边界行为

### Scenario: 缺少内容参数时返回用法
**Given** 已创建 `WriteHandler`  
**When** 执行命令 `write ./a.txt`  
**Then** 退出码应为非 `0`  
**And** 错误信息应包含 `Usage: write <file_path> <content>`

### Scenario: 文件路径支持引号与空格
**Given** 已创建 `WriteHandler`  
**When** 执行命令 `write "./tmp/my file.txt" "hello world"`  
**Then** 退出码应为 `0`  
**And** 目标文件应被正确创建并写入

### Scenario: 内容中的转义序列会被还原
**Given** 已创建 `WriteHandler`  
**When** 执行命令 `write ./tmp/a.txt "line1\\nline2\\tcol2"`  
**Then** 写入后的文件内容应包含换行和制表符

### Scenario: heredoc 风格内容可被正确截取
**Given** 已创建 `WriteHandler`  
**When** 执行命令 `write ./tmp/a.txt <<EOF\nhello\nworld\nEOF`  
**Then** 退出码应为 `0`  
**And** 文件内容应包含 `hello` 与 `world`

### Scenario: 写入目标是目录时返回错误
**Given** `<DIR_PATH>` 已存在且为目录  
**When** 执行命令 `write <DIR_PATH> "x"`  
**Then** 退出码应为非 `0`  
**And** 错误信息应包含 `Cannot write to directory`

## Feature: edit 工具边界行为

### Scenario: 参数不足时返回用法
**Given** 已创建 `EditHandler`  
**When** 执行命令 `edit ./a.txt "old"`  
**Then** 退出码应为非 `0`  
**And** 错误信息应包含 `Usage: edit <file_path> <old_string> <new_string> [--all]`

### Scenario: 文件不存在时返回错误
**Given** 文件 `<MISSING_FILE>` 不存在  
**When** 执行命令 `edit <MISSING_FILE> "old" "new"`  
**Then** 退出码应为非 `0`  
**And** 错误信息应包含 `File not found`

### Scenario: 目标路径是目录时返回错误
**Given** `<DIR_PATH>` 已存在且为目录  
**When** 执行命令 `edit <DIR_PATH> "old" "new"`  
**Then** 退出码应为非 `0`  
**And** 错误信息应包含 `Cannot edit directory`

### Scenario: 未匹配到旧字符串时返回错误
**Given** 文件内容不包含 `not-found-token`  
**When** 执行命令 `edit ./a.txt "not-found-token" "new"`  
**Then** 退出码应为非 `0`  
**And** 错误信息应包含 `String not found in file`

### Scenario: `--all` 使用字面量匹配而非正则语义
**Given** 文件内容包含 `a.b` 多次出现  
**When** 执行命令 `edit ./a.txt "a.b" "x" --all`  
**Then** 仅 `a.b` 字面量应被替换  
**And** 不应误替换 `acb` 等非字面量文本

## Feature: task 命令执行体验

### Scenario: `task:* --help` 返回完整帮助
**Given** 已创建 `TaskCommandHandler`  
**When** 执行命令 `task:general --help`  
**Then** 退出码应为 `0`  
**And** 输出包含 `USAGE`、`TYPES`、`OPTIONS`、`EXAMPLES`

### Scenario: 非法 task 类型返回错误
**Given** 已创建 `TaskCommandHandler`  
**When** 执行命令 `task:unknown --prompt "x" --description "y"`  
**Then** 退出码应为 `1`  
**And** 错误信息提示可用类型为 `skill|explore|general`

### Scenario: 缺失必填参数时返回参数校验错误
**Given** 已创建 `TaskCommandHandler`  
**When** 执行命令 `task:general --prompt "only prompt"`  
**Then** 退出码应为 `1`  
**And** 错误信息应包含 `Required: --prompt, --description`

### Scenario: `--max-turns` 非法值导致校验失败
**Given** 已创建 `TaskCommandHandler`  
**When** 执行命令 `task:general --prompt "x" --description "y" --max-turns abc`  
**Then** 退出码应为 `1`  
**And** 错误信息应包含参数无效提示

### Scenario: task 执行被中断时返回 130
**Given** 已创建 `TaskCommandHandler` 且执行期间收到 abort 信号  
**When** 触发取消操作  
**Then** 返回 `stderr=Task execution interrupted.`  
**And** `exitCode=130`

## Feature: TodoWrite 真实输入场景

### Scenario: 合法 Todo JSON 可更新状态摘要
**Given** 已创建 `TodoWriteHandler`  
**When** 执行 `TodoWrite '{"todos":[{"content":"A","activeForm":"Doing A","status":"in_progress"}]}'`  
**Then** 退出码应为 `0`  
**And** 输出应包含 `Todo list updated`

### Scenario: 缺少 JSON 参数时返回用法错误
**Given** 已创建 `TodoWriteHandler`  
**When** 执行命令 `TodoWrite`  
**Then** 退出码应为 `1`  
**And** 错误信息应包含 `Missing JSON parameter`

### Scenario: JSON 格式错误时返回解析失败
**Given** 已创建 `TodoWriteHandler`  
**When** 执行命令 `TodoWrite '{invalid-json}'`  
**Then** 退出码应为 `1`  
**And** 错误信息应包含 `Invalid JSON format`

### Scenario: Todo 字段缺失时返回 schema 校验错误
**Given** 已创建 `TodoWriteHandler`  
**When** 执行缺少 `content`/`status` 必填字段的 JSON  
**Then** 退出码应为 `1`  
**And** 错误信息应包含 `Validation failed` 与字段路径

## Feature: Bash 工具稳健性

### Scenario: 空命令参数被拒绝
**Given** 已创建 `BashTool`  
**When** 调用 `Bash(command="   ")`  
**Then** 返回应为 `ToolError`  
**And** 错误说明包含 `command parameter is required`

### Scenario: 将 `Bash(...)` 作为命令字符串会触发误用提示
**Given** 已创建 `BashTool`  
**When** 调用 `Bash(command="Bash(command=\"ls\")")`  
**Then** 返回应为 `ToolError`  
**And** 输出应明确提示“不要在 command 字符串中再包一层 Bash”

### Scenario: 命令执行超时后自动重启 Bash 会话
**Given** 路由结果包含 `Command execution timeout` 标记  
**When** `BashTool` 处理该结果  
**Then** 应触发会话重启  
**And** 返回输出中应包含 `Bash session restarted after timeout.`

### Scenario: `restart=true` 时先重启再执行命令
**Given** 已创建 `BashRouter` 且会话中存在历史环境变量  
**When** 调用 `route("echo $VAR", true)`  
**Then** 路由应先执行 `session.restart()`  
**And** 命令在新会话上下文中运行

## 备注
- 本文件补充了高频工具在真实输入下的边界行为，强调“可诊断错误 + 稳定退出码”。  
- 文件行数需保持小于等于 1000；后续超限请创建 `02-p1-core-tools-part03.md`。
