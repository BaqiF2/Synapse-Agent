# Architecture Decision Record (ADR) Template

File naming convention: `docs/architecture/adr/YYYY-MM-DD-ADR-NNN-<title>.md`

---

# ADR-NNN: [Decision Title]

## Status

Proposed / Accepted / Deprecated / Superseded by ADR-XXX

## Context

[Describe the business/technical context from the PRD that drives this decision. Include the specific PRD requirement ID(s) being addressed.]

**PRD Reference**: [Requirement ID(s)]

**Business Driver**: [The non-functional or functional requirement triggering this decision]

## Decision Drivers

- [Driver 1: e.g., "PRD requires support for 100K concurrent users"]
- [Driver 2: e.g., "Team has no prior experience with Go"]
- [Driver 3: e.g., "Must integrate with existing PostgreSQL infrastructure"]

## Considered Options

### Option A: [Technology/Approach Name]

| Dimension | Assessment |
|-----------|-----------|
| Performance | [Specific metrics or benchmarks] |
| Learning Curve | [Team familiarity, ramp-up estimate] |
| Community & Ecosystem | [Activity level, library availability] |
| Operational Complexity | [Deployment, monitoring, debugging difficulty] |
| Cost | [Licensing, infrastructure, personnel costs] |
| Risk | [Key risks and mitigations] |

### Option B: [Technology/Approach Name]

| Dimension | Assessment |
|-----------|-----------|
| Performance | [Specific metrics or benchmarks] |
| Learning Curve | [Team familiarity, ramp-up estimate] |
| Community & Ecosystem | [Activity level, library availability] |
| Operational Complexity | [Deployment, monitoring, debugging difficulty] |
| Cost | [Licensing, infrastructure, personnel costs] |
| Risk | [Key risks and mitigations] |

### Option C: [Technology/Approach Name] (if applicable)

[Same table format]

## Decision

[State the chosen option clearly.]

**Chosen**: Option [X] — [Technology/Approach Name]

## Rationale

[Explain WHY this option was chosen over others. Reference specific decision drivers and how the chosen option best addresses them. Be explicit about trade-offs accepted.]

1. [Rationale point 1]
2. [Rationale point 2]
3. [Rationale point 3]

## Consequences

### Positive

- [Positive consequence 1]
- [Positive consequence 2]

### Negative

- [Negative consequence 1 — and accepted mitigation]
- [Negative consequence 2 — and accepted mitigation]

### Neutral

- [Neutral consequence / observation]

## Validation

- [ ] POC completed (if required)
- [ ] Performance benchmarks meet PRD thresholds
- [ ] Team sign-off obtained
- [ ] Operational readiness confirmed
