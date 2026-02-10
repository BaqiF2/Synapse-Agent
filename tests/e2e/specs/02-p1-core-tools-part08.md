# P1 核心工具能力 E2E BDD（part08）

## 范围
- Toolset 错误信息中的自修复提示契约
- 工具执行返回值与 `toolCallId` 绑定一致性
- Bash 包装器命令透传语义
- 文件工具边界输入的可诊断性

## Feature: Toolset 自修复提示

### Scenario: 未知工具错误应给出 `Bash(command="...")` 纠正示例
**Given** 模型发出 `ToolCall(name=UnknownTool)`  
**When** `CallableToolset.handle` 处理该调用  
**Then** 错误消息应包含 `Unknown tool`  
**And** 应提供 `Bash(command="UnknownTool <args>")` 形式的纠正示例

### Scenario: 未知工具错误应标记 `failureCategory=command_not_found`
**Given** 工具名无法在 Toolset 中匹配  
**When** 执行工具分发  
**Then** 返回值应为 `isError=true`  
**And** `extras.failureCategory` 应为 `command_not_found`

### Scenario: 参数 JSON 解析失败应包含 `toolName` 与 `parseError`
**Given** `arguments` 为损坏 JSON 字符串  
**When** Toolset 返回参数错误  
**Then** `extras.toolName` 应等于原工具名  
**And** `extras.parseError` 应包含底层解析失败信息

### Scenario: 成功与失败返回都必须保持原始 `toolCallId`
**Given** 分别构造一次成功调用与一次失败调用  
**When** 读取两次 `handle()` 结果  
**Then** 两次返回中的 `toolCallId` 都应等于各自请求 id  
**And** 不应因错误分支丢失关联 id

## Feature: Bash 包装器透传

### Scenario: `bash <command>` 应去掉前缀后透传给会话执行器
**Given** 输入命令 `bash echo hi`  
**When** `BashWrapperHandler.execute` 执行  
**Then** 底层 session.execute 应收到 `echo hi`  
**And** stdout 应返回该实际命令执行输出

### Scenario: `bash` 无参数时应返回 Usage 错误
**Given** 输入命令仅为 `bash`  
**When** 解析包装器参数  
**Then** 返回应为非零退出码  
**And** 错误文本应包含 `Usage: bash <command>`

### Scenario: `bash echo -h` 不应被识别为帮助模式
**Given** 输入命令 `bash echo -h`  
**When** 执行帮助判定  
**Then** 应按普通命令执行  
**And** 不应直接返回帮助文档

## Feature: 文件工具边界可诊断性

### Scenario: `read` 缺失文件时错误应包含目标路径
**Given** 执行 `read /path/not-exists.txt`  
**When** 命令失败返回  
**Then** stderr 应包含缺失路径  
**And** 调用方可据此直接定位文件问题

### Scenario: `write` 目标为目录时应拒绝并返回明确原因
**Given** `write` 的目标路径实际是目录  
**When** 执行写入  
**Then** 返回应为失败状态  
**And** 错误文案应明确目标不是可写文件

### Scenario: `read` 对大偏移量应稳定返回空窗口而非异常
**Given** 文件总行数小于请求 `--offset`  
**When** 执行 `read <file> --offset <very-large>`  
**Then** 返回应为成功且输出为空  
**And** 不应抛出越界异常

### Scenario: `edit --all` 应对普通文本执行字面量替换
**Given** 旧字符串中包含点号等正则敏感字符  
**When** 执行 `edit ... --all`  
**Then** 匹配应按纯文本而非正则解释  
**And** 所有字面量匹配项应被替换

## 备注
- 本分片聚焦“工具失败后是否可自修复”，确保模型在下一轮能拿到足够明确的纠错信号。  
- 文件行数需保持小于等于 1000；后续超限请创建 `02-p1-core-tools-part09.md`。
