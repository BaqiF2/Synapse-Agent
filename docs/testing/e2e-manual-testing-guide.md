# Synapse Agent Phase 1 E2E 手动测试指南

**版本**: v1.0
**日期**: 2026-01-25
**状态**: 可用于验收测试

---

## 目录

1. [环境准备](#1-环境准备)
2. [CLI 启动和基础命令](#2-cli-启动和基础命令)
3. [REPL 特殊命令](#3-repl-特殊命令)
4. [Base Bash 工具测试](#4-base-bash-工具测试)
5. [Agent Bash 工具测试](#5-agent-bash-工具测试)
6. [持久 Bash 会话测试](#6-持久-bash-会话测试)
7. [MCP 工具测试](#7-mcp-工具测试)
8. [技能系统测试](#8-技能系统测试)
9. [会话持久化测试](#9-会话持久化测试)
10. [性能验证](#10-性能验证)
11. [验收清单](#11-验收清单)

---

## 1. 环境准备

### 1.1 前置条件

```bash
# 检查 Bun 是否已安装
bun --version
# 预期: 显示 bun 版本号 (>= 1.0.0)

# 检查 Node.js 是否已安装 (用于部分脚本)
node --version
# 预期: 显示 node 版本号 (>= 18.0.0)
```

### 1.2 安装依赖

```bash
cd /Users/wuwenjun/WebstormProjects/Synapse-Agent
bun install
```

**验证结果**:
- [x] 命令执行成功，无错误信息

### 1.3 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，填入必要的 API 密钥
# ANTHROPIC_API_KEY=<your-api-key>
# ANTHROPIC_BASE_URL=https://api.minimaxi.chat/v1
# MODEL=minimax-2.1
```

**验证结果**:
- [x] `.env` 文件已创建
- [x] `ANTHROPIC_API_KEY` 已配置

### 1.4 创建必要目录

```bash
# 创建 Synapse 配置目录
mkdir -p ~/.synapse/bin
mkdir -p ~/.synapse/skills
mkdir -p ~/.synapse/sessions
mkdir -p ~/.synapse/logs
```

**验证结果**:
- [x] 目录创建成功

---

## 2. CLI 启动和基础命令

### 2.1 显示帮助信息

```bash
bun run src/cli/index.ts --help
```

**预期输出**:
```
Usage: synapse [options] [command]

Synapse Agent - 基于统一 Bash 抽象的 AI 智能体

Options:
  -V, --version   output the version number
  -h, --help      display help for command

Commands:
  chat            启动交互式 REPL 对话模式
  help [command]  display help for command
```

**验证结果**:
- [x] 显示帮助信息
- [x] 包含 `chat` 命令

### 2.2 显示版本号

```bash
bun run src/cli/index.ts --version
```

**预期输出**: `0.1.0`

**验证结果**:
- [x] 显示版本号

### 2.3 启动 REPL

```bash
bun run chat
```

**预期**:
- 显示欢迎信息
- 显示提示符 `You (1)>`
- 光标等待输入

**验证结果**:
- [x] REPL 正常启动
- [x] 显示提示符

---

## 3. REPL 特殊命令

> 以下测试在 REPL 中进行，先启动 REPL: `bun run chat`

### 3.1 帮助命令

```
You (1)> /help
```

**预期输出**: 显示可用的特殊命令列表

**验证结果**:
- [x] 显示帮助信息

### 3.2 列出工具

```
You (1)> /tools
```

**预期输出**: 显示所有可用的工具列表，包括:
- Base Bash 工具
- Agent Bash 工具 (read, write, edit, glob, grep, bash)
- Field Bash 工具 (mcp:*, skill:*, tools)

**验证结果**:
- [x] 显示工具列表

### 3.3 列出技能

```
You (1)> /skills
```

**预期输出**: 显示已安装的技能列表

**验证结果**:
- [x] 命令执行成功

### 3.4 清空历史

```
You (1)> /clear
```

**预期**: 对话历史被清空，提示符重置为 `You (1)>`

**验证结果**:
- [x] 历史已清空

### 3.5 直接执行 Shell 命令

```
You (1)> !pwd
```

**预期输出**: 显示当前工作目录

```
You (2)> !ls -la
```

**预期输出**: 显示当前目录文件列表

**验证结果**:
- [x] Shell 命令直接执行成功
- [x] 输出正确显示

### 3.6 退出 REPL

```
You (1)> /exit
```

**预期**: REPL 正常退出

**验证结果**:
- [x] 正常退出，无错误

---

## 4. Base Bash 工具测试

> 以下测试验证 LLM 能够通过 Bash 工具执行标准 Unix 命令

### 4.1 目录操作

在 REPL 中输入:
```
You (1)> 请列出当前目录的文件
```

**预期行为**:
1. Agent 调用 Bash 工具执行 `ls` 命令
2. 返回文件列表

**验证结果**:
- [x] Agent 调用了 Bash 工具
- [x] 返回了目录内容

### 4.2 查看文件内容

```
You (2)> 请查看 package.json 的内容
```

**预期行为**:
1. Agent 调用 Bash 工具执行 `cat package.json` 或 read 工具
2. 返回文件内容

**验证结果**:
- [x] 正确显示 package.json 内容

### 4.3 Git 操作

```
You (3)> 请查看 git 状态
```

**预期行为**:
1. Agent 调用 `git status`
2. 返回仓库状态

**验证结果**:
- [x] 显示 git 状态

---

## 5. Agent Bash 工具测试

### 5.1 read 工具测试

在 REPL 中请求 Agent 使用 read 工具:

```
You (1)> 使用 read 工具读取 README.md 文件的前 10 行
```

**预期行为**:
- Agent 执行 `read README.md --limit 10`
- 返回带行号的文件内容

**验证结果**:
- [x] read 工具正常工作
- [x] 显示行号

### 5.2 write 工具测试

```
You (2)> 使用 write 工具创建一个测试文件 /tmp/synapse-test.txt，内容为 "Hello Synapse"
```

**预期行为**:
- Agent 执行 write 命令
- 文件被创建

**验证**:
```bash
# 在另一个终端验证
cat /tmp/synapse-test.txt
# 预期: Hello Synapse
```

**验证结果**:
- [x] 文件创建成功
- [x] 内容正确

### 5.3 edit 工具测试

```
You (3)> 使用 edit 工具将 /tmp/synapse-test.txt 中的 "Hello" 替换为 "Hi"
```

**预期行为**:
- Agent 执行 edit 命令
- 文件内容被修改

**验证**:
```bash
cat /tmp/synapse-test.txt
# 预期: Hi Synapse
```

**验证结果**:
- [x] 替换成功
- [x] 内容正确

### 5.4 glob 工具测试

```
You (4)> 使用 glob 工具查找 src 目录下所有的 TypeScript 文件
```

**预期行为**:
- Agent 执行 `glob "src/**/*.ts"`
- 返回匹配的文件列表

**验证结果**:
- [x] 返回文件列表
- [x] 文件路径正确

### 5.5 grep 工具测试

```
You (5)> 使用 grep 工具在 src 目录中搜索 "BashRouter" 关键词
```

**预期行为**:
- Agent 执行 grep 命令
- 返回匹配的文件和行号

**验证结果**:
- [x] 搜索成功
- [x] 显示匹配结果

### 5.6 工具自描述 (-h)

```
You (6)> 执行 read -h 查看 read 工具的帮助信息
```

**预期输出**: 显示 read 工具的用法说明

**验证结果**:
- [x] 显示帮助信息

---

## 6. 持久 Bash 会话测试

### 6.1 环境变量持久化

```
You (1)> 请执行 export TEST_VAR=synapse_test

You (2)> 请执行 echo $TEST_VAR
```

**预期行为**:
- 第一条命令设置环境变量
- 第二条命令能获取到设置的值 `synapse_test`

**验证结果**:
- [x] 环境变量在命令之间保持

### 6.2 工作目录持久化

```
You (3)> 请执行 cd /tmp

You (4)> 请执行 pwd
```

**预期行为**:
- 第一条命令切换目录
- 第二条命令返回 `/tmp`

**验证结果**:
- [x] 工作目录在命令之间保持

### 6.3 会话重启

```
You (5)> 请重启 Bash 会话 (使用 restart: true 参数)

You (6)> 请执行 pwd
```

**预期行为**:
- 会话重启
- pwd 返回初始工作目录（项目目录），而非 /tmp

**验证结果**:
- [x] 会话重启成功
- [x] 状态被重置

---

## 7. MCP 工具测试

> 前提：需要配置 `mcp_servers.json`

### 7.1 检查 MCP 配置

```bash
# 在项目根目录检查 mcp_servers.json
cat mcp_servers.json
```

**预期**: 存在有效的 MCP 服务器配置

### 7.2 列出 MCP 工具

```
You (1)> 请使用 tools search 命令搜索可用的 mcp 工具
```

**预期行为**:
- 列出所有可用的 MCP 工具

**验证结果**:
- [x] 显示 MCP 工具列表

### 7.3 调用 MCP 工具

```
You (2)> 请调用 mcp:filesystem:read_file 工具读取 README.md 文件
```

> 注意：具体命令取决于配置的 MCP 服务器

**预期行为**:
- MCP 工具被调用
- 返回执行结果

**验证结果**:
- [x] MCP 工具调用成功

### 7.4 MCP 工具帮助

```
You (3)> 执行 mcp:filesystem:read_file -h
```

**预期输出**: 显示工具的参数说明

**验证结果**:
- [x] 显示帮助信息

---

## 8. 技能系统测试

### 8.1 准备测试技能

创建测试技能目录和文件:

```bash
# 创建技能目录
mkdir -p ~/.synapse/skills/test-skill/scripts

# 创建 SKILL.md
cat > ~/.synapse/skills/test-skill/SKILL.md << 'EOF'
# test-skill

**领域**: general
**描述**: 测试技能，用于验证技能系统功能
**标签**: test, demo, validation

## 使用场景
用于端到端测试技能系统是否正常工作。

## 工具依赖
- skill:test-skill:hello

## 执行流程
1. 调用 hello 脚本
2. 返回问候信息

## 示例
输入: skill:test-skill:hello World
输出: Hello, World!
EOF

# 创建测试脚本
cat > ~/.synapse/skills/test-skill/scripts/hello.sh << 'EOF'
#!/bin/bash
# @name hello
# @description 简单的问候脚本
# @param name string 要问候的名字

if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "Usage: hello <name>"
    echo "  name: 要问候的名字"
    exit 0
fi

NAME=${1:-World}
echo "Hello, $NAME!"
EOF

chmod +x ~/.synapse/skills/test-skill/scripts/hello.sh
```

### 8.2 技能加载

```
You (1)> 请读取 test-skill 的 SKILL.md 文档
```

**预期行为**:
- Agent 读取并显示技能文档

**验证结果**:
- [ ] 显示技能文档内容

### 8.3 执行技能工具

```
You (2)> 请执行 skill:test-skill:hello Synapse
```

**预期输出**: `Hello, Synapse!`

**验证结果**:
- [ ] 技能工具执行成功
- [ ] 输出正确

### 8.4 技能工具帮助

```
You (3)> 执行 skill:test-skill:hello -h
```

**预期输出**: 显示 hello 脚本的使用说明

**验证结果**:
- [ ] 显示帮助信息

---

## 9. 会话持久化测试

### 9.1 启用持久化

```bash
# 确保持久化已启用
export SYNAPSE_PERSISTENCE_ENABLED=true
bun run chat
```

### 9.2 创建会话

在 REPL 中进行一些对话:

```
You (1)> 请记住这个数字：42

You (2)> 请告诉我刚才我让你记住的数字是什么
```

**预期**: Agent 能记住并回答 42

### 9.3 查看会话列表

```
You (3)> /sessions
```

**预期输出**: 显示已保存的会话列表

**验证结果**:
- [x] 显示会话列表

### 9.4 退出并恢复

```
You (4)> /exit
```

重新启动 REPL:

```bash
bun run chat
```

```
You (1)> /sessions
```

记录会话 ID，然后:

```
You (2)> /resume <session-id>
```

**预期**: 恢复之前的对话上下文

```
You (3)> 请告诉我之前让你记住的数字
```

**预期**: Agent 能回答 42

**验证结果**:
- [x] 会话恢复成功
- [x] 上下文保持

---

## 10. 性能验证

### 10.1 首次响应时间 (TTFT)

在 REPL 中:

```
You (1)> 你好
```

**测量方法**: 从按下回车到看到第一个输出字符的时间

**目标**: P90 TTFT < 2 秒

**验证结果**:
- [x] TTFT < 2s
- 实际测量: _____ 秒

### 10.2 工具执行时间

```
You (2)> 请列出 src 目录下所有文件
```

**测量方法**: 从发送到收到完整响应的时间

**目标**: < 5 秒

**验证结果**:
- [x] 响应时间 < 5s
- 实际测量: _____ 秒

### 10.3 日志验证

```bash
# 检查日志文件
cat ~/.synapse/logs/agent.log | tail -50
```

**预期**:
- 日志文件存在
- 包含操作记录

**验证结果**:
- [x] 日志正常记录

---

## 11. 验收清单

根据 Phase 1 PRD 验证标准，完成以下清单:

### 核心功能

| 验证项 | 状态 | 备注 |
|--------|------|------|
| 用户可以通过 CLI 与 Agent 交互 | ☐ | |
| Agent 可以使用 Agent Bash 工具完成文件操作 | ☐ | |
| LLM 只看到唯一的 Bash 工具 | ☐ | |
| Bash 会话状态在命令之间保持 | ☐ | |
| 支持 `restart: true` 参数重启会话 | ☐ | |
| 所有命令支持 `-h/--help` 自描述 | ☐ | |

### 工具系统

| 验证项 | 状态 | 备注 |
|--------|------|------|
| read 工具正常工作 | ☐ | |
| write 工具正常工作 | ☐ | |
| edit 工具正常工作 | ☐ | |
| glob 工具正常工作 | ☐ | |
| grep 工具正常工作 | ☐ | |
| bash 包装器正常工作 | ☐ | |

### MCP 和技能系统

| 验证项 | 状态 | 备注 |
|--------|------|------|
| 成功转换至少 3 种不同类型的工具 | ☐ | |
| MCP 工具可以被发现和调用 | ☐ | |
| 技能搜索功能正常 | ☐ | |
| 成功执行至少 2 个自定义技能 | ☐ | |

### CLI 交互

| 验证项 | 状态 | 备注 |
|--------|------|------|
| `!` 前缀可直接执行 Shell 命令 | ☐ | |
| `/help` 显示帮助 | ☐ | |
| `/tools` 列出工具 | ☐ | |
| `/skills` 列出技能 | ☐ | |
| `/clear` 清空历史 | ☐ | |
| `/exit` 正常退出 | ☐ | |

### 性能指标

| 验证项 | 目标 | 实测 | 状态 |
|--------|------|------|------|
| P90 TTFT | < 2s | ___s | ☐ |
| 工具执行响应 | < 5s | ___s | ☐ |
| 任务成功率 | > 80% | ___% | ☐ |

---

## 清理测试环境

测试完成后，清理测试文件:

```bash
# 删除测试文件
rm -f /tmp/synapse-test.txt

# 可选：删除测试技能
rm -rf ~/.synapse/skills/test-skill
```

---

## 问题反馈

如果在测试过程中发现问题，请记录以下信息:

1. **测试步骤**: 执行的具体命令
2. **预期行为**: 应该发生什么
3. **实际行为**: 实际发生了什么
4. **错误信息**: 控制台输出的错误
5. **日志**: `~/.synapse/logs/agent.log` 相关内容

---

**文档版本**: 1.0
**最后更新**: 2026-01-25
