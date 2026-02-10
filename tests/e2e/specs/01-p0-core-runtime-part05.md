# P0 核心运行链路 E2E BDD（part05）

## 范围
- REPL PTY 模式下的真实用户输入链路
- 处理中断与空闲中断的交互差异
- 会话历史重写的原子性与失败回滚
- 会话上限逐出与离线数据清理
- 会话清理后的状态重置行为

## Feature: REPL PTY 真实用户输入链路

### Scenario: 首轮普通输入后仍应输出提示符并可正常退出
**Given** 使用 PTY 启动 `synapse chat` 并注入首条普通输入 `hello`  
**When** 用户随后输入 `/exit`  
**Then** 输出中应包含 `Synapse Agent` 与 `You>` 提示符  
**And** 退出时应包含 `Goodbye`

### Scenario: 连续 shell 命令应按输入顺序返回结果
**Given** 用户连续输入 `!echo first` 与 `!echo second`  
**When** REPL 逐条执行命令  
**Then** 输出顺序应先出现 `first` 再出现 `second`  
**And** 两条命令都应在同一会话内成功返回

### Scenario: shell 命令带引号参数时应保留参数文本
**Given** 用户输入 `!echo "hello-pty-test"`  
**When** REPL 执行该命令  
**Then** 输出应包含 `hello-pty-test`  
**And** 不应出现参数被截断或丢失引号语义

### Scenario: 执行 `/help` 后仍可继续后续交互
**Given** 当前会话已启动且用户先输入 `/help`  
**When** 用户继续输入其它命令并最终 `/exit`  
**Then** `/help` 输出应包含 `Common`、`/clear`、`/exit`  
**And** 会话应继续响应直到显式退出

### Scenario: 空输入不应打断会话主循环
**Given** 用户先输入空行再输入 `/exit`  
**When** REPL 处理空输入  
**Then** 应继续显示 `You>` 提示符  
**And** 会话可被后续命令正常结束

## Feature: 中断交互一致性

### Scenario: 处理中按 `Ctrl+C` 只中断当前轮次并回到提示符
**Given** 当前 `isProcessing=true` 且存在 `interruptCurrentTurn` 回调  
**When** 用户触发 `Ctrl+C`  
**Then** 应调用 `interruptCurrentTurn()` 一次  
**And** 应重置为可继续输入状态而非退出 REPL

### Scenario: 空闲时按 `Ctrl+C` 应清空当前输入而非中断任务
**Given** 当前 `isProcessing=false` 且存在 `clearCurrentInput` 回调  
**When** 用户触发 `Ctrl+C`  
**Then** 不应调用 `interruptCurrentTurn`  
**And** 应调用 `clearCurrentInput()` 并重新展示提示符

## Feature: 会话历史重写一致性

### Scenario: `rewriteHistory` 成功后应完整替换历史内容
**Given** 会话历史已存在多条 JSONL 消息  
**When** 调用 `rewriteHistory(modifiedMessages)` 成功  
**Then** 历史文件内容应与 `modifiedMessages` 完全一致  
**And** 行数应等于新消息条数

### Scenario: `rewriteHistory` 写入失败时应保持原历史不变
**Given** 会话历史文件已有内容且 `writeFile` 在重写阶段失败  
**When** 执行 `rewriteHistory`  
**Then** 应抛出包含底层原因的错误  
**And** 原历史文件内容应与失败前一致

### Scenario: `rewriteHistory` 后会话统计应同步更新
**Given** 新历史与旧历史条数不同且首条用户消息变更  
**When** `rewriteHistory` 成功  
**Then** `messageCount` 应更新为新历史条数  
**And** `title` 应基于新首条用户消息重新提取

## Feature: 会话容量与逐出清理

### Scenario: 超过最大会话数时应逐出最旧会话历史文件
**Given** 已创建达到上限的历史会话集合  
**When** 再创建一个新会话  
**Then** 最旧会话的 `*.jsonl` 文件应被删除  
**And** 会话索引只保留最新 `MAX_SESSIONS` 条记录

### Scenario: 逐出旧会话时应同步清理其 offload 目录
**Given** 最旧会话目录下存在 `offloaded` 文件  
**When** 该会话因上限策略被逐出  
**Then** 对应 `/<session-id>/offloaded` 目录应一并删除  
**And** 不应残留孤儿卸载文件

## Feature: 会话清理后的状态重置

### Scenario: `clear()` 默认应重置 usage 聚合统计
**Given** 当前会话已累计多轮 usage  
**When** 执行 `clear()`  
**Then** `totalInputOther/totalOutput/totalCache*` 应归零  
**And** `rounds` 应为空数组且 `totalCost` 归为 `null`

### Scenario: `clear()` 应移除会话卸载文件并清零计数
**Given** 会话 offload 目录已有至少一个文件  
**When** 执行 `clear()`  
**Then** `countOffloadedFiles()` 应返回 `0`  
**And** 对应 offload 目录应不存在

### Scenario: `clear()` 后基础索引信息应回到空会话状态
**Given** 会话已有标题与消息计数  
**When** 执行 `clear()` 完成  
**Then** `messageCount` 应为 `0`  
**And** `title` 应为 `undefined`

## 备注
- 本分片补充“用户真实终端交互 + 会话生命周期”路径，强调可恢复性与状态一致性。  
- 文件行数需保持小于等于 1000；后续超限请创建 `01-p0-core-runtime-part06.md`。
