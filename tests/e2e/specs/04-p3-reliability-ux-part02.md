# P3 稳定性与体验保障 E2E BDD（part02）

## 范围
- 沙箱授权交互闭环
- AgentRunner 保护机制
- Session 容错读取
- 显示层鲁棒性

## Feature: 沙箱授权交互闭环

### Scenario: 遇到受限资源时返回 `requires_permission`
**Given** Agent 首轮工具调用返回 `extras.type=sandbox_blocked`  
**And** block 资源为 `~/.ssh/id_rsa`  
**When** 调用 `runner.step("读取密钥")`  
**Then** 返回状态应为 `requires_permission`  
**And** `permission.type` 应为 `sandbox_access`  
**And** `permission.options` 应为 `allow_once|allow_session|allow_permanent|deny`

### Scenario: 选择 `allow_once` 走无沙盒单次执行
**Given** 已存在 pending sandbox permission  
**When** 调用 `resolveSandboxPermission('allow_once')`  
**Then** 应调用 `bashTool.executeUnsandboxed(command, cwd)`  
**And** 返回输出应包含无沙盒执行结果

### Scenario: 选择 `allow_session` 添加会话白名单并重试命令
**Given** 已存在 pending sandbox permission，资源为 `~/.ssh/id_rsa`  
**When** 调用 `resolveSandboxPermission('allow_session')`  
**Then** 应调用 `allowSession('~/.ssh', cwd)`  
**And** 随后调用 `bashTool.call({ command })` 重试  
**And** 返回输出应包含重试结果

### Scenario: 选择 `allow_permanent` 写入永久授权并重试
**Given** 已存在 pending sandbox permission  
**When** 调用 `resolveSandboxPermission('allow_permanent')`  
**Then** 应调用 `allowPermanent('<resource-dir>', cwd)`  
**And** 随后调用 `bashTool.call({ command })` 重试

### Scenario: 选择 `deny` 返回拒绝信息且不执行命令
**Given** 已存在 pending sandbox permission  
**When** 调用 `resolveSandboxPermission('deny')`  
**Then** 返回应包含 `User denied access`  
**And** 不应调用 `allowSession`、`allowPermanent`、`executeUnsandboxed`

### Scenario: 无 pending 权限时 resolve 应报错
**Given** 当前没有待处理的 permission 请求  
**When** 调用 `resolveSandboxPermission('allow_once')`  
**Then** 应抛出 `No pending sandbox permission request`

## Feature: AgentRunner 保护机制

### Scenario: 连续工具失败达到阈值后主动停止
**Given** 工具连续失败次数达到 `maxConsecutiveToolFailures`  
**When** 执行 `runner.run(...)`  
**Then** 应返回 `Consecutive tool execution failures; stopping.`  
**And** 不应继续进入下一轮工具调用

### Scenario: 工具迭代达到上限后停止并返回指引
**Given** 运行过程中持续存在工具调用且超过 `maxIterations`  
**When** 执行 `runner.run(...)`  
**Then** 应返回 `Reached tool iteration limit` 提示  
**And** 提示中包含 `Use --help to see command usage.`

### Scenario: 用户消息在执行前可被 signal 中断
**Given** 调用 `runner.run(userMessage, { signal })` 且 signal 已 abort  
**When** 进入执行流程  
**Then** 应立即抛出中断相关错误  
**And** 不应追加新一轮消息到历史

### Scenario: Stop Hook 仅在正常完成时执行
**Given** `stopHookExecutor.shouldExecute()` 为 true  
**When** `runWithPotentialPermission` 正常完成且无权限中断  
**Then** 应执行 `executeAndAppend`  
**And** 返回包含 Hook 追加后的结果

## Feature: Session 容错与数据健壮性

### Scenario: JSONL 含损坏行时跳过坏行继续加载
**Given** history 文件中部分行为非法 JSON  
**When** 调用 `session.loadHistory()`  
**Then** 非法行应被跳过  
**And** 其余合法消息仍可成功加载

### Scenario: `Session.list` 在索引损坏时返回空数组
**Given** `sessions.json` 非法或 schema 不匹配  
**When** 调用 `Session.list()`  
**Then** 应返回 `[]`  
**And** 不应抛出未捕获异常

### Scenario: `Session.find` 在索引损坏时返回 null
**Given** `sessions.json` 非法或不可读  
**When** 调用 `Session.find(sessionId)`  
**Then** 应返回 `null`

### Scenario: `Session.continue` 在无会话时返回 null
**Given** 会话索引为空  
**When** 调用 `Session.continue()`  
**Then** 应返回 `null`

## Feature: REPL 显示层鲁棒性

### Scenario: `/skills` 在技能目录缺失时提示创建路径
**Given** `~/.synapse/skills` 目录不存在  
**When** 执行 `/skills`  
**Then** 输出应包含 `No skills directory found.`  
**And** 输出应包含建议创建路径

### Scenario: `/skills` 在 SKILL.md 无描述字段时显示默认描述
**Given** 技能目录存在但 `SKILL.md` 无法提取 description  
**When** 执行 `/skills`  
**Then** 该技能描述应显示 `(No description)`

### Scenario: `/tools` 输出应移除 `Found N tools` 头部行
**Given** `McpInstaller.formatSearchResult` 输出首行包含 `Found N tools`  
**When** 执行 `/tools`  
**Then** 显示内容应移除该头部行  
**And** 保留工具主体列表

### Scenario: `/compact` 在无 runner 上下文时返回不可用提示
**Given** `agentRunner=null`  
**When** 执行 `/compact`  
**Then** 输出应包含 `Compact unavailable in this context.`

### Scenario: `/compact` 异常时返回带原因的失败信息
**Given** `forceCompact()` 抛出异常  
**When** 执行 `/compact`  
**Then** 输出应包含 `压缩失败`  
**And** 输出应包含异常 message

## Feature: 输出与可读性

### Scenario: 技能增强进度文本在 TTY 下高亮
**Given** `process.stdout.isTTY=true` 且输出包含 `SKILL_ENHANCE_PROGRESS_TEXT`  
**When** 调用 `formatStreamText(text)`  
**Then** 返回值应包含高亮 ANSI 前缀/后缀  
**And** 文本内容保持不变

### Scenario: 非 TTY 下不注入 ANSI 高亮
**Given** `process.stdout.isTTY=false` 且输出包含技能增强进度文本  
**When** 调用 `formatStreamText(text)`  
**Then** 返回应等于原始文本（不加颜色控制符）

## 备注
- 本文件覆盖“线上稳定性 + 用户可诊断体验”的关键守护场景。  
- 文件行数需保持小于等于 1000；后续超限请创建 `04-p3-reliability-ux-part03.md`。
