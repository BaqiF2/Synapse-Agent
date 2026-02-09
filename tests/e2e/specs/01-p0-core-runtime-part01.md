# P0 核心运行链路 E2E BDD（part01）

## 范围
- CLI/REPL 启动与基础交互
- 特殊命令可用性
- Shell 前缀命令执行
- Bash 会话状态保持与重置
- Session 文件与索引基础行为

## Feature: CLI 启动与 REPL 可用性

### Scenario: 使用 chat 命令可以进入交互式 REPL
**Given** 在项目根目录且依赖已安装完成  
**And** 环境变量 `ANTHROPIC_API_KEY` 已正确配置  
**When** 执行命令 `bun run chat`  
**Then** 进程应成功启动并显示 REPL 提示符  
**And** 用户可继续输入下一条命令

### Scenario: 缺失必要鉴权信息时给出明确错误
**Given** 未配置 `ANTHROPIC_API_KEY` 且本地设置中也无可用 Key  
**When** 执行命令 `bun run chat`  
**Then** 启动流程应失败并返回可读错误信息  
**And** 错误信息应能提示用户补充鉴权配置

## Feature: REPL 特殊命令

### Scenario: `/help` 显示帮助信息
**Given** 已进入 REPL 会话  
**When** 输入命令 `/help`  
**Then** 命令应被识别为特殊命令并执行成功  
**And** 输出中包含帮助说明

### Scenario: `/h` 是 `/help` 的别名
**Given** 已进入 REPL 会话  
**When** 输入命令 `/h`  
**Then** 命令应被正确处理  
**And** 行为与 `/help` 一致

### Scenario: `/?` 是 `/help` 的别名
**Given** 已进入 REPL 会话  
**When** 输入命令 `/?`  
**Then** 命令应被正确处理  
**And** 行为与 `/help` 一致

### Scenario: `/tools` 可以展示可用工具信息
**Given** 已进入 REPL 会话  
**When** 输入命令 `/tools`  
**Then** 命令应成功处理  
**And** 输出中包含工具列表或工具状态说明

### Scenario: `/skills` 可以展示技能列表信息
**Given** 已进入 REPL 会话  
**When** 输入命令 `/skills`  
**Then** 命令应成功处理  
**And** 输出中包含技能列表或无技能时的提示

### Scenario: `/model` 可以输出当前模型标识
**Given** 已进入 REPL 会话且 Runner 已初始化  
**When** 输入命令 `/model`  
**Then** 命令应成功处理  
**And** 输出包含当前模型名称

### Scenario: `/cost` 可以输出会话用量信息
**Given** 已进入 REPL 会话且存在会话用量统计  
**When** 输入命令 `/cost`  
**Then** 命令应成功处理  
**And** 输出包含 token/cost 相关字段

### Scenario: `/resume` 不带参数时给出用法提示
**Given** 已进入 REPL 会话  
**When** 输入命令 `/resume`  
**Then** 命令应被处理  
**And** 输出包含 session id 的使用说明

### Scenario: `/resume` 使用非法 session id 时可优雅处理
**Given** 已进入 REPL 会话  
**When** 输入命令 `/resume invalid-id`  
**Then** 命令应被处理  
**And** 输出应包含无法恢复会话的提示而非崩溃

### Scenario: `/exit` 可以安全退出
**Given** 已进入 REPL 会话  
**When** 输入命令 `/exit`  
**Then** 命令应成功处理  
**And** 进程应按预期退出

### Scenario: `/quit` 是 `/exit` 的别名
**Given** 已进入 REPL 会话  
**When** 输入命令 `/quit`  
**Then** 命令应成功处理  
**And** 行为与 `/exit` 一致

### Scenario: `/q` 是 `/exit` 的别名
**Given** 已进入 REPL 会话  
**When** 输入命令 `/q`  
**Then** 命令应成功处理  
**And** 行为与 `/exit` 一致

