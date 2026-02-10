# P2 扩展与集成能力 E2E BDD（part05）

## 范围
- MCP/Skill 初始化过程中的孤儿 wrapper 清理
- 初始化失败策略（跳过失败或快速失败）
- MCP 客户端与管理器的连接状态机边界
- Skill Auto Updater 生命周期与事件转发

## Feature: MCP 初始化清理与失败策略

### Scenario: 配置移除 server 后应清理其孤儿 `mcp:*` wrapper
**Given** `~/.synapse/bin` 中已存在旧 server 的 `mcp:legacy:*` wrapper  
**And** 当前 `mcp_servers.json` 不再包含 `legacy`  
**When** 执行 `initializeMcpTools()`  
**Then** 旧 server 对应 wrapper 应被自动移除  
**And** 当前配置中的 server wrapper 应继续保留/重装

### Scenario: `skipFailedServers=true` 时单个 server 失败不阻断其余 server
**Given** 多个 MCP server 中只有一个连接失败  
**And** 初始化选项 `skipFailedServers=true`  
**When** 执行初始化  
**Then** 失败 server 应记录到 `errors`  
**And** 其它可连接 server 仍应继续安装工具

### Scenario: `skipFailedServers=false` 时遇到失败应中止后续 server 处理
**Given** 初始化选项 `skipFailedServers=false`  
**And** 第一个失败 server 已返回连接错误  
**When** 初始化流程继续判断结果  
**Then** 总体 `success` 应标记为 `false`  
**And** 后续 server 不应再继续处理

### Scenario: `processServer` 无论成功失败都应执行 disconnect
**Given** MCP server 在连接、列工具或生成 wrapper 任一步骤可能失败  
**When** `processServer` 退出  
**Then** `client.disconnect()` 应在 finally 分支执行  
**And** 不应遗留活跃连接句柄

### Scenario: `cleanupMcpTools` 在无 MCP 工具时应返回 0
**Given** bin 目录不存在或不存在任何 `mcp:*` wrapper  
**When** 执行 `cleanupMcpTools()`  
**Then** 返回值应为 `0`  
**And** 不应抛异常

## Feature: Skill 初始化清理与健壮性

### Scenario: 初始化前应清理不存在技能的 `skill:*` 孤儿 wrapper
**Given** bin 目录中存在 `skill:removed-skill:*` 文件  
**And** skills 目录不再包含 `removed-skill`  
**When** 执行 `initializeSkillTools()`  
**Then** 对应孤儿 wrapper 应被移除  
**And** 现存技能对应 wrapper 不应被误删

### Scenario: Meta Skill 安装失败不应中断技能初始化
**Given** `MetaSkillInstaller.installIfMissing()` 抛出异常  
**When** 执行 `initializeSkillTools()`  
**Then** 初始化流程应继续执行普通技能扫描  
**And** 最终结果不应仅因 meta skill 失败而整体失败

### Scenario: 技能列表读取失败时应快速失败并返回错误摘要
**Given** `SkillStructure.listSkills()` 抛出异常  
**When** 执行 `initializeSkillTools()`  
**Then** 结果应 `success=false`  
**And** `errors` 中应包含 `Failed to list skills`

### Scenario: `cleanupSkillTools` 只删除 `skill:` 前缀文件
**Given** bin 目录包含 `skill:demo:hello` 与 `other-tool`  
**When** 执行 `cleanupSkillTools()`  
**Then** 仅 `skill:demo:hello` 被删除  
**And** `other-tool` 必须保留

## Feature: MCP 客户端连接状态机

### Scenario: server 配置非法时 `connect` 应返回断开态错误结果
**Given** server 既非 command 也非 url 的非法配置  
**When** 调用 `client.connect()`  
**Then** `success=false` 且 `state=disconnected`  
**And** `error` 应包含 `Invalid server configuration`

### Scenario: 未连接时调用 `listTools` 应返回明确错误
**Given** `client.isConnected()` 为 false  
**When** 调用 `client.listTools()`  
**Then** 应抛出 `Not connected to MCP server`  
**And** 调用方可据此提示重连

### Scenario: 未连接时调用 `callTool` 应返回明确错误
**Given** 客户端尚未完成 `connect()`  
**When** 调用 `client.callTool(name, args)`  
**Then** 应抛出 `Not connected to MCP server`  
**And** 不应发起实际 MCP 调用

### Scenario: 已连接后重复 `connect()` 应返回幂等成功结果
**Given** 客户端当前状态已是 `connected`  
**When** 再次调用 `connect()`  
**Then** 应直接返回 `success=true`  
**And** 不应重复创建 transport/client

### Scenario: 连接超时后应自动清理并回到断开态
**Given** 目标 server 长时间无响应触发 timeout  
**When** `connect()` 超时失败  
**Then** 返回错误应包含 `Connection timeout`  
**And** 内部状态应回到 `disconnected`

## Feature: McpClientManager 多服务容错

### Scenario: 连接未注册 server 时应返回结构化错误
**Given** `McpClientManager` 未注册目标 server 名称  
**When** 调用 `connectServer("unknown")`  
**Then** 返回应为 `success=false`  
**And** `error` 包含 `not registered`

### Scenario: `listAllTools` 单服务失败不应中断其它服务结果
**Given** manager 中多个已连接服务且其中一个 `listTools` 抛错  
**When** 调用 `listAllTools()`  
**Then** 失败服务应返回空数组  
**And** 其它服务工具列表仍应正常返回

## Feature: SkillAutoUpdater 运行态事件保障

### Scenario: 已运行状态再次 `start()` 应拒绝重复启动
**Given** `SkillAutoUpdater` 已处于 running 状态  
**When** 再次调用 `start()`  
**Then** 应抛出 `Auto-updater is already running`  
**And** 不应重复注册 watcher

### Scenario: `syncAll` 应为每个 wrapper 生成并广播安装事件
**Given** skills 目录下存在多个可生成 wrapper 的脚本  
**When** 调用 `syncAll()`  
**Then** 返回事件数组长度应覆盖所有 wrapper  
**And** 每个事件应通过 `onUpdate` 广播

### Scenario: update handler 抛错时应转发到 `onError` 处理器
**Given** 已注册一个会抛错的 `onUpdate` 回调  
**When** 收到更新事件并触发回调  
**Then** 错误应被捕获并传递给 `onError`  
**And** 不应导致整个 updater 崩溃

### Scenario: wrapper 生成失败时应发布 `type=error` 的更新事件
**Given** `generateWrapper` 返回 `null`（脚本元数据不可解析）  
**When** 处理脚本新增事件  
**Then** 应发布 `type=error` 的 update 事件  
**And** `error` 字段应包含可诊断原因

## 备注
- 本分片强化“初始化与运行态集成容错”，覆盖真实环境中最常见的部分失败场景。  
- 文件行数需保持小于等于 1000；后续超限请创建 `03-p2-integration-part06.md`。
