# Phase 1 端到端测试指南

> **测试目标**: 验证 Synapse Agent Phase 1 所有核心功能是否正常工作
>
> **预计时间**: 20-30 分钟
>
> **测试日期**: ________
>
> **测试人员**: ________

---

## 📋 测试前准备

### 1. 环境检查

```bash
# 1.1 检查 Python 版本（需要 3.13+）
python --version

# 1.2 检查项目依赖
uv sync

# 1.3 设置 API Key（必需）
export ANTHROPIC_API_KEY="your-api-key-here"

# 可选：使用 MiniMax API
export MODEL="MiniMax-M2"
export ANTHROPIC_BASE_URL="https://api.minimaxi.com/anthropic"
```

### 1.4 验证安装

```bash
# 运行基础命令
uv run synapse version

# 预期输出：显示版本号
```

**✅ 准备完成检查:**
- [✅] Python 版本 >= 3.13
- [✅] 依赖安装成功
- [✅] API Key 已设置
- [✅] `synapse version` 命令成功运行

---

## 🧪 测试部分 1: 唯一 Bash 工具架构

### 测试 1.1: 验证单一工具 Schema

**目标**: 确认 LLM 只看到一个 Bash 工具

```bash
# 启动交互式会话
uv run synapse chat
```

**测试步骤:**
1. 启动后，Agent 会初始化
2. 观察启动日志（如果有 verbose 输出）

**预期结果:**
- ✅ Agent 成功启动
- ✅ 无报错信息
- ✅ 进入交互模式（显示提示符）

**验证方式:**
```python
# 在 Python 中验证（可选）
from synapse.core.agent import Agent
agent = Agent()
schemas = agent.get_tool_schemas()

# 应该只有一个工具
assert len(schemas) == 1
assert schemas[0]["name"] == "Bash"
print("✅ 单一 Bash 工具验证通过")
```

---

## 🧪 测试部分 2: 持久 Bash 会话

### 测试 2.1: 环境变量持久化

```bash
uv run synapse chat
```

**方式 1: 使用自然语言指令（推荐）**

```
You: 请执行命令：export TEST_VAR=hello
```

**等待 Agent 响应后继续:**

```
You: 请执行命令：echo $TEST_VAR
```

**方式 2: 使用 ! 前缀直接执行（更直接）**

```
You: !export TEST_VAR=hello
```

**等待 Agent 响应后继续:**

```
You: !echo $TEST_VAR
```

**预期结果:**
- ✅ 第一次执行成功，设置了环境变量
- ✅ 第二次执行输出 `hello`
- ✅ 环境变量在两次命令之间保持

**记录结果:**
- [✅] 环境变量持久化成功
- [✅] 如有问题，描述: _______________

---

### 测试 2.2: 工作目录持久化

**方式 1: 使用自然语言指令（推荐）**

```
You: 请执行命令：mkdir -p /tmp/synapse_test && cd /tmp/synapse_test
```

**等待响应后:**

```
You: 请执行命令：pwd
```

**方式 2: 使用 ! 前缀直接执行（更直接）**

```
You: !mkdir -p /tmp/synapse_test && cd /tmp/synapse_test
```

**等待响应后:**

```
You: !pwd
```

**然后创建文件:**

```
You: 请执行命令：echo "test content" > test.txt
```

**预期输出：**
- 应显示工具调用信息：
  ```
  --- Tool Calls ---
  1. Calling: Bash
     Command: echo "test content" > test.txt
     Result: (命令执行结果)
  --- End Tool Calls ---
  ```
- Agent 响应确认命令已执行

**读取文件验证:**

```
You: 请执行命令：cat test.txt
```

**预期输出：**
- 应显示工具调用信息：
  ```
  --- Tool Calls ---
  1. Calling: Bash
     Command: cat test.txt
     Result: test content
  --- End Tool Calls ---
  ```
- Agent 响应应包含文件内容 "test content"

**验证文件:**

```
You: 列出当前目录文件：ls -la
```

**预期结果:**
- ✅ 成功切换到 `/tmp/synapse_test`
- ✅ `pwd` 显示正确的工作目录
- ✅ 文件创建成功
- ✅ `ls` 可以看到 `test.txt`

**记录结果:**
- [✅] 工作目录持久化成功
- [✅] 文件创建成功
- [✅] 如有问题，描述: _______________

