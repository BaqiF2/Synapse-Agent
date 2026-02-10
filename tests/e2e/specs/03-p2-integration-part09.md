# P2 扩展与集成能力 E2E BDD（part09）

## 范围
- SubAgentManager 执行回调与并发隔离
- Skill 子代理配置（search/enhance）权限边界
- Skill 文档解析默认值与工具依赖提取
- Skill 索引增量维护操作

## Feature: SubAgentManager 集成行为

### Scenario: 子代理完成后应触发 `onComplete` 并携带执行摘要
**Given** 注册 `onComplete` 回调并执行一次子代理任务  
**When** 子代理返回成功结果  
**Then** 回调应收到 `success=true` 的完成事件  
**And** 事件中应包含 `duration/toolCount` 等摘要字段

### Scenario: 子代理执行 usage 应通过 `onUsage` 回传到上层
**Given** 注册 `onUsage` 回调  
**When** 子代理完成一轮模型调用  
**Then** `onUsage` 应收到 usage 与 model  
**And** usage 数值应与本轮实际调用一致

### Scenario: 并行子代理任务应隔离 Bash 执行上下文
**Given** 同时触发两个子代理任务（alpha 与 beta）  
**When** 两任务并行执行并各自产生 Bash 输出  
**Then** alpha 结果中不应混入 beta 输出  
**And** beta 结果中不应混入 alpha 输出

### Scenario: 子代理收到中断信号时应抛 AbortError 并上报失败完成事件
**Given** 子代理执行期间外部 signal 被 abort  
**When** 等待该任务完成  
**Then** 调用方应收到 `AbortError`  
**And** `onComplete` 应记录 `success=false` 与错误信息

### Scenario: skill-enhance 子代理不应注入技能搜索前置指令
**Given** 执行类型为 `skill` 且 `action=enhance`  
**When** 子代理构建 user prompt  
**Then** prompt 应保持原始增强上下文文本  
**And** 不应包含 `Skill Search Priority` 指令块

## Feature: Skill 子代理配置策略

### Scenario: `search` 模式应为单轮推理且无工具权限
**Given** 创建 skill search 配置  
**When** 读取配置项  
**Then** `maxIterations` 应为 `1`  
**And** `permissions.include/exclude` 应为空（无工具访问）

### Scenario: `enhance` 模式应允许工具但显式排除 `task:*`
**Given** 创建 skill enhance 配置  
**When** 检查权限配置  
**Then** `permissions.include` 应为 `all`  
**And** `permissions.exclude` 应包含 `task:` 前缀

### Scenario: `createSkillConfig(undefined)` 应默认返回 enhance 配置
**Given** 未提供 action 参数  
**When** 调用 `createSkillConfig()`  
**Then** 返回值应等价于 enhance 模式配置  
**And** 配置类型 `type` 应保持为 `skill`

## Feature: Skill 文档解析

### Scenario: `SKILL.md` 缺失 domain 时应默认填充 `general`
**Given** 技能文档未声明 Domain 字段  
**When** 执行文档解析  
**Then** `doc.domain` 应为 `general`  
**And** 其余可解析字段仍应被保留

### Scenario: `## Tools` 区块中的工具依赖应被提取到 `toolDependencies`
**Given** `SKILL.md` 包含 `- \`mcp:filesystem:read_file\`` 条目  
**When** 执行解析  
**Then** `toolDependencies` 应包含该 MCP 工具标识  
**And** 解析结果应可用于后续能力匹配

## Feature: Skill 索引增量维护

### Scenario: 新增技能时 `addSkill` 应更新索引并增加总数
**Given** index 初始为空且新增一个合法技能目录  
**When** 调用 `addSkill(<name>)`  
**Then** `index.skills` 应包含该技能  
**And** `totalSkills` 应同步增加

### Scenario: 删除不存在技能时 `removeSkill` 应保持幂等
**Given** 当前索引中不存在目标技能  
**When** 调用 `removeSkill(<missing>)`  
**Then** 操作不应抛异常  
**And** 索引其余条目应保持不变

### Scenario: 空技能目录执行 `rebuildIndex` 应生成空索引文件
**Given** skills 目录不含任何技能子目录  
**When** 调用 `rebuildIndex()`  
**Then** 应生成合法 `index.json`  
**And** `totalSkills/skills[]` 应分别为 `0` 与空数组

## 备注
- 本分片聚焦“子代理与技能配置协作链路”，覆盖执行回调、权限策略、文档解析与索引维护闭环。  
- 文件行数需保持小于等于 1000；后续超限请创建 `03-p2-integration-part10.md`。