### Scenario: 未知斜杠命令返回错误但不会中断 REPL
**Given** 已进入 REPL 会话  
**When** 输入命令 `/unknown`  
**Then** 命令应被识别并返回“未知命令”提示  
**And** REPL 会话保持可继续输入状态

### Scenario: 普通文本输入不会被当作特殊命令
**Given** 已进入 REPL 会话  
**When** 输入文本 `hello world`  
**Then** 特殊命令处理器应返回“未处理”  
**And** 后续进入正常对话处理流程

### Scenario: 特殊命令大小写不敏感
**Given** 已进入 REPL 会话  
**When** 依次输入 `/HELP`、`/Help`、`/hElP`、`/EXIT`  
**Then** 每条命令都应被正确识别并处理成功

## Feature: Shell 前缀命令（`!`）执行

### Scenario: `!` 前缀可执行简单 shell 命令
**Given** 已进入 REPL 会话  
**When** 输入命令 `!echo "test"`  
**Then** 命令退出码应为 `0`  
**And** 输出中包含 `test`

### Scenario: shell 命令失败时返回非零退出码
**Given** 已进入 REPL 会话  
**When** 输入命令 `!false`  
**Then** 命令退出码应为非 `0`

### Scenario: shell 命令支持参数
**Given** 已进入 REPL 会话  
**When** 输入命令 `!ls -la /tmp`  
**Then** 命令应执行成功  
**And** 返回退出码为 `0`

### Scenario: shell 命令支持管道
**Given** 已进入 REPL 会话  
**When** 输入命令 `!echo "hello" | cat`  
**Then** 命令应执行成功  
**And** 返回退出码为 `0`

## Feature: Bash 会话状态管理

### Scenario: 会话保持工作目录状态
**Given** 已创建 `BashSession` 与 `BashRouter`  
**And** 已存在临时目录 `<TEST_DIR>`  
**When** 执行 `cd <TEST_DIR>` 后再执行 `pwd`  
**Then** `pwd` 输出应包含 `<TEST_DIR>`

### Scenario: 会话保持环境变量状态
**Given** 已创建 `BashSession` 与 `BashRouter`  
**When** 先执行 `export TEST_VAR="synapse_test"` 再执行 `echo $TEST_VAR`  
**Then** 输出应包含 `synapse_test`

### Scenario: 请求重启会话后状态被清空
**Given** 已创建 `BashSession` 与 `BashRouter`  
**And** 已执行 `export RESTART_TEST="before"`  
**When** 以 `restart=true` 执行 `echo $RESTART_TEST`  
**Then** 输出应为空字符串或仅空白字符  
**And** 表示会话状态已重置

## Feature: Session 索引与路径

### Scenario: 创建新会话时自动生成 session id
**Given** 指定可写的 `sessionsDir`  
**When** 调用 `Session.create({ sessionsDir })`  
**Then** 返回的 `session.id` 应匹配 `session-` 前缀格式

### Scenario: 新会话会注册到 `sessions.json`
**Given** 指定可写的 `sessionsDir`  
**When** 调用 `Session.create({ sessionsDir })`  
**Then** `sessionsDir/sessions.json` 文件应存在  
**And** 文件中的 `sessions` 数组长度应大于等于 `1`  
**And** 索引版本字段应为 `1.0.0`

### Scenario: 会话 historyPath 指向正确 jsonl 文件
**Given** 指定可写的 `sessionsDir`  
**When** 调用 `Session.create({ sessionsDir })` 获取会话实例  
**Then** `session.historyPath` 应等于 `<sessionsDir>/<sessionId>.jsonl`

### Scenario: 索引文件损坏时可自动恢复
**Given** `sessionsDir/sessions.json` 内容是非法 JSON  
**When** 调用 `Session.create({ sessionsDir })`  
**Then** 不应抛出未捕获异常  
**And** 仍可返回有效的 `session.id`

## 备注
- 本文件采用 BDD 规范描述，优先覆盖 P0 核心链路。  
- 文件行数需保持小于等于 1000；如后续补充超限，新增 `01-p0-core-runtime-part02.md`。
