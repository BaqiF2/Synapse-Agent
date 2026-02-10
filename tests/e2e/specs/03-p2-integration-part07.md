# P2 扩展与集成能力 E2E BDD（part07）

## 范围
- Skill 版本管理的序列、排序与清理策略
- 回滚前备份判定与恢复一致性
- 本地/远程导入中的部分失败与临时目录清理
- Skill 合并降级路径与 Meta Skill 安装细节

## Feature: Skill 版本管理

### Scenario: `MAX_VERSIONS` 默认值应为 20
**Given** 未设置 `SYNAPSE_SKILL_MAX_VERSIONS`  
**When** 读取 SkillManager 的版本上限配置  
**Then** 上限应为 `20`  
**And** 连续创建版本时应按该上限执行保留策略

### Scenario: `SYNAPSE_SKILL_MAX_VERSIONS` 可覆盖默认上限
**Given** 设置 `SYNAPSE_SKILL_MAX_VERSIONS=5`  
**When** 读取配置后的版本上限  
**Then** 上限应为 `5`  
**And** 超限清理应按新上限生效

### Scenario: 同一天连续 `createVersion` 序号应单调递增
**Given** 同一技能在同一天被连续创建多个版本  
**When** 读取版本列表  
**Then** 版本号应形如 `YYYY-MM-DD-001/002/003` 递增  
**And** `getVersions` 返回时应按降序排列

### Scenario: 超过上限后应 FIFO 删除最旧版本
**Given** 版本上限为 `3` 且已连续创建 4 个版本  
**When** 再次读取版本目录  
**Then** 仅应保留最近 3 个版本  
**And** 最旧版本目录应被删除

### Scenario: 计算目录哈希时应忽略 `versions/` 历史内容
**Given** 技能当前内容不变但 `versions/` 内历史文件被修改  
**When** 重新计算技能目录 hash  
**Then** hash 值应保持不变  
**And** 回滚前“内容是否变化”判断不应受历史快照噪声影响

## Feature: 回滚与备份判定

### Scenario: 回滚到目标版本后应恢复 `SKILL.md` 与 `scripts/`
**Given** 当前技能内容为新版且存在旧版本快照  
**When** 执行 `skill:rollback <name> <version>`  
**Then** 线上目录内容应恢复为目标版本  
**And** `versions/` 目录本身应保留

### Scenario: 当前内容已存在于历史版本时回滚应跳过新增备份
**Given** 当前内容与某历史版本完全一致  
**When** 执行回滚到另一个历史版本  
**Then** 回滚前不应再新增备份版本  
**And** 版本总数应保持不变

### Scenario: 当前内容为新内容时回滚前应自动备份
**Given** 当前内容不在历史版本集合中  
**When** 执行回滚  
**Then** 回滚前应先创建当前快照备份  
**And** 版本总数应增加 1

### Scenario: 回滚不存在版本时应返回明确错误
**Given** 指定版本号在 `versions/` 中不存在  
**When** 执行回滚  
**Then** 应返回 `Version <x> not found` 类错误  
**And** 当前技能目录内容不应被修改

## Feature: 导入流程与索引更新

### Scenario: 批量导入中单个技能复制失败不应影响其他技能导入
**Given** 导入源包含 `skill-a/skill-b/skill-c` 且 `skill-b` 复制失败  
**When** 执行 `skill:import`  
**Then** `skill-a/skill-c` 仍应导入成功  
**And** `skill-b` 应进入 `skipped` 或错误列表

### Scenario: 前序导入成功后遇到冲突不应回滚前序结果
**Given** 导入顺序为 `new-skill` 后 `existing-skill(conflict)`  
**When** 执行导入  
**Then** `new-skill` 应保留为已导入状态  
**And** 冲突仅影响冲突项本身

### Scenario: 导入结果含 `conflicts/similar` 时不应触发索引重建
**Given** 本次导入产生冲突或相似技能待决策  
**When** 导入结束  
**Then** `indexer.rebuild` 不应被调用  
**And** 避免未完成导入状态污染索引

### Scenario: 全部导入成功时应触发一次索引重建
**Given** 本次导入所有技能均成功  
**When** 导入流程结束  
**Then** `indexer.rebuild` 应被调用 1 次  
**And** 新技能应可被 `skill:list` 立即检索

### Scenario: 远程 URL 导入完成后应清理临时克隆目录
**Given** 使用 `skill:import <https-url>` 导入并成功  
**When** 导入流程结束  
**Then** 临时目录应被删除  
**And** 不应在系统临时目录残留仓库副本

### Scenario: 远程克隆超时或失败后也必须清理临时目录
**Given** 远程导入发生超时或 git 错误  
**When** 导入流程异常退出  
**Then** 错误应向上抛出  
**And** 临时目录仍必须被清理

### Scenario: 克隆成功但后续导入失败时仍必须清理临时目录
**Given** git clone 成功但 `importFromDirectory` 抛错  
**When** 导入流程结束  
**Then** 失败错误应被透传  
**And** 临时目录必须被删除

## Feature: 相似检测/合并降级与 Meta Skill

### Scenario: 无 `SubAgentManager` 时 `findSimilar` 应降级为空结果
**Given** SkillMerger 未注入 `SubAgentManager`  
**When** 触发相似检测  
**Then** 结果应为 `[]`  
**And** 不应抛出异常中断导入流程

### Scenario: 相似检测子代理超时或返回非法 JSON 时应降级为空结果
**Given** `findSimilar` 调用子代理抛错或返回非 JSON 文本  
**When** SkillMerger 处理结果  
**Then** 应降级为空相似列表  
**And** 上层导入流程应可继续

### Scenario: 降级模式下调用 `merge` 应返回明确错误
**Given** SkillMerger 未注入 `SubAgentManager`  
**When** 执行 `--merge=<source>:<target>`  
**Then** 应返回“需要 SubAgentManager”类明确错误  
**And** 不应执行任何目标技能改写

### Scenario: Meta Skill 安装应保留脚本可执行权限
**Given** 资源目录中 `scripts/*.py` 具有可执行权限  
**When** 执行 Meta Skill 安装  
**Then** 目标技能目录中脚本应保留可执行位  
**And** 后续 `skill:<name>:<tool>` 可直接执行脚本

## 备注
- 本分片聚焦“导入与版本系统在复杂路径下的可恢复性”，覆盖失败后清理、降级与索引一致性。  
- 文件行数需保持小于等于 1000；后续超限请创建 `03-p2-integration-part08.md`。
