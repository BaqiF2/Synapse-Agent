# Coverage 85% Test Expansion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Raise unit test coverage to ~85% and add low-cost IT coverage for core flows.

**Architecture:** Keep unit tests for pure logic and boundaries, add lightweight IT tests for cross-module flows with mocked external dependencies. Use Bun's native coverage reporting.

**Tech Stack:** Bun test runner, TypeScript ESM, tmp dir fixtures, test doubles/mocks.

---

## Test Case Inventory (Per File)

### Agent
- `src/agent/agent-runner.ts`
  - tool_call multi-round loop
  - consecutive tool failures threshold
  - history merge order
  - onMessagePart callback dispatch
- `src/agent/session.ts`
  - new session init
  - persistence load/save
  - history truncation boundary
- `src/agent/system-prompt.ts`
  - template join ordering
  - missing optional fields
  - tools list formatting

### Tools
- `src/tools/toolset.ts`
  - tool registration order
  - duplicate tool name conflict
  - missing tool error
- `src/tools/bash-router.ts`
  - routing precedence
  - fallback for unknown command
  - argument passthrough
- `src/tools/bash-session.ts`
  - session reuse
  - parallel calls isolation
  - timeout/exception propagation
- `src/tools/handlers/agent-bash/read.ts`
  - missing path
  - encoding handling
  - size cap
- `src/tools/handlers/agent-bash/write.ts`
  - overwrite vs append
  - missing dir
  - permission failure
- `src/tools/handlers/agent-bash/edit.ts`
  - patch failure
  - offset boundary
  - empty patch
- `src/tools/handlers/agent-bash/glob.ts`
  - empty match
  - depth limit
  - ignore rules
- `src/tools/handlers/agent-bash/grep.ts`
  - empty file
  - binary input
  - regex failure

### CLI
- `src/cli/tree-builder.ts`
  - empty tree
  - single level
  - multi-level merge
  - stable sort
- `src/cli/repl.ts`
  - special commands (/help /tools /exit)
  - unknown command
  - state transitions
- `src/cli/terminal-renderer.ts`
  - empty list render
  - style toggles
  - output format

### Config
- `src/config/settings-manager.ts`
  - default merge
  - missing settings file
  - corrupted JSON
- `src/config/settings-schema.ts`
  - schema validation failure
  - default fill

### Sub-agents
- `src/sub-agents/sub-agent-manager.ts`
  - route selection
  - missing config
  - unknown sub-agent type
- `src/sub-agents/configs/index.ts`
  - config assembly
  - dedupe

### Skills
- `src/skills/indexer.ts`
  - index build
  - duplicate handling
  - sorting
- `src/skills/index-updater.ts`
  - incremental update
  - empty dir
  - rollback on error
- `src/skills/skill-loader.ts`
  - parse failure
  - missing fields
  - version mismatch
- `src/skills/skill-schema.ts`
  - field validation
  - defaults

### IT (Low-cost integration)
- `tests/it/cli-repl-flow.test.ts`
  - REPL command flow without PTY
- `tests/it/agent-toolchain.test.ts`
  - AgentRunner + Toolset + agent-bash handlers
- `tests/it/skills-index-flow.test.ts`
  - skills index build + update
- `tests/it/mcp-converter-flow.test.ts`
  - MCP config parse + install
- `tests/it/sub-agent-flow.test.ts`
  - sub-agent config + routing

---

### Task 1: Add coverage script (local)

**Files:**
- Modify: `package.json`

**Step 1: Write the failing test**
- Not applicable (script-only change).

**Step 2: Run test to verify it fails**
- Run: `bun test --coverage --coverage-reporter=text --coverage-reporter=lcov`
- Expected: coverage outputs generated in `coverage/`.

**Step 3: Write minimal implementation**
- Add `test:cov` script to `package.json`.

**Step 4: Run test to verify it passes**
- Run: `bun run test:cov`
- Expected: coverage summary printed, lcov file generated.

**Step 5: Commit**
- `git add package.json`
- `git commit -m "chore(test): add coverage script"`

---

