# PRD Phase 1 End-to-End Validation

本目录包含 PRD 第一阶段所有功能的端到端验证测试。

## 目录结构

```
phase1-validation/
├── README.md              # 本文件
├── test-cases.md          # 详细测试用例文档（支持手动执行）
├── phase1-e2e.test.ts     # 自动化测试脚本
├── run-manual.sh          # 手动测试辅助脚本
└── fixtures/              # 测试数据
    ├── skills/            # 测试技能
    │   ├── text-analyzer/ # 文本分析技能
    │   └── file-utils/    # 文件工具技能
    └── mcp/
        └── mcp_servers.json  # MCP 配置
```

## 快速开始

### 1. 运行自动化测试

```bash
# 运行所有 Phase 1 E2E 测试
bun test tests/e2e/phase1-validation/

# 运行特定测试套件
bun test tests/e2e/phase1-validation/phase1-e2e.test.ts

# 运行特定测试（按名称过滤）
bun test tests/e2e/phase1-validation/ -t "Three-Layer"
bun test tests/e2e/phase1-validation/ -t "Agent Shell Command"
bun test tests/e2e/phase1-validation/ -t "Skill System"
```

### 2. 运行手动测试

```bash
# 设置测试环境
./tests/e2e/phase1-validation/run-manual.sh setup

# 运行所有手动测试
./tests/e2e/phase1-validation/run-manual.sh all

# 运行特定类型的手动测试
./tests/e2e/phase1-validation/run-manual.sh cli      # CLI 交互测试
./tests/e2e/phase1-validation/run-manual.sh skill    # 技能执行测试
./tests/e2e/phase1-validation/run-manual.sh session  # 会话持久化测试
./tests/e2e/phase1-validation/run-manual.sh workflow # 完整工作流测试

# 清理测试环境
./tests/e2e/phase1-validation/run-manual.sh teardown
```

## 测试用例分类

### 自动化测试 [AUTO]

以下测试可完全通过脚本自动执行：

| 用例 ID | 测试内容 | 命令 |
|---------|---------|------|
| TC-1.1 | LLM 只看到唯一 Bash 工具 | `bun test -t "TC-1.1"` |
| TC-1.2 | 命令路由正确性 | `bun test -t "TC-1.2"` |
| TC-1.3 | Bash 会话状态持久化 | `bun test -t "TC-1.3"` |
| TC-1.4 | Bash 会话重启 | `bun test -t "TC-1.4"` |
| TC-2.x | Agent Shell Command 工具 | `bun test -t "TC-2"` |
| TC-3.x | 工具转换系统 | `bun test -t "TC-3"` |
| TC-4.2 | 特殊命令 | `bun test -t "TC-4.2"` |
| TC-4.3 | Shell 命令执行 | `bun test -t "TC-4.3"` |
| TC-5.x | 技能系统 | `bun test -t "TC-5"` |

### 手动测试 [MANUAL]

以下测试需要用户手动执行：

| 用例 ID | 测试内容 | 辅助脚本 |
|---------|---------|---------|
| TC-4.1 | CLI 交互界面 | `./run-manual.sh cli` |
| TC-4.4 | 上下文管理 | `./run-manual.sh cli` |
| TC-5.4 | 技能执行 | `./run-manual.sh skill` |
| TC-7.1 | 会话保存和恢复 | `./run-manual.sh session` |
| TC-8.1 | 完整工作流 | `./run-manual.sh workflow` |

## 测试数据说明

### 测试技能

#### text-analyzer
- **功能**: 分析文本文件统计信息
- **脚本**: `analyze.py` - 统计行数、词数、字符数
- **用法**: `skill:text-analyzer:analyze <file>`

#### file-utils
- **功能**: 文件操作工具集
- **脚本**:
  - `count_files.sh` - 按扩展名统计文件
  - `list_large.sh` - 列出大文件
- **用法**: `skill:file-utils:count_files <dir>`

### MCP 配置

测试 MCP 配置文件包含：
- `test-local-server`: command 类型服务器
- `test-remote-server`: url 类型服务器
- `filesystem-mock`: 模拟文件系统服务器

## PRD 验证标准对照

| PRD 验证标准 | 测试用例 | 类型 |
|-------------|---------|------|
| 用户可通过 CLI 与 Agent 交互 | TC-4.1 | MANUAL |
| Agent 可使用 Agent Shell Command 工具 | TC-2.x | AUTO |
| LLM 只看到唯一 Bash 工具 | TC-1.1 | AUTO |
| Bash 会话状态保持 | TC-1.3 | AUTO |
| restart: true 重启会话 | TC-1.4 | AUTO |
| -h/--help 自描述 | TC-2.6 | AUTO |
| 转换 3 种工具类型 | TC-6.1 | AUTO |
| 执行自定义技能 | TC-5.4 | MANUAL |
| 所有命令通过 Bash 执行 | TC-1.2 | AUTO |

## 环境要求

- **运行时**: Bun >= 1.0.0
- **操作系统**: macOS / Linux
- **依赖**: 项目依赖已安装 (`bun install`)
- **API Key**: `ANTHROPIC_API_KEY` 环境变量（LLM 相关测试需要）

## 问题排查

### 测试失败

1. 确保依赖已安装：`bun install`
2. 检查 TypeScript 编译：`bun run typecheck`
3. 查看详细日志：`bun test --verbose`

### 手动测试环境问题

1. 重新设置环境：`./run-manual.sh teardown && ./run-manual.sh setup`
2. 检查技能文件权限：`ls -la ~/.synapse-test/skills/`

### LLM 测试问题

1. 确认 API Key：`echo $ANTHROPIC_API_KEY`
2. 检查网络连接

## 贡献指南

添加新测试用例时：
1. 在 `test-cases.md` 添加用例描述
2. 在 `phase1-e2e.test.ts` 添加自动化测试
3. 如需手动测试，在 `run-manual.sh` 添加辅助函数
4. 更新本 README 的用例列表
