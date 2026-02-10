# P2 扩展与集成能力 E2E BDD（part08）

## 范围
- SkillIndexer 扫描、重建与增量更新行为
- SkillGenerator 创建/更新技能流程
- SkillManager 导入选项（`--continue/--merge`）执行路径
- 远程导入错误透传与删除行为

## Feature: SkillIndexer 索引生成

### Scenario: 扫描应跳过 `index.json` 与隐藏目录
**Given** skills 目录存在 `index.json`、隐藏目录与普通技能目录  
**When** 执行 `SkillIndexer.scan()`  
**Then** 索引结果应只包含合法技能目录  
**And** 不应把隐藏目录误计入 `totalSkills`

### Scenario: 扫描结果应按技能名升序稳定排序
**Given** skills 目录中存在乱序命名技能目录  
**When** 执行索引扫描  
**Then** `skills[]` 应按 `name` 升序排序  
**And** 连续扫描结果顺序应保持稳定

### Scenario: 缺失 `SKILL.md` 的目录也应作为条目保留并标记
**Given** 某技能目录存在但缺少 `SKILL.md`  
**When** 执行扫描  
**Then** 该技能条目应存在  
**And** `hasSkillMd` 应为 `false`

### Scenario: `scripts/` 中受支持扩展脚本应映射为 `skill:<name>:<tool>`
**Given** 技能目录下 `scripts/hello.ts` 存在  
**When** 扫描该技能  
**Then** 条目 `tools` 应包含 `skill:<skill-name>:hello`  
**And** `scriptCount` 应与受支持脚本数一致

### Scenario: 无现有索引时 `updateSkill` 应触发全量重建
**Given** `index.json` 不存在或不可读  
**When** 调用 `updateSkill(<name>)`  
**Then** 应回退执行 `rebuild()`  
**And** 结果索引文件应被重新写入

## Feature: SkillGenerator 创建与更新

### Scenario: `createSkill` 成功后应创建技能目录与 `SKILL.md`
**Given** 提供完整 `SkillSpec` 且目标技能不存在  
**When** 调用 `createSkill(spec)`  
**Then** 返回 `success=true`  
**And** `<skillsDir>/<name>/SKILL.md` 应存在

### Scenario: 重复创建同名技能应失败且不得覆盖原文件
**Given** 目标技能目录已存在  
**When** 再次调用 `createSkill`  
**Then** 返回应为失败  
**And** 原有 `SKILL.md` 内容应保持不变

### Scenario: `createSkill` 包含 `.sh` 脚本时应设置可执行权限
**Given** `SkillSpec.scripts` 包含 shell 脚本  
**When** 创建技能成功  
**Then** 脚本文件应被写入 `scripts/`  
**And** 文件权限应包含可执行位

### Scenario: `updateSkill` 应合并局部字段并保留技能名称
**Given** 已存在技能 `update-test`  
**When** 调用 `updateSkill('update-test', { description, executionSteps })`  
**Then** 更新后 `SKILL.md` 应包含新描述与新步骤  
**And** 技能名称字段不应被重命名

### Scenario: 更新不存在技能应返回明确 `not found` 错误
**Given** 目标技能不存在  
**When** 调用 `updateSkill(<missing>, ...)`  
**Then** 返回应为失败状态  
**And** 错误信息应包含 `not found`

## Feature: SkillManager 导入选项

### Scenario: `--continue` 命中时应跳过相似检测直接导入
**Given** 导入候选技能名包含在 `continueSkills` 列表  
**When** 执行导入流程  
**Then** `merger.findSimilar` 不应被调用  
**And** 该技能应直接进入 imported 结果

### Scenario: `--merge` 命中时应调用 `merger.merge(source,target)`
**Given** 导入参数包含 `mergeInto: [{source,target}]`  
**When** 执行导入  
**Then** 应调用一次 `merger.merge(<sourcePath>, <target>)`  
**And** imported 列表应记录 `source → target` 标识

### Scenario: 空导入目录应返回全空结构结果
**Given** 导入源目录存在但不含任何技能子目录  
**When** 调用 `skill:import <empty-dir>`  
**Then** `imported/skipped/conflicts/similar` 应全部为空数组  
**And** 流程不应抛异常

## Feature: 远程导入与删除

### Scenario: 远程仓库不存在时应透传 git 原始错误
**Given** 远程 URL 指向不存在仓库  
**When** 执行 `skill:import <url>`  
**Then** 应返回包含 `repository not found` 的错误信息  
**And** 不应改写为无法定位根因的泛化报错

### Scenario: 删除不存在技能应返回明确错误而非静默成功
**Given** 本地不存在目标技能目录  
**When** 执行 `skill:delete <missing-skill>`  
**Then** 命令应失败  
**And** 错误信息应包含 `Skill <name> not found`

## 备注
- 本分片聚焦“技能资产生命周期操作”（索引、创建、更新、导入、删除）的端到端一致性。  
- 文件行数需保持小于等于 1000；后续超限请创建 `03-p2-integration-part09.md`。
