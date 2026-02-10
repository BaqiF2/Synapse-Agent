# P3 稳定性与体验保障 E2E BDD（part09）

## 范围
- SettingsManager 文件级持久化与故障处理
- LLM 配置读取默认化行为
- OffloadStorage 文件落盘与异常分支
- 全局 StopHookRegistry 单例一致性

## Feature: SettingsManager 持久化可靠性

### Scenario: 配置文件缺失时 `get()` 应落盘默认配置并返回默认值
**Given** `settings.json` 尚不存在  
**When** 调用 `SettingsManager.get()`  
**Then** 文件系统应创建默认配置文件  
**And** 返回值应等于 `DEFAULT_SETTINGS`

### Scenario: 配置文件 JSON 损坏时 `get()` 应抛可诊断解析错误
**Given** `settings.json` 内容为非法 JSON  
**When** 调用 `get()`  
**Then** 应抛出 `Failed to parse settings file` 类错误  
**And** 不应返回部分解析结果

### Scenario: `set` 更新后应持久化到文件且可被新实例读取
**Given** 已初始化 settings 文件  
**When** 调用 `set('skillEnhance.autoEnhance', true)`  
**Then** 文件内容应更新为 `true`  
**And** 新建 SettingsManager 读取时应保持该值

### Scenario: `setAutoEnhance(true/false)` 应正确切换并反映在 `isAutoEnhanceEnabled`
**Given** 默认自动增强状态为关闭  
**When** 先执行 `setAutoEnhance(true)` 再执行 `setAutoEnhance(false)`  
**Then** `isAutoEnhanceEnabled()` 应先返回 `true` 再返回 `false`  
**And** 状态切换应同步持久化

## Feature: LLM 配置默认化

### Scenario: `getLlmConfig` 应从 settings 读取 apiKey/baseURL/model
**Given** settings 中已写入自定义 LLM 配置  
**When** 调用 `getLlmConfig()`  
**Then** 返回对象应包含对应 `apiKey/baseURL/model`  
**And** 值应与配置文件一致

### Scenario: `getLlmConfig` 缺失 baseURL/model 时应回退默认值
**Given** settings 仅配置 `ANTHROPIC_API_KEY`  
**When** 调用 `getLlmConfig()`  
**Then** `baseURL` 应回退 `https://api.anthropic.com`  
**And** `model` 应回退默认模型

## Feature: OffloadStorage 可靠性

### Scenario: 保存纯文本内容时应生成 `.txt` 文件路径
**Given** 初始化 OffloadStorage 到会话目录  
**When** 调用 `save('plain text content')`  
**Then** 返回路径应位于 `offloaded/` 且后缀为 `.txt`  
**And** 文件内容应与输入文本一致

### Scenario: 保存 JSON 字符串时应自动使用 `.json` 扩展名
**Given** 输入内容为 JSON 字符串 `{"key":"value"}`  
**When** 调用 `save()`  
**Then** 返回路径应以 `.json` 结尾  
**And** 文件应成功落盘

### Scenario: 首次保存时应自动创建 `offloaded` 目录
**Given** 会话目录下尚无 `offloaded/` 子目录  
**When** 首次调用 `save()`  
**Then** 系统应自动创建该目录  
**And** 随后保存流程应成功完成

### Scenario: 落盘写入失败时应抛异常以便上层回退
**Given** `offloaded/` 目录不可写  
**When** 调用 `save()`  
**Then** 方法应抛出异常  
**And** 上层可基于异常触发降级处理

## Feature: StopHookRegistry 单例一致性

### Scenario: 多次导入 `stopHookRegistry` 应引用同一全局实例
**Given** 从不同模块路径导入 StopHookRegistry 单例  
**When** 比较实例引用  
**Then** 引用应严格相等  
**And** 共享注册状态应在各入口一致可见

## 备注
- 本分片聚焦“配置与存储的故障可恢复性”，保障文件损坏、权限异常等场景下的可诊断行为。  
- 文件行数需保持小于等于 1000；后续超限请创建 `04-p3-reliability-ux-part10.md`。
