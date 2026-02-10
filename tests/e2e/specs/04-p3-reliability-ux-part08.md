# P3 稳定性与体验保障 E2E BDD（part08）

## 范围
- sandbox 配置写入幂等与变量展开边界
- sandbox 合并后校验失败的兜底行为
- settings schema 的环境变量默认化边界
- pricing 正常加载与命中分支

## Feature: Sandbox 配置幂等与边界

### Scenario: `addPermanentWhitelist` 重复添加同一路径时不应产生重复项
**Given** 已存在 `sandbox.json` 且 whitelist 已包含 `~/.ssh`  
**When** 再次调用 `addPermanentWhitelist('~/.ssh')`  
**Then** whitelist 中该路径应仅出现一次  
**And** 配置文件应保持可解析

### Scenario: `buildPolicy` 中未定义环境变量应保持原 token 不展开
**Given** policy 路径包含 `$UNSET_VAR/data` 且环境中不存在该变量  
**When** 调用 `buildPolicy`  
**Then** 输出路径应保留 `$UNSET_VAR` 字样  
**And** 不应错误替换为空字符串导致路径畸形

### Scenario: 合并后配置若违反 schema 应回退默认配置
**Given** 运行时 patch 导致 merged config 与 schema 不兼容  
**When** 调用 `loadSandboxConfig`  
**Then** 应返回默认 sandbox 配置  
**And** 日志中应包含 merged config invalid 的告警

### Scenario: `validateSandboxConfig` 对默认配置应返回 success
**Given** 使用 `DEFAULT_SANDBOX_CONFIG` 作为输入  
**When** 调用 `validateSandboxConfig`  
**Then** 返回应为 `success=true`  
**And** 不应产生 issue 列表

## Feature: Settings Schema 默认化边界

### Scenario: `maxEnhanceContextChars` 默认值应受环境变量覆盖
**Given** 设置 `SYNAPSE_MAX_ENHANCE_CONTEXT_CHARS=<N>`  
**When** 加载 `DEFAULT_SETTINGS` 并执行 schema 验证  
**Then** `skillEnhance.maxEnhanceContextChars` 应等于 `<N>`  
**And** 该值应在后续增强决策中可见

### Scenario: 未设置增强上下文环境变量时应回退内置默认值
**Given** 未设置 `SYNAPSE_MAX_ENHANCE_CONTEXT_CHARS`  
**When** 读取默认设置  
**Then** `maxEnhanceContextChars` 应回退到内置默认  
**And** 不应出现 `undefined` 或 `NaN`

### Scenario: llm 可选项缺失时应自动补齐稳定默认
**Given** settings 仅提供 `env.ANTHROPIC_API_KEY`  
**When** 执行 schema 解析  
**Then** 应补齐默认 `ANTHROPIC_BASE_URL` 与默认模型  
**And** 解析结果应保持成功

## Feature: Pricing 正常分支

### Scenario: 有效 `pricing.json` 应被完整加载
**Given** `pricing.json` 包含合法模型单价配置  
**When** 调用 `loadPricing`  
**Then** 返回值应为非空对象  
**And** 模型价格字段应与文件内容一致

### Scenario: `getPricing` 命中模型时应返回对应价格对象
**Given** pricing map 中存在目标模型 key  
**When** 调用 `getPricing(model, pricing)`  
**Then** 返回值应为该模型对应价格对象  
**And** 字段应包含 input/output/cache 三类单价

### Scenario: `loadPricing` 类型不匹配时应降级 `null` 而非抛出
**Given** `pricing.json` 字段类型不满足 schema（如单价为字符串）  
**When** 调用 `loadPricing`  
**Then** 返回值应为 `null`  
**And** 系统应继续以 no-pricing 模式运行

### Scenario: `calculateCost` 在零 token 输入下应返回 0
**Given** usage 的四类 token 值均为 0  
**When** 调用 `calculateCost`  
**Then** 结果应为 `0`  
**And** 不应出现负值或浮点异常噪声

## 备注
- 本分片聚焦“默认配置与异常配置并存时”的稳定输出，确保用户环境差异不会导致不可恢复故障。  
- 文件行数需保持小于等于 1000；后续超限请创建 `04-p3-reliability-ux-part09.md`。
