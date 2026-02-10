# P2 扩展与集成能力 E2E BDD（part04）

## 范围
- MCP 配置发现与多来源合并
- Wrapper 安装/检索/移除完整链路
- MCP/Skill wrapper 生成语义
- SkillWatcher 自动转换链路
- `command:search` 扩展命令行为

## Feature: MCP 配置发现与合并

### Scenario: 本地 `cwd` 配置应覆盖 home 同名 server 配置
**Given** `~/.synapse/mcp/mcp_servers.json` 与 `./mcp_servers.json` 同时存在  
**And** 两处都定义了同名 server `shared`  
**When** 执行 `McpConfigParser.parse()`  
**Then** `shared` 应使用 `cwd` 配置  
**And** 其他仅在 home 的 server 仍应被保留

### Scenario: 配置应同时识别 command 与 url 两类 server
**Given** 配置中同时包含 `{ command, args }` 与 `{ url }` 结构  
**When** 调用 `getCommandServers()` 与 `getUrlServers()`  
**Then** 两类 server 应被正确分流返回

### Scenario: 配置文件 JSON/Schema 非法时应返回错误但不中断解析流程
**Given** 某配置文件存在非法 JSON 或 schema 校验失败  
**When** 调用 `parse()`  
**Then** `errors` 应包含对应错误描述  
**And** 其它合法来源配置仍应继续参与合并

### Scenario: 无示例配置时可自动创建 example 文件
**Given** `~/.synapse/mcp/mcp_servers.json` 不存在  
**When** 调用 `createExampleConfig()`  
**Then** 应返回新建文件路径  
**And** 文件内容应包含 `example-local` 与 `example-remote`

### Scenario: 示例配置已存在时不应覆盖
**Given** `~/.synapse/mcp/mcp_servers.json` 已存在  
**When** 调用 `createExampleConfig()`  
**Then** 返回值应为 `null`  
**And** 原文件内容应保持不变

## Feature: McpInstaller 安装与检索

### Scenario: 安装 wrapper 后应可在列表中看到 description 与类型
**Given** 安装脚本文件名为 `mcp:test:echo` 且脚本注释包含 `* Description: Echo tool`  
**When** 调用 `listTools()`  
**Then** 结果应包含 `commandName=mcp:test:echo`  
**And** `description` 应为 `Echo tool`

### Scenario: 支持按 type 与 serverName 过滤检索结果
**Given** 已安装 `mcp:alpha:tool` 与 `skill:beta:run`  
**When** 搜索 `type=mcp` 与 `serverName=beta`  
**Then** 结果应分别仅返回匹配集合

### Scenario: glob 模式检索可匹配 commandName/toolName/description
**Given** 已安装多个 wrapper  
**When** 搜索 `pattern="mcp:test:*"`  
**Then** 结果应仅包含匹配命令  
**And** `total` 与输出内容一致

### Scenario: `removeByServer` 应批量移除目标 server 全部 wrapper
**Given** 同一 server 下安装多个命令  
**When** 调用 `removeByServer("demo")`  
**Then** 返回移除数量应等于该 server 的 wrapper 数  
**And** 其它 server wrapper 应保留

### Scenario: 空检索结果应输出统一提示
**Given** 当前无匹配工具  
**When** 调用 `formatSearchResult(emptyResult)`  
**Then** 输出应包含 `No tools found matching pattern`

## Feature: Wrapper 生成语义

### Scenario: MCP wrapper 必填参数应按 required 顺序映射为位置参数
**Given** MCP tool schema `required=[message]` 且可选参数 `times`  
**When** 生成 `mcp:server:echo` wrapper 并查看 usage  
**Then** usage 应包含 `<message>` 必填位置参数  
**And** 可选参数应以 `--times` 形式出现

### Scenario: MCP wrapper 的 `-h/--help` 分别输出简版与详版帮助
**Given** 已生成 MCP wrapper  
**When** 运行 `wrapper -h` 与 `wrapper --help`  
**Then** 两者均应 `exitCode=0`  
**And** `--help` 输出应包含更完整参数说明

### Scenario: Skill wrapper 应按脚本扩展名选择解释器并转发全部参数
**Given** skill 脚本扩展名为 `.py/.sh/.ts/.js`  
**When** 运行对应 `skill:<name>:<tool> ...` wrapper  
**Then** wrapper 应使用匹配解释器启动脚本  
**And** 所有用户参数应原样转发

### Scenario: Skill wrapper 安装失败时应返回结构化错误
**Given** wrapper 目标路径已是目录导致写入失败  
**When** 调用 `SkillWrapperGenerator.install(wrapper)`  
**Then** 返回 `success=false`  
**And** `error` 字段应包含失败原因

## Feature: SkillWatcher 自动转换

### Scenario: watcher 启动后进入监听状态，停止后退出监听状态
**Given** 已创建 `SkillWatcher`  
**When** 依次调用 `start()` 与 `stop()`  
**Then** `isWatching()` 应分别为 `true` 与 `false`

### Scenario: `processScript` 处理合法 docstring 脚本时生成 wrapper
**Given** skill 下 `scripts/analyze.py` 含有效 docstring 元数据  
**When** 调用 `processScript(scriptPath, skillName)`  
**Then** 返回 `success=true`  
**And** `.synapse/bin/skill:<skill>:analyze` 文件应存在

### Scenario: 无 docstring 元数据脚本也应以宽松模式处理成功
**Given** script 仅有可执行代码且缺少规范元数据  
**When** 调用 `processScript(...)`  
**Then** 返回 `success=true`  
**And** `toolName` 应回退为脚本文件名

### Scenario: `processNewSkill` 应批量处理 skill 下所有受支持脚本
**Given** `scripts/` 下存在多个受支持扩展脚本  
**When** 调用 `processNewSkill(skillName)`  
**Then** 返回结果数量应等于可处理脚本数量  
**And** 每个脚本都应尝试生成/安装 wrapper

### Scenario: skill 无 `scripts/` 目录时应返回空结果
**Given** skill 目录仅有 `SKILL.md` 无 `scripts/` 子目录  
**When** 调用 `processNewSkill(skillName)`  
**Then** 返回结果数组应为空  
**And** 不应抛异常

### Scenario: 删除 skill 时可批量移除其 wrapper
**Given** 已为 skill 生成多个 wrapper  
**When** 调用 `removeSkillWrappers(skillName)`  
**Then** 返回值应为移除数量  
**And** 对应 `skill:<skill>:*` wrapper 文件应被清理

## Feature: `command:search` 用户检索

### Scenario: `command:search -h/--help` 返回统一帮助文档
**Given** 已创建 `CommandSearchHandler`  
**When** 执行 `command:search --help`  
**Then** 退出码应为 `0`  
**And** 输出应包含 `USAGE`、`EXAMPLES`、三层命令说明

### Scenario: 不带 pattern 时应按 `*` 执行全量搜索
**Given** 已安装多类命令 wrapper  
**When** 执行 `command:search`  
**Then** 内部搜索 pattern 应为 `*`  
**And** 输出应覆盖可发现命令集合

### Scenario: 带 pattern 时应支持按命令名与描述联合匹配
**Given** 已安装命令且包含描述文本  
**When** 执行 `command:search "git"`  
**Then** 匹配结果可来自 `commandName` 或 `description`

## 备注
- 本分片强调“扩展生态从配置到命令可执行”的闭环可验证性。  
- 文件行数需保持小于等于 1000；后续超限请创建 `03-p2-integration-part05.md`。
