# P3 稳定性与体验保障 E2E BDD（part07）

## 范围
- `sandbox-config` 默认化、合并与安全强制规则
- `settings-schema` 默认值与校验边界
- `pricing` 读取容错与计费公式稳定性

## Feature: Sandbox 配置加载与安全规则

### Scenario: 无用户配置文件时应加载默认安全配置
**Given** `sandbox.json` 不存在  
**When** 调用 `loadSandboxConfig`  
**Then** 结果应启用默认 provider 与默认黑名单  
**And** `policy.network.allowNetwork` 应为 `false`

### Scenario: 用户黑名单应在默认黑名单基础上追加且不可移除默认项
**Given** 用户配置仅声明自定义 blacklist（如 `~/.kube`）  
**When** 合并 sandbox 配置  
**Then** 结果应同时保留默认 `~/.ssh/~/.aws` 规则  
**And** 追加项也应存在于 blacklist

### Scenario: 即使用户显式开启网络，最终策略也必须强制禁网
**Given** 用户配置 `allowNetwork=true`  
**When** 调用 `loadSandboxConfig`  
**Then** 最终 `allowNetwork` 仍应为 `false`  
**And** 不应出现可绕过的网络放开分支

### Scenario: 配置文件 JSON 损坏时应降级默认并记录告警
**Given** `sandbox.json` 内容为非法 JSON  
**When** 读取 sandbox 配置  
**Then** 应回退为 `DEFAULT_SANDBOX_CONFIG`  
**And** 日志层应产出 warning 便于排查

### Scenario: 应支持默认+文件+用户+运行时配置的叠加合并
**Given** 文件配置、用户配置、运行时配置均有重叠字段  
**When** 执行配置加载  
**Then** 运行时配置应覆盖优先级最高字段  
**And** whitelist/providerOptions 应保留多层来源的并集结果

### Scenario: `buildPolicy` 应展开 `~` 与 `$VAR` 路径变量
**Given** policy 中出现 `~/.ssh` 与 `$WORKSPACE/data` 形式路径  
**When** 在给定环境变量下调用 `buildPolicy`  
**Then** 输出路径应被展开为绝对路径  
**And** 展开后仍应保持 `allowNetwork=false`

### Scenario: `validateSandboxConfig` 缺失 provider 时返回结构化错误
**Given** 配置缺少 `provider` 字段  
**When** 调用 `validateSandboxConfig`  
**Then** `success` 应为 `false`  
**And** `error.issues` 应包含指向 `provider` 的路径信息

### Scenario: `addPermanentWhitelist` 应创建/更新 `sandbox.json` 并追加白名单
**Given** 当前不存在 `sandbox.json`  
**When** 调用 `addPermanentWhitelist('~/.ssh')`  
**Then** 应落盘生成配置文件  
**And** 文件内 whitelist 应包含该路径

## Feature: Settings Schema 兼容与校验

### Scenario: `DEFAULT_SETTINGS` 应始终可通过 schema 校验
**Given** 使用代码内置 `DEFAULT_SETTINGS`  
**When** 执行 `SynapseSettingsSchema.safeParse`  
**Then** 校验结果应为成功  
**And** 不应出现默认配置与 schema 漂移

### Scenario: 仅提供最小 env 时应补齐 llm 与增强配置默认值
**Given** 输入仅包含 `env.ANTHROPIC_API_KEY`  
**When** 执行 schema 解析  
**Then** 应自动填充 `ANTHROPIC_BASE_URL` 与默认 `model`  
**And** `skillEnhance.autoEnhance` 应回退为默认值

### Scenario: 空字符串 API Key 在 schema 层应允许通过
**Given** `ANTHROPIC_API_KEY` 为空字符串  
**When** 执行 schema 解析  
**Then** 结果应为成功  
**And** provider 层再负责鉴权可用性校验

### Scenario: 缺失 `env` 根块时应校验失败
**Given** settings 输入不含 `env` 字段  
**When** 执行 schema 解析  
**Then** 校验应失败  
**And** 错误应指向缺失的必填块

### Scenario: `skillEnhance.autoEnhance` 类型非法时应拒绝
**Given** `autoEnhance` 被写为字符串值  
**When** 执行 schema 解析  
**Then** 结果应失败  
**And** 不应静默转换为布尔值

## Feature: Pricing 配置容错与计费

### Scenario: pricing 文件不存在时应返回 `null`
**Given** 指定 `pricing.json` 路径不存在  
**When** 调用 `loadPricing`  
**Then** 返回值应为 `null`  
**And** 调用方不应因缺失文件崩溃

### Scenario: pricing JSON 非法时应返回 `null` 并记录告警
**Given** `pricing.json` 为非法 JSON  
**When** 调用 `loadPricing`  
**Then** 返回值应为 `null`  
**And** 日志应包含 warning

### Scenario: `getPricing` 未命中模型时应返回 `null`
**Given** pricing map 不包含当前模型键  
**When** 调用 `getPricing(model, pricing)`  
**Then** 返回应为 `null`  
**And** 上层成本展示应走无定价分支

### Scenario: `calculateCost` 应按输入/输出/cache 三路公式累计
**Given** 存在 inputOther/output/cacheRead/cacheCreation token 与单价  
**When** 执行 `calculateCost`  
**Then** 返回成本应等于四项分量求和  
**And** 结果精度应满足小数比较容差

## 备注
- 本分片聚焦“配置损坏、默认回退、强制安全规则”的稳定性底座，确保运行时体验可诊断且不失控。  
- 文件行数需保持小于等于 1000；后续超限请创建 `04-p3-reliability-ux-part08.md`。
