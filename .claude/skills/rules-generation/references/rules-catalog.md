# Rules Catalog — Consolidated Rule Categories

This catalog defines **consolidated** rule categories to generate for each technology domain.
Related concerns are merged into single files to minimize rule file count and context window usage.
Each rule file uses YAML frontmatter `paths` to scope when it loads into context.

---

## Consolidation Principle

- **Fewer files, deeper content**: Merge related rules into one comprehensive file per domain
- **Path-scoped by default**: Every rule file must declare `paths` unless truly cross-cutting
- **Code quality focus**: Prioritize coding standards, error handling, and best practices over operational/infra rules
- **Context-efficient**: Only load rules when Claude is working on matching files

---

## 1. Language Best Practices (path-scoped: source files)

One consolidated file per language. Covers coding standards, error handling, concurrency, and performance in a single file.

### Java → `java-best-practices.md`

| Field | Value |
|-------|-------|
| Paths | `**/*.java` |
| ADR | ADR for language choice |
| Covers | Naming conventions, code structure, access modifiers, Javadoc, forbidden patterns (raw types, wildcard imports, mutable static fields), checked vs unchecked exceptions, exception hierarchy, logging in catch blocks, custom exceptions, Virtual Threads best practices (Java 21+), thread safety, CompletableFuture patterns, object allocation, String handling, Stream vs loop, Collection sizing, boxing/unboxing, Record classes, sealed interfaces |

### TypeScript → `typescript-best-practices.md`

| Field | Value |
|-------|-------|
| Paths | `**/*.{ts,tsx}` |
| ADR | ADR for language choice |
| Covers | strict mode, no-any policy, strictNullChecks, interface vs type, naming, barrel exports, Error class hierarchy, Result pattern, async error propagation, optional chaining, assertion functions, exhaustive checks |

### Python → `python-best-practices.md`

| Field | Value |
|-------|-------|
| Paths | `**/*.py` |
| ADR | ADR for language choice |
| Covers | PEP 8 + extensions, type hints, docstring format, import ordering, exception hierarchy, custom exceptions, context managers, logging patterns |

### Go → `go-best-practices.md`

| Field | Value |
|-------|-------|
| Paths | `**/*.go` |
| ADR | ADR for language choice |
| Covers | Effective Go conventions, naming, package structure, error wrapping, sentinel errors, custom error types |

### Rust → `rust-best-practices.md`

| Field | Value |
|-------|-------|
| Paths | `**/*.rs` |
| ADR | ADR for language choice |
| Covers | Clippy lints, naming, module structure, Result/Option patterns, thiserror vs anyhow, error propagation |

---

## 2. Framework Best Practices (path-scoped: main source)

One consolidated file per framework. Covers conventions, API/MCP design, security, and caching in a single file.

### Spring Boot → `spring-boot-best-practices.md`

| Field | Value |
|-------|-------|
| Paths | `src/main/**/*.java` |
| ADR | ADRs for framework, HTTP client, validation, cache, logging |
| Covers | Package-by-feature structure, component stereotypes, constructor injection only, configuration properties, profile management, DTO vs entity separation, validation annotations, error response format, security filter chain, CORS, secrets management via env vars, cache key naming, TTL policies, cache invalidation, structured logging with MDC, correlation IDs |

If the project uses a specific SDK or protocol (e.g., Spring AI MCP), include its conventions in this file as a dedicated section rather than a separate file.

### React / Next.js → `react-best-practices.md`

| Field | Value |
|-------|-------|
| Paths | `src/**/*.{tsx,jsx}` |
| ADR | ADR for framework choice |
| Covers | Component structure, hooks rules, state management, prop types, file naming, memoization, lazy loading, bundle optimization |

### Express / NestJS → `node-api-best-practices.md`

| Field | Value |
|-------|-------|
| Paths | `src/**/*.{ts,js}` |
| ADR | ADR for framework choice |
| Covers | Middleware patterns, route organization, error middleware, validation, Helmet, rate limiting, input sanitization, CORS |

### FastAPI / Django → `python-api-best-practices.md`

| Field | Value |
|-------|-------|
| Paths | `src/**/*.py` or `app/**/*.py` |
| ADR | ADR for framework choice |
| Covers | Router organization, dependency injection, Pydantic models, authentication, input validation, CORS |

---

## 3. Testing Best Practices (path-scoped: test files)

One consolidated file covering all testing concerns: unit testing, mocking strategy, and integration testing.

| Field | Value |
|-------|-------|
| File | `testing-best-practices.md` |
| Paths | Language-specific test file patterns (e.g., `src/test/**/*.java`, `**/*.test.ts`, `tests/**/*.py`, `**/*_test.go`) |
| ADR | ADR for testing strategy |
| Covers | Test naming convention, AAA pattern, test isolation, no interdependency, coverage thresholds, when to mock, mock scope, mock verification, avoiding over-mocking, integration test setup, external service mocking (WireMock/Testcontainers), database test isolation, CI considerations |

---

## 4. Build & DevOps (path-scoped: config files)

One consolidated file covering build tools, Docker, CI/CD pipeline, and code quality tool usage.

| Field | Value |
|-------|-------|
| File | `build-and-devops.md` |
| Paths | Build/config file patterns (e.g., `pom.xml`, `build.gradle*`, `package.json`, `Dockerfile*`, `docker-compose*.{yml,yaml}`, `.github/**`, `Makefile`) |
| ADR | ADRs for build tool, containerization, code quality tools |
| Covers | Build configuration best practices, Docker multi-stage builds, image optimization, non-root user, health checks, CI pipeline structure, code quality tool usage (formatter, linter, static analysis), dependency management |

---

## 5. Always-Loaded Rules (no paths — use sparingly)

These rules have **no `paths` frontmatter** and load unconditionally. Keep them lean to minimize context consumption.

### `git-conventions.md`

| Field | Value |
|-------|-------|
| Paths | (none — always loaded) |
| Covers | Branch naming, commit message format (Conventional Commits), PR template, merge strategy |

---

## Rule Selection Algorithm

Given a confirmed tech stack document, select rules as follows:

1. **Always generate** (max 1 always-loaded): `git-conventions.md`
2. **Per language** (1 file): Select the consolidated language best-practices file
3. **Per framework** (1 file): Select the consolidated framework best-practices file; include security, caching, logging sections within it
4. **Per testing stack** (1 file): Generate `testing-best-practices.md`
5. **Per build/DevOps** (1 file): Generate `build-and-devops.md` if build tools, Docker, or CI/CD are in the stack
6. **Cross-check**: Skip any category already fully covered by existing global rules

**Target**: 4–5 rule files for a typical single-language, single-framework project.

Skip categories that have no corresponding technology in the stack. For example, a backend-only project without a database skips all database and frontend rules.

### What NOT to generate as separate files

The following concerns should be **sections within** the files above, not standalone rule files:

- Security → section in framework best-practices
- Logging / Observability → section in framework best-practices
- Caching → section in framework best-practices
- API / MCP design → section in framework best-practices
- Mocking strategy → section in testing best-practices
- Integration testing → section in testing best-practices
- Docker → section in build-and-devops
- CI/CD → section in build-and-devops
- Code quality tools → section in build-and-devops
