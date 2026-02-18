# Context7 Version Verification Guide

Use this guide to verify dependency versions via the Context7 MCP tools during tech stack confirmation. All selected technologies must be validated for latest stable versions, compatibility, and active maintenance status before final confirmation.

## Context7 MCP Tools

Two tools are available:

| Tool | Purpose |
|------|---------|
| `mcp__context7__resolve-library-id` | Resolve a library name to its Context7 library ID |
| `mcp__context7__query-docs` | Query latest documentation, version info, and code examples for a library |

## Verification Workflow

### Step 1: Resolve Library ID

For each candidate technology, resolve its Context7 library ID:

```
Tool: mcp__context7__resolve-library-id
Input: { "libraryName": "<library-name>" }
```

Examples of library name formats:
- Frameworks: `spring-boot`, `react`, `nextjs`, `express`
- Build tools: `maven`, `gradle`, `vite`, `webpack`
- Test frameworks: `junit`, `jest`, `pytest`
- Databases: `postgresql`, `mongodb`, `redis`
- Libraries: `jackson`, `caffeine`, `webflux`

### Step 2: Query Latest Documentation

Using the resolved library ID, query for current version information:

```
Tool: mcp__context7__query-docs
Input: { "libraryId": "<resolved-id>", "topic": "latest version installation getting started" }
```

### Step 3: Extract Version Information

From the query results, extract and record:

1. **Latest stable version** — the most recent non-pre-release version
2. **Minimum required version** — if dependent on other libraries (e.g., Spring Boot requires Java 17+)
3. **Compatibility constraints** — version requirements for peer dependencies
4. **EOL / maintenance status** — whether the version is actively maintained

### Step 4: Cross-check Compatibility

Verify inter-dependency compatibility across the full stack:

| Check Type | Example |
|-----------|---------|
| Runtime version | Spring Boot 3.x requires Java 17+ |
| Framework + plugin | JUnit 5 requires Maven Surefire 3.x |
| Library + framework | Jackson version bundled in Spring Boot vs standalone |
| Build tool + language | Gradle 8.x supports Java 21 |

## Version Verification Table Template

Record verification results in this format for each technology:

```markdown
## Dependency Version Verification

| Component | Technology | Verified Version | Latest Stable | Status | Context7 Verified |
|-----------|-----------|-----------------|---------------|--------|-------------------|
| [Component] | [Technology] | [Version in stack] | [Latest from Context7] | Active / Maintenance / EOL | Yes / Unavailable |

### Compatibility Matrix

| Dependency A | Version | Dependency B | Required Version | Compatible |
|-------------|---------|-------------|-----------------|------------|
| [e.g., Spring Boot] | [3.4.x] | [Java] | [17+] | Yes |
| [e.g., JUnit] | [5.11.x] | [Maven Surefire] | [3.x] | Yes |
```

## When Context7 Cannot Resolve a Library

If Context7 cannot resolve a library:

1. Note it as "Unavailable" in the verification table
2. Fall back to web search for the latest version information
3. Check the library's official release page or repository
4. Still record the verified version in the table with the source noted

## Verification Frequency

- **During Phase 3 (Trade-off Analysis)**: Verify candidate versions to inform scoring
- **During Phase 6 (Final Assembly)**: Re-verify all selected technologies before finalizing the tech stack document
- **Pin exact versions**: The confirmed tech stack document must specify exact versions, not ranges (e.g., `3.4.1` not `3.x`)
