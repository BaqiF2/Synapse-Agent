# Rule File Template

Each generated rule file must follow the Claude Code `.claude/rules/` format with YAML frontmatter.
The content must be concrete, actionable, and specific to the technology version confirmed in the tech stack.

---

## Template Structure

### Path-Scoped Rule (conditional loading)

Use `paths` frontmatter to scope rules to specific file types. The rule only loads into context
when Claude is working with files matching the specified glob patterns.

````markdown
---
paths:
  - "glob/pattern/**/*.ext"
  - "another/pattern/**/*.ext"
---

# [Rule Category Title]

> Based on: [Technology] [Version] — ADR Reference: [ADR-NNN]
> Extends global rule: ~/.claude/rules/<filename> (if applicable)

## Mandatory Rules

Rules that MUST be followed. Violations should be treated as bugs.

### M-[NNN]: [Rule Name]
- **Rule**: [Clear, unambiguous statement of the rule]
- **Rationale**: [Why this rule exists — link to NFR or best practice]
- **DO**:
  ```[language]
  // Correct example
  ```
- **DON'T**:
  ```[language]
  // Incorrect example
  ```

## Recommended Rules

Rules that SHOULD be followed. Exceptions require a code comment explaining why.

### R-[NNN]: [Rule Name]
- **Rule**: [Clear statement]
- **Rationale**: [Why]
- **DO**: ...
- **DON'T**: ...

## Checklist

Before submitting code, verify:
- [ ] [Checklist item 1]
- [ ] [Checklist item 2]
- [ ] [Checklist item N]
````

### Always-Loaded Rule (no paths)

Omit the `paths` field for rules that apply universally regardless of file type.
Use sparingly — only for truly cross-cutting concerns like git conventions.

````markdown
# [Rule Category Title]

> Based on: [Technology] [Version] — ADR Reference: [ADR-NNN]

## Mandatory Rules
...
````

---

## Paths Glob Patterns Reference

| Pattern | Matches |
|---------|---------|
| `**/*.java` | All Java files in any directory |
| `src/main/**/*.java` | Main source Java files |
| `src/test/**/*.java` | Test source Java files |
| `**/*.{ts,tsx}` | TypeScript and TSX files |
| `**/Dockerfile*` | All Dockerfiles |
| `**/docker-compose*.{yml,yaml}` | Docker Compose files |
| `pom.xml` | Maven POM in project root |
| `.github/**` | GitHub Actions workflows |

Multiple patterns can be specified to match different file locations:

```yaml
paths:
  - "src/**/*.ts"
  - "lib/**/*.ts"
  - "tests/**/*.test.ts"
```

---

## Content Guidelines

1. **Version-specific**: Reference the exact version from the tech stack. For example, Java 21 rules should mention Virtual Threads, Record classes, and sealed interfaces where relevant.

2. **ADR-traceable**: Each rule file header must reference the ADR(s) that confirmed the technology choice.

3. **DO/DON'T examples**: Every mandatory rule must include both a correct and incorrect code example in the project's primary language.

4. **Quantifiable where possible**: Prefer "method body must not exceed 30 lines" over "keep methods short."

5. **No duplication with global rules**: Check existing `.claude/rules/` files. If a rule already exists globally (e.g., `code-spec.md` already covers logging language), reference it with `> Extends global rule:` instead of duplicating.

6. **English for code artifacts**: All code examples, log messages, and exception messages in rule files must use English (per project global rule).

7. **Named constants**: Any numeric threshold in rules must follow the project's no-magic-value policy — show the constant definition pattern.

8. **Paths scoping**: Always add `paths` frontmatter unless the rule is truly cross-cutting. This prevents unnecessary context window consumption.

9. **Consolidation over fragmentation**: Each rule file should be comprehensive for its domain. Prefer one well-organized file covering Java best practices over four separate files for coding standards, error handling, concurrency, and performance.