---

### 测试 2.3: 会话重启功能

**在 Chat 中执行:**

```
You: 我刚才设置的 TEST_VAR 变量现在应该还在，请输出它
```

（应该还能看到之前设置的变量）

**然后请求重启:**

```
You: 请重启 bash 会话
```

**Agent 应该会调用 restart 参数**

**重启后验证:**

```
You: 现在再次输出 TEST_VAR：echo $TEST_VAR
```

**预期结果:**
- ✅ 重启前变量存在
- ✅ Agent 成功执行重启
- ✅ 重启后变量被清空（输出为空）

**记录结果:**
- [ ] 会话重启功能正常
- [ ] 如有问题，描述: _______________

---

## 🧪 测试部分 3: 自描述能力

### 测试 3.1: Agent Bash 工具帮助

**在 Chat 中执行:**

```
You: 请展示 read 命令的简要帮助：read -h
```

**预期结果:**
- ✅ 显示 `read` 命令的简要用法
- ✅ 包含参数列表

**继续测试详细帮助:**

```
You: 请展示 read 命令的详细帮助：read --help
```

**预期结果:**
- ✅ 显示完整的命令文档
- ✅ 包含参数描述和示例

**测试其他命令:**

```
You: 请分别测试这些命令的帮助：write -h, edit -h, glob -h, grep -h
```

**记录结果:**
- [ ] `read -h` 和 `read --help` 成功
- [ ] `write -h` 成功
- [ ] `edit -h` 成功
- [ ] `glob -h` 成功
- [ ] `grep -h` 成功
- [ ] 如有问题，描述: _______________

---

### 测试 3.2: Field Bash 帮助

**在 Chat 中执行:**

```
You: 列出所有可用的 Field 领域：field -h
```

**预期结果:**
- ✅ 显示 Field Bash 的使用说明
- ✅ 说明如何使用 `field:domain:tool` 格式

**记录结果:**
- [ ] Field 帮助系统正常
- [ ] 如有问题，描述: _______________

---

## 🧪 测试部分 4: Agent Bash 工具

### 测试 4.1: Read 工具

**准备测试文件:**

```bash
# 在项目根目录执行
echo "Line 1
Line 2
Line 3
Line 4
Line 5" > /tmp/test_read.txt
```

**在 Chat 中执行:**

```
You: 请读取文件 /tmp/test_read.txt
```

**预期结果:**
- ✅ 成功读取文件内容
- ✅ 显示所有 5 行

**测试限制参数:**

```
You: 请读取 /tmp/test_read.txt 文件，只读前 3 行
```

**预期结果:**
- ✅ 只显示前 3 行

**记录结果:**
- [ ] Read 工具基本功能正常
- [ ] Read 工具限制参数正常
- [ ] 如有问题，描述: _______________

---

### 测试 4.2: Write 工具

**在 Chat 中执行:**

```
You: 请写入文件 /tmp/test_write.txt，内容为 "Hello from Synapse Agent"
```

**验证写入:**

```
You: 请读取刚才写入的文件 /tmp/test_write.txt
```

**预期结果:**
- ✅ 文件写入成功
- ✅ 读取显示正确内容

**记录结果:**
- [✅] Write 工具功能正常
- [✅] 如有问题，描述: _______________

---

### 测试 4.3: Edit 工具

**在 Chat 中执行:**

```
You: 请编辑文件 /tmp/test_write.txt，将 "Hello" 替换为 "Hi"
```

**验证编辑:**

```
You: 请读取 /tmp/test_write.txt 确认修改
```

**预期结果:**
- ✅ 内容从 "Hello from Synapse Agent" 变为 "Hi from Synapse Agent"

**记录结果:**
- [✅] Edit 工具功能正常
- [✅] 如有问题，描述: _______________

---

### 测试 4.4: Glob 工具

**在 Chat 中执行:**

```
You: 请在 src/synapse/tools 目录下查找所有 .py 文件
```

**预期结果:**
- ✅ 列出所有 Python 文件
- ✅ 包含 `bash_session.py`, `bash_router.py` 等

**记录结果:**
- [✅] Glob 工具功能正常
- [✅] 如有问题，描述: _______________

---

### 测试 4.5: Grep 工具

**在 Chat 中执行:**

```
You: 请在 src/synapse/core 目录中搜索包含 "BashSession" 的文件
```

