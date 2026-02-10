# P3 稳定性与体验保障 E2E BDD（part05）

## 范围
- ContextCompactor 的安全边界与失败回退
- 卸载文件清理容错与引用保留策略
- `/compact` 用户交互反馈稳定性
- 会话持久化在异常路径下的一致性

## Feature: Offload 引用恢复安全边界

### Scenario: 仅 `tool` 消息中的卸载引用可被恢复
**Given** 历史中同时存在 `tool` 与 `user` 消息且都包含 `Tool result is at:` 文本  
**When** 执行压缩前的引用恢复  
**Then** 只应替换 `tool` 消息内容  
**And** 非 `tool` 消息应保持原文不变

### Scenario: 引用卸载目录外路径时应跳过恢复
**Given** `tool` 消息引用了 offload 目录之外的绝对路径  
**When** 执行内容恢复  
**Then** 应跳过该引用不读取文件  
**And** 原消息内容保持不变

### Scenario: 卸载文件缺失时应降级为占位文本
**Given** `tool` 消息引用的 offload 文件已不存在  
**When** 执行恢复流程  
**Then** 该消息应替换为 `[Content unavailable: <path>]`  
**And** 压缩流程不应因此中断

### Scenario: 保留区间中的卸载引用应继续保留文件
**Given** 末尾保留消息中仍包含 `Tool result is at: <file>` 引用  
**When** 执行 compact 清理阶段  
**Then** 该文件不应被删除  
**And** 保留区消息应继续保持路径引用形式

## Feature: 压缩重试与回退

### Scenario: 总结首次失败后应按重试策略再次尝试
**Given** 总结生成第一次调用失败且 `retryCount>=2`  
**When** 执行 compact  
**Then** 应按重试策略进行下一次调用  
**And** 后续成功时整体压缩结果应为 `success=true`

### Scenario: 重试耗尽时 compact 应回退原历史
**Given** 总结生成连续失败直至重试耗尽  
**When** 执行 compact  
**Then** 返回应为 `success=false`  
**And** `messages` 应等于原始历史且 `freedTokens=0`

### Scenario: 消息数不超过保留阈值时应直接跳过压缩
**Given** 历史消息数量 `<= preserveCount`  
**When** 执行 compact  
**Then** 不应触发 LLM 总结调用  
**And** 结果应保持原历史并返回 `freedTokens=0`

### Scenario: 未配置压缩模型时应继续使用当前模型
**Given** compact options 未设置 `model`  
**When** 执行 compact  
**Then** 不应调用 `withModel` 切换模型  
**And** 仍应正常完成摘要生成

## Feature: 卸载文件清理容错

### Scenario: 批量清理中单文件删除失败不应阻断其它文件删除
**Given** offload 目录中多个文件且其中一个删除会抛错  
**When** 执行清理  
**Then** 其余可删文件应继续删除成功  
**And** 流程仅记录告警而不抛出整体异常

### Scenario: 清理时应跳过保留引用集合中的文件
**Given** `retainedFiles` 集合包含当前会话仍被引用的文件  
**When** 执行 cleanupOffloadedFiles  
**Then** 被引用文件不应删除  
**And** 返回的 deleted 列表不应包含这些路径

## Feature: `/compact` 交互反馈稳定性

### Scenario: 压缩成功时应展示 token 变化与删除统计
**Given** `forceCompact()` 返回 `success=true` 且释放了 token  
**When** 用户执行 `/compact`  
**Then** 输出应包含 `before -> after` token 数值  
**And** 输出应包含释放量与删除文件数量

### Scenario: 压缩失败时应明确提示保持原历史
**Given** `forceCompact()` 返回 `success=false`  
**When** 用户执行 `/compact`  
**Then** 输出应包含“压缩失败，保持原历史不变”语义  
**And** 不应误报成功

### Scenario: 无需压缩时应输出 no-op 提示
**Given** `forceCompact()` 返回 `freedTokens=0` 且前后 token 相同  
**When** 用户执行 `/compact`  
**Then** 输出应包含“无需压缩”提示  
**And** 命令处理结果仍应为已处理

### Scenario: `/compact` 命令应等待异步压缩完成后再返回
**Given** `forceCompact()` 返回一个延迟 resolve 的 Promise  
**When** 用户执行 `/compact`  
**Then** 命令处理 Promise 在压缩完成前不应提前 resolve  
**And** resolve 后应输出最终压缩结果信息

## Feature: 会话异常路径一致性

### Scenario: `rewriteHistory` 写入失败后应保持旧历史内容
**Given** 会话已有历史文件且重写阶段写入失败  
**When** 调用 `rewriteHistory`  
**Then** 应抛出带原因错误  
**And** 原历史内容应保持一致不被破坏

### Scenario: `clear` 后 usage 与 offload 目录应同步归零
**Given** 会话已有 usage 统计和 offload 文件  
**When** 执行 `clear()`  
**Then** usage 聚合字段应重置到初始状态  
**And** offload 目录应被删除

### Scenario: `find` 恢复会话时应还原已持久化 usage 字段
**Given** 索引中已持久化 usage 的 totals 与 rounds  
**When** 通过 `Session.find()` 恢复该会话  
**Then** `getUsage()` 应返回与索引一致的累计值  
**And** model 字段应与索引保持一致

## 备注
- 本分片强调“失败可回退、输出可诊断、用户命令反馈一致”的稳定性保障。  
- 文件行数需保持小于等于 1000；后续超限请创建 `04-p3-reliability-ux-part06.md`。
