# P0 核心运行链路 E2E BDD（part06）

## 范围
- Session 消息持久化与索引一致性
- 会话标题提取与长度边界
- 会话延续与历史读取兜底
- 删除/清理流程中的资源一致回收

## Feature: Session 写入与索引一致性

### Scenario: 批量 `appendMessage` 后索引 messageCount 应准确累加
**Given** 新建会话后一次追加多条消息  
**When** 读取 `sessions.json` 中对应 session 记录  
**Then** `messageCount` 应等于追加消息总数  
**And** history JSONL 行数应与之保持一致

### Scenario: 多次 `appendMessage` 顺序写入后历史应按追加顺序保留
**Given** 同一会话连续执行多次 `appendMessage`  
**When** 重新加载该会话历史  
**Then** 消息顺序应与写入顺序一致  
**And** 不应出现乱序或覆盖

### Scenario: 并发触发索引更新时应通过队列串行化避免丢写
**Given** 同一会话在短时间内连续触发多个写操作  
**When** 所有写操作完成并读取索引  
**Then** 最终 `messageCount/usage/title` 应反映最后一次有效状态  
**And** 不应出现回退到旧值的并发冲突

## Feature: 会话标题生成规则

### Scenario: 首条用户消息应作为会话标题来源
**Given** 新会话首条写入消息角色为 `user`  
**When** `appendMessage` 完成  
**Then** `session.title` 应等于该用户消息文本  
**And** 索引中的 `title` 字段应同步更新

### Scenario: 首条非用户消息不应错误生成标题
**Given** 新会话首批仅写入 `assistant` 消息  
**When** 写入完成后读取会话信息  
**Then** `title` 应保持为空  
**And** 直到出现首条用户消息才生成标题

### Scenario: 超长标题应按上限截断并追加省略号
**Given** 首条用户消息长度超过 `TITLE_MAX_LENGTH`  
**When** 标题提取完成  
**Then** 标题长度应不超过上限  
**And** 末尾应追加 `...` 以提示截断

## Feature: 会话恢复与历史读取

### Scenario: `Session.continue()` 应返回索引中最近会话
**Given** 已按时间创建多个会话  
**When** 调用 `Session.continue()`  
**Then** 返回对象应指向索引首位会话  
**And** 返回结果不应为旧会话

### Scenario: 新会话无历史文件时 `loadHistory` 返回空数组
**Given** 会话刚创建且尚未写入任何消息  
**When** 调用 `loadHistory()`  
**Then** 返回值应为 `[]`  
**And** 调用方不应收到异常

### Scenario: `loadHistorySync` 在文件缺失时应安全返回空数组
**Given** history 文件不存在或已被清理  
**When** 调用 `loadHistorySync()`  
**Then** 返回值应为 `[]`  
**And** 不应抛出文件不存在错误

## Feature: 会话删除与清理一致性

### Scenario: `delete()` 应同时移除 history 文件与索引记录
**Given** 会话已有历史并已注册到索引  
**When** 执行 `session.delete()`  
**Then** 对应 `*.jsonl` 文件应被删除  
**And** `sessions.json` 中不应再包含该会话

### Scenario: `delete()` 应同步清理会话 offload 目录
**Given** 会话目录下存在 `offloaded` 文件  
**When** 执行删除  
**Then** `/<session-id>/` 目录应被一并移除  
**And** 不应残留离线内容文件

### Scenario: 删除流程遇到缺失文件时应容错继续
**Given** history 或 offload 文件已被外部提前删除  
**When** 执行 `delete()`  
**Then** 删除流程仍应完成索引移除  
**And** 不应因 `ENOENT` 中断

## 备注
- 本分片强调“会话写入-索引-回收”链路在真实运行中的一致性与幂等性。  
- 文件行数需保持小于等于 1000；后续超限请创建 `01-p0-core-runtime-part07.md`。
