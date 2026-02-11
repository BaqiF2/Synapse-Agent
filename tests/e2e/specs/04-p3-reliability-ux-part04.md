# P3 稳定性与体验保障 E2E BDD（part04）

## 范围
- Sandbox 生命周期与策略稳定性
- Local backend 拦截准确性
- 平台适配器 fail-close 行为
- Terminal/FixedBottom 渲染稳定性

## Feature: SandboxManager 生命周期

### Scenario: 首次 `getSandbox` 懒初始化，后续调用复用实例
**Given** `SandboxManager(enabled=true)` 已创建  
**When** 连续两次调用 `getSandbox('/workspace')`  
**Then** provider.create 应只调用一次  
**And** 两次返回应为同一 backend 实例

### Scenario: `enabled=false` 时应使用无沙盒 backend 且不触发 provider.create
**Given** `SandboxManager(enabled=false)`  
**When** 调用 `getSandbox('/workspace')`  
**Then** 应返回 unsandboxed backend  
**And** provider.create 调用次数应为 `0`

### Scenario: 沙盒创建失败时必须 fail-close 而非自动降级
**Given** provider.create 抛出 `create failed`  
**When** 调用 `getSandbox('/workspace')`  
**Then** 应直接抛出错误  
**And** 不应自动回退到无沙盒执行

### Scenario: `addRuntimeWhitelist` 应重建沙盒并保留新增路径
**Given** 当前已有活跃 sandbox  
**When** 连续调用 `addRuntimeWhitelist('/path1')` 与 `addRuntimeWhitelist('/path2')`  
**Then** sandbox 应被重建  
**And** 最新 policy.whitelist 应同时包含 `/path1` 与 `/path2`

### Scenario: 执行时若沙盒崩溃应自动重建并重试命令
**Given** 第一次 backend.execute 抛出进程崩溃错误  
**When** 调用 `manager.execute(command, cwd)`  
**Then** 应销毁旧 sandbox 并创建新 sandbox 重试  
**And** 最终返回重试后的执行结果

### Scenario: `buildPolicy` 应合并 cwd、配置白名单、运行时白名单与 TMPDIR
**Given** 配置白名单含 `/data` 且运行时新增 `/extra`  
**When** 调用 `buildPolicy('/workspace')`  
**Then** whitelist 应包含 `/workspace`、`/data`、`/extra`  
**And** 应包含系统临时目录路径

### Scenario: `shutdown` 后再次 `getSandbox` 应创建新实例
**Given** 已存在活跃 sandbox  
**When** 调用 `shutdown()` 后再次 `getSandbox(...)`  
**Then** provider.destroy 应被调用  
**And** provider.create 应再次被调用

## Feature: 沙箱状态作用域

### Scenario: 同一持久沙盒内 `cd` 与 `export` 状态可跨命令保留
**Given** 已获取同一个 sandbox backend  
**When** 先执行 `cd /tmp && export FOO=bar` 再执行 `pwd` 与 `echo $FOO`  
**Then** 应输出 `/tmp` 与 `bar`

### Scenario: 沙盒重建后 shell 状态应被重置
**Given** 先在旧 sandbox 中设置 `cd/export` 状态  
**When** 通过 `addRuntimeWhitelist` 触发重建  
**Then** 新 sandbox 中 `pwd` 不应保持旧目录  
**And** `echo $FOO` 应为空

### Scenario: 会话级白名单不应跨 SandboxManager 实例持久化
**Given** managerA 通过 `addRuntimeWhitelist('/extra')` 已加入会话白名单  
**When** 新建 managerB 并构建 policy  
**Then** managerB 的 whitelist 不应自动包含 `/extra`

### Scenario: 永久白名单写入后应可跨实例加载
**Given** 调用 `addPermanentWhitelist('/extra')` 写入 `sandbox.json`  
**When** 新建 SandboxManager 并加载配置  
**Then** `buildPolicy(...)` 的 whitelist 应包含 `/extra`

## Feature: LocalSandboxBackend 拦截准确性

### Scenario: 黑名单命中应在命令执行前直接阻断
**Given** policy whitelist 与 blacklist 同时覆盖某敏感路径  
**When** 执行 `cat <blacklist-path>`  
**Then** 返回应为 `blocked=true`  
**And** 底层 session.execute 不应被调用

