# P1 核心工具能力 E2E BDD（part06）

## 范围
- `TodoWrite` 严格 schema 校验与环境变量边界
- `TodoStore` 订阅通知语义
- Bash 失败提示的可修复性输出

## Feature: TodoWrite 参数与 schema 严格校验

### Scenario: 缺失 JSON 参数时返回明确用法错误
**Given** 执行命令仅为 `TodoWrite` 且不带 JSON 体  
**When** Handler 解析参数  
**Then** 应返回 `exitCode=1`  
**And** stderr 包含 `Missing JSON parameter` 与标准 `USAGE`

### Scenario: JSON 语法错误时应返回解析失败提示
**Given** 执行 `TodoWrite '{invalid}'`  
**When** 进入 JSON.parse  
**Then** 返回 `exitCode=1`  
**And** stderr 包含 `Invalid JSON format`

### Scenario: `content` 缺失时应报告 Required 字段错误
**Given** todos 项缺少 `content` 字段  
**When** 执行 schema 校验  
**Then** 返回 `exitCode=1`  
**And** 错误路径应指向 `todos.*.content`

### Scenario: `activeForm` 仅空白字符时应校验失败
**Given** todos 项 `activeForm="   "`  
**When** 执行 schema 校验  
**Then** 返回应为失败  
**And** 错误信息应明确 `activeForm` 非法

### Scenario: `status` 非枚举值时应返回候选枚举提示
**Given** todos 项 `status="done"`  
**When** 执行 schema 校验  
**Then** 返回 `exitCode=1`  
**And** 错误信息应包含 `pending/in_progress/completed`

### Scenario: TodoItem 出现多余字段时应拒绝
**Given** todos 项包含未定义字段 `extra`  
**When** 执行校验  
**Then** 返回应为失败  
**And** 错误信息应包含 `extra`

### Scenario: 根对象出现多余字段时应拒绝
**Given** 根对象包含未定义字段 `foo`  
**When** 执行校验  
**Then** 返回 `exitCode=1`  
**And** 错误路径应指向根级别额外字段

## Feature: TodoWrite 运行时边界

### Scenario: `todos=[]` 空数组应被允许并清空任务
**Given** 当前 TodoStore 中已有任务  
**When** 执行 `TodoWrite '{"todos":[]}'`  
**Then** 返回 `exitCode=0`  
**And** TodoStore 项数应变为 `0`

### Scenario: `SYNAPSE_TODO_MAX_ITEMS` 可收紧列表长度上限
**Given** 环境变量 `SYNAPSE_TODO_MAX_ITEMS=2`  
**When** 提交 3 条 todo  
**Then** 校验应失败并返回 `Too many items`  
**And** 不应更新 TodoStore

### Scenario: `SYNAPSE_TODO_MAX_ITEMS` 非法值应回退默认上限
**Given** 环境变量 `SYNAPSE_TODO_MAX_ITEMS=0`（非法）  
**When** 提交合法输入  
**Then** 校验应按默认上限执行  
**And** 合法输入应可通过

### Scenario: `SYNAPSE_TODO_MAX_CONTENT_LENGTH` 应限制文案长度
**Given** 环境变量 `SYNAPSE_TODO_MAX_CONTENT_LENGTH=5`  
**When** 提交超过长度上限的 `content`  
**Then** 返回应为失败  
**And** 错误信息应包含最大长度约束

### Scenario: 更新成功后应返回状态聚合摘要
**Given** 输入中同时含 `completed/in_progress/pending` 三类状态  
**When** TodoWrite 更新成功  
**Then** stdout 应包含三类状态的计数摘要  
**And** 计数应与输入数据一致

## Feature: TodoStore 通知语义

### Scenario: 注册 `onChange` 后应立即收到当前状态
**Given** 新建 TodoStore 并尚未更新数据  
**When** 注册监听器  
**Then** 监听器应立即收到一次当前 state 回调  
**And** 回调 state 应与 `store.get()` 一致

### Scenario: 即使传入相同列表对象，`update` 也应触发通知
**Given** 已注册监听器且再次传入同一引用的 todos 列表  
**When** 执行 `store.update(items)`  
**Then** 监听器仍应收到变更通知  
**And** `updatedAt` 应刷新

### Scenario: 取消订阅后不应再收到后续通知
**Given** 已注册监听器并获取 `unsubscribe`  
**When** 调用 `unsubscribe()` 后再次 `update`  
**Then** 该监听器不应再被调用  
**And** 不影响其它监听器

## Feature: Bash 失败提示可修复性

### Scenario: 普通命令失败时应自动注入 `--help` 提示
**Given** 命令执行失败并返回非零退出码  
**When** BashTool 组装错误消息  
**Then** message 应包含 `--help` 建议  
**And** 应包含失败命令名用于定位

### Scenario: `mcp:*` 命令失败同样应提供 `--help` 指引
**Given** 执行 `mcp:nonexistent:tool` 失败  
**When** 返回错误消息  
**Then** 提示中应包含 `--help`  
**And** 应包含原命令标识 `mcp:nonexistent:tool`

### Scenario: 成功命令输出不应包含失败提示文案
**Given** 命令执行成功（如 `echo "success"`）  
**When** BashTool 返回结果  
**Then** `isError` 应为 `false`  
**And** message 中不应包含 `Hint:` 或失败修复提示

## 备注
- 本分片聚焦“Todo 与 Bash 提示系统”两类高频工具交互，覆盖严格输入与可恢复反馈。  
- 文件行数需保持小于等于 1000；后续超限请创建 `02-p1-core-tools-part07.md`。