### Task 2: Agent unit tests expansion

**Files:**
- Modify: `tests/unit/agent/agent-runner.test.ts`
- Modify: `tests/unit/agent/session.test.ts`
- Modify: `tests/unit/agent/system-prompt.test.ts`

**Step 1: Write the failing test**
```ts
it('stops after maxConsecutiveToolFailures and appends tool error', async () => {
  // arrange runner + client
  // expect: error message and history tail is tool
});
```

**Step 2: Run test to verify it fails**
- Run: `bun test tests/unit/agent/agent-runner.test.ts`
- Expected: FAIL if path not covered; otherwise PASS.

**Step 3: Write minimal implementation**
- Add missing mocks/fixtures to drive branches.

**Step 4: Run test to verify it passes**
- Run: `bun test tests/unit/agent/agent-runner.test.ts`
- Expected: PASS

**Step 5: Commit**
- `git add tests/unit/agent/agent-runner.test.ts tests/unit/agent/session.test.ts tests/unit/agent/system-prompt.test.ts`
- `git commit -m "test(agent): expand unit coverage"`

---

### Task 3: Tools unit tests expansion

**Files:**
- Create: `tests/unit/tools/bash-router.test.ts`
- Create: `tests/unit/tools/bash-session.test.ts`
- Create: `tests/unit/tools/handlers/agent-bash/read.test.ts`
- Create: `tests/unit/tools/handlers/agent-bash/write.test.ts`
- Create: `tests/unit/tools/handlers/agent-bash/edit.test.ts`
- Create: `tests/unit/tools/handlers/agent-bash/glob.test.ts`
- Create: `tests/unit/tools/handlers/agent-bash/grep.test.ts`
- Modify: `tests/unit/agent/toolset.test.ts`

**Step 1: Write the failing test**
```ts
it('routes unknown command to fallback', async () => {
  // arrange router with no match
  // expect fallback tool
});
```

**Step 2: Run test to verify it fails**
- Run: `bun test tests/unit/tools/bash-router.test.ts`
- Expected: FAIL if branch uncovered; otherwise PASS.

**Step 3: Write minimal implementation**
- Add temp dir fixtures and mocks for fs/exec boundaries.

**Step 4: Run test to verify it passes**
- Run: `bun test tests/unit/tools/bash-router.test.ts`
- Expected: PASS

**Step 5: Commit**
- `git add tests/unit/tools tests/unit/agent/toolset.test.ts`
- `git commit -m "test(tools): add handler coverage"`

---

### Task 4: CLI unit tests expansion

**Files:**
- Create: `tests/unit/cli/tree-builder.test.ts`
- Create: `tests/unit/cli/repl.test.ts`
- Modify: `tests/unit/cli/terminal-renderer.test.ts`

**Step 1: Write the failing test**
```ts
it('builds empty tree without errors', () => {
  // expect empty structure
});
```

**Step 2: Run test to verify it fails**
- Run: `bun test tests/unit/cli/tree-builder.test.ts`
- Expected: FAIL if uncovered; otherwise PASS.

**Step 3: Write minimal implementation**
- Add mock input/output for REPL command parsing.

**Step 4: Run test to verify it passes**
- Run: `bun test tests/unit/cli/tree-builder.test.ts`
- Expected: PASS

**Step 5: Commit**
- `git add tests/unit/cli/tree-builder.test.ts tests/unit/cli/repl.test.ts tests/unit/cli/terminal-renderer.test.ts`
- `git commit -m "test(cli): cover repl and tree builder"`

---

### Task 5: Config unit tests expansion

**Files:**
- Modify: `tests/unit/config/settings-manager.test.ts`
- Modify: `tests/unit/config/settings-schema.test.ts`

**Step 1: Write the failing test**
```ts
it('falls back to defaults when settings file is missing', () => {
  // expect default settings
});
```

**Step 2: Run test to verify it fails**
- Run: `bun test tests/unit/config/settings-manager.test.ts`
- Expected: FAIL if uncovered; otherwise PASS.