### Scenario: 子进程命令也应遵守黑名单
**Given** blacklist 包含 `/home/.ssh`  
**When** 执行 `bash -c "cat /home/.ssh/id_rsa"`  
**Then** 应返回 `blocked=true`  
**And** `blockedResource` 应指向命中规则

### Scenario: 平台违规检测命中后应附带原因与资源
**Given** platform.isViolation(result)=true  
**When** 执行命令返回平台拒绝特征  
**Then** 返回应包含 `blockedReason` 与 `blockedResource`

### Scenario: `dispose` 必须同时释放 session 与平台资源
**Given** backend 已 `start()` 并持有活动 session  
**When** 调用 `dispose()`  
**Then** 应调用 `session.kill/cleanup`  
**And** 应调用 `platform.cleanup`

## Feature: 平台适配器 fail-close

### Scenario: Linux 无 `bwrap` 时应拒绝启动沙箱命令
**Given** `LinuxAdapter.hasBwrap=false`  
**When** 调用 `wrapCommand(policy)`  
**Then** 应抛出 `bwrap is required` 错误  
**And** 不应产生 fail-open 行为

### Scenario: macOS profile 应包含网络禁用规则
**Given** 使用 `MacOSAdapter` 生成 profile  
**When** 调用 `wrapCommand(policy)`  
**Then** profile 内容应包含 `(deny network*)`

### Scenario: macOS 黑名单 glob 规则应转换为 regex deny
**Given** blacklist 含 `**/.env` 等 glob 模式  
**When** 生成 profile  
**Then** deny 段应包含对应 `regex` 规则  
**And** deny 声明顺序应位于 allow 规则之后

## Feature: TerminalRenderer 并行渲染稳定性

### Scenario: 并行 SubAgent 启动时每个任务都应立即可见
**Given** 连续启动多个并行 SubAgent 工具调用  
**When** 调用 `renderSubAgentToolStart(...)`  
**Then** 每个任务都应输出独立 `Task(...)` 行  
**And** 不应等待前一个任务完成

### Scenario: TTY 并行输出时不应把后续 Task 行拼接到前一工具行
**Given** `process.stdout.isTTY=true` 且存在并行任务  
**When** 第二个任务开始渲染  
**Then** 输出中应出现换行后的新 Task 行  
**And** 不应出现行粘连

### Scenario: 并行任务工具超过窗口时应显示省略提示
**Given** 单任务工具数超过 `MAX_RECENT_TOOLS`  
**When** 继续渲染后续工具  
**Then** 输出应包含 `... (N earlier tool[s])` 提示

### Scenario: 非 TTY 下应使用静态输出且不使用光标控制
**Given** `process.stdout.isTTY=false`  
**When** 渲染 SubAgent 工具与结果  
**Then** 应输出可读静态文本  
**And** 不应依赖 `cursorTo/moveCursor/clearLine`

### Scenario: 任务描述过长应按摘要长度截断
**Given** SubAgent 描述长度超过摘要限制  
**When** 渲染 Task 行  
**Then** 描述应截断并以 `...` 结尾

## Feature: TodoWrite 普通滚动输出稳定性

### Scenario: TodoWrite 应通过常规工具流显示
**Given** Agent 触发 `TodoWrite` 工具调用  
**When** 工具开始与结束事件被渲染  
**Then** 输出中应出现该工具调用轨迹  
**And** 输出应包含工具结果摘要

### Scenario: 非 TTY 下 TodoWrite 结果应保持可读
**Given** `process.stdout.isTTY=false`  
**When** 渲染 `TodoWrite` 工具调用结果  
**Then** 应输出可读静态文本  
**And** 不应依赖 `cursorTo/moveCursor/clearLine`

### Scenario: 多次 TodoWrite 更新应按时间顺序滚动展示
**Given** 连续触发多次 `TodoWrite` 调用  
**When** 每次调用完成并输出结果  
**Then** 终端应按发生顺序追加输出  
**And** 不应存在固定底部 Todo 区域

## 备注
- 本分片聚焦“高并发输出 + 沙箱重建 + 终端降级”下的可用性与可恢复性。  
- 文件行数需保持小于等于 1000；后续超限请创建 `04-p3-reliability-ux-part05.md`。
