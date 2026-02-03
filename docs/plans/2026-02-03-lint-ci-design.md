# Lint 与 GitHub CI 设计方案

## 目标
为当前框架补齐 Lint 与 GitHub Actions CI：本地可执行 `lint`，CI 在 `push` 与 `pull_request` 触发时运行 `lint/typecheck/test`，保证代码质量与基础稳定性。

## 架构与组件
- **Lint 配置**：新增 `eslint.config.js`（扁平配置）。
- **脚本**：在 `package.json` 增加 `lint` 与 `lint:fix`。
- **版本锁定**：新增 `.bun-version`，固定 Bun 版本为本机 `1.3.5`。
- **CI**：新增 `.github/workflows/ci.yml`，使用 `oven-sh/setup-bun` 安装 Bun，执行 `bun install --frozen-lockfile` 后依次运行 `lint/typecheck/test`。

## Lint 规则与输入/输出
- **输入**：`src/`、`tests/`、`examples/` 下的 TypeScript 代码；`eslint.config.js`。
- **输出**：
  - 发现错误/警告 → 进程退出码非 0（CI 失败）。
  - 无问题 → 退出码 0。
- **规则基线**：`eslint:recommended` + `@typescript-eslint/recommended`。
- **工程化补充**：
  - `@typescript-eslint/consistent-type-imports`
  - `@typescript-eslint/no-unused-vars`（允许 `_` 前缀变量）
  - `no-restricted-globals`（防误用环境全局变量）
- **范围/忽略**：默认忽略 `dist/`、`node_modules/`、`coverage/`。
- **优先级/边界规则**：CI 中警告视为失败（`--max-warnings 0`）。

## CI 流程与错误处理
- **触发**：`push` 与 `pull_request`。
- **步骤**：
  1) 安装 Bun（读取 `.bun-version`）。
  2) `bun install --frozen-lockfile`。
  3) `bun run lint`。
  4) `bun run typecheck`。
  5) `bun run test`。
- **错误场景**：
  - 依赖安装失败 → 直接失败。
  - Lint 有警告/错误 → 失败。
  - TypeScript 类型错误 → 失败。
  - 测试失败 → 失败。
- **不包含**：默认不跑 `test:e2e`，避免 CI 变慢；后续可单独 Job 或按需触发。

## 状态行为
- 持久状态仅来自 `bun.lock` 与 `.bun-version`；CI 为无状态执行。
- Lint 与测试不会修改源代码（`lint:fix` 仅用于本地修复）。

## 可测试性检查（BDD 维度）
- **输入/输出格式**：已明确输入目录与输出（退出码、CI 状态）。
- **错误场景**：安装失败、配置错误、规则违规、类型错误、测试失败均有预期行为（CI 失败）。
- **边界/优先级**：警告即失败；忽略目录明确。
- **状态行为**：无额外运行时状态；仅依赖锁文件与版本文件。
- **可验证粒度**：`bun run lint/typecheck/test` 可独立验证。
- **歧义检查**：未启用 type-aware 规则，避免对 `parserOptions.project` 的隐含要求。

## 测试与验证
- 本地：`bun run lint`、`bun run typecheck`、`bun run test`。
- CI：同上，确保与本地一致性。
