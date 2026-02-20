# P1 核心工具能力 E2E BDD（part05）

## 范围
- `task:general` 子代理中的嵌套 task 防递归
- Bash 工具误用时的自修复提示
- 路由层取消传播与依赖缺失兜底
- 原生 Shell 写文件语法兼容性

## Feature: `task:general` 防递归保障

### Scenario: 子代理内出现 `task:*` 指令时应阻断递归且主任务继续收敛
**Given** `task:general` 子代理第一轮产出 `Bash(command="task:skill:search ...")`  
**When** 主代理执行该工具调用  
**Then** 嵌套 `task:*` 调用应被阻断  
**And** 主任务仍应返回成功收尾文本而非无限递归

### Scenario: 嵌套 task 被阻断后 LLM 调用次数应保持可控
**Given** 用可计数 mock LLM 驱动 `task:general` 执行  
**When** 子代理尝试触发嵌套 task  
**Then** 总调用次数应固定在预期上限（如 2 次）  
**And** 不应出现额外调用导致递归膨胀

### Scenario: 防递归命中时输出应包含可诊断语义
**Given** 发生 `task:general` 内嵌套 task 命中  
**When** 本轮任务结束  
**Then** 输出应体现“未执行嵌套 task，主任务已完成”的语义  
**And** `isError` 不应被误标记为 `true`

## Feature: Bash 工具误用自修复

### Scenario: 直接输入 `Bash` 工具名时应返回修复示例
**Given** 用户将 `command` 误写为 `Bash`  
**When** 调用 Bash 工具  
**Then** 返回应标记为 `invalid_usage`  
**And** 提示中应包含正确示例 `Bash(command="...")`

### Scenario: 命令字符串写成 `Bash(command="...")` 时应提示去包裹
**Given** 用户将命令字符串误写为 `Bash(command="ls -la")`  
**When** 调用 Bash 工具  
**Then** 返回应说明“不要在 command 内再包裹 Bash(...)”  
**And** 失败类别应为 `invalid_usage`

### Scenario: `read` 用法错误时应提供 `read --help` 自修复指引
**Given** `read` 执行返回 usage 错误  
**When** Bash 工具组装失败信息  
**Then** 输出应包含 `Bash(command="read --help")`  
**And** 指导模型先学习用法后重试

### Scenario: 非零退出码应输出 stderr 并附带通用帮助建议
**Given** 命令执行得到 `exitCode != 0` 且含 stderr  
**When** Bash 工具返回错误  
**Then** 输出应包含 `[stderr]` 与原始错误文本  
**And** message 中应提供 `--help` 或同等修复建议

## Feature: 路由层取消传播与依赖兜底

### Scenario: `restart=true` 的异步路由取消应传递到内部任务 promise
**Given** `route(command, true)` 触发重启并返回可取消 promise  
**When** 调用外层 promise 的 `cancel()`  
**Then** 内部任务 promise 的 `cancel()` 也应被调用  
**And** 不应丢失取消信号

### Scenario: Task 依赖未注入时应返回统一依赖错误
**Given** Router 未注入 `subAgentExecutorFactory`
**When** 执行 `task:general --prompt ... --description ...`
**Then** 退出码应为 `1`
**And** stderr 应包含 `Task commands require SubAgent executor`

## Feature: 原生 Shell 写文件语法兼容

### Scenario: `echo ... > file` 应被视为 native 命令并正常执行
**Given** Router 已就绪  
**When** 执行 `echo "hello" > ./tmp.txt`  
**Then** 应路由到 native shell 会话执行  
**And** 返回 `exitCode=0`

### Scenario: heredoc 写文件语法应保持可执行
**Given** Router 已就绪  
**When** 执行 `cat <<'EOF' > ./tmp.txt` 多行 heredoc 命令  
**Then** 命令文本应原样传递给 native shell  
**And** 返回应为成功

### Scenario: `sed -i` 原地编辑语法不应被误拦截
**Given** Router 已就绪  
**When** 执行 `sed -i "s/a/b/g" ./tmp.txt`  
**Then** 应作为 native shell 命令执行  
**And** 不应误判为 Agent Shell 内建命令

### Scenario: `bash` 前缀包装写入命令时应去前缀后执行
**Given** 用户输入 `bash echo "hello" > ./tmp.txt`  
**When** Router 处理命令  
**Then** 实际执行命令应为去除前缀后的 `echo "hello" > ./tmp.txt`  
**And** 返回 `exitCode=0`

## 备注
- 本分片聚焦“模型常见误用 + task 防递归 + native 写文件命令兼容”三类高频真实路径。  
- 文件行数需保持小于等于 1000；后续超限请创建 `02-p1-core-tools-part06.md`。
