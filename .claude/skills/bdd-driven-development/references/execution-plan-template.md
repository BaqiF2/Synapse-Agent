# Execution Plan Template

> This template defines the structure for the BDD execution plan document generated at Step 1.
> All `{{placeholder}}` values must be replaced with project-specific data read from the architecture document, tech-stack document, PRD, and BDD JSON files at runtime.

---

```markdown
# BDD-Driven Development Execution Plan

> Generated: {{date}}
> PRD: `{{prd-file-path}}`
> Architecture: `{{architecture-file-path}}`
> Tech Stack: `{{tech-stack-file-path}}`

## Project Context

| Item | Value |
|------|-------|
| Project | {{project-name}} |
| Language | {{language-and-version}} |
| Framework | {{framework-and-version}} |
| Build Tool | {{build-tool-and-version}} |
| Test Framework | {{test-frameworks}} |
| HTTP Mock | {{http-mock-tool}} |
| Architecture Test | {{architecture-test-tool}} |
| Coverage Tool | {{coverage-tool}} |

## Command Cheat Sheet

\```
Build:              {{build-command}}
Test (all):         {{full-test-command}}
Test (unit only):   {{unit-test-command}}
Test (integ only):  {{integration-test-command}}
Test (e2e only):    {{e2e-test-command}}
Test (single):      {{single-test-command}}
Coverage:           {{coverage-command}}
Source root:        {{source-root-path}}
Test root:          {{test-root-path}}
\```

## Walking Skeleton Status

{{for each infrastructure component discovered in the codebase:}}
- [x] {{component-name}} ({{brief-description}})
{{end for}}
{{for each pending infrastructure item:}}
- [ ] {{pending-item-description}}
{{end for}}

## Feature Execution Order

### Phase 0: Infrastructure Verification

> Features where walking skeleton already provides an implementation. Only tests need to be written/verified.

| # | Feature | Module | Scenarios | Status |
|---|---------|--------|-----------|--------|
{{for each infra-verification feature:}}
| {{index}} | {{feature-name}} | {{module}} | {{scenario-count}} | Pending |
{{end for}}

### Phase 1: Must Features

| # | Feature | Module | MCP Tool | Scenarios | Status |
|---|---------|--------|----------|-----------|--------|
{{for each Must feature sorted by F-xxx ID:}}
| {{index}} | {{feature-id}} {{feature-name}} | {{module}} | `{{mcp-tool-name}}` | {{scenario-count}} | Pending |
{{end for}}

### Phase 2: Should Features

| # | Feature | Module | MCP Tool | Scenarios | Status |
|---|---------|--------|----------|-----------|--------|
{{for each Should feature sorted by F-xxx ID:}}
| {{index}} | {{feature-id}} {{feature-name}} | {{module}} | `{{mcp-tool-name}}` | {{scenario-count}} | Pending |
{{end for}}

### Phase 3: Could Features

| # | Feature | Module | MCP Tool | Scenarios | Status |
|---|---------|--------|----------|-----------|--------|
{{for each Could feature sorted by F-xxx ID:}}
| {{index}} | {{feature-id}} {{feature-name}} | {{module}} | `{{mcp-tool-name}}` | {{scenario-count}} | Pending |
{{end for}}

**Total: {{total-feature-count}} features, {{total-scenario-count}} BDD scenarios**

## Feature Dependencies

\```
{{ASCII diagram showing phase flow and cross-feature dependencies}}
{{Identify from architecture doc section on module communication}}
{{Mark critical dependencies with explanatory notes}}
\```

**Key dependency:** {{describe the most important cross-feature dependency, if any}}

## BDD Review Notes

{{for each feature, in execution order:}}
{{index}}. **{{feature-id}} {{feature-name}}** — {{1-2 sentence technical note covering: enum conventions, API constraints, cache behavior, data format requirements, or "Complete and unambiguous."}}
{{end for}}

{{final line:}}
{{N}}. **No contradictions or blockers found between BDD scenarios and PRD.** (or list specific concerns)

## Per-Feature Development Cycle

Each feature follows BDD-guided TDD:

\```
1. RED    — Translate BDD scenarios to failing tests
2. GREEN  — Write minimal production code to pass
3. REFACTOR — Clean up while tests pass
4. VERIFY — Confirm all BDD scenarios covered
5. COMMIT — One atomic commit per feature
6. REPORT — Progress summary, then next feature
\```

## Layered Implementation Order

{{Read from architecture doc dependency rules section. Typical:}}

\```
1. core/     — Domain models, service interfaces, business logic (pure, no framework deps)
2. infrastructure/ — External API client implementations
3. api/      — Tool/controller definitions, framework wiring
\```

## Test Classification Rules

| BDD `given` Pattern | Test Type | Location |
|---------------------|-----------|----------|
| Pure input validation, business rules | Unit test | `{{unit-test-path-pattern}}` |
| External API returns specific response | Integration test ({{mock-tool}}) | `{{integration-test-path-pattern}}` |
| Requires running server | Integration test (@SpringBootTest or equivalent) | `{{integration-test-path-pattern}}` |
| Cache behavior verification | Integration test ({{mock-tool}} + counting) | `{{integration-test-path-pattern}}` |
| Full protocol path (feature discoverable + invocable by external client) | E2E smoke test (full stack, no auto-config exclusions) | `{{e2e-test-path-pattern}}` |

> **E2E smoke tests are mandatory.** At least one E2E test must verify each feature is discoverable and invocable through the protocol layer (e.g., MCP `tools/list`, REST endpoint, gRPC reflection). Integration tests that exclude auto-configuration do NOT count as E2E coverage.

### E2E Test Environment Requirements

{{If E2E tests require external environment setup:}}
| Requirement | Description | Setup Command |
|-------------|-------------|---------------|
| {{env-var-or-service}} | {{purpose}} | {{how-to-setup}} |

{{If E2E tests are self-contained (embedded server + HTTP stubs only):}}
E2E tests are self-contained — no external environment setup required.

## Coverage Targets

{{Read from architecture doc coverage targets table:}}

| Module | Line Coverage | Branch Coverage |
|--------|--------------|-----------------|
{{for each module:}}
| {{module-name}} | >= {{line-threshold}}% | >= {{branch-threshold}}% |
{{end for}}
| Overall | >= {{overall-line}}% | >= {{overall-branch}}% |

## Progress Log

> Append-only log. Each entry records a feature status change during the development cycle.

| Feature | From | To | Note |
|---------|------|----|------|
{{entries appended as features progress, e.g.:}}
| F-001 Get Spot Price | Pending | In Progress | Starting RED phase |
| F-001 Get Spot Price | In Progress | Done | 4/4 scenarios, commit abc1234 |

## Final Verification Checklist

- [ ] All {{total-scenario-count}} BDD scenarios have corresponding tests
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] All E2E smoke tests pass (features discoverable and invocable through protocol layer)
- [ ] Architecture tests pass
- [ ] Code style checks pass (zero errors)
- [ ] Static analysis pass (zero high-priority issues)
- [ ] Coverage meets thresholds
- [ ] BDD JSON files updated (`passes: true`, `overallPass: true`)
- [ ] All commits follow Conventional Commits format
```