**预期结果:**
- ✅ 找到包含 "BashSession" 的文件
- ✅ 至少找到 `agent.py`

**记录结果:**
- [✅] Grep 工具功能正常
- [✅] 如有问题，描述: _______________

---

## 🧪 测试部分 5: 技能系统 (SKILL.md)

### 测试 5.1: 创建简单技能

**创建技能目录和文件:**

```bash
# 创建技能目录
mkdir -p ~/.synapse/skills/test/greeting

# 创建 SKILL.md 文件
cat > ~/.synapse/skills/test/greeting/SKILL.md << 'EOF'
---
name: greeting
description: Simple greeting skill for testing
domain: test
---

# Greeting Skill

This is a test skill that provides greeting functionality.

## Usage

When the user asks for a greeting, respond with a friendly message.

## Examples

User: "Say hello"
Assistant: "Hello! I'm Synapse Agent, happy to help you!"
EOF
```

**在 Chat 中执行:**

```
You: 请列出所有可用的技能：skill list
```

**预期结果:**
- ✅ 列出技能，包含 `greeting`
- ✅ 显示技能的描述

**记录结果:**
- [✅] 技能系统加载成功
- [✅] 技能列表显示正常
- [✅] 如有问题，描述: _______________

---

### 测试 5.2: 创建带脚本的技能

**创建带脚本的技能:**

```bash
# 创建技能目录
mkdir -p ~/.synapse/skills/test/calculator/scripts

# 创建 SKILL.md
cat > ~/.synapse/skills/test/calculator/SKILL.md << 'EOF'
---
name: calculator
description: Calculator skill with Python script
domain: test
---

# Calculator Skill

This skill provides calculation capabilities via scripts.

## Scripts

- add.py: Adds two numbers
EOF

# 创建 Python 脚本
cat > ~/.synapse/skills/test/calculator/scripts/add.py << 'EOF'
#!/usr/bin/env python3
"""Add two numbers.

Args:
    a: First number
    b: Second number
"""
import sys

if len(sys.argv) != 3:
    print("Usage: add.py <a> <b>")
    sys.exit(1)

try:
    a = float(sys.argv[1])
    b = float(sys.argv[2])
    result = a + b
    print(f"Result: {result}")
except ValueError:
    print("Error: Arguments must be numbers")
    sys.exit(1)
EOF

chmod +x ~/.synapse/skills/test/calculator/scripts/add.py
```

**在 Chat 中执行:**

```
You: 请重新加载技能列表并展示 calculator 技能
```

**预期结果:**
- ✅ `calculator` 技能出现在列表中
- ✅ 显示技能描述

**记录结果:**
- [✅] 带脚本的技能创建成功
- [✅] 如有问题，描述: _______________

---

## 🧪 测试部分 6: Tool2Bash Agent

### 测试 6.1: 安装 MCP 格式工具

**创建测试用的 MCP 工具定义:**

```bash
cat > /tmp/test_mcp_tool.json << 'EOF'
{
  "name": "test_echo",
  "description": "Echo a message back",
  "inputSchema": {
    "type": "object",
    "properties": {
      "message": {
        "type": "string",
        "description": "Message to echo"
      }
    },
    "required": ["message"]
  }
}
EOF
```

**使用 Python 安装工具:**

```python
# 在 Python 中测试
from pathlib import Path
from synapse.tools.tool_to_bash_agent import Tool2BashAgent, ToolDefinition, ToolSourceType
from synapse.tools.index import ToolIndex
import json

# 加载工具定义
tool_def_data = json.loads(Path("/tmp/test_mcp_tool.json").read_text())

# 创建 ToolDefinition
tool_def = ToolDefinition(
    name="test_echo",
    source_type=ToolSourceType.MCP,
    definition=tool_def_data,
    domain="test"
)

# 安装
tools_dir = Path.home() / ".synapse" / "tools"
tool_index = ToolIndex()
agent = Tool2BashAgent(tool_index, tools_dir)
path = agent.install(tool_def)

print(f"✅ 工具安装成功: {path}")
print(f"✅ 工具在索引中: {'test_echo' in tool_index}")

# 保存索引
index_path = tools_dir / "index.json"
tool_index.save(index_path)
print(f"✅ 索引已保存: {index_path}")
```

