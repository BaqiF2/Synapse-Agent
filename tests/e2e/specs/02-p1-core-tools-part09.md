# P1 核心工具能力 E2E BDD（part09）

## 范围
- BashRouter 指令分类边界
- `task:*` 依赖校验与取消传播
- BashSession 自定义 shell 启动参数
- MCP 扩展命令的参数映射与输出格式化

## Feature: Router 分类边界

### Scenario: `TodoWrite` 与 `todowrite` 应被区分为不同命令类型
**Given** 输入命令分别为 `TodoWrite {...}` 与 `todowrite {...}`  
**When** 调用 `identifyCommandType`  
**Then** `TodoWrite` 应识别为 Agent Shell Command  
**And** `todowrite` 应回落为 Native Shell Command

### Scenario: 未知双段 `skill:<x>` 命令应归类为 Agent Shell 以统一报错
**Given** 输入 `skill:unknown` 或 `skill:search`  
**When** 进行命令分类  
**Then** 应归类为 Agent Shell Command  
**And** 由 skill handler 返回统一未知命令错误

### Scenario: `restart=true` 路由时应先重启会话再执行命令
**Given** 调用 `router.route('echo hello', true)`  
**When** 路由执行命令  
**Then** `session.restart()` 应先被调用  
**And** 后续命令执行结果应正常返回

## Feature: Task 命令校验与中断

### Scenario: `task:*` 缺少必填参数时应在执行前返回参数错误
**Given** 执行 `task:general --prompt "hi"`（缺少 description）  
**When** Task handler 解析参数  
**Then** 返回应为 `exitCode=1`  
**And** 错误信息应包含 `Invalid parameters`

### Scenario: `task:*` 参数合法时应触发 SubAgent 执行
**Given** 执行 `task:general --prompt "hi" --description "Test"`  
**When** 参数校验通过  
**Then** SubAgentManager.execute 应被调用  
**And** stdout 应返回子代理结果文本

### Scenario: 调用 `cancel()` 时应中断任务并返回 130
**Given** 正在执行的 task 命令支持 AbortSignal 取消  
**When** 调用返回 Promise 的 `cancel()`  
**Then** SubAgent 执行信号应进入 aborted 状态  
**And** 命令结果应返回 `exitCode=130` 与 interrupted 提示

## Feature: BashSession 自定义 shell

### Scenario: 未配置 `shellCommand` 时默认使用 `/bin/bash`
**Given** 使用默认参数创建 BashSession  
**When** 读取 `session.shellCommand`  
**Then** 值应为 `/bin/bash`  
**And** 启动流程应基于该默认 shell

### Scenario: 自定义 `shellCommand` 应拆分为 `spawn(cmd,args)` 并追加无配置参数
**Given** `shellCommand='sandbox-exec -f /tmp/test.sb /bin/bash'`  
**When** BashSession 初始化进程  
**Then** spawn 参数应包含 `--norc --noprofile`  
**And** 命令与参数拆分顺序应保持稳定

### Scenario: 自定义 shell 下执行结果标记解析应保持可用
**Given** BashSession 在自定义 shell 中执行 `echo hello`  
**When** 读取 execute 返回值  
**Then** 应正确解析退出码与输出文本  
**And** 不应因外层 wrapper 破坏结束标记检测

## Feature: MCP 扩展命令映射

### Scenario: MCP 位置参数应按 schema 转为 integer/boolean
**Given** 工具 schema required 顺序为 `count(integer), active(boolean)`  
**When** 执行 `mcp:demo:echo "4" true`  
**Then** 调用参数应映射为 `{ count: 4, active: true }`  
**And** 不应保留字符串类型

### Scenario: MCP 工具混合文本与对象结果时应格式化为可读输出
**Given** MCP 返回内容同时包含 `text` 与结构化对象块  
**When** Router 组装 stdout  
**Then** 文本内容应直接展示  
**And** 对象内容应以 JSON 字符串形式追加输出

## 备注
- 本分片聚焦“路由与执行器边界契约”，用于约束模型高频命令误用时的系统行为。  
- 文件行数需保持小于等于 1000；后续超限请创建 `02-p1-core-tools-part10.md`。
