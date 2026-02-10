# P1 核心工具能力 E2E BDD（part04）

## 范围
- `task:*` 参数解析与执行边界
- `RestrictedBashTool` 权限阻断语义
- BashRouter 与沙箱分流行为
- `read/write/TodoWrite` 细粒度用户输入场景

## Feature: task 命令参数解析与执行

### Scenario: `-p/-d` 短参数应等价于长参数
**Given** 已创建 `TaskCommandHandler`  
**When** 执行 `task:general -p "research" -d "general task"`  
**Then** 解析后的参数应包含 `prompt=research` 与 `description=general task`  
**And** 命令可进入正常执行路径

### Scenario: `--model` 与 `--max-turns` 可被正确解析
**Given** 已创建 `TaskCommandHandler`  
**When** 执行 `task:general --prompt "x" --description "y" --model claude-sonnet-4-20250514 --max-turns 10`  
**Then** 参数对象应包含 `model` 与 `maxTurns=10`

### Scenario: `task:* --help` 仅输出帮助且不触发子代理执行
**Given** 已创建 `TaskCommandHandler` 且可观测 SubAgentManager.execute 调用次数  
**When** 执行 `task:general --help`  
**Then** 返回 `exitCode=0` 且输出包含 `USAGE`  
**And** SubAgentManager.execute 不应被调用

### Scenario: 非法类型命令应返回统一错误
**Given** 已创建 `TaskCommandHandler`  
**When** 执行 `task:invalid --prompt "x" --description "y"`  
**Then** 返回 `exitCode=1`  
**And** 错误信息包含 `Invalid task command`

### Scenario: 引号参数支持单引号、双引号与混合形式
**Given** 已创建 `TaskCommandHandler`  
**When** 执行 `task:explore --prompt "multi word" --description 'single quoted'`  
**Then** `prompt/description` 应完整保留空格文本

### Scenario: 参数引号未闭合时应返回可诊断错误
**Given** 已创建 `TaskCommandHandler`  
**When** 执行 `task:explore --prompt "unclosed --description "x"`  
**Then** 返回 `exitCode=1`  
**And** 错误信息应包含 `Unclosed quote`

### Scenario: 执行中调用 cancel 应返回中断退出码
**Given** `TaskCommandHandler.execute(...)` 返回可取消 promise  
**When** 调用返回 promise 的 `cancel()`  
**Then** 返回结果应为 `exitCode=130`  
**And** `stderr` 包含 `Task execution interrupted`

## Feature: RestrictedBashTool 权限阻断

### Scenario: 前缀模式 `task:` 应阻断所有 task 命令
**Given** `exclude=['task:']`  
**When** 执行 `task:skill:search ...` 或 `task:explore ...`  
**Then** 返回应为 `ToolError`  
**And** 错误信息应说明命令不被允许

### Scenario: 精确模式仅阻断同名命令不阻断近似前缀
**Given** `exclude=['edit']`  
**When** 执行 `edit ./a.txt ...` 与 `editor ./a.txt`  
**Then** 前者应被阻断  
**And** 后者不应因权限规则被阻断

### Scenario: 被阻断命令应在委托前返回且不触发 delegate.call
**Given** delegate BashTool 可统计 `call` 调用次数  
**And** `exclude=['rm']`  
**When** 执行 `rm -rf /tmp/x`  
**Then** 返回应为 `Command blocked`  
**And** delegate.call 调用次数应为 `0`

### Scenario: 允许命令应透传给 delegate 并保留返回 extras
**Given** `exclude=['rm']` 且 delegate 对 `cat /etc/passwd` 返回 `extras.type=sandbox_blocked`  
**When** 执行 `cat /etc/passwd`  
**Then** 调用应透传至 delegate  
**And** 返回值中的 `extras.type` 与 `resource` 应保留

### Scenario: 返回 promise 的 cancel 能力应向下透传
**Given** delegate 返回 `CancelablePromise`  
**When** 调用 `RestrictedBashTool.call(...).cancel()`  
**Then** delegate promise 的 `cancel()` 应被触发

## Feature: BashRouter 与沙箱分流

### Scenario: Native 命令在存在 SandboxManager 时走沙箱执行
**Given** `BashRouter` 注入 `sandboxManager` 与 `getCwd=/workspace`  
**When** 执行 `npm test`  
**Then** 应调用 `sandboxManager.execute('npm test', '/workspace')`

### Scenario: Agent Shell 命令不应走 sandboxManager
**Given** `BashRouter` 注入 `sandboxManager`  
**When** 执行 `read ./README.md`  
**Then** `sandboxManager.execute` 调用次数应保持为 `0`

### Scenario: Extend Shell 命令不应走 sandboxManager
**Given** `BashRouter` 注入 `sandboxManager`  
**When** 执行 `mcp:demo:echo` 或 `skill:demo:run`  
**Then** `sandboxManager.execute` 不应被调用

## Feature: 文件与 Todo 命令细节

### Scenario: `read` 输出应包含 cat -n 风格行号
**Given** 文件内容为多行文本  
**When** 执行 `read <file>`  
**Then** 每行输出前应包含右对齐行号与制表符  
**And** 行号应与 offset/limit 结果一致

### Scenario: `write` 文件路径引号未闭合时返回明确错误
**Given** 已创建 `WriteHandler`  
**When** 执行 `write "./tmp/a.txt hello`  
**Then** 返回 `exitCode=1`  
**And** 错误信息包含 `Unclosed quote in file path`

### Scenario: TodoWrite 限制同一时刻最多 1 个 `in_progress`
**Given** 已创建 `TodoWriteHandler`  
**When** 提交 JSON 中包含 2 个 `status=in_progress`  
**Then** 返回 `exitCode=1`  
**And** 错误信息包含 `Too many in_progress items`

### Scenario: TodoWrite 约束可由环境变量覆盖且非法值回退默认
**Given** 设置 `SYNAPSE_TODO_MAX_ITEMS` 为有效正整数  
**When** 提交超过上限的 todos 数组  
**Then** 应按环境变量上限校验失败  
**And** 当环境变量非法时应回退默认上限校验

## 备注
- 本分片聚焦“工具层输入细节 + 权限边界”，用于覆盖真实用户命令误用与复杂参数输入。  
- 文件行数需保持小于等于 1000；后续超限请创建 `02-p1-core-tools-part05.md`。