**预期结果:**
- ✅ 工具安装成功
- ✅ 文件创建在 `~/.synapse/tools/field/test/`
- ✅ 文件具有可执行权限
- ✅ 索引已更新

**记录结果:**
- [ ] MCP 工具安装成功
- [ ] 文件系统正确
- [ ] 如有问题，描述: _______________

---

### 测试 6.2: 安装 Function Calling 格式工具

**创建 Function Calling 格式工具:**

```python
from synapse.tools.tool_to_bash_agent import Tool2BashAgent, ToolDefinition, ToolSourceType
from synapse.tools.index import ToolIndex
from pathlib import Path

# Anthropic Function Calling 格式
fc_tool_def = ToolDefinition(
    name="test_greet",
    source_type=ToolSourceType.FUNCTION_CALLING,
    definition={
        "name": "test_greet",
        "description": "Generate a greeting",
        "input_schema": {  # 注意：snake_case
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Name to greet"
                }
            },
            "required": ["name"]
        }
    },
    domain="test"
)

# 安装
tools_dir = Path.home() / ".synapse" / "tools"
tool_index = ToolIndex.load(tools_dir / "index.json")
agent = Tool2BashAgent(tool_index, tools_dir)
path = agent.install(fc_tool_def)

print(f"✅ Function Calling 工具安装成功: {path}")

# 保存索引
tool_index.save(tools_dir / "index.json")
```

**预期结果:**
- ✅ 工具安装成功
- ✅ 索引更新

**记录结果:**
- [ ] Function Calling 工具安装成功
- [ ] 如有问题，描述: _______________

---

### 测试 6.3: 安装 Skill Script 格式工具

**使用之前创建的 calculator 技能脚本:**

```python
from synapse.tools.tool_to_bash_agent import Tool2BashAgent, ToolDefinition, ToolSourceType
from synapse.tools.index import ToolIndex
from pathlib import Path

# Skill Script 格式
script_path = Path.home() / ".synapse/skills/test/calculator/scripts/add.py"

skill_script_def = ToolDefinition(
    name="calculator_add",
    source_type=ToolSourceType.SKILL_SCRIPT,
    definition={
        "script_path": str(script_path),
        "skill_name": "calculator"
    },
    domain="test"
)

# 安装
tools_dir = Path.home() / ".synapse" / "tools"
tool_index = ToolIndex.load(tools_dir / "index.json")
agent = Tool2BashAgent(tool_index, tools_dir)
path = agent.install(skill_script_def)

print(f"✅ Skill Script 工具安装成功: {path}")
print(f"✅ 工具在索引中: {'skill_calculator_add' in tool_index}")

# 保存索引
tool_index.save(tools_dir / "index.json")
```

**预期结果:**
- ✅ 脚本转换为工具成功
- ✅ 工具名称包含 `calculator` 和 `add`

**记录结果:**
- [ ] Skill Script 工具安装成功
- [ ] 如有问题，描述: _______________

---

## 🧪 测试部分 7: 文件系统记忆

### 测试 7.1: 工具持久化验证

**验证工具文件存在:**

```bash
# 列出已安装的工具
ls -la ~/.synapse/tools/field/test/

# 查看工具索引
cat ~/.synapse/tools/index.json | python -m json.tool
```

**预期结果:**
- ✅ 工具文件存在于正确的域目录
- ✅ 所有文件都有可执行权限
- ✅ 索引包含所有已安装的工具

**在索引中应该看到:**

```json
{
  "version": "1.0.0",
  "agent": {},
  "field": {
    "test": {
      "test_echo": {
        "version": "1.0.0",
        "source": "mcp",
        "path": "field/test/test_echo",
        "description": "Echo a message back"
      },
      "test_greet": {...},
      "skill_calculator_add": {...}
    }
  }
}
```

**记录结果:**
- [ ] 工具文件正确保存
- [ ] 工具索引格式正确
- [ ] agent/field 分层结构正确
- [ ] 如有问题，描述: _______________

---

### 测试 7.2: 技能持久化验证

**验证技能文件存在:**

```bash
# 列出已创建的技能
ls -la ~/.synapse/skills/test/

# 查看技能索引（如果存在）
ls -la ~/.synapse/skills/index.json
```