**Step 3: Write minimal implementation**
- Add temp dir fixture for missing file path.

**Step 4: Run test to verify it passes**
- Run: `bun test tests/unit/config/settings-manager.test.ts`
- Expected: PASS

**Step 5: Commit**
- `git add tests/unit/config/settings-manager.test.ts tests/unit/config/settings-schema.test.ts`
- `git commit -m "test(config): cover settings edge cases"`

---

### Task 6: Sub-agents unit tests expansion

**Files:**
- Create: `tests/unit/sub-agents/sub-agent-manager.test.ts`
- Create: `tests/unit/sub-agents/configs-index.test.ts`

**Step 1: Write the failing test**
```ts
it('routes to default sub-agent when type missing', () => {
  // expect default route
});
```

**Step 2: Run test to verify it fails**
- Run: `bun test tests/unit/sub-agents/sub-agent-manager.test.ts`
- Expected: FAIL if uncovered; otherwise PASS.

**Step 3: Write minimal implementation**
- Add minimal config fixtures.

**Step 4: Run test to verify it passes**
- Run: `bun test tests/unit/sub-agents/sub-agent-manager.test.ts`
- Expected: PASS

**Step 5: Commit**
- `git add tests/unit/sub-agents/sub-agent-manager.test.ts tests/unit/sub-agents/configs-index.test.ts`
- `git commit -m "test(sub-agents): add routing coverage"`

---

### Task 7: Skills unit tests expansion

**Files:**
- Create: `tests/unit/skills/indexer.test.ts`
- Modify: `tests/unit/skills/index-updater.test.ts`
- Create: `tests/unit/skills/skill-loader.test.ts`
- Create: `tests/unit/skills/skill-schema.test.ts`

**Step 1: Write the failing test**
```ts
it('skips duplicate skill entries when indexing', () => {
  // expect unique list
});
```

**Step 2: Run test to verify it fails**
- Run: `bun test tests/unit/skills/indexer.test.ts`
- Expected: FAIL if uncovered; otherwise PASS.

**Step 3: Write minimal implementation**
- Add temp skill fixture directories.

**Step 4: Run test to verify it passes**
- Run: `bun test tests/unit/skills/indexer.test.ts`
- Expected: PASS

**Step 5: Commit**
- `git add tests/unit/skills/indexer.test.ts tests/unit/skills/index-updater.test.ts tests/unit/skills/skill-loader.test.ts tests/unit/skills/skill-schema.test.ts`
- `git commit -m "test(skills): expand coverage"`

---

### Task 8: Add low-cost IT tests

**Files:**
- Create: `tests/it/cli-repl-flow.test.ts`
- Create: `tests/it/agent-toolchain.test.ts`
- Create: `tests/it/skills-index-flow.test.ts`
- Create: `tests/it/mcp-converter-flow.test.ts`
- Create: `tests/it/sub-agent-flow.test.ts`

**Step 1: Write the failing test**
```ts
it('executes repl command flow without PTY', async () => {
  // arrange repl core
  // expect output + state transitions
});
```

**Step 2: Run test to verify it fails**
- Run: `bun test tests/it/cli-repl-flow.test.ts`
- Expected: FAIL if uncovered; otherwise PASS.

**Step 3: Write minimal implementation**
- Add temp dir setup and mock external deps.

**Step 4: Run test to verify it passes**
- Run: `bun test tests/it/cli-repl-flow.test.ts`
- Expected: PASS

**Step 5: Commit**
- `git add tests/it`
- `git commit -m "test(it): add low-cost integration coverage"`

---

### Task 9: Coverage baseline run and gap list

**Files:**
- None (local run)

**Step 1: Run coverage**
- Run: `bun run test:cov`
- Expected: coverage summary and lcov output

**Step 2: Record gaps**
- Capture top 10 uncovered files and add follow-up tasks if needed.

**Step 3: Commit**
- Not required unless docs updated.

---

## Notes
- Keep IT tests fast and deterministic; avoid PTY and external network.
- Prefer temp directories and inline fixtures.
- Use Bun `mock()` and dependency injection for external clients.

