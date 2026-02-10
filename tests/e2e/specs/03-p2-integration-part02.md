# P2 扩展与集成能力 E2E BDD（part02）

## 范围
- `skill:*` 管理命令真实操作流
- `mcp:*` 与 `skill:<name>:<tool>` 扩展命令失败分支
- 启动阶段工具发现与可见性

## Feature: skill 管理命令（用户可直接执行）

### Scenario: `skill:list` 在无技能时返回空提示
**Given** `.synapse/skills` 目录存在但没有任何技能  
**When** 执行命令 `skill:list`  
**Then** 退出码应为 `0`  
**And** 输出应包含 `No skills installed.`

### Scenario: `skill:list` 在有技能时列出版本数量
**Given** 已安装多个技能且索引可读取  
**When** 执行命令 `skill:list`  
**Then** 退出码应为 `0`  
**And** 每行应包含 `skill-name - description (N versions)` 结构

### Scenario: `skill:info` 无参数时返回帮助
**Given** 已创建 `SkillCommandHandler`  
**When** 执行命令 `skill:info`  
**Then** 退出码应为 `1`  
**And** 输出应包含 `USAGE: skill:info <skill-name>`

### Scenario: `skill:info` 查询不存在技能返回错误
**Given** 已创建 `SkillCommandHandler`  
**When** 执行命令 `skill:info not-exist`  
**Then** 退出码应为 `1`  
**And** 错误信息包含 `Skill 'not-exist' not found`

### Scenario: `skill:info` 查询存在技能返回详情
**Given** 目标技能存在且有版本历史  
**When** 执行命令 `skill:info <skill-name>`  
**Then** 退出码应为 `0`  
**And** 输出应包含 `Version`、`Created`、`Updated`、`Tools`、`Version History`

### Scenario: `skill:import` 无参数时返回帮助
**Given** 已创建 `SkillCommandHandler`  
**When** 执行命令 `skill:import`  
**Then** 退出码应为 `1`  
**And** 输出应包含 `USAGE: skill:import <source>`

### Scenario: `skill:import` 可解析 `--continue` 与 `--merge` 参数
**Given** source 中存在需要跳过相似检查与合并的技能  
**When** 执行 `skill:import <source> --continue=a,b --merge=x:y`  
**Then** 命令应成功执行  
**And** 处理结果应体现 imported/skipped/conflicts/similar 信息

### Scenario: `skill:rollback` 无参数时返回帮助
**Given** 已创建 `SkillCommandHandler`  
**When** 执行命令 `skill:rollback`  
**Then** 退出码应为 `1`  
**And** 输出应包含 `USAGE: skill:rollback <skill-name> [version]`

### Scenario: `skill:rollback <name>` 未给版本时展示可选版本
**Given** 目标技能存在多个历史版本  
**When** 执行命令 `skill:rollback <skill-name>`  
**Then** 退出码应为 `0`  
**And** 输出应包含版本列表与“请选择版本号”提示

### Scenario: `skill:rollback <name> <version>` 成功回滚
**Given** 目标技能与指定版本均存在  
**When** 执行命令 `skill:rollback <skill-name> <version>`  
**Then** 退出码应为 `0`  
**And** 输出包含 `Rollback completed`

### Scenario: `skill:delete` 无参数时返回帮助
**Given** 已创建 `SkillCommandHandler`  
**When** 执行命令 `skill:delete`  
**Then** 退出码应为 `1`  
**And** 输出应包含 `USAGE: skill:delete <skill-name>`

### Scenario: `skill:delete` 删除存在技能成功
**Given** 目标技能目录与索引条目存在  
**When** 执行命令 `skill:delete <skill-name>`  
**Then** 退出码应为 `0`  
**And** 输出应包含 `Skill '<skill-name>' deleted.`

### Scenario: 未知 `skill:*` 命令返回可用命令提示
**Given** 已创建 `SkillCommandHandler`  
**When** 执行命令 `skill:unknown whatever`  
**Then** 退出码应为 `1`  
**And** 错误信息应包含 `Available: skill:load ... skill:delete ...`

