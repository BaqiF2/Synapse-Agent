# 测试指南

本指南面向日常开发与 CI 校验，目标是让你在本地 3 分钟内完成自检，并能快速定位 CI 失败原因。

## 快速开始

最小闭环命令顺序如下：

```bash
bun install
bun run lint
bun run typecheck
bun run test
```

说明：
- `lint` 警告视为失败
- `examples/` 目录即使为空也不会导致 lint 失败

## 本地校验

## Lint

命令：

```bash
bun run lint
```

要点：
- 规则来自 `eslint.config.js`
- `--max-warnings 0` 使警告直接失败
- `--no-error-on-unmatched-pattern` 避免空目录导致报错
- `.mjs` 文件已在 ESLint 层面忽略

## Typecheck

命令：

```bash
bun run typecheck
```

要点：
- 等价于 `tsc --noEmit`
- `tsconfig.json` 已排除 `**/*.mjs`

## Test

命令：

```bash
bun run test
```

要点：
- 默认跑全量测试（含自动化 E2E）
- 仅需 E2E 时可使用：

```bash
bun run test:e2e
bun run test:cli:e2e
bun run test:cli:e2e:basic
bun run test:cli:e2e:file
```

## CI 流程

CI 配置在 `/.github/workflows/ci.yml`，触发条件为 `push` 和 `pull_request`。

执行步骤：

```bash
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run test
```

说明：
- `--frozen-lockfile` 会在锁文件变更时失败
- CI 使用 `.bun-version` 固定 Bun 版本，确保与本地一致

## E2E 与手动测试

如需手动验证 REPL/PTY 交互或更复杂场景，请参考：
- `docs/testing/e2e-manual-testing-guide.md`
- `docs/testing/e2e-manual-testing-guide-phase2.md`

## 常见问题

- 锁文件变化导致 CI 失败：先运行 `bun install`，确认 `bun.lock` 更新后提交。
- Lint 失败：优先处理未使用变量与类型导入；可用 `_` 前缀明确未使用。
- Typecheck 失败：定位到具体文件后，从类型不匹配或可能为 `undefined` 的访问点修正。
- E2E 失败：先在本地复现，必要时单独跑 `bun run test:e2e` 或 CLI E2E 子集，缩小范围。
