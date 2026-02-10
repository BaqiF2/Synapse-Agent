# P2 扩展与集成能力 E2E BDD（part03）

## 范围
- BashRouter 在 Skill/MCP/Task 之间的命令分流
- skill 管理命令与三段式 skill 工具命令区分
- task/skill 处理器依赖注入与降级行为
- 扩展命令参数映射一致性

## Feature: BashRouter 命令分类

### Scenario: `skill:load` 归类为 Agent Shell 命令
**Given** 已创建 `BashRouter`  
**When** 调用 `identifyCommandType('skill:load my-skill')`  
**Then** 应返回 `AGENT_SHELL_COMMAND`

### Scenario: `skill:list/info/import/rollback/delete` 归类为 Agent Shell
**Given** 已创建 `BashRouter`  
**When** 分别识别 `skill:list`、`skill:info x`、`skill:import y`、`skill:rollback z`、`skill:delete z`  
**Then** 均应返回 `AGENT_SHELL_COMMAND`

### Scenario: `skill:<name>:<tool>` 三段式归类为 Extend Shell
**Given** 已创建 `BashRouter`  
**When** 调用 `identifyCommandType('skill:analyzer:run')`  
**Then** 应返回 `EXTEND_SHELL_COMMAND`

### Scenario: 旧语法 `skill list` 不再识别为 Agent 命令
**Given** 已创建 `BashRouter`  
**When** 调用 `identifyCommandType('skill list')`  
**Then** 应返回 `NATIVE_SHELL_COMMAND`

### Scenario: `task:skill|task:explore|task:general` 归类为 Agent Shell
**Given** 已创建 `BashRouter`  
**When** 分别识别 `task:skill:search`、`task:explore`、`task:general`  
**Then** 均应返回 `AGENT_SHELL_COMMAND`

### Scenario: `mcp:<server>:<tool>` 归类为 Extend Shell
**Given** 已创建 `BashRouter`  
**When** 调用 `identifyCommandType('mcp:my-server:query')`  
**Then** 应返回 `EXTEND_SHELL_COMMAND`

## Feature: BashRouter 实际路由执行

### Scenario: `skill:load --help` 通过 skill handler 返回帮助
**Given** 已初始化 `BashRouter` 且 skill handler 可用  
**When** 执行 `router.route('skill:load --help')`  
**Then** 退出码应为 `0`  
**And** 输出应包含 `USAGE`

### Scenario: `skill:load` 缺少参数时返回可读错误
**Given** 已初始化 `BashRouter`  
**When** 执行 `router.route('skill:load')`  
**Then** 退出码应为 `1`  
**And** 输出应包含 `USAGE`

### Scenario: `skill:list` 返回技能列表
**Given** skills 目录存在可读取技能  
**When** 执行 `router.route('skill:list')`  
**Then** 退出码应为 `0`  
**And** 输出应包含技能名称与版本数量

### Scenario: `skill:unknown-command` 返回统一未知命令错误
**Given** 已初始化 `BashRouter`  
**When** 执行 `router.route('skill:unknown-command')`  
**Then** 退出码应为 `1`  
**And** 错误信息包含 `Unknown skill command`

### Scenario: skill 三段式工具 `--help` 显示 usage
**Given** 已初始化 `BashRouter`  
**When** 执行 `router.route('skill:test-skill:run --help')`  
**Then** 退出码应为 `0`  
**And** 输出应包含 `Usage: skill:test-skill:run`

### Scenario: 非法 skill 三段式格式返回错误
**Given** 已初始化 `BashRouter`  
**When** 执行 `router.route('skill::run')`  
**Then** 退出码应为 `1`  
**And** 错误信息包含 `Invalid skill command format`

### Scenario: skill 工具缺失时返回可诊断错误
**Given** skill 存在但目标 tool 脚本元数据不匹配  
**When** 执行 `router.route('skill:<skill>:missing')`  
**Then** 退出码应为 `1`  
**And** 错误信息包含 `Tool '<tool>' not found`

### Scenario: skill 脚本带参数可正常执行
**Given** skill 脚本存在且可执行  
**When** 执行 `router.route('skill:<skill>:run "hello world"')`  
**Then** 退出码应为 `0`

## Feature: 处理器依赖注入

### Scenario: 缺少 llm/tool 依赖时 task handler 降级为固定错误
**Given** `BashRouter` 未注入 `llmClient` 或 `toolExecutor`  
**When** 执行 `router.route('task:general --prompt "x" --description "y"')`  
**Then** 退出码应为 `1`  
**And** 错误信息包含 `Task commands require LLM client and tool executor`

### Scenario: 通过 `setToolExecutor` 延迟注入后 task 路由恢复可用
**Given** 初始 router 未绑定 tool executor  
**When** 调用 `setToolExecutor(executor)` 后再执行 task 命令  
**Then** task handler 应重新初始化并按新依赖执行

### Scenario: 注入 llm/tool 依赖后 skill merger 启用 SubAgentManager
**Given** 创建 router 时传入 `llmClient` 与 `toolExecutor`  
**When** 执行一个 `skill:*` 管理命令触发 handler 初始化  
**Then** handler 内部 `SkillMerger.getSubAgentManager()` 不应为 `null`

## Feature: MCP 参数映射一致性

### Scenario: 位置参数按 required 顺序映射到 tool 参数
**Given** MCP 工具 schema 定义 `required=[a,b]`  
**When** 执行 `mcp:server:tool 1 2`  
**Then** 应映射为 `{a:'1', b:'2'}`（含类型转换规则）

### Scenario: number/integer 类型位置参数会转为数字
**Given** tool schema 中参数类型为 `number` 或 `integer`  
**When** 传入位置参数 `42`  
**Then** 调用 `callTool` 时该参数类型应为数字

### Scenario: boolean 类型位置参数会转为布尔值
**Given** tool schema 中参数类型为 `boolean`  
**When** 传入 `true` 或 `1`  
**Then** 调用参数应转换为 `true`

### Scenario: 显式命名参数优先保留
**Given** 传入 `--name=value` 形式命名参数  
**When** 同时有位置参数映射  
**Then** 结果参数对象应包含命名参数键值

## 备注
- 本文件聚焦“扩展命令能否被正确识别并路由到正确执行单元”。  
- 文件行数需保持小于等于 1000；后续超限请创建 `03-p2-integration-part04.md`。