**预期结果:**
- ✅ `greeting/` 和 `calculator/` 目录存在
- ✅ 每个目录包含 `SKILL.md` 文件
- ✅ `calculator/scripts/add.py` 存在

**记录结果:**
- [ ] 技能文件正确保存
- [ ] 目录结构符合规范
- [ ] 如有问题，描述: _______________

---

### 测试 7.3: Agent 重启验证

**重启 Agent 并验证工具可用:**

```bash
# 重新启动 Chat
uv run synapse chat
```

**在新的 Chat 会话中:**

```
You: 请列出所有可用的技能
```

**预期结果:**
- ✅ 之前创建的技能仍然可用
- ✅ `greeting` 和 `calculator` 出现在列表中

**验证工具索引加载:**

```python
# 在新的 Python 会话中
from pathlib import Path
from synapse.tools.index import ToolIndex

tools_dir = Path.home() / ".synapse" / "tools"
index_path = tools_dir / "index.json"

# 加载索引
tool_index = ToolIndex.load(index_path)

# 验证工具存在
print(f"✅ 索引中的工具数量: {len(tool_index)}")
print(f"✅ test 领域的工具: {tool_index.list_tools_in_domain('test')}")
```

**预期结果:**
- ✅ 索引正确加载
- ✅ 所有工具都在索引中

**记录结果:**
- [ ] Agent 重启后工具可用
- [ ] Agent 重启后技能可用
- [ ] 索引加载正常
- [ ] 如有问题，描述: _______________

---

## 🧪 测试部分 8: 脚本上下文隔离

### 测试 8.1: 验证脚本代码不进入上下文

**创建一个大型脚本:**

```bash
cat > /tmp/large_script.py << 'EOF'
#!/usr/bin/env python3
"""Large script test.

This script has lots of code but only outputs a simple message.

Args:
    message: Message to print
"""
import sys

# Large code block (should NOT enter LLM context)
EOF

# 添加 1000 行代码
for i in {1..1000}; do
  echo "x_$i = $i" >> /tmp/large_script.py
done

cat >> /tmp/large_script.py << 'EOF'

# Only this output should reach the LLM
if len(sys.argv) > 1:
    print(f"Message: {sys.argv[1]}")
else:
    print("Done")
EOF

chmod +x /tmp/large_script.py
```

**验证脚本工作:**

```bash
# 直接执行脚本
python /tmp/large_script.py "Hello"

# 预期输出: Message: Hello
```

**使用 Tool2Bash Agent 安装:**

```python
from synapse.tools.tool_to_bash_agent import Tool2BashAgent, ToolDefinition, ToolSourceType
from synapse.tools.index import ToolIndex
from pathlib import Path

# 创建 tool definition
large_script_def = ToolDefinition(
    name="large_test",
    source_type=ToolSourceType.SKILL_SCRIPT,
    definition={
        "script_path": "/tmp/large_script.py",
        "skill_name": "test"
    },
    domain="test"
)

# 安装
tools_dir = Path.home() / ".synapse" / "tools"
tool_index = ToolIndex.load(tools_dir / "index.json")
agent = Tool2BashAgent(tool_index, tools_dir)
path = agent.install(large_script_def)

print(f"✅ 大型脚本安装成功: {path}")

# 读取生成的包装脚本
wrapper_script = path.read_text()

# 验证包装脚本不包含原脚本的代码
assert "x_1 = 1" not in wrapper_script, "❌ 脚本代码泄露到包装脚本中"
assert "x_1000 = 1000" not in wrapper_script, "❌ 脚本代码泄露到包装脚本中"

print("✅ 包装脚本不包含原脚本代码")
print(f"✅ 包装脚本大小: {len(wrapper_script)} 字符")
print(f"✅ 原脚本大小: ~{1000 * 10 + 200} 字符")
```

**预期结果:**
- ✅ 包装脚本不包含原脚本的 1000 行代码
- ✅ 包装脚本只包含调用逻辑和帮助信息
- ✅ 包装脚本大小远小于原脚本

**记录结果:**
- [ ] 脚本上下文隔离正常
- [ ] 包装脚本不包含原脚本代码
- [ ] 如有问题，描述: _______________

---

## 🧪 测试部分 9: 完整工作流测试

### 测试 9.1: 端到端技能使用流程

**场景**: 创建、安装、使用一个完整的技能

**步骤 1: 创建技能**