## Feature: MCP 扩展命令真实失败路径

### Scenario: MCP 命令格式非法时返回统一格式错误
**Given** 已创建 `McpCommandHandler`  
**When** 执行命令 `mcp:invalid-format`（缺失 tool 段）  
**Then** 退出码应为 `1`  
**And** 错误信息应包含 `Invalid MCP command format`

### Scenario: MCP server 不存在时返回明确错误
**Given** 配置中不存在 server `unknown`  
**When** 执行命令 `mcp:unknown:any-tool`  
**Then** 退出码应为 `1`  
**And** 错误信息应包含 `server 'unknown' not found`

### Scenario: MCP server 可连通但 tool 不存在
**Given** server 存在且连接成功，但目标工具不存在  
**When** 执行命令 `mcp:<server>:not-found-tool`  
**Then** 退出码应为 `1`  
**And** 错误信息应包含 `Tool 'not-found-tool' not found`

### Scenario: MCP `--help` 在 wrapper 不可用时回退到通用帮助
**Given** 执行 `mcp:<server>:<tool> --help` 且 wrapper 执行失败  
**When** 命令处理器走 fallback 分支  
**Then** 退出码应为 `0`  
**And** 输出应包含 `Usage: mcp:<server>:<tool> [args...]`

## Feature: Skill Tool 扩展命令真实失败路径

### Scenario: Skill tool 命令格式非法时返回统一格式错误
**Given** 已创建 `SkillToolHandler`  
**When** 执行命令 `skill:only-one-segment`  
**Then** 退出码应为 `1`  
**And** 错误信息应包含 `Invalid skill command format`

### Scenario: 目标 skill 不存在或无脚本时返回错误
**Given** `SkillStructure.listScripts(skillName)` 返回空  
**When** 执行命令 `skill:not-found:run`  
**Then** 退出码应为 `1`  
**And** 错误信息应包含 `not found or has no scripts`

### Scenario: skill 存在但 tool 名不匹配时返回错误
**Given** skill 下有脚本但 docstring name 不匹配目标 tool  
**When** 执行命令 `skill:analyzer:unknown-tool`  
**Then** 退出码应为 `1`  
**And** 错误信息应包含 `Tool 'unknown-tool' not found`

### Scenario: Skill tool `--help` 在 wrapper 不可用时回退到通用帮助
**Given** 执行 `skill:<skill>:<tool> --help` 且 wrapper 调用失败  
**When** 命令处理器走 fallback 分支  
**Then** 退出码应为 `0`  
**And** 输出应包含 `Usage: skill:<skill>:<tool> [args...]`

### Scenario: skill 脚本返回非零退出码时透传 stderr
**Given** 目标脚本执行失败并返回 `stdout/stderr/status`  
**When** 执行 `skill:<skill>:<tool> ...`  
**Then** 返回结果应透传脚本 `stdout` 和 `stderr`  
**And** `exitCode` 应与脚本状态一致

## Feature: 启动阶段集成反馈

### Scenario: MCP 初始化成功时显示已加载工具数
**Given** `initializeMcpTools` 返回 `totalToolsInstalled>0`  
**When** 执行 `initializeMcp()`  
**Then** 输出应包含 `Loaded <N> MCP tools from <M> server(s)`

### Scenario: MCP 初始化无工具但有 server 时展示错误摘要
**Given** `initializeMcpTools` 返回 `totalToolsInstalled=0` 且 `totalServers>0` 且带 errors  
**When** 执行 `initializeMcp()`  
**Then** 应输出前 3 条错误摘要  
**And** 不应抛出未捕获异常

### Scenario: Skill 初始化有技能但无可安装工具时给出提示
**Given** `initializeSkillTools` 返回 `totalSkills>0` 且 `totalToolsInstalled=0`  
**When** 执行 `initializeSkills()`  
**Then** 输出应包含 `No skill tools to load`

## 备注
- 本文件重点覆盖用户直接敲命令时最容易触发的管理与错误分支。  
- 文件行数需保持小于等于 1000；后续超限请创建 `03-p2-integration-part03.md`。