---

## Template Usage Notes

### Status Column Values

The Status column in Feature Execution Order tables uses these values:

| Status | Meaning |
|--------|---------|
| `Pending` | Not yet started (initial state) |
| `In Progress` | Currently being implemented (set at Step 2 start) |
| `Done` | Implementation complete and committed (set at Step 6) |
| `Skipped` | User requested to skip (add reason in BDD Review Notes) |

### Resume Logic

To resume from an existing plan:
1. Scan all Feature Execution Order tables
2. Find the first row with Status = `Pending`
3. That is the next feature to implement
4. If all rows are `Done`, proceed to Step 8 (Final Verification)

### Progress Log Format

The Progress Log is an **append-only** section. Each status change appends one row:

| When to Append | From | To | Note Template |
|----------------|------|----|---------------|
| Step 2 start (RED phase begins) | `Pending` | `In Progress` | `Starting RED phase` |
| Step 6 complete (feature committed) | `In Progress` | `Done` | `N/N scenarios, commit <short-hash>` |
| User requests skip | `Pending` or `In Progress` | `Skipped` | `User requested skip: <reason>` |

Never delete or modify existing log entries. The log provides a chronological record of development progress.

### Dynamic Sections

The following sections should be updated during development:
- **Feature Execution Order tables** — Status column updated per feature
- **Progress Log** — New row appended on each feature status change
- **Final Verification Checklist** — Checkboxes ticked during Step 8

All other sections are written once at plan generation time and remain static.
