# P2 扩展与集成能力 E2E BDD（part06）

## 范围
- ConversationReader 对 JSONL 会话的读取/截断解析
- 会话压缩文本 `compact()` 的格式化规则
- 工具调用序列与摘要统计提取
- Skill 导入提示文案的可操作性

## Feature: ConversationReader 文件读取与截断

### Scenario: 会话文件不存在时 `read` 返回空数组
**Given** 输入的会话 JSONL 路径不存在  
**When** 调用 `ConversationReader.read(filePath)`  
**Then** 返回应为 `[]`  
**And** 调用方无需处理异常

### Scenario: `readTruncated` 在 `maxChars<=0` 时直接返回空结果
**Given** 合法会话文件存在但 `maxChars=0`  
**When** 调用 `readTruncated(filePath, 0)`  
**Then** 返回应为 `[]`  
**And** 不应执行后续截断解析逻辑

### Scenario: `readTruncated` 从尾部截断后应对齐到完整行边界
**Given** 原文件长度超过 `maxChars` 且截断点位于行中间  
**When** 执行 `readTruncated`  
**Then** 结果首行应从下一个完整换行开始  
**And** 不应出现半截 JSON 行

### Scenario: JSONL 含损坏行时应跳过坏行继续解析
**Given** 文件中混合合法行与非法 JSON 行  
**When** 调用 `read` 或 `readTruncated`  
**Then** 非法行应被忽略  
**And** 合法行仍应转换为 ConversationTurn

## Feature: 内容块解析与映射

### Scenario: `content` 为字符串时应直接映射为 turn.content
**Given** 某消息 `content` 字段是纯文本字符串  
**When** 解析该行  
**Then** turn.content 应等于原文本  
**And** 不应生成 toolCalls/toolResults

### Scenario: `content` 为数组时应同时提取 text/tool_use/tool_result
**Given** 单行消息 content 数组中同时包含 `text`、`tool_use`、`tool_result` 块  
**When** 执行解析  
**Then** text 应汇总到 turn.content  
**And** tool_use/tool_result 应分别映射到 `toolCalls` 与 `toolResults`

### Scenario: 非 user/assistant 角色消息应在解析阶段过滤
**Given** JSONL 行 role 既不是 `user` 也不是 `assistant`  
**When** 解析会话文件  
**Then** 该行应被丢弃  
**And** 最终结果中不应出现未知角色 turn

## Feature: compact 文本格式化规则

### Scenario: 混合会话应按 `[User]/[Assistant]/[Tool]/[Result]` 顺序展开
**Given** turns 中包含用户文本、助手文本、工具调用与工具结果  
**When** 调用 `compact(turns)`  
**Then** 输出应保留上述标签顺序  
**And** 各块之间应使用空行分隔

### Scenario: Tool result 超过默认摘要上限时应截断加省略号
**Given** 工具结果内容长度超过 `SYNAPSE_TOOL_RESULT_SUMMARY_LIMIT` 默认值  
**When** 执行 `compact()`  
**Then** `[Result]` 内容应截断  
**And** 末尾应追加 `...`

### Scenario: 含换行的 Tool result 截断应优先保留完整行
**Given** 工具结果为多行文本且超出限制  
**When** 执行结果截断  
**Then** 应优先按行边界截断并追加省略号  
**And** 避免中间切断一行导致可读性下降

### Scenario: compact 指定 `maxChars` 时应从尾部保留最近上下文
**Given** compact 全量文本超过 `maxChars`  
**When** 调用 `compact(turns, maxChars)`  
**Then** 输出长度应不超过 `maxChars`  
**And** 语义上应偏向保留末尾最近交互

## Feature: 工具序列与摘要统计

### Scenario: `extractToolSequence` 应返回按时间顺序的工具名列表
**Given** 多轮 turn 中包含多个 toolCalls  
**When** 调用 `extractToolSequence(turns)`  
**Then** 返回数组顺序应与出现顺序一致  
**And** 不应去重导致顺序信息丢失

### Scenario: `summarize` 应统计 user/assistant/toolCalls 与 uniqueTools
**Given** 输入会话包含多角色与重复工具调用  
**When** 调用 `summarize(turns)`  
**Then** `userTurns/assistantTurns/toolCalls` 应准确  
**And** `uniqueTools` 应去重后返回

### Scenario: `summarize` token 估算应受 `SYNAPSE_CHARS_PER_TOKEN` 影响
**Given** 设置不同 `SYNAPSE_CHARS_PER_TOKEN` 配置  
**When** 对同一会话执行 `summarize`  
**Then** `estimatedTokens` 应随配置变化  
**And** 配置缺失时应回退默认值

## Feature: Skill 导入反馈可操作性

### Scenario: 导入发生冲突时应提示修改名称后重试
**Given** `skill:import` 返回命名冲突列表  
**When** Handler 格式化输出  
**Then** 输出应包含冲突 skill 名称  
**And** 给出“修改源目录名称后重新导入”的明确指引

### Scenario: 发现相似技能时应提供 `--continue` 与 `--merge` 示例
**Given** `skill:import` 返回 similar 列表  
**When** Handler 生成提示文本  
**Then** 输出应包含 `--continue=<skill>` 示例  
**And** 同时包含 `--merge=<source>:<target>` 示例

## 备注
- 本分片聚焦“技能增强输入材料的构建质量”，保障会话摘要可读、可压缩、可操作。  
- 文件行数需保持小于等于 1000；后续超限请创建 `03-p2-integration-part07.md`。