```bash
mkdir -p ~/.synapse/skills/productivity/todo-manager/scripts

cat > ~/.synapse/skills/productivity/todo-manager/SKILL.md << 'EOF'
---
name: todo-manager
description: Simple TODO list manager
domain: productivity
---

# TODO Manager

Manage your TODO list with simple commands.

## Scripts

- add.py: Add a new TODO item
- list.py: List all TODO items
EOF

# 创建 add.py 脚本
cat > ~/.synapse/skills/productivity/todo-manager/scripts/add.py << 'EOF'
#!/usr/bin/env python3
"""Add a new TODO item.

Args:
    item: TODO item description
"""
import sys
from pathlib import Path

if len(sys.argv) < 2:
    print("Usage: add.py <item>")
    sys.exit(1)

todo_file = Path.home() / ".synapse" / "todos.txt"
todo_file.parent.mkdir(exist_ok=True)

item = " ".join(sys.argv[1:])
with todo_file.open("a") as f:
    f.write(f"[ ] {item}\n")

print(f"✅ Added: {item}")
EOF

# 创建 list.py 脚本
cat > ~/.synapse/skills/productivity/todo-manager/scripts/list.py << 'EOF'
#!/usr/bin/env python3
"""List all TODO items."""
from pathlib import Path

todo_file = Path.home() / ".synapse" / "todos.txt"

if not todo_file.exists():
    print("No TODO items yet.")
else:
    print("TODO List:")
    print(todo_file.read_text())
EOF

chmod +x ~/.synapse/skills/productivity/todo-manager/scripts/*.py
```

**步骤 2: 在 Chat 中使用**

```bash
uv run synapse chat
```

```
You: 请列出所有技能，应该能看到 todo-manager
```

**预期**: 看到 `todo-manager` 技能

```
You: 我想使用 todo-manager 技能添加一个 TODO 项目：学习 Synapse Agent
```

**预期**: Agent 应该能够使用对应的脚本添加 TODO

```
You: 现在列出所有的 TODO 项目
```

**预期**: 看到刚才添加的 TODO 项目

**记录结果:**
- [ ] 技能创建成功
- [ ] 技能在 Chat 中可用
- [ ] 技能脚本执行成功
- [ ] 如有问题，描述: _______________

---

## 📊 测试总结

### 测试完成情况

**核心功能测试:**
- [ ] 唯一 Bash 工具架构 (1 项)
- [ ] 持久 Bash 会话 (3 项)
- [ ] 自描述能力 (2 项)
- [ ] Agent Bash 工具 (5 项)
- [ ] 技能系统 (2 项)
- [ ] Tool2Bash Agent (3 项)
- [ ] 文件系统记忆 (3 项)
- [ ] 脚本上下文隔离 (1 项)
- [ ] 完整工作流 (1 项)

**总计**: _____ / 21 项测试通过

### 发现的问题

**问题 1:**
- 描述: _______________________
- 严重程度: [ ] 高 [ ] 中 [ ] 低
- 复现步骤: _______________________

**问题 2:**
- 描述: _______________________
- 严重程度: [ ] 高 [ ] 中 [ ] 低
- 复现步骤: _______________________

### 总体评估

- [ ] ✅ 所有核心功能正常
- [ ] ⚠️ 部分功能有问题（请详细记录）
- [ ] ❌ 重大问题需要修复

### 测试建议

_______________________
_______________________
_______________________

---

## 📝 附录: 快速验证脚本

**运行所有自动化测试:**

```bash
# 运行单元测试
uv run pytest tests/tools/test_bash_session.py -v
uv run pytest tests/tools/test_bash_router.py -v
uv run pytest tests/tools/test_tool_to_bash_agent.py -v

# 运行集成测试
uv run pytest tests/integration/ -v

# 如果所有测试通过，则核心功能正常
```

**清理测试数据:**

```bash
# 清理测试文件
rm -rf /tmp/synapse_test
rm -f /tmp/test_*.txt
rm -f /tmp/test_*.py
rm -f /tmp/test_mcp_tool.json
rm -f /tmp/large_script.py

# 清理测试技能和工具（可选，谨慎操作）
# rm -rf ~/.synapse/skills/test
# rm -rf ~/.synapse/skills/productivity
# rm -rf ~/.synapse/tools/field/test
```

---

**测试完成日期**: ________

**签名**: ________
