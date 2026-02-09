# P2 扩展与集成能力 E2E BDD（part01）

## 范围
- `command:search` 扩展命令检索
- MCP 配置解析与安装器搜索
- Skill 索引、加载、命令处理
- Skill 全生命周期集成
- Auto-Enhance 触发与增强流程

## Feature: command:search 扩展命令

### Scenario: `command:search --help` 返回帮助信息
**Given** 已初始化 `CommandSearchHandler`  
**When** 执行命令 `command:search --help`  
**Then** 退出码应为 `0`  
**And** 输出应包含 `command:search` 与 `USAGE`

### Scenario: `command:search` 带 pattern 时可执行
**Given** 已初始化 `CommandSearchHandler`  
**When** 执行命令 `command:search test`  
**Then** 退出码应为 `0`  
**And** 不应出现未捕获异常

### Scenario: `command:search` 不带 pattern 时返回全量结果
**Given** 已初始化 `CommandSearchHandler`  
**When** 执行命令 `command:search`  
**Then** 退出码应为 `0`  
**And** 输出应包含列表结果或空列表说明

### Scenario: `command:search --type=mcp` 可按类型过滤
**Given** 已初始化 `CommandSearchHandler`  
**When** 执行命令 `command:search --type=mcp`  
**Then** 退出码应为 `0`  
**And** 结果只包含 MCP 类型命令

## Feature: MCP 配置解析

### Scenario: 解析有效的 `mcp_servers.json`
**Given** `<HOME>/.synapse/mcp/mcp_servers.json` 包含 1 个合法 server 配置  
**When** 调用 `McpConfigParser(<HOME>).parse()`  
**Then** 返回结果中的 `servers` 数组长度应为 `1`  
**And** `servers[0].name` 应等于配置中的 `test-server`

### Scenario: 配置缺失时返回空结果而非抛异常
**Given** `<HOME>/.synapse/mcp/mcp_servers.json` 不存在  
**When** 调用 `McpConfigParser(<HOME>).parse()`  
**Then** 返回结果中的 `servers` 应为 `[]`  
**And** 不应抛出未捕获异常

## Feature: MCP Installer 检索与格式化

### Scenario: 搜索已安装工具
**Given** 已初始化 `McpInstaller(<HOME>)`  
**When** 调用 `search({ pattern: '*' })`  
**Then** 返回对象应存在  
**And** 返回结构中包含 `tools`

### Scenario: 按 `mcp` 类型过滤搜索结果
**Given** 已初始化 `McpInstaller(<HOME>)`  
**When** 调用 `search({ pattern: '*', type: 'mcp' })`  
**Then** 返回对象应存在  
**And** 结果应满足 MCP 类型筛选条件

### Scenario: 按 `skill` 类型过滤搜索结果
**Given** 已初始化 `McpInstaller(<HOME>)`  
**When** 调用 `search({ pattern: '*', type: 'skill' })`  
**Then** 返回对象应存在  
**And** 结果应满足 Skill 类型筛选条件

### Scenario: 搜索结果可格式化为可读文本
**Given** 已初始化 `McpInstaller(<HOME>)` 且已有搜索结果对象  
**When** 调用 `formatSearchResult(result)`  
**Then** 返回值类型应为字符串  
**And** 字符串中应包含可读的结果摘要

## Feature: Skill 索引与检索

### Scenario: SkillIndexer 可按名称检索技能
**Given** `.synapse/skills` 下存在 `example-analyzer` 技能  
**When** 执行 `SkillIndexer.rebuild()` 并读取索引  
**Then** 索引中应存在名称包含 `analyzer` 的技能条目  
**And** 条目名称应为 `example-analyzer`

### Scenario: SkillIndexer 可按 domain 过滤
**Given** 索引中存在多个 `programming` 域技能  
**When** 过滤 `domain=programming`  
**Then** 结果数量应大于等于 `2`

### Scenario: SkillIndexer 可按 tags 过滤
**Given** 索引中存在带 `git` 标签的技能  
**When** 过滤 `tag=git`  
**Then** 结果应包含 `git-helper`

### Scenario: SkillIndexer 重建后包含更新时间
**Given** 已初始化 `SkillIndexer`  
**When** 调用 `rebuild()`  
**Then** 返回索引中的 `updatedAt` 应存在  
**And** `skills` 数组长度应符合当前技能目录实际数量

## Feature: SkillLoader 分层加载

### Scenario: Level 1 能加载全部技能元数据
**Given** 技能目录下存在多个有效技能  
**When** 调用 `loadAllLevel1()`  
**Then** 返回数组长度应大于等于 `2`  
**And** 包含 `example-analyzer` 与 `git-helper`

### Scenario: Level 2 能加载单技能完整内容
**Given** 技能 `example-analyzer` 存在且 `SKILL.md` 合法  
**When** 调用 `loadLevel2('example-analyzer')`  
**Then** 返回对象不应为 `null`  
**And** `name` 为 `example-analyzer`  
**And** `executionSteps` 长度应大于 `0`

### Scenario: Level 1 支持关键字搜索
**Given** 技能目录含 `git-helper`  
**When** 调用 `searchLevel1('git')`  
**Then** 返回结果应包含 `git-helper`

### Scenario: Level 2 加载具备缓存行为
**Given** 同一进程内多次加载同一技能  
**When** 连续两次调用 `loadLevel2('example-analyzer')`  
**Then** 两次返回对象内容应一致

