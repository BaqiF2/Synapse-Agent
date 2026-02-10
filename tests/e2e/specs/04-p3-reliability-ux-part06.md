# P3 稳定性与体验保障 E2E BDD（part06）

## 范围
- Session usage 累积、截断与重置一致性
- Cost 展示在有/无定价下的分支行为
- 数值格式化与缓存命中率展示稳定性
- SettingsManager 默认化、校验与单例行为

## Feature: Session usage 累积与重置

### Scenario: 单轮 usage 累积应同步更新 totals 与 rounds
**Given** 初始 usage 为空结构  
**When** 调用一次 `accumulateUsage`  
**Then** `totalInputOther/totalOutput/totalCache*` 应按本轮增加  
**And** `rounds` 长度应增加 1

### Scenario: 多轮 usage 累积应保持 totals 为全量和
**Given** 连续调用多次 `accumulateUsage`  
**When** 读取最终 usage  
**Then** totals 应等于全部轮次求和  
**And** 不应只保留最近一轮

### Scenario: 超过 `MAX_ROUNDS_KEPT` 时 rounds 截断但 totals 不丢失
**Given** 连续累积轮次数量超过 `SYNAPSE_MAX_ROUNDS_KEPT`  
**When** 读取 usage  
**Then** `rounds` 仅保留最近 N 轮  
**And** totals 仍应反映完整历史累计

### Scenario: `resetSessionUsage` 应重置计数但保留 model
**Given** usage 已有累计值且 model 已设置  
**When** 执行 `resetSessionUsage`  
**Then** 各 totals 与 rounds 应归零/清空  
**And** model 字段应保持不变

## Feature: Cost 计算与展示分支

### Scenario: 有定价配置时应累积 totalCost
**Given** 当前 model 在 pricing 配置中可匹配  
**When** 执行 `accumulateUsage`  
**Then** `totalCost` 应按 token 计价增长  
**And** `formatCostOutput` 应输出美元金额

### Scenario: 无定价配置时应维持 `totalCost=null`
**Given** 当前 model 未配置 pricing  
**When** 执行 `accumulateUsage`  
**Then** `totalCost` 应保持 `null`  
**And** 不应错误显示为具体金额

### Scenario: 空会话即使无定价也应显示 `$0.00`
**Given** usage 为初始空会话状态  
**When** 调用 `formatCostOutput`  
**Then** Cost 字段应显示 `$0.00`  
**And** 不应显示 `N/A`

### Scenario: 非空且无定价会话应显示 `Cost: N/A`
**Given** usage 非空但 model 无定价  
**When** 调用 `formatCostOutput`  
**Then** Cost 字段应显示 `N/A`  
**And** token/cache 统计仍应正常显示

## Feature: 数值格式化与命中率稳定性

### Scenario: 大数字输出应使用千分位分隔
**Given** usage 包含较大的 token/cache 数值  
**When** 调用 `formatCostOutput`  
**Then** 输出中的数字应使用 `en-US` 千分位格式  
**And** 不应出现难读的长整数字符串

### Scenario: 缓存命中率应按输入总量稳定计算
**Given** 有 `inputOther/cacheRead/cacheCreation` 三类输入  
**When** 生成成本摘要  
**Then** 命中率应等于 `cacheRead / totalInput` 的百分比  
**And** `totalInput=0` 时命中率应稳定显示为 `0%`

## Feature: SettingsManager 容错与单例

### Scenario: 配置文件缺失时 `get()` 应自动创建默认配置
**Given** `settings.json` 尚不存在  
**When** 调用 `SettingsManager.get()`  
**Then** 应返回 `DEFAULT_SETTINGS`  
**And** 文件系统应生成新的 `settings.json`

### Scenario: 配置 JSON 可解析但 schema 非法时应抛 `Invalid settings file`
**Given** `settings.json` 存在但字段结构不符合 schema  
**When** 调用 `get()`  
**Then** 应抛出 `Invalid settings file`  
**And** 不应返回半合法配置对象

### Scenario: `set` 更新嵌套键时应保留其它配置项
**Given** 已存在完整 settings 配置  
**When** 执行 `set('skillEnhance.autoEnhance', true)`  
**Then** 目标键应更新  
**And** 其它无关配置值应保持不变

### Scenario: `getInstance()` 应返回同一默认实例，`resetInstance()` 后重建
**Given** 多次调用 `SettingsManager.getInstance()`  
**When** 未执行 `resetInstance()`  
**Then** 返回对象应为同一实例  
**And** 调用 `resetInstance()` 后下一次 `getInstance()` 应返回新实例

## 备注
- 本分片聚焦“统计展示可信度 + 配置管理容错”两条稳定性主线。  
- 文件行数需保持小于等于 1000；后续超限请创建 `04-p3-reliability-ux-part07.md`。
