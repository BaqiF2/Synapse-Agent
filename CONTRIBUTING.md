# Contributing Guide

Thanks for contributing to Synapse Agent. This document explains how to submit changes efficiently and reproducibly.

## Ways to Contribute

- Report bugs or suggest improvements
- Improve documentation
- Submit fixes or new features
- Add tests, especially for agent/tooling flows

## Development Setup

```bash
bun install
cp .env.example .env
```

Notes:

- Running the CLI usually requires `ANTHROPIC_API_KEY`
- Unit tests often do not require real online credentials (depends on the specific test)

## Branches and Commits

Create your branch from `main`, for example:

- `feat/<topic>`
- `fix/<topic>`
- `docs/<topic>`

Use Conventional Commits (aligned with repository history):

- `feat(scope): ...`
- `fix(scope): ...`
- `refactor(scope): ...`
- `docs(scope): ...`
- `test(scope): ...`

Example:

```text
feat(skill-sub-agent): add skill timeout guard
fix(repl): avoid duplicate prompt render
docs(readme): add open-source collaboration section
```

## Local Validation Before PR

Run at least:

```bash
bun run lint
bun run typecheck
bun run test
```

If your changes touch REPL rendering, streaming output, or interactive behavior, also run:

```bash
bun run test:e2e
bun run test:cli:e2e
```

## Code and Testing Conventions

- Use TypeScript ESM (`"type": "module"`)
- Prefer kebab-case file names (for example, `agent-runner.ts`)
- Keep modules small and focused; place shared public types in clearly named `*-types.ts` files
- When changing agent/tooling behavior, update tests in `tests/unit/agent/` or the relevant module

## Pull Request Expectations

A good PR description includes:

- Purpose and scope of changes
- Key design tradeoffs (if any)
- Validation commands and results
- Whether docs were updated
- For REPL/terminal UX changes, include key screenshots or terminal snippets

## License

By contributing, you agree that your contributions are released under this project's current MIT license.
