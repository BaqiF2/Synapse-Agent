# Task 并行执行设计

## 问题背景

当前系统在使用 `task:explore` 和 `task:general` 工具时存在问题：

1. 所有参数都塞到一个任务里，无法并行执行
2. 主代理发起多个 `task:*` 调用时，系统串行执行

## 设计目标

1. 支持主代理同时发起多个 `task:explore` / `task:general` 调用
2. 系统识别同批次的 `task:*` 调用，并行执行
3. 每个任务返回独立的 tool_result
4. 每个并行任务在终端独立显示一行状态

## 不在范围内

- 代码层自动拆分任务（由主代理负责决策）
- 命令截断渲染

## 核心设计

### 并行执行机制

当主代理在一次响应中返回多个 `task:*` 工具调用时：

```
tool_use[0]: task:explore --prompt "分析 src/agent"
tool_use[1]: task:explore --prompt "分析 src/tools"
tool_use[2]: task:general --prompt "查询项目依赖"
```

系统处理流程：

1. `AgentRunner` 收到多个 tool_use
2. 识别出可并行的 `task:*` 类型调用
3. 通过 `Promise.allSettled()` 并行执行
4. 每个任务返回独立的 tool_result
5. 主代理收到所有 tool_result 后继续执行

### 返回结构

```
tool_result[0]: { content: "src/agent 分析结果..." }
tool_result[1]: { content: "src/tools 分析结果..." }
tool_result[2]: { content: "项目依赖查询结果..." }
```

失败的任务返回错误信息：

```
tool_result[1]: { content: "Error: Connection timeout", is_error: true }
```

### 执行顺序

按 tool_use 数组顺序分组，连续的 `task:*` 调用并行执行：

```
tool_use[0]: read file.txt        → 单独执行
tool_use[1]: task:explore A       ┐
tool_use[2]: task:explore B       ├→ 并行执行
tool_use[3]: task:general C       ┘
tool_use[4]: write result.txt     → 等待上面完成后执行
```

### 并行限制

- 最大并行数：5（`SYNAPSE_MAX_PARALLEL_TASKS`）
- 超出限制时：前 5 个并行，其余排队等待

## 终端渲染

### 多任务并行显示

每个并行任务在终端独立显示一行状态：

```
◐ task:explore "分析 src/agent"
◐ task:explore "分析 src/tools"
◐ task:general "查询项目依赖"
```

任务完成后更新状态：

```
✓ task:explore "分析 src/agent"
◐ task:explore "分析 src/tools"
✗ task:general "查询项目依赖"
```

### 状态图标

| 状态 | 图标 |
|------|------|
| 执行中 | `◐` (带动画) |
| 成功 | `✓` (绿色) |
| 失败 | `✗` (红色) |

### 显示内容截断

复用现有 `TOOL_RESULT_SUMMARY_LIMIT` 环境变量配置。

## 边界情况处理

| 场景 | 处理方式 |
|------|----------|
| 并行任务数超过 5 | 前 5 个并行执行，其余排队等待 |
| 单个任务超时 | 该任务返回超时错误，不影响其他任务 |
| 全部任务失败 | 每个任务独立返回错误信息 |
| 混合 task 类型 | `task:explore` 和 `task:general` 可混合并行 |
| 非 task 工具调用 | 不参与并行，按原有逻辑执行 |
| 主代理只发起 1 个 task | 正常执行，无需特殊处理 |

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `SYNAPSE_MAX_PARALLEL_TASKS` | 5 | 最大并行任务数 |
| `TOOL_RESULT_SUMMARY_LIMIT` | (现有值) | 显示内容截断长度 |

## 实现文件清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/agent/agent-runner.ts` | 修改 | 识别多个 task:* 调用，并行执行 |
| `src/cli/terminal-renderer.ts` | 修改 | 支持多行并行任务状态显示 |
| `src/tools/handlers/task-command-handler.ts` | 修改 | 支持 task:general |
| `tests/unit/agent/agent-runner.test.ts` | 新增/修改 | 并行执行测试 |
| `tests/unit/cli/terminal-renderer.test.ts` | 新增/修改 | 多任务渲染测试 |

## 测试用例

| 测试场景 | 输入 | 预期输出 |
|----------|------|----------|
| 单个 task 执行 | 1 个 task:explore | 正常执行，返回 1 个 tool_result |
| 多个 task 并行 | 3 个 task:explore | 并行执行，返回 3 个独立 tool_result |
| 混合类型并行 | 2 个 task:explore + 1 个 task:general | 全部并行执行 |
| 超过限制 | 7 个 task:* | 前 5 个并行，后 2 个排队 |
| 部分失败 | 3 个任务，1 个失败 | 2 个成功 + 1 个 is_error |
| 混合工具调用 | read + 3 个 task:* + write | 按顺序分组执行 |
| 渲染多行状态 | 3 个并行任务 | 终端显示 3 行独立状态 |