## Feature: skill:load 命令

### Scenario: 加载存在的技能成功返回内容
**Given** `SkillCommandHandler` 指向包含 `code-analyzer` 的 homeDir  
**When** 执行命令 `skill:load code-analyzer`  
**Then** 退出码应为 `0`  
**And** 输出包含 `# Skill: code-analyzer`

### Scenario: 加载不存在技能返回失败
**Given** `SkillCommandHandler` 已初始化  
**When** 执行命令 `skill:load nonexistent`  
**Then** 退出码应为 `1`  
**And** `stderr` 包含 `not found`

### Scenario: `skill:load` 无参数时输出用法
**Given** `SkillCommandHandler` 已初始化  
**When** 执行命令 `skill:load`  
**Then** 退出码应为 `1`  
**And** 输出包含 `USAGE`

### Scenario: `skill:load --help` 返回帮助
**Given** `SkillCommandHandler` 已初始化  
**When** 执行命令 `skill:load --help`  
**Then** 退出码应为 `0`  
**And** 输出包含 `USAGE`

### Scenario: 未知 skill 子命令返回引导信息
**Given** `SkillCommandHandler` 已初始化  
**When** 执行命令 `skill:invalid`  
**Then** 退出码应为 `1`  
**And** `stderr` 包含 `Unknown skill command`  
**And** `stderr` 包含 `skill:load` 建议

## Feature: Skill 全生命周期集成

### Scenario: 技能创建后可被索引并加载
**Given** `SkillGenerator`、`SkillIndexUpdater`、`SkillCommandHandler` 已初始化  
**When** 先创建技能 `file-processor`，再执行索引更新，最后执行 `skill:load file-processor`  
**Then** 加载命令退出码应为 `0`  
**And** 输出包含技能标题 `File Processor`

### Scenario: 批量创建技能后均可加载
**Given** 准备技能清单 `python-linter`、`js-formatter`、`code-reviewer`  
**When** 逐个创建并加入索引后依次执行 `skill:load`  
**Then** 每个加载命令退出码都应为 `0`

### Scenario: 重复创建同名技能被拒绝
**Given** 已存在技能 `unique-skill`  
**When** 再次调用 `createSkill({ name: 'unique-skill', ... })`  
**Then** 返回应为失败  
**And** 错误信息包含 `already exists`

### Scenario: 并发加载同一技能保持成功
**Given** 已存在可加载技能 `load-target`  
**When** 并发发起三次 `skill:load load-target`  
**Then** 每次返回的退出码都应为 `0`

## Feature: Skill Enhance 流程

### Scenario: 复杂会话可被分析并提取统计
**Given** 已构造复杂会话文件（包含多轮、多工具调用）  
**When** 调用 `SkillEnhancer.analyzeConversation(convPath)`  
**Then** `summary.toolCalls` 应大于 `3`  
**And** `summary.uniqueTools` 长度应大于 `1`

### Scenario: 复杂模式触发“创建新技能”建议
**Given** 已构造有明确工具序列模式的会话  
**When** 调用 `SkillEnhancer.shouldEnhance(analysis)`  
**Then** `shouldEnhance` 应为 `true`  
**And** `suggestedAction` 应为 `create`

### Scenario: 简单会话不会触发增强
**Given** 已构造简单会话文件  
**When** 调用 `SkillEnhancer.shouldEnhance(analysis)`  
**Then** `shouldEnhance` 应为 `false`  
**And** 原因应包含 `too simple`

### Scenario: 会话文件缺失时返回空分析
**Given** 会话路径不存在  
**When** 调用 `SkillEnhancer.analyzeConversation('/nonexistent/path.jsonl')`  
**Then** `turns.length` 应为 `0`  
**And** `summary.totalTurns` 应为 `0`

### Scenario: Trigger 在启用且复杂任务时应触发
**Given** `AutoEnhanceTrigger` 已启用  
**And** 任务上下文包含高工具调用量与多样工具  
**When** 调用 `shouldTrigger(context)`  
**Then** `shouldTrigger` 应为 `true`

### Scenario: Trigger 在未启用时不触发
**Given** `AutoEnhanceTrigger` 未启用  
**And** 任务上下文复杂度较高  
**When** 调用 `shouldTrigger(context)`  
**Then** `shouldTrigger` 应为 `false`  
**And** 原因应包含 `disabled`

### Scenario: 技能效果良好时不触发增强
**Given** `AutoEnhanceTrigger` 已启用  
**And** 任务上下文声明 `skillsWorkedWell=true`  
**When** 调用 `shouldTrigger(context)`  
**Then** `shouldTrigger` 应为 `false`

### Scenario: 技能表现不佳时建议增强
**Given** `AutoEnhanceTrigger` 已启用  
**And** 任务上下文声明 `skillsWorkedWell=false`  
**When** 调用 `shouldTrigger(context)`  
**Then** `shouldTrigger` 应为 `true`  
**And** `suggestedAction` 应为 `enhance`

### Scenario: 完整增强链路可运行
**Given** 会话文件与任务上下文均满足触发条件  
**When** 调用 `triggerEnhancement(convPath, context)`  
**Then** 返回对象应存在  
**And** `action` 应属于 `created|enhanced|none`

## 备注
- 本文件聚焦 P2 扩展组件之间的联动行为。  
- 文件行数需保持小于等于 1000；如后续补充超限，新增 `03-p2-integration-part02.md`。
