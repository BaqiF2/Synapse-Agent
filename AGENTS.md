# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds the TypeScript source. Key areas: `src/cli/` (REPL/CLI entry), `src/agent/` (AgentRunner, context, skill sub-agent), `src/tools/` (tool handlers/converters), `src/skills/`, and `src/utils/`.
- `tests/` contains `unit/` and `e2e/` suites; test files typically end with `.test.ts`.
- `docs/` includes implementation plans and testing notes (see `docs/plans/` and `docs/testing/`).
- `examples/` contains sample usage; `index.ts` is the package entry.

## Build, Test, and Development Commands
- `bun install` installs dependencies.
- `bun run start` runs the CLI entry (`src/cli/index.ts`).
- `bun run chat` launches the interactive REPL.
- `bun run test` runs all tests via Bun.
- `bun run test:e2e` runs end-to-end tests in `tests/e2e/`.
- `bun run typecheck` runs `tsc --noEmit` for type checking.

## Coding Style & Naming Conventions
- TypeScript ESM is used throughout (`"type": "module"`).
- File names favor kebab-case (e.g., `agent-runner.ts`, `skill-sub-agent.ts`).
- Match existing formatting in nearby files; there is no repository-wide formatter or linter configured.
- Prefer small, focused modules and keep public types in clearly named files (e.g., `*-types.ts`).

## Testing Guidelines
- Unit tests live in `tests/unit/`; e2e tests live in `tests/e2e/`.
- Use Bun’s test runner (`bun test`) and keep test names descriptive of behavior.
- When changing agent flow or tooling, add/adjust tests under `tests/unit/agent/`.

## Commit & Pull Request Guidelines
- Commit messages follow Conventional Commits patterns seen in history, e.g. `feat(skill-sub-agent): ...`, `fix(repl): ...`, `refactor(...): ...`.
- PRs should include: a short summary, test commands run, and any docs updates. Include screenshots or terminal output for REPL UX changes.

## Security & Configuration Tips
- Copy `.env.example` to `.env` and set required keys such as `ANTHROPIC_API_KEY` before running.
- Do not commit secrets or local log/config files (e.g., under `~/.synapse/`).

## 约定
- 当前处于项目开发阶段，任何调整优先考虑重构而非向后的兼容。
