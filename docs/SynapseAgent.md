# Synapse Agent

名称含义: 神经突触，是大脑学习和记忆的关键连接点。

## 核心

1. 工具就是agent的手脚
2. 一切工具都是Bash
3. 一切都是工具
4. 文件系统是一种记忆
5. 技能 = 文件系统 + 工具
6. 技能 + LLM = 大脑
7. 技能 + LLM + Bash = 通用智能体
8. 沙盒 = 一种工作台

## 目标

基于核心理解和自己的智能体理解设计出这么一个智能体

## 设计

### 已知定律

1、4、5

### 需要证明的

#### 一切工具都是 Shell Command

所有工具都应该被封装为 Shell Command

- Native Shell Command

Unix/Linux 自带指令

- Agent Shell Command

agent需要的基本工具封装的指令 Read/Write/Task/Skill/.... 等

- Extension Shell Command

扩展 Shell Command，由专业领域生成的 Shell Command。由工具转化，比如 Mcp2Bash Fc2Bash

#### 一切都是工具

在Agent loop 上想加功能，先把它封装为工具，典型：Task/Skill

需要注意的是：提示词进入到Agent Loop 和 最终的Result返回不再Agent Loop中，可以加入一些流程控制。

#### 技能 + LLM = 大脑

证明是2点，自我学习和自我成长(记忆)。

一切围绕着SKill来设计

**钩子1/工具1**: 技能搜索Agent（一个会反思获取需要加载哪些技能的Agent），会在User prompt进入到AgentLoop前先执行。

**钩子2/工具2:** 当前任务如果顺利完成，在退出AgentLoop之后，由SKill Agent 判断任务是否完全由已有的Agent完成，如果不是，需要强化特定的Skill 或者 新增一个领域Skill

**（先封装为工具） - 效果不好再调整为钩子**

**这里我倾向于封装成task工具，但是因为可能受到上下文影响，LLM如果无法在一开始先加载Skill或者退出时总结Skill，可以保留钩子实现的可能性。**

**外源补充知识库：**导入技能后，由LLM对技能进行分类、强化、新增 （特色功能）

#### 技能 + LLM + Bash = 通用智能体

- 技能中使用的工具都将被转化为 Extension Shell Command
- SKill Agent 生成的新技能,会将过程中新增工具转化为 Extension Shell Command,同时将 工具和技能保存在文件系统

### 沙盒

一个工作台,一种工程手段，在现有LLM发展阶段的产物，重要但不认为是Agent的核心。

## 技术设计

### 框架基础

#### 交互方式

CLI

#### 语言

Python

#### 模型

Minimax 2.1

#### API SDK

Anthropic SDK

[https://platform.minimaxi.com/docs/api-reference/api-overview](https://platform.minimaxi.com/docs/api-reference/api-overview)

[https://platform.claude.com/docs/en/api/overview](https://platform.claude.com/docs/en/api/overview)

https://github.com/anthropics/anthropic-sdk-typescript

### Bash管理

#### Agent Tools Bash

[https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)

Json schema 2 Bash

#### Extension Shell Command

[https://github.com/philschmid/mcp-cli](https://github.com/philschmid/mcp-cli)

Mcp 2 bash

### 工具管理

- 封装工具的系统提示词
- 本次任务需要预先加载的工具
- 根据需要再加载的工具

### Agent Loop (Infinite-training)

#### 钩子1: 技能搜索Agent

- 提示词 + 模型 + 工具

#### Agent Loop

参考

[https://github.com/shareAI-lab/learn-claude-code/blob/main/README_zh.md](https://github.com/shareAI-lab/learn-claude-code/blob/main/README_zh.md)

- 提示词 + 模型 + 工具 + 技能

#### 钩子2: 技能强化Agent

- 提示词 + 模型 + 工具

强化工具自主保存为文件，并生成 Shell Command 保存到文件

### 扩展

#### 人类强化Agent（RLHF/Fine-tuning）

对齐人类偏好、遵循指令。获得人类/奖励模型的高分。

- 在历史信息中用户主动告诉Agent哪些地方不符合预期
- 主动将外源Skill加载到Agent中，由Agent强化学习或微调

#### 沙盒（可选）

- 将工具执行转移到沙盒中，避免造成环境的破坏。（Extension Shell Command）